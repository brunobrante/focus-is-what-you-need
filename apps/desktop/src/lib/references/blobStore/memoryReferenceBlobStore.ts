import { base64ToBlob } from "./codec";
import type { ReferenceBlobStore, StackBatchFile } from "./types";

/**
 * In-memory adapter. Backs the "memory" runtime (Bun tests, or any environment
 * without IndexedDB). Same key scheme as the IndexedDB adapter.
 */
export function createMemoryReferenceBlobStore(): ReferenceBlobStore {
  const blobs = new Map<string, Blob>();
  const json = new Map<string, string>();

  const prefix = (id: string) => `ref:${id}:`;
  const originalKey = (id: string) => `${prefix(id)}original`;
  const stackFileKey = (id: string, fileName: string) => `${prefix(id)}stack:${fileName}`;
  const stackPrefix = (id: string) => `${prefix(id)}stack:`;
  const stackDataKey = (id: string) => `${prefix(id)}stackdata`;

  const deleteByPrefix = (map: Map<string, unknown>, keyPrefix: string) => {
    for (const key of map.keys()) {
      if (key.startsWith(keyPrefix)) map.delete(key);
    }
  };

  return {
    async writeOriginal(id, _ext, blob) {
      blobs.set(originalKey(id), blob);
    },
    async readOriginal(id) {
      return blobs.get(originalKey(id)) ?? null;
    },
    async deleteOriginal(id) {
      deleteByPrefix(blobs, prefix(id));
      deleteByPrefix(json, prefix(id));
    },

    async writeStackFile(id, fileName, blob) {
      blobs.set(stackFileKey(id, fileName), blob);
    },
    async readStackFile(id, fileName) {
      return blobs.get(stackFileKey(id, fileName)) ?? null;
    },
    async writeStackBatch(id, files: StackBatchFile[], dataJson) {
      deleteByPrefix(blobs, stackPrefix(id));
      for (const file of files) {
        blobs.set(stackFileKey(id, file.fileName), base64ToBlob(file.dataB64, "image/png"));
      }
      json.set(stackDataKey(id), dataJson);
    },
    async writeStackData(id, dataJson) {
      json.set(stackDataKey(id), dataJson);
    },
    async readStackData(id) {
      return json.get(stackDataKey(id)) ?? null;
    },
    async deleteStack(id) {
      deleteByPrefix(blobs, stackPrefix(id));
      json.delete(stackDataKey(id));
    },

    async ffmpegAvailable() {
      return false;
    },
    async extractVideoFrames() {
      return [];
    },
    async extractVideoFrameFull() {
      return null;
    },
    async readFrame() {
      return null;
    },
    async deleteFrames() {
      // No-op: frames are never produced without ffmpeg.
    },
  };
}
