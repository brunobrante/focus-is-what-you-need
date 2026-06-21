import { peekTable, TABLES } from "@/lib/storage/store";
import type { SceneRow } from "@/lib/storage/schema";

/**
 * Synchronous, cache-only snapshot of the scenes table.
 *
 * Encapsulates the direct `peekTable(TABLES.scenes)` read so UI-layer canvas code
 * does not reach into the storage cache itself. The semantics are identical to the
 * underlying peek: it returns whatever rows are already hydrated, without awaiting,
 * so callers that rely on the synchronous snapshot at canvas seed time (after the
 * current scene has loaded) keep the same data and the same timing.
 *
 * This is not a React hook — it performs no subscription. Callers decide when to
 * re-read it (e.g. inside a `useMemo` keyed on the current scene graph), preserving
 * the existing rebuild cadence.
 */
export function getScenesSnapshot(): SceneRow[] {
  return peekTable<SceneRow>(TABLES.scenes);
}
