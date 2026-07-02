import { SaveQueue } from "./saveQueue";
import { setSaveStatus } from "./saveStatusStore";
import {
  getPersistencePort,
  resetPersistencePort,
} from "@/infrastructure/persistence/createPersistence";
import { detectPersistenceRuntime } from "@/infrastructure/persistence/runtime";
import {
  createLocalStorageOutbox,
  createMemoryOutbox,
} from "@/infrastructure/persistence/outbox";

// The SaveQueue is an application concern, so the singleton lives here — not in
// infrastructure. Infrastructure only provides the port (and the outbox/runtime
// adapters the queue is wired with). See ORG-19 in BETTER.md.
let queueSingleton: SaveQueue | null = null;

export function getSaveQueue(): SaveQueue {
  if (!queueSingleton) {
    const outbox =
      detectPersistenceRuntime() === "memory"
        ? createMemoryOutbox()
        : createLocalStorageOutbox();
    queueSingleton = new SaveQueue(getPersistencePort(), {
      outbox,
      onStatusChange: setSaveStatus,
    });
    // Replay any batch a previous session left behind before accepting edits.
    void queueSingleton.replayOutbox().catch((error) => {
      console.warn("[persistence] outbox replay failed", error);
    });
  }
  return queueSingleton;
}

/** Test seam: reset both the queue and the underlying port (used by tests / reseed). */
export function resetPersistenceSingletons(): void {
  queueSingleton = null;
  resetPersistencePort();
}
