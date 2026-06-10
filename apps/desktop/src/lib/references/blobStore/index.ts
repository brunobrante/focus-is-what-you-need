import { detectPersistenceRuntime } from "@/infrastructure/persistence/runtime";
import { createIndexedDbReferenceBlobStore } from "./indexedDbReferenceBlobStore";
import { createMemoryReferenceBlobStore } from "./memoryReferenceBlobStore";
import { createTauriReferenceBlobStore } from "./tauriReferenceBlobStore";
import type { ReferenceBlobStore } from "./types";

export type {
  ExtractedFrame,
  ReferenceBlobStore,
  StackBatchFile,
  VideoFrameOptions,
} from "./types";

let instance: ReferenceBlobStore | null = null;

/** Picks the binary-storage adapter from the same runtime detection the
 *  structured persistence port uses, so References / Builder binaries land
 *  wherever that environment can store them. */
export function getReferenceBlobStore(): ReferenceBlobStore {
  if (instance) return instance;
  instance = createReferenceBlobStore();
  return instance;
}

function createReferenceBlobStore(): ReferenceBlobStore {
  switch (detectPersistenceRuntime()) {
    case "desktop":
      return createTauriReferenceBlobStore();
    case "web":
      return createIndexedDbReferenceBlobStore();
    case "memory":
      return createMemoryReferenceBlobStore();
  }
}

/** Test seam — drops the cached singleton. */
export function resetReferenceBlobStore(): void {
  instance = null;
}
