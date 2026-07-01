import { flushRecordStore } from "@/lib/storage/store";
import { detectPersistenceRuntime } from "@/infrastructure/persistence/runtime";

/**
 * Drain every pending write before the app exits (H2).
 *
 * Two things sit between an edit and the disk:
 *   1. Feature-level debounces — e.g. the canvas holds a scene edit for 300ms
 *      (`useDeferredPersistence`) before it even reaches the save queue.
 *   2. The save queue itself, which flushes on an idle callback.
 *
 * On quit neither drains on its own, so the last edits are lost. Editors register
 * a flusher here; on window-close we run them (which enqueue into the save queue)
 * and then flush the queue to disk.
 */

type Flusher = () => void | Promise<void>;

const flushers = new Set<Flusher>();

/**
 * Register a callback that pushes a feature's in-memory debounced edit into the
 * save queue. Returns an unregister function — call it on unmount.
 */
export function registerPendingFlusher(flusher: Flusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

/**
 * Drain all registered debounced edits, then flush the save queue to disk.
 * Best-effort: a failing flusher is logged, never allowed to abort the rest.
 */
export async function flushAllPendingWrites(): Promise<void> {
  for (const flusher of Array.from(flushers)) {
    try {
      await flusher();
    } catch (error) {
      console.error("[flushOnQuit] a pending flusher failed", error);
    }
  }
  await flushRecordStore();
}

let installed = false;

/**
 * Wire the flush into the platform's app-exit signal. Idempotent — safe to call
 * from React StrictMode's double-invoked effects.
 *
 * Desktop (Tauri): intercept the native close so the async flush completes before
 * the window is destroyed. Web: a best-effort synchronous kick on tab close.
 */
export function installQuitFlush(): void {
  if (installed) return;
  installed = true;

  if (detectPersistenceRuntime() === "desktop") {
    void installTauriCloseFlush();
    return;
  }

  if (typeof window === "undefined") return;
  const handler = () => {
    void flushAllPendingWrites();
  };
  // `pagehide` is the reliable one across browsers; `beforeunload` covers the
  // rest. Both may only get a synchronous head-start — the desktop path is the
  // one that actually awaits the flush.
  window.addEventListener("pagehide", handler);
  window.addEventListener("beforeunload", handler);
}

async function installTauriCloseFlush(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    await appWindow.onCloseRequested(async (event) => {
      // Hold the close until the flush lands, then destroy the window ourselves.
      event.preventDefault();
      try {
        await flushAllPendingWrites();
      } finally {
        await appWindow.destroy();
      }
    });
  } catch (error) {
    console.error("[flushOnQuit] could not install the Tauri close handler", error);
  }
}
