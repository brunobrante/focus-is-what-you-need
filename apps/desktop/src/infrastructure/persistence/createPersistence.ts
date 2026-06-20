import type { PersistencePort } from "@/domain/persistence/persistencePort";
import { detectPersistenceRuntime } from "./runtime";
import { createMemoryPersistence } from "./memoryPersistence";
import { createIndexedDbPersistence } from "./indexedDbPersistence";
import { createSqlitePersistence } from "./sqlitePersistence";

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

export function getPersistencePort(): PersistencePort {
  if (!portSingleton) portSingleton = createPersistencePort();
  return portSingleton;
}

/**
 * Test seam: reset the port singleton. The SaveQueue singleton (an application
 * concern) is owned and reset by `resetPersistenceSingletons` in
 * `@/application/persistence/saveQueueProvider`, which also calls this.
 */
export function resetPersistencePort(): void {
  portSingleton = null;
}
