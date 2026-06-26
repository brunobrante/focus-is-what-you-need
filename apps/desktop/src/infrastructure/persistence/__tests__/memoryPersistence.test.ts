import { createMemoryPersistence } from "@/infrastructure/persistence/memoryPersistence";

import {
  runAssetBlobContract,
  runRecordPortContract,
} from "./persistencePortContract";

// The memory adapter is the reference implementation for the port contract (D9).
runRecordPortContract("memory", createMemoryPersistence);
runAssetBlobContract("memory", createMemoryPersistence);
