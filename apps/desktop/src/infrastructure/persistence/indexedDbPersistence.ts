import type { PersistencePort } from "@/domain/persistence/persistencePort";
import type { ApplyAck, Mutation } from "@/domain/persistence/mutations";

/**
 * Web PersistencePort over a real IndexedDB object store (not a blob KV). One
 * record per row keyed by `[table, id]`; an entire interaction applies in a
 * single `IDBTransaction`, so it is atomic with no IPC.
 *
 * Rows carry their `rev` so an upsert can enforce the optimistic-write guard
 * (D6): a `get` then a conditional `put`, both within the one transaction, so a
 * stale write (`incoming.rev <= stored.rev`) is dropped. A mutation without
 * `rev` overwrites unconditionally (legacy / last-write-wins).
 */

const DB_NAME = "focus-persistence";
const DB_VERSION = 1;
const RECORDS = "records";

type RecordRow = { table: string; id: string; json: string; rev?: number };

let dbPromise: Promise<IDBDatabase> | null = null;

export function createIndexedDbPersistence(): PersistencePort {
  return {
    async applyBatch(mutations) {
      const db = await openDatabase();
      return new Promise<ApplyAck>((resolve, reject) => {
        const tx = db.transaction(RECORDS, "readwrite");
        const recordsStore = tx.objectStore(RECORDS);
        for (const mutation of mutations) applyMutation(recordsStore, mutation);
        tx.oncomplete = () => resolve({ applied: mutations.length });
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },

    async getRecord(table, id) {
      const db = await openDatabase();
      const row = await reqToPromise<RecordRow | undefined>(
        store(db, "readonly").get([table, id]),
      );
      return row?.json ?? null;
    },

    async listRecords(table) {
      const db = await openDatabase();
      const range = IDBKeyRange.bound([table], [table, []]);
      const rows = await reqToPromise<RecordRow[]>(
        store(db, "readonly").getAll(range),
      );
      return rows.map((row) => row.json);
    },
  };
}

function applyMutation(recordsStore: IDBObjectStore, mutation: Mutation): void {
  switch (mutation.op) {
    case "upsertRecord": {
      const next: RecordRow = {
        table: mutation.table,
        id: mutation.id,
        json: mutation.json,
        rev: mutation.rev,
      };
      if (mutation.rev === undefined) {
        recordsStore.put(next);
        return;
      }
      // Guarded upsert: read the stored row first, then put only if the incoming
      // rev wins. Both requests stay on this readwrite transaction, so the read
      // sees committed state and the write is atomic with the rest of the batch.
      const getReq = recordsStore.get([mutation.table, mutation.id]);
      getReq.onsuccess = () => {
        const stored = getReq.result as RecordRow | undefined;
        if (stored && stored.rev !== undefined && mutation.rev! <= stored.rev) {
          return; // stale write — keep the newer row
        }
        recordsStore.put(next);
      };
      return;
    }
    case "deleteRecords":
      for (const id of mutation.ids) {
        recordsStore.delete([mutation.table, id]);
      }
      return;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        db.createObjectStore(RECORDS, { keyPath: ["table", "id"] });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(RECORDS, mode).objectStore(RECORDS);
}

function reqToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
