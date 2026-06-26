import type { GraphPersistencePort } from "@/domain/persistence/persistencePort";
import { detectPersistenceRuntime } from "./runtime";
import { createMemoryPersistence } from "./memoryPersistence";
import { createIndexedDbPersistence } from "./indexedDbPersistence";
import { createSqlitePersistence } from "./sqlitePersistence";

/**
 * Choose the record-store adapter for the current runtime. Every adapter is
 * graph-capable (records + graph edges + asset blobs — D4), so the factory hands
 * back the wider port; record-only consumers narrow to `PersistencePort`.
 */
export function createPersistencePort(): GraphPersistencePort {
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

let portSingleton: GraphPersistencePort | null = null;

export function getPersistencePort(): GraphPersistencePort {
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
