import type { RawKVStore } from "@/domain/persistence/kvStore";

const PREFIX = "fwyn:";

type StorageGlobal = typeof globalThis & {
  localStorage?: Storage;
};

export function legacyStorageKey(key: string): string {
  return PREFIX + key;
}

export function createLocalStorageKVStore(): RawKVStore {
  return {
    async getRaw(key: string): Promise<string | null> {
      const storage = (globalThis as StorageGlobal).localStorage;
      if (!storage) return null;
      return storage.getItem(legacyStorageKey(key));
    },
    async setRaw(key: string, value: string): Promise<void> {
      const storage = (globalThis as StorageGlobal).localStorage;
      if (!storage) return;
      storage.setItem(legacyStorageKey(key), value);
    },
  };
}
