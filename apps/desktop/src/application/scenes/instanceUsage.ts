import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene";
import { TABLES, listTable, putRecord, removeRecords } from "@/lib/storage/store";
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

/**
 * Reconcile a scene's usage rows after it is saved. Upserts changed/new rows and
 * removes stale ones — enqueued on the SAME SaveQueue as the scene write (D3), so
 * the index rides the scene's flush. Scenes are always variant-owned.
 */
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

/** Test seam: force the next read to re-evaluate the cold-rebuild path. */
export function resetInstanceUsageRebuilt(): void {
  rebuilt = false;
}
