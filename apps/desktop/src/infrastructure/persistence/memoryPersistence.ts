import type { PersistencePort } from "@/domain/persistence/persistencePort";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";

/**
 * In-memory PersistencePort. Backs the "memory" runtime (Bun tests) and is the
 * reference implementation the SQLite/IndexedDB adapters must match.
 */
export function createMemoryPersistence(): PersistencePort {
  const tables = new Map<string, Map<string, string>>();

  function table(name: string): Map<string, string> {
    let bucket = tables.get(name);
    if (!bucket) {
      bucket = new Map();
      tables.set(name, bucket);
    }
    return bucket;
  }

  function apply(mutation: Mutation): void {
    switch (mutation.op) {
      case "upsertRecord":
        table(mutation.table).set(mutation.id, mutation.json);
        return;
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
      return table(name).get(id) ?? null;
    },
    async listRecords(name) {
      return Array.from(table(name).values());
    },
  };
}
