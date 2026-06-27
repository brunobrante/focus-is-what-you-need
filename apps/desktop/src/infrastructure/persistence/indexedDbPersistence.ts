import type {
  AssetBlobMeta,
  GraphPersistencePort,
} from "@/domain/persistence/persistencePort";
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
// v2 adds the `asset_blobs` store (binaries out of the record JSON, RUST-4 / D5).
const DB_VERSION = 2;
const RECORDS = "records";
const ASSET_BLOBS = "asset_blobs";

type RecordRow = { table: string; id: string; json: string; rev?: number };
type AssetBlobEntry = { blobKey: string; bytes: Uint8Array; meta: AssetBlobMeta };

let dbPromise: Promise<IDBDatabase> | null = null;
// Sync handle to the live connection so test teardown can close it before the DB
// is deleted (an open connection blocks `deleteDatabase`, which would then stall
// the next `open` — see `resetIndexedDbForTests`). In production the connection
// lives for the app's lifetime and is never closed.
let openDb: IDBDatabase | null = null;

export function createIndexedDbPersistence(): GraphPersistencePort {
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

    async getAssetBlob(blobKey) {
      const db = await openDatabase();
      const entry = await reqToPromise<AssetBlobEntry | undefined>(
        db.transaction(ASSET_BLOBS, "readonly").objectStore(ASSET_BLOBS).get(blobKey),
      );
      return entry?.bytes ?? null;
    },

    async getAssetBlobs(blobKeys) {
      const db = await openDatabase();
      // One readonly transaction, one get per key (no full-store scan); the keys a
      // grid asks for are a small set, and they all resolve on the same tx.
      const store = db
        .transaction(ASSET_BLOBS, "readonly")
        .objectStore(ASSET_BLOBS);
      const entries = await Promise.all(
        blobKeys.map((key) =>
          reqToPromise<AssetBlobEntry | undefined>(store.get(key)),
        ),
      );
      const out = new Map<string, Uint8Array>();
      entries.forEach((entry, i) => {
        if (entry) out.set(blobKeys[i]!, entry.bytes);
      });
      return out;
    },

    async putAssetBlob(bytes, meta) {
      const db = await openDatabase();
      await txDone(
        db.transaction(ASSET_BLOBS, "readwrite"),
        (tx) =>
          tx
            .objectStore(ASSET_BLOBS)
            .put({ blobKey: meta.blobKey, bytes, meta } satisfies AssetBlobEntry),
      );
    },

    async deleteAssetBlob(blobKey) {
      const db = await openDatabase();
      await txDone(db.transaction(ASSET_BLOBS, "readwrite"), (tx) =>
        tx.objectStore(ASSET_BLOBS).delete(blobKey),
      );
    },
  };
}

function txDone(tx: IDBTransaction, run: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    run(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
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

/** Test seam: drop the cached connection so the next open re-runs against a fresh
 *  (e.g. just-deleted) database. Pairs with `indexedDB.deleteDatabase` in tests. */
export function resetIndexedDbForTests(): void {
  // Close the live connection synchronously so the paired `deleteDatabase` isn't
  // blocked (a blocked delete stalls the next open → every later test times out).
  openDb?.close();
  openDb = null;
  dbPromise = null;
}

export const INDEXED_DB_NAME = DB_NAME;

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
      if (!db.objectStoreNames.contains(ASSET_BLOBS)) {
        db.createObjectStore(ASSET_BLOBS, { keyPath: "blobKey" });
      }
    };
    request.onsuccess = () => {
      openDb = request.result;
      resolve(request.result);
    };
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
