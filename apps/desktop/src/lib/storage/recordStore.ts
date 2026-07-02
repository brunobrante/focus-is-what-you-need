import { getSaveQueue } from "@/application/persistence/saveQueueProvider";
import {
  notifyInvalidation,
  tableInvalidationKey,
} from "@/application/persistence/invalidationBus";
import type { TableKey } from "@/lib/storage/storeKeys";

/**
 * The record store: the in-memory source of truth for every persisted row.
 *
 * One record per row, keyed by `(table, id)`. There is no table blob.
 *
 *  - Reads (`listTable`/`getRecord`) hydrate a table from the port once, then
 *    serve synchronously from cache — read-after-write within a session is
 *    immediate.
 *  - Writes (`putRecord`/`removeRecords`/`replaceTable`) update the cache
 *    synchronously and enqueue per-row deltas onto the SaveQueue. The UI never
 *    awaits the database; durability happens in the background with an outbox.
 *
 * This replaces the old 12-blob KV model entirely: editing one row persists one
 * row, never a whole table.
 */

type Row = { id: string } & Record<string, unknown>;

/**
 * The collaboration envelope the store manages on every persisted row (D1/D6):
 * a monotonic `rev` (the optimistic-write guard) and a `deletedAt` tombstone
 * field. Repos never set these — the store stamps them so every written row
 * carries them and the adapter's `rev` guard has something to compare.
 */
const ENVELOPE_KEYS = ["rev", "deletedAt"] as const;

function nextRev(prev: unknown): number {
  const prevRev = (prev as { rev?: unknown } | undefined)?.rev;
  return (typeof prevRev === "number" ? prevRev : 0) + 1;
}

/** Stamp the store-managed envelope onto a row about to be written. */
function withEnvelope<T extends Row>(row: T, rev: number): T {
  return {
    ...row,
    deletedAt: (row as { deletedAt?: number | null }).deletedAt ?? null,
    rev,
  };
}

/**
 * Serialize a row for change-detection, ignoring the store-managed envelope so a
 * bumped `rev` (or a defaulted `deletedAt`) never reads as a content change and
 * defeats `replaceTable`'s diff-skip.
 */
function comparableJson(row: unknown): string {
  if (!row || typeof row !== "object") return JSON.stringify(row);
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of ENVELOPE_KEYS) delete copy[key];
  return JSON.stringify(copy);
}

const cache = new Map<string, Map<string, unknown>>();
const hydration = new Map<string, Promise<void>>();
/** Tables whose hydration promise has *resolved* (rows fully loaded into cache). */
const hydrated = new Set<string>();
/**
 * Ids written or deleted in-session *before* their table finished hydrating, per
 * table. Hydration loads disk rows into the same cache; without this it would
 * overwrite a synchronous in-session upsert with the older disk row, or resurrect
 * a row that was deleted this session (M3). Populated only while a table is
 * un-hydrated, consulted by the hydration loop, then dropped.
 */
const dirtyBeforeHydration = new Map<string, Set<string>>();

function markDirtyBeforeHydration(table: string, id: string): void {
  let set = dirtyBeforeHydration.get(table);
  if (!set) {
    set = new Set();
    dirtyBeforeHydration.set(table, set);
  }
  set.add(id);
}

/**
 * Called before every synchronous write. If the table hasn't hydrated yet, mark
 * the id so hydration won't clobber/resurrect it, and kick hydration off now so
 * its rev reconcile against disk actually runs even for a table never read (M3).
 * Once hydrated, writes see the disk row in cache and need no guarding.
 */
function guardBeforeHydration(table: string, id: string): void {
  if (hydrated.has(table)) return;
  markDirtyBeforeHydration(table, id);
  void ensureHydrated(table);
}

/**
 * A dirty id also exists on disk: the in-session upsert stamped its `rev` from an
 * empty cache (so `rev = 1`), which the adapter's `excluded.rev > records.rev`
 * guard would drop against a higher disk rev. Re-stamp the cached row above the
 * disk rev and re-enqueue so the write actually lands (M3). Deletes need no fix —
 * the adapters apply them unconditionally.
 */
function reconcileDirtyRevAgainstDisk(table: string, diskRow: Row): void {
  const map = bucket(table);
  const cached = map.get(diskRow.id) as { rev?: unknown } | undefined;
  if (cached === undefined) return; // in-session delete — leave it deleted
  const cachedRev = typeof cached.rev === "number" ? cached.rev : 0;
  const diskRev = typeof diskRow.rev === "number" ? (diskRow.rev as number) : 0;
  if (cachedRev > diskRev) return; // already out-revs disk
  const bumped = { ...(cached as Row), rev: diskRev + 1 };
  map.set(diskRow.id, bumped);
  getSaveQueue().enqueue({
    op: "upsertRecord",
    table,
    id: diskRow.id,
    json: JSON.stringify(bumped),
    rev: diskRev + 1,
  });
}
/** Tables already warned about a pre-hydration `peekTable` — warn once each. */
const peekedBeforeHydrated = new Set<string>();

const listeners = new Map<string, Set<() => void>>();

function bucket(table: string): Map<string, unknown> {
  let map = cache.get(table);
  if (!map) {
    map = new Map();
    cache.set(table, map);
  }
  return map;
}

async function ensureHydrated(table: string): Promise<void> {
  if (hydration.has(table)) return hydration.get(table)!;
  const promise = (async () => {
    const queue = getSaveQueue();
    const rows = await queue.port.listRecords(table);
    const map = bucket(table);
    const dirty = dirtyBeforeHydration.get(table);
    for (const raw of rows) {
      try {
        const parsed = JSON.parse(raw) as Row;
        if (!parsed || typeof parsed.id !== "string") continue;
        if (dirty?.has(parsed.id)) {
          // An in-session write already superseded this disk row — keep the
          // session value, but make its enqueued rev out-rank disk so it sticks.
          reconcileDirtyRevAgainstDisk(table, parsed);
          continue;
        }
        map.set(parsed.id, parsed);
      } catch {
        // Skip unparseable rows rather than failing the whole table load.
      }
    }
    hydrated.add(table);
    dirtyBeforeHydration.delete(table);
  })();
  hydration.set(table, promise);
  return promise;
}

/** Whether a table has finished hydrating (its rows are fully loaded). Lets a
 *  synchronous `peekTable` reader tell "loaded but empty" from "not loaded yet". */
export function isTableHydrated(table: TableKey): boolean {
  return hydrated.has(table);
}

export async function listTable<T>(table: TableKey): Promise<T[]> {
  await ensureHydrated(table);
  return Array.from(bucket(table).values()) as T[];
}

export async function getRecordById<T>(
  table: TableKey,
  id: string,
): Promise<T | null> {
  await ensureHydrated(table);
  return (bucket(table).get(id) as T | undefined) ?? null;
}

/**
 * Synchronous cache-only read. Returns whatever rows are already hydrated for the
 * table without awaiting; an un-hydrated table yields an empty array. Use only where
 * the table is known to be hydrated already (e.g. instance resolution at canvas seed,
 * which runs after the current scene has loaded). Never use it as the primary loader.
 *
 * Reading before hydration would silently resolve instances against zero masters
 * (blank render), so a first such read warns; gate on `isTableHydrated` if a caller
 * can legitimately run early (SAVE-12).
 */
export function peekTable<T>(table: TableKey): T[] {
  // Only the genuinely ambiguous case warns: not hydrated *and* nothing written
  // this session, so the empty result can't be told from "not loaded yet". A
  // cache populated by in-session writes is suppressed (it has real data).
  if (
    !hydrated.has(table) &&
    (cache.get(table)?.size ?? 0) === 0 &&
    !peekedBeforeHydrated.has(table)
  ) {
    peekedBeforeHydrated.add(table);
    console.warn(
      `[recordStore] peekTable("${table}") read before hydration — got an ` +
        `empty/partial table. Ensure the table is loaded first (isTableHydrated).`,
    );
  }
  return Array.from(bucket(table).values()) as T[];
}

/** Synchronous single-row upsert: cache write + enqueue + notify, no await. */
export function putRecord<T extends Row>(table: TableKey, row: T): void {
  const map = bucket(table);
  guardBeforeHydration(table, row.id);
  const stored = withEnvelope(row, nextRev(map.get(row.id)));
  map.set(row.id, stored);
  getSaveQueue().enqueue({
    op: "upsertRecord",
    table,
    id: stored.id,
    json: JSON.stringify(stored),
    rev: stored.rev as number,
  });
  notify(table);
}

/** Synchronous multi-row delete by id. */
export function removeRecords(table: TableKey, ids: string[]): void {
  if (ids.length === 0) return;
  const map = bucket(table);
  for (const id of ids) {
    guardBeforeHydration(table, id);
    map.delete(id);
  }
  getSaveQueue().enqueue({ op: "deleteRecords", table, ids });
  notify(table);
}

/**
 * Replace a table's full contents (drop-in for the old `setTable`). Diffs the
 * incoming rows against the cache and enqueues only the per-row upserts and
 * deletes that actually changed — so a repo that computes a whole next-array
 * still persists O(changed rows), never the whole table.
 *
 * Hot, large tables (scenes/thumbnails) should prefer `putRecord` to avoid the
 * per-row JSON diff; this is for the small cold tables.
 *
 * `options.silent` suppresses the per-table `notify`: a multi-table writer (the
 * reseed) can populate every cache first and fire one batched notify at the end,
 * so a subscriber can never observe a half-applied cross-table state (SAVE-4).
 */
export async function replaceTable<T extends Row>(
  table: TableKey,
  rows: T[],
  options?: { silent?: boolean },
): Promise<void> {
  await ensureHydrated(table);
  const map = bucket(table);
  const queue = getSaveQueue();

  const nextIds = new Set(rows.map((row) => row.id));
  const removed: string[] = [];
  for (const id of map.keys()) {
    if (!nextIds.has(id)) removed.push(id);
  }

  for (const row of rows) {
    const prev = map.get(row.id);
    // Compare content only — a bumped envelope must not count as a change.
    if (prev !== undefined && comparableJson(prev) === comparableJson(row)) {
      continue;
    }
    const stored = withEnvelope(row, nextRev(prev));
    map.set(row.id, stored);
    queue.enqueue({
      op: "upsertRecord",
      table,
      id: stored.id,
      json: JSON.stringify(stored),
      rev: stored.rev as number,
    });
  }

  for (const id of removed) map.delete(id);
  if (removed.length > 0) {
    queue.enqueue({ op: "deleteRecords", table, ids: removed });
  }

  if (!options?.silent) notify(table);
}

// ---------------------------------------------------------------------------
// Meta — a single singleton record, stored in its own table under a fixed id.
// ---------------------------------------------------------------------------

const META_TABLE = "meta" as TableKey;
const META_ID = "singleton";

export async function getMeta<T>(): Promise<T | null> {
  await ensureHydrated(META_TABLE);
  return (bucket(META_TABLE).get(META_ID) as T | undefined) ?? null;
}

export function setMeta<T>(value: T): void {
  const map = bucket(META_TABLE);
  guardBeforeHydration(META_TABLE, META_ID);
  const row = withEnvelope(
    { ...(value as object), id: META_ID } as Row,
    nextRev(map.get(META_ID)),
  );
  map.set(META_ID, row);
  getSaveQueue().enqueue({
    op: "upsertRecord",
    table: META_TABLE,
    id: META_ID,
    json: JSON.stringify(row),
    rev: row.rev as number,
  });
  // Like putRecord, notify subscribers so meta-driven UI (seed/migration state)
  // re-reads instead of going stale until the next unrelated notify.
  notify(META_TABLE);
}

// ---------------------------------------------------------------------------
// Reactivity — unchanged table-level pub/sub, used by the React hooks.
// ---------------------------------------------------------------------------

export function notify(table: TableKey): void {
  notifyInvalidation(tableInvalidationKey(table));
  listeners.get(table)?.forEach((fn) => fn());
}

export function subscribe(table: TableKey, fn: () => void): () => void {
  let set = listeners.get(table);
  if (!set) {
    set = new Set();
    listeners.set(table, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
}

/** Test seam: drop all cached rows + hydration state. */
export function resetRecordStoreCache(): void {
  cache.clear();
  hydration.clear();
  hydrated.clear();
  peekedBeforeHydrated.clear();
  dirtyBeforeHydration.clear();
}

/** Force-flush pending writes (tests / shutdown). */
export async function flushRecordStore(): Promise<void> {
  await getSaveQueue().flush();
}
