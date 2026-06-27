import { getAssetTextMany } from "@/application/persistence/assetStore";

/**
 * Batching loader for blob-keyed `data:` URL assets (flip 3, thumbnails).
 *
 * Thumbnails moved out of row JSON into the asset store keyed by `blobKey`. A
 * grid of N cards would otherwise do N `getAssetBlob` round-trips — slower than
 * the old single inline `listRecords`. This loader coalesces every key requested
 * within the same microtask into ONE `getAssetTextMany` call (a DataLoader-style
 * batch) and caches the result, so a grid mount costs one IPC and re-renders are
 * free.
 *
 * Thumbnail blobs store the full `data:` URL string verbatim, so a resolved value
 * is ready to drop into an `<img src>` with no mime reconstruction. A resolved
 * value of `null` means "no asset for that key" (cached as a negative result).
 */

// Resolved values (string = the data URL, null = known-missing). Absence from the
// map means "not loaded yet".
const cache = new Map<string, string | null>();
// In-flight promise per key so concurrent callers share one fetch.
const inflight = new Map<string, Promise<string | null>>();

let pending = new Set<string>();
let scheduled: Promise<void> | null = null;

/** Synchronous cache peek: the data URL, `null` if known-missing, or `undefined`
 *  if not loaded yet. Lets a hook paint a cached thumbnail without a flash. */
export function peekAssetDataUrl(blobKey: string): string | null | undefined {
  return cache.get(blobKey);
}

/** Load (and cache) the data URL for a blob key, batching with sibling calls. */
export function loadAssetDataUrl(blobKey: string): Promise<string | null> {
  if (cache.has(blobKey)) return Promise.resolve(cache.get(blobKey)!);
  const existing = inflight.get(blobKey);
  if (existing) return existing;

  pending.add(blobKey);
  scheduled ??= Promise.resolve().then(runBatch);
  const promise = scheduled.then(() => cache.get(blobKey) ?? null);
  inflight.set(blobKey, promise);
  return promise;
}

async function runBatch(): Promise<void> {
  const keys = Array.from(pending);
  pending = new Set();
  scheduled = null;
  const found = await getAssetTextMany(keys);
  for (const key of keys) {
    cache.set(key, found.get(key) ?? null);
    inflight.delete(key);
  }
}

/**
 * Drop a key's cached value so the next load refetches. Call this when a blob is
 * rewritten under a reused (stable) key — e.g. a thumbnail regenerated in place —
 * since the bytes changed but the key did not.
 */
export function invalidateAssetDataUrl(blobKey: string): void {
  cache.delete(blobKey);
  inflight.delete(blobKey);
}

/** Test seam: clear all cached/in-flight state. */
export function resetAssetDataUrlCacheForTests(): void {
  cache.clear();
  inflight.clear();
  pending = new Set();
  scheduled = null;
}
