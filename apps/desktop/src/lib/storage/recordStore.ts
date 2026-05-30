import { getSaveQueue } from "@/infrastructure/persistence/createPersistence";
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

const cache = new Map<string, Map<string, unknown>>();
const hydration = new Map<string, Promise<void>>();

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
    for (const raw of rows) {
      try {
        const parsed = JSON.parse(raw) as Row;
        if (parsed && typeof parsed.id === "string") map.set(parsed.id, parsed);
      } catch {
        // Skip unparseable rows rather than failing the whole table load.
      }
    }
  })();
  hydration.set(table, promise);
  return promise;
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

/** Synchronous single-row upsert: cache write + enqueue + notify, no await. */
export function putRecord<T extends Row>(table: TableKey, row: T): void {
  bucket(table).set(row.id, row);
  getSaveQueue().enqueue({
    op: "upsertRecord",
    table,
    id: row.id,
    json: JSON.stringify(row),
  });
  notify(table);
}

/** Synchronous multi-row delete by id. */
export function removeRecords(table: TableKey, ids: string[]): void {
  if (ids.length === 0) return;
  const map = bucket(table);
  for (const id of ids) map.delete(id);
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
 */
export async function replaceTable<T extends Row>(
  table: TableKey,
  rows: T[],
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
    const json = JSON.stringify(row);
    const prev = map.get(row.id);
    if (prev !== undefined && JSON.stringify(prev) === json) continue;
    map.set(row.id, row);
    queue.enqueue({ op: "upsertRecord", table, id: row.id, json });
  }

  for (const id of removed) map.delete(id);
  if (removed.length > 0) {
    queue.enqueue({ op: "deleteRecords", table, ids: removed });
  }

  notify(table);
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
  const row = { ...(value as object), id: META_ID } as Row;
  bucket(META_TABLE).set(META_ID, row);
  getSaveQueue().enqueue({
    op: "upsertRecord",
    table: META_TABLE,
    id: META_ID,
    json: JSON.stringify(row),
  });
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
}

/** Force-flush pending writes (tests / shutdown). */
export async function flushRecordStore(): Promise<void> {
  await getSaveQueue().flush();
}
