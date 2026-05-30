import type { PersistencePort } from "@/domain/persistence/persistencePort";
import { SaveQueue } from "@/application/persistence/saveQueue";
import { detectPersistenceRuntime } from "./runtime";
import { createMemoryPersistence } from "./memoryPersistence";
import { createIndexedDbPersistence } from "./indexedDbPersistence";
import { createSqlitePersistence } from "./sqlitePersistence";
import { createLocalStorageOutbox, createMemoryOutbox } from "./outbox";

/** Choose the record-store adapter for the current runtime. */
export function createPersistencePort(): PersistencePort {
  switch (detectPersistenceRuntime()) {
    case "desktop":
      return createSqlitePersistence();
    case "web":
      return createIndexedDbPersistence();
    case "memory":
    default:
      return createMemoryPersistence();
  }
}

let portSingleton: PersistencePort | null = null;
let queueSingleton: SaveQueue | null = null;

export function getPersistencePort(): PersistencePort {
  if (!portSingleton) portSingleton = createPersistencePort();
  return portSingleton;
}

export function getSaveQueue(): SaveQueue {
  if (!queueSingleton) {
    const outbox =
      detectPersistenceRuntime() === "memory"
        ? createMemoryOutbox()
        : createLocalStorageOutbox();
    queueSingleton = new SaveQueue(getPersistencePort(), { outbox });
    // Replay any batch a previous session left behind before accepting edits.
    void queueSingleton.replayOutbox().catch((error) => {
      console.warn("[persistence] outbox replay failed", error);
    });
  }
  return queueSingleton;
}

/** Test seam: reset the singletons (used by unit tests / reseed). */
export function resetPersistenceSingletons(): void {
  portSingleton = null;
  queueSingleton = null;
}
