import type { RawKVStore } from "@/domain/persistence/kvStore";

const DB_NAME = "focus-is-what-you-need";
const DB_VERSION = 1;
const STORE_NAME = "kv";

type KVRow = {
  key: string;
  value: string;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function createIndexedDbKVStore(): RawKVStore {
  return {
    async getRaw(key: string): Promise<string | null> {
      const db = await openDatabase();
      return requestToPromise<KVRow | undefined>(
        db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key),
      ).then((row) => row?.value ?? null);
    },
    async setRaw(key: string, value: string): Promise<void> {
      const db = await openDatabase();
      await requestToPromise(
        db
          .transaction(STORE_NAME, "readwrite")
          .objectStore(STORE_NAME)
          .put({ key, value, updatedAt: Date.now() } satisfies KVRow),
      );
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
