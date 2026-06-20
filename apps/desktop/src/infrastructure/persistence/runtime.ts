export type PersistenceRuntime = "desktop" | "web" | "memory";

type TauriWindow = Window &
  typeof globalThis & {
    __TAURI_INTERNALS__?: unknown;
  };

type BunGlobal = typeof globalThis & {
  Bun?: unknown;
  process?: {
    versions?: {
      bun?: string;
    };
  };
};

export function detectPersistenceRuntime(): PersistenceRuntime {
  if (isBunRuntime()) {
    return "memory";
  }
  if (typeof window !== "undefined" && Boolean((window as TauriWindow).__TAURI_INTERNALS__)) {
    return "desktop";
  }
  if (typeof indexedDB !== "undefined") {
    return "web";
  }
  return "memory";
}

function isBunRuntime(): boolean {
  const runtime = globalThis as BunGlobal;
  return Boolean(runtime.Bun || runtime.process?.versions?.bun);
}
