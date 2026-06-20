import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import { schedulePropagation } from "@/application/scenes/propagationQueue";
import type { SceneOwnerType, SceneRow } from "@/lib/storage/schema";

export type SaveSceneInput = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

/**
 * Save a scene. The UI never waits for the database: `upsertScene` updates the
 * record-store cache and enqueues a single per-row delta on the save queue, with
 * `propagate: false` so the ancestor walk does NOT run on the interaction thread.
 * Ancestor propagation (and the parent thumbnails it regenerates) is scheduled on
 * the idle propagation queue, coalesced per owner. Fire-and-forget.
 */
export function saveScene(input: SaveSceneInput): void {
  void upsertScene(input, { propagate: false });
  schedulePropagation(input);
}

export async function readSceneByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<SceneRow | null> {
  return getSceneByOwner(ownerType, ownerId);
}
