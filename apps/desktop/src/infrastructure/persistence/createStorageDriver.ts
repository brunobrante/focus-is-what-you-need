import type { RawKVStore } from "@/domain/persistence/kvStore";
import { TABLES } from "@/lib/storage/storeKeys";
import { createIndexedDbKVStore } from "./indexedDbKvStore";
import { createLocalStorageKVStore } from "./localStorageKvStore";
import { detectPersistenceRuntime } from "./runtime";
import { createTauriSqliteKVStore } from "./tauriSqliteKvStore";

const MIGRATION_FLAG = "__legacy_local_storage_migrated_v1";

type StorageGlobal = typeof globalThis & {
  localStorage?: Storage;
};

let driverPromise: Promise<RawKVStore> | null = null;

export function getStorageDriver(): Promise<RawKVStore> {
  if (!driverPromise) {
    driverPromise = createDriver();
  }
  return driverPromise;
}

async function createDriver(): Promise<RawKVStore> {
  const runtime = detectPersistenceRuntime();
  const driver =
    runtime === "desktop"
      ? createTauriSqliteKVStore()
      : runtime === "web"
        ? createIndexedDbKVStore()
        : createLocalStorageKVStore();

  if (runtime !== "memory") {
    await migrateLegacyLocalStorage(driver).catch((error) => {
      console.warn("[storage] Failed to migrate legacy localStorage data", error);
    });
  }

  return driver;
}

async function migrateLegacyLocalStorage(driver: RawKVStore): Promise<void> {
  const storage = (globalThis as StorageGlobal).localStorage;
  if (!storage) return;
  if ((await driver.getRaw(MIGRATION_FLAG)) === "1") return;

  for (const key of Object.values(TABLES)) {
    const legacyRaw = storage.getItem(`fwyn:${key}`);
    if (legacyRaw == null) continue;
    const current = await driver.getRaw(key);
    if (current == null) {
      await driver.setRaw(key, legacyRaw);
    }
  }

  await driver.setRaw(MIGRATION_FLAG, "1");
}
