import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene";
import {
  TABLES,
  listTable,
  peekTable,
  putRecord,
  removeRecords,
} from "@/lib/storage/store";
import type { SceneRow } from "@/lib/storage/schema";

/**
 * The derived `instance_usage` index (save-architecture-v3 Step 3). Component
 * instances stay canonical in each host scene's `graphJSON`; this is a CACHE
 * rebuilt from that graph on every scene save (D3, derived in TypeScript), so
 * "which scenes use this master?" is an index hit instead of scanning + parsing
 * every scene (the Better.md SAVE-5 cliff).
 *
 * Because it is derived, a stale/missing row only costs a rebuild, never a
 * correctness divergence — so the first read self-heals from a cold table.
 */
export type InstanceUsageRow = {
  id: string; // `${ownerVariantId}:${nodeId}`
  componentId: string; // master referenced
  variantId: string; // pinned version
  ownerVariantId: string; // the host scene's owner variant
  nodeId: string;
};

const KEY = TABLES.instanceUsage;

function usageId(ownerVariantId: string, nodeId: string): string {
  return `${ownerVariantId}:${nodeId}`;
}

/** Derive the usage rows a single scene contributes from its graph. */
export function deriveSceneUsage(
  ownerVariantId: string,
  graphJSON: string,
): InstanceUsageRow[] {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return [];
  const rows: InstanceUsageRow[] = [];
  for (const node of doc.nodes) {
    if (!node.instanceOf) continue;
    rows.push({
      id: usageId(ownerVariantId, node.id),
      componentId: node.instanceOf.componentId,
      variantId: node.instanceOf.variantId,
      ownerVariantId,
      nodeId: node.id,
    });
  }
  return rows;
}

/** Diff next-vs-existing usage rows for one scene and enqueue the delta. Pure
 *  cache writes (putRecord/removeRecords are synchronous), so the caller controls
 *  whether `existing` came from a sync peek or an async list. */
function applyUsageDelta(
  next: InstanceUsageRow[],
  existing: InstanceUsageRow[],
): void {
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const nextIds = new Set(next.map((r) => r.id));
  for (const row of next) {
    const prev = existingById.get(row.id);
    if (
      prev &&
      prev.componentId === row.componentId &&
      prev.variantId === row.variantId
    ) {
      continue; // unchanged — no write
    }
    putRecord<InstanceUsageRow>(KEY, row);
  }
  const removed = existing.filter((r) => !nextIds.has(r.id)).map((r) => r.id);
  if (removed.length) removeRecords(KEY, removed);
}

/**
 * Reconcile a scene's usage rows on save — SYNCHRONOUSLY, so the upserts/deletes
 * are enqueued in the same tick as the scene `putRecord` and ride the SAME
 * SaveQueue flush (D3, genuinely — not the next batch). Reads existing rows from
 * the in-memory cache via `peekTable`; `primeInstanceUsage()` at boot keeps that
 * cache warm so the stale-row diff is complete. A cold miss only delays reaping a
 * stale row to the next save (rebuildable cache), never a correctness divergence.
 */
export function reconcileSceneUsageSync(
  ownerType: string,
  ownerId: string,
  graphJSON: string,
): void {
  if (ownerType !== "variant") return;
  const next = deriveSceneUsage(ownerId, graphJSON);
  const existing = peekTable<InstanceUsageRow>(KEY).filter(
    (r) => r.ownerVariantId === ownerId,
  );
  applyUsageDelta(next, existing);
}

/** Async reconcile (hydrates the table first) — for callers off the save hot path. */
export async function reconcileSceneUsage(
  ownerType: string,
  ownerId: string,
  graphJSON: string,
): Promise<void> {
  if (ownerType !== "variant") return;
  const next = deriveSceneUsage(ownerId, graphJSON);
  const existing = (await listTable<InstanceUsageRow>(KEY)).filter(
    (r) => r.ownerVariantId === ownerId,
  );
  applyUsageDelta(next, existing);
}

let rebuilt = false;

/** One-time full rebuild from every scene — the self-heal for a cold index. */
async function rebuildAllUsage(): Promise<void> {
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  for (const scene of scenes) {
    if (scene.ownerType !== "variant") continue;
    for (const row of deriveSceneUsage(scene.ownerId, scene.graphJSON)) {
      putRecord<InstanceUsageRow>(KEY, row);
    }
  }
}

async function ensureUsageIndex(): Promise<InstanceUsageRow[]> {
  const rows = await listTable<InstanceUsageRow>(KEY);
  if (!rebuilt && rows.length === 0) {
    // Cold/empty: rebuild once from scenes (D3 self-heal). A genuinely
    // instance-free workspace pays one cheap empty scan per session.
    await rebuildAllUsage();
    rebuilt = true;
    return listTable<InstanceUsageRow>(KEY);
  }
  rebuilt = true;
  return rows;
}

/** Every usage row referencing one of the given master components (indexed). */
export async function instanceUsageForComponents(
  componentIds: Set<string>,
): Promise<InstanceUsageRow[]> {
  if (componentIds.size === 0) return [];
  const rows = await ensureUsageIndex();
  return rows.filter((r) => componentIds.has(r.componentId));
}

/** Warm the index at boot so the sync save-path reconcile sees existing rows via
 *  `peekTable` (and cold-rebuilds from scenes if the table is empty). */
export async function primeInstanceUsage(): Promise<void> {
  await ensureUsageIndex();
}

/** Test seam: force the next read to re-evaluate the cold-rebuild path. */
export function resetInstanceUsageRebuilt(): void {
  rebuilt = false;
}
