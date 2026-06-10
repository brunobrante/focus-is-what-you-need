import { base64ToBlob } from "./codec";
import type { ReferenceBlobStore, StackBatchFile } from "./types";

/**
 * Web adapter. Reference binaries live in a dedicated IndexedDB database, one
 * row per payload. IndexedDB stores `Blob` natively, so there is no base64
 * round-trip on the read path the way the disk/IPC path needs one.
 *
 * Every row for a reference is keyed under a single `ref:{id}:` prefix:
 *   - `ref:{id}:original`         the original image/video blob
 *   - `ref:{id}:stack:{file}`     one crop PNG
 *   - `ref:{id}:stackdata`        the stack data.json string
 * Deleting the original range-deletes the whole prefix, mirroring the desktop
 * behaviour of removing the `references/{id}` directory.
 *
 * Video frame extraction (ffmpeg) has no browser equivalent, so those methods
 * degrade to "unavailable" / null and video references skip frame extraction.
 */

const DB_NAME = "focus-reference-blobs";
const DB_VERSION = 1;
const STORE = "blobs";

type BlobRow = { key: string; blob?: Blob; json?: string };

let dbPromise: Promise<IDBDatabase> | null = null;

const prefix = (id: string) => `ref:${id}:`;
const originalKey = (id: string) => `${prefix(id)}original`;
const stackFileKey = (id: string, fileName: string) => `${prefix(id)}stack:${fileName}`;
const stackPrefix = (id: string) => `${prefix(id)}stack:`;
const stackDataKey = (id: string) => `${prefix(id)}stackdata`;

export function createIndexedDbReferenceBlobStore(): ReferenceBlobStore {
  return {
    async writeOriginal(id, _ext, blob) {
      await put({ key: originalKey(id), blob });
    },

    async readOriginal(id) {
      const row = await get(originalKey(id));
      return row?.blob ?? null;
    },

    async deleteOriginal(id) {
      // Mirror `delete_reference_file`: nuke everything under the reference.
      await deleteRange(prefix(id));
    },

    async writeStackFile(id, fileName, blob) {
      await put({ key: stackFileKey(id, fileName), blob });
    },

    async readStackFile(id, fileName) {
      const row = await get(stackFileKey(id, fileName));
      return row?.blob ?? null;
    },

    async writeStackBatch(id, files: StackBatchFile[], dataJson) {
      const db = await openDatabase();
      await runWrite(db, (objectStore) => {
        // Replace the whole stack subtree, like the Rust batch command does.
        deleteRangeInStore(objectStore, stackPrefix(id));
        for (const file of files) {
          objectStore.put({
            key: stackFileKey(id, file.fileName),
            blob: base64ToBlob(file.dataB64, "image/png"),
          } satisfies BlobRow);
        }
        objectStore.put({ key: stackDataKey(id), json: dataJson } satisfies BlobRow);
      });
    },

    async writeStackData(id, dataJson) {
      await put({ key: stackDataKey(id), json: dataJson });
    },

    async readStackData(id) {
      const row = await get(stackDataKey(id));
      return row?.json ?? null;
    },

    async deleteStack(id) {
      const db = await openDatabase();
      await runWrite(db, (objectStore) => {
        deleteRangeInStore(objectStore, stackPrefix(id));
        objectStore.delete(stackDataKey(id));
      });
    },

    // ffmpeg is desktop-only; the browser cannot run the sidecar.
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
      // No frames are ever written on web.
    },
  };
}

/* ---------- IndexedDB plumbing ---------- */

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

async function get(key: string): Promise<BlobRow | undefined> {
  const db = await openDatabase();
  const tx = db.transaction(STORE, "readonly");
  return reqToPromise<BlobRow | undefined>(tx.objectStore(STORE).get(key));
}

async function put(row: BlobRow): Promise<void> {
  const db = await openDatabase();
  await runWrite(db, (objectStore) => {
    objectStore.put(row);
  });
}

async function deleteRange(keyPrefix: string): Promise<void> {
  const db = await openDatabase();
  await runWrite(db, (objectStore) => {
    deleteRangeInStore(objectStore, keyPrefix);
  });
}

function deleteRangeInStore(objectStore: IDBObjectStore, keyPrefix: string): void {
  // `￿` is the highest UTF-16 code unit, so this bounds every key that
  // starts with `keyPrefix`.
  objectStore.delete(IDBKeyRange.bound(keyPrefix, `${keyPrefix}￿`));
}

function runWrite(db: IDBDatabase, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
