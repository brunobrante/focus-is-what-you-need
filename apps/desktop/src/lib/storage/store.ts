import type { KVStore } from "@/domain/persistence/kvStore";
import { getStorageDriver } from "@/infrastructure/persistence/createStorageDriver";
import { notifyInvalidation, tableInvalidationKey } from "@/application/persistence/invalidationBus";
import type { TableKey } from "@/lib/storage/storeKeys";

export { TABLES, type TableKey } from "@/lib/storage/storeKeys";

export const store: KVStore = {
  async get<T>(key: string): Promise<T | null> {
    const driver = await getStorageDriver();
    const raw = await driver.getRaw(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    const driver = await getStorageDriver();
    await driver.setRaw(key, JSON.stringify(value));
  },
};

export async function getTable<T>(key: TableKey): Promise<T[]> {
  return (await store.get<T[]>(key)) ?? [];
}

export async function setTable<T>(key: TableKey, rows: T[]): Promise<void> {
  await store.set(key, rows);
}

const listeners = new Map<TableKey, Set<() => void>>();

export function notify(key: TableKey): void {
  notifyInvalidation(tableInvalidationKey(key));
  listeners.get(key)?.forEach((fn) => fn());
}

export function subscribe(key: TableKey, fn: () => void): () => void {
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(fn);
  return () => bucket!.delete(fn);
}
