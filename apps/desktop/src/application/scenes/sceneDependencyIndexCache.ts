import { createSceneDependencyIndex, type SceneDependencyIndex } from "@/application/scenes/dependencyIndex";
import type { ComponentRow, VariantRow } from "@/lib/storage/schema";
import { TABLES, listTable, subscribe } from "@/lib/storage/store";

/**
 * Memoized scene dependency index for ancestor propagation. Building it scans the
 * whole variants + components tables, and propagation runs on every save, so a
 * fresh build per save is O(table) repeated work (PERF-ARCH-04). The cache is
 * dropped whenever either table changes (it subscribes to both), so adding a
 * component/variant mid-session correctly forces a rebuild on the next propagation.
 */
let cached: SceneDependencyIndex | null = null;
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  const invalidate = () => {
    cached = null;
  };
  subscribe(TABLES.variants, invalidate);
  subscribe(TABLES.components, invalidate);
}

export async function getCachedSceneDependencyIndex(): Promise<SceneDependencyIndex> {
  ensureSubscribed();
  if (cached) return cached;
  const [variants, components] = await Promise.all([
    listTable<VariantRow>(TABLES.variants),
    listTable<ComponentRow>(TABLES.components),
  ]);
  cached = createSceneDependencyIndex({ variants, components });
  return cached;
}

/** Test seam: drop the memoized index. */
export function resetSceneDependencyIndexCache(): void {
  cached = null;
}
