import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type { SceneOwnerType, SceneRow } from "@/lib/storage/schema";

export type SaveSceneInput = {
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
};

export type SaveSceneOptions = {
  propagate?: boolean;
};

export async function saveScene(
  input: SaveSceneInput,
  options: SaveSceneOptions = {},
): Promise<SceneRow> {
  return upsertScene(input, options);
}

export async function readSceneByOwner(
  ownerType: SceneOwnerType,
  ownerId: string,
): Promise<SceneRow | null> {
  return getSceneByOwner(ownerType, ownerId);
}
