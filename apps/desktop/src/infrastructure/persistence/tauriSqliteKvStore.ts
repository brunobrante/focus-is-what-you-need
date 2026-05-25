import type { RawKVStore } from "@/domain/persistence/kvStore";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

let invokePromise: Promise<Invoke> | null = null;

export function createTauriSqliteKVStore(): RawKVStore {
  return {
    async getRaw(key: string): Promise<string | null> {
      const invoke = await getInvoke();
      return invoke<string | null>("kv_get", { key });
    },
    async setRaw(key: string, value: string): Promise<void> {
      const invoke = await getInvoke();
      await invoke<void>("kv_set", { key, value });
    },
  };
}

async function getInvoke(): Promise<Invoke> {
  if (!invokePromise) {
    invokePromise = import("@tauri-apps/api/core").then((module) => module.invoke as Invoke);
  }
  return invokePromise;
}
