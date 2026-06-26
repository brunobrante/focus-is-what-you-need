import { createMemoryPersistence } from "@/infrastructure/persistence/memoryPersistence";

import { runRecordPortContract } from "./persistencePortContract";

// The memory adapter is the reference implementation for the port contract (D9).
runRecordPortContract("memory", createMemoryPersistence);
