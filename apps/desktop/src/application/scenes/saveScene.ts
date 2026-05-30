import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type { SceneOwnerType, SceneRow } from "@/lib/storage/schema";

export type SaveSceneInput = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

/**
 * Save a scene. The UI never waits for the database: `upsertScene` updates the
 * record-store cache synchronously and enqueues a single per-row delta on the
 * save queue; ancestor propagation runs off the critical path. Fire-and-forget.
 */
export function saveScene(input: SaveSceneInput): void {
  void upsertScene(input);
}

export async function readSceneByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<SceneRow | null> {
  return getSceneByOwner(ownerType, ownerId);
}
