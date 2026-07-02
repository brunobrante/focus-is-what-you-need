import type { SaveStatus } from "./saveQueue";

/**
 * A tiny observable mirror of the save queue's status, so the UI can surface a
 * "changes aren't saving" indicator (M1). The queue pushes here via its
 * onStatusChange callback (wired in saveQueueProvider); components read it with
 * useSyncExternalStore.
 */

let status: SaveStatus = "idle";
const listeners = new Set<() => void>();

export function setSaveStatus(next: SaveStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

export function getSaveStatus(): SaveStatus {
  return status;
}

export function subscribeSaveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
