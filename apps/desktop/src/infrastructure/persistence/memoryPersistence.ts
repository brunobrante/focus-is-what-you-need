import type {
  AssetBlobMeta,
  GraphPersistencePort,
} from "@/domain/persistence/persistencePort";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";

/**
 * In-memory PersistencePort. Backs the "memory" runtime (Bun tests) and is the
 * reference implementation the SQLite/IndexedDB adapters must match.
 *
 * Each cell keeps the row JSON alongside its `rev` so the optimistic-write guard
 * (D6) can reject a stale upsert — `incoming.rev > stored.rev`. A mutation that
 * omits `rev` is applied unconditionally (legacy / last-write-wins).
 */
type Cell = { json: string; rev: number | undefined };

export function createMemoryPersistence(): GraphPersistencePort {
  const tables = new Map<string, Map<string, Cell>>();
  const blobs = new Map<string, { bytes: Uint8Array; meta: AssetBlobMeta }>();

  function table(name: string): Map<string, Cell> {
    let bucket = tables.get(name);
    if (!bucket) {
      bucket = new Map();
      tables.set(name, bucket);
    }
    return bucket;
  }

  function apply(mutation: Mutation): void {
    switch (mutation.op) {
      case "upsertRecord": {
        const bucket = table(mutation.table);
        if (mutation.rev !== undefined) {
          const stored = bucket.get(mutation.id);
          // Reject a stale write: keep the row when its rev is >= the incoming one.
          if (stored && stored.rev !== undefined && mutation.rev <= stored.rev) {
            return;
          }
        }
        bucket.set(mutation.id, { json: mutation.json, rev: mutation.rev });
        return;
      }
      case "deleteRecords": {
        const bucket = table(mutation.table);
        for (const id of mutation.ids) bucket.delete(id);
        return;
      }
    }
  }

  return {
    async applyBatch(mutations) {
      for (const mutation of mutations) apply(mutation);
      const ack: ApplyAck = { applied: mutations.length };
      return ack;
    },
    async getRecord(name, id) {
      return table(name).get(id)?.json ?? null;
    },
    async listRecords(name) {
      return Array.from(table(name).values(), (cell) => cell.json);
    },
    async getAssetBlob(blobKey) {
      return blobs.get(blobKey)?.bytes ?? null;
    },
    async getAssetBlobs(blobKeys) {
      const out = new Map<string, Uint8Array>();
      for (const key of blobKeys) {
        const entry = blobs.get(key);
        if (entry) out.set(key, entry.bytes);
      }
      return out;
    },
    async putAssetBlob(bytes, meta) {
      blobs.set(meta.blobKey, { bytes, meta });
    },
    async deleteAssetBlob(blobKey) {
      blobs.delete(blobKey);
    },
  };
}
