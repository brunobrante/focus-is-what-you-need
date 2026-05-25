import type { SceneOwnerType } from "@/lib/storage/schema";
import type { TableKey } from "@/lib/storage/storeKeys";

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function tableInvalidationKey(table: TableKey): string {
  return `table:${table}`;
}

export function ownerInvalidationKey(
  entity: "scene" | "thumbnail",
  ownerType: SceneOwnerType,
  ownerId: string,
): string {
  return `${entity}:${ownerType}:${ownerId}`;
}

export function entityInvalidationKey(entity: string, id: string): string {
  return `entity:${entity}:${id}`;
}

export function projectInvalidationKey(entity: string, projectId: string): string {
  return `project:${entity}:${projectId}`;
}

export function notifyInvalidation(keys: string | string[]): void {
  const nextKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of nextKeys) {
    listeners.get(key)?.forEach((listener) => listener());
  }
}

export function subscribeInvalidation(keys: string[], listener: Listener): () => void {
  const cleanups = keys.map((key) => {
    let bucket = listeners.get(key);
    if (!bucket) {
      bucket = new Set();
      listeners.set(key, bucket);
    }
    bucket.add(listener);
    return () => bucket?.delete(listener);
  });

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
