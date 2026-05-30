import type { Mutation } from "@/domain/persistence/mutations";
import type { OutboxStore } from "@/application/persistence/saveQueue";

const OUTBOX_KEY = "__save_outbox_v1";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Crash-durable outbox backed by localStorage. Synchronous and IPC-free, so
 * persisting the in-flight batch before each flush is cheap.
 */
export function createLocalStorageOutbox(): OutboxStore {
  return {
    async load() {
      const storage = getStorage();
      if (!storage) return [];
      try {
        const raw = storage.getItem(OUTBOX_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Mutation[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async save(mutations) {
      const storage = getStorage();
      if (!storage) return;
      try {
        storage.setItem(OUTBOX_KEY, JSON.stringify(mutations));
      } catch {
        // Quota / serialization failure must never break the editor.
      }
    },
    async clear() {
      getStorage()?.removeItem(OUTBOX_KEY);
    },
  };
}

/** In-memory outbox for tests and the "memory" runtime. */
export function createMemoryOutbox(initial: Mutation[] = []): OutboxStore {
  let store: Mutation[] = [...initial];
  return {
    async load() {
      return [...store];
    },
    async save(mutations) {
      store = [...mutations];
    },
    async clear() {
      store = [];
    },
  };
}

function getStorage(): StorageLike | null {
  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  return candidate ?? null;
}
