import { getPersistencePort } from "@/infrastructure/persistence/createPersistence";
import { detectPersistenceRuntime } from "@/infrastructure/persistence/runtime";
import { newId } from "@/lib/storage/ids";
import { base64ToBytes, bytesToBase64 } from "@/lib/encoding/base64";
import type {
  AssetBlobMeta,
  AssetStorageKind,
} from "@/domain/persistence/persistencePort";

/**
 * The asset store: binaries (thumbnails, crop images, imported assets) keyed by
 * `blobKey`, kept OUT of the records table so a bulk `listRecords` never drags
 * megabytes through one IPC (RUST-4 / save-architecture-v3 D5). Rows store only a
 * `blobKey`; this module reads/writes the bytes.
 *
 * The adapter underneath decides physical placement: desktop keeps small blobs
 * (<=256 KB) in a SQLite column and large ones as files keyed by `blobKey`; web
 * uses an IndexedDB object store. We record the chosen `storageKind` in the meta
 * so a future GC / export step knows where each blob lives.
 */
const SQLITE_INLINE_LIMIT = 256 * 1024;

function pickStorageKind(byteLength: number): AssetStorageKind {
  if (detectPersistenceRuntime() === "web") return "indexedDbBlob";
  return byteLength <= SQLITE_INLINE_LIMIT ? "sqliteBlob" : "file";
}

export type PutAssetInput = {
  /** Reuse a stable key (e.g. a per-owner thumbnail) to overwrite in place. */
  blobKey?: string;
  mimeType: string;
  contentHash?: string | null;
  width?: number | null;
  height?: number | null;
};

/** Store bytes; returns the `blobKey` to persist on the owning row. */
export async function putAsset(
  bytes: Uint8Array,
  input: PutAssetInput,
): Promise<string> {
  const blobKey = input.blobKey ?? newId();
  const meta: AssetBlobMeta = {
    blobKey,
    contentHash: input.contentHash ?? null,
    mimeType: input.mimeType,
    byteLength: bytes.byteLength,
    width: input.width ?? null,
    height: input.height ?? null,
    storageKind: pickStorageKind(bytes.byteLength),
  };
  await getPersistencePort().putAssetBlob(bytes, meta);
  return blobKey;
}

export async function getAssetBytes(blobKey: string): Promise<Uint8Array | null> {
  return getPersistencePort().getAssetBlob(blobKey);
}

export async function deleteAsset(blobKey: string): Promise<void> {
  await getPersistencePort().deleteAssetBlob(blobKey);
}

// --- text/dataURL convenience (thumbnails are SVG data-URL strings) ----------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Store a UTF-8 string (e.g. an SVG data URL) and return its `blobKey`. */
export async function putAssetText(
  text: string,
  input: PutAssetInput,
): Promise<string> {
  return putAsset(encoder.encode(text), input);
}

/** Read a blob back as a UTF-8 string, or null if the key is unknown. */
export async function getAssetText(blobKey: string): Promise<string | null> {
  const bytes = await getAssetBytes(blobKey);
  return bytes == null ? null : decoder.decode(bytes);
}

/**
 * Batched UTF-8 read (flip 3): resolve many blob keys to strings in ONE port
 * round-trip. Returns a map of the keys that were found; callers treat a missing
 * key as "no asset". Backs the thumbnail grid loader so N cards cost one IPC.
 */
export async function getAssetTextMany(
  blobKeys: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (blobKeys.length === 0) return out;
  const bytesByKey = await getPersistencePort().getAssetBlobs(blobKeys);
  for (const [key, bytes] of bytesByKey) out.set(key, decoder.decode(bytes));
  return out;
}

/** Read a blob back as a `data:` URL of the given mime type. */
export async function getAssetDataUrl(
  blobKey: string,
  mimeType: string,
): Promise<string | null> {
  const bytes = await getAssetBytes(blobKey);
  return bytes == null ? null : `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/** Decode a `data:...;base64,` URL into bytes (for callers holding a baked URL). */
export function bytesFromBase64DataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  return base64ToBytes(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
}
