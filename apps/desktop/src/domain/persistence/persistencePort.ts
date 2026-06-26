import type { ApplyAck, Mutation } from "./mutations";

/**
 * The central persistence contract. Everything above this line (record store,
 * queue, repos) is written once; the adapters below it are the only pieces that
 * know whether the backend is SQLite (desktop), IndexedDB (web) or an in-memory
 * Map (tests).
 *
 * - Writes go through `applyBatch`: one atomic batch == one IPC on desktop /
 *   one IDBTransaction on web. N coalesced edits collapse to a single call.
 * - Reads are per record / per table — never a whole-database scan. Records are
 *   returned as raw JSON strings; the record-store layer parses and caches them.
 */
export interface PersistencePort {
  applyBatch(mutations: Mutation[]): Promise<ApplyAck>;
  getRecord(table: string, id: string): Promise<string | null>;
  listRecords(table: string): Promise<string[]>;
}

/**
 * Metadata for one stored binary (save-architecture-v3 D5). The bytes live in the
 * asset store keyed by `blobKey`; rows hold only this metadata + the key, so a
 * bulk `listRecords` never drags megabytes of base64 through one IPC (RUST-4).
 *
 * `storageKind` is chosen by size: desktop keeps small blobs (<=256 KB) in a
 * SQLite `blob` column and large ones as a file in the app data dir keyed by
 * `blobKey`; web keeps them in an IndexedDB object store. `contentHash` enables
 * dedup. Thumbnails and crops are regenerable caches and may be deleted.
 */
export type AssetStorageKind = "sqliteBlob" | "file" | "indexedDbBlob";

export type AssetBlobMeta = {
  blobKey: string;
  contentHash: string | null;
  mimeType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
  storageKind: AssetStorageKind;
};

/**
 * The record port extended with the graph + asset-blob capabilities of v3 (D4:
 * *extends*, never replaces — existing repos keep using `PersistencePort`). The
 * factory hands the graph-capable port to the repos that need it. Graph-edge and
 * instance-usage methods are added here as Step 2 / Step 3 land; the asset-blob
 * pair ships first.
 */
export interface GraphPersistencePort extends PersistencePort {
  /** Read raw bytes for a stored asset, or null if the key is unknown. */
  getAssetBlob(blobKey: string): Promise<Uint8Array | null>;
  /** Store (or replace) the bytes for `meta.blobKey`. Idempotent by key. */
  putAssetBlob(bytes: Uint8Array, meta: AssetBlobMeta): Promise<void>;
  /** Delete a stored asset (thumbnails/crops are regenerable — safe to drop). */
  deleteAssetBlob(blobKey: string): Promise<void>;
}

/** True when a port exposes the v3 graph/asset capabilities. */
export function isGraphPort(
  port: PersistencePort,
): port is GraphPersistencePort {
  return typeof (port as Partial<GraphPersistencePort>).getAssetBlob === "function";
}
