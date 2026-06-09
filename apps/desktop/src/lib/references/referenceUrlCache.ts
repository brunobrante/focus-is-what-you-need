import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";

/**
 * Session cache of reference object URLs, keyed by reference id.
 *
 * Reference binaries (images/videos) live on disk and are read through Tauri.
 * Eagerly turning every file into a blob URL at startup blocks the first paint
 * and pins every image in memory. This cache instead resolves a URL on demand
 * — the grid loads a card's image only when it scrolls into view, modals load
 * on open — and keeps it for the rest of the session so re-renders don't re-read
 * from disk. Freshly imported items prime the cache with the blob URL that
 * already exists in memory, so they appear instantly with no extra disk read.
 */

type LoadableReference = {
  id: string;
  ext?: string;
  name: string;
};

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/** Synchronous read of an already-resolved URL, or null if not loaded yet. */
export function peekReferenceUrl(id: string): string | null {
  return cache.get(id) ?? null;
}

/** Register an externally-created blob URL (e.g. a freshly imported file). */
export function primeReferenceUrl(id: string, url: string): void {
  const existing = cache.get(id);
  if (existing === url) return;
  if (existing) URL.revokeObjectURL(existing);
  cache.set(id, url);
}

/** Resolve a reference URL, reading the file from disk once and caching it. */
export function loadReferenceUrl(item: LoadableReference): Promise<string | null> {
  const cached = cache.get(item.id);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(item.id);
  if (pending) return pending;

  const promise = (async () => {
    const ext = item.ext || extFromName(item.name);
    const blob = await loadReferenceFile(item.id, ext).catch(() => null);
    if (!blob) return null;
    // Another caller may have primed/resolved this id while we awaited the read.
    const existing = cache.get(item.id);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    cache.set(item.id, url);
    return url;
  })();

  inflight.set(item.id, promise);
  void promise.finally(() => {
    if (inflight.get(item.id) === promise) inflight.delete(item.id);
  });
  return promise;
}

/** Revoke and forget a single reference URL (on delete/discard). */
export function dropReferenceUrl(id: string): void {
  const url = cache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(id);
  }
  inflight.delete(id);
}

/** Revoke every cached URL (on leaving the references route). */
export function clearReferenceUrlCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inflight.clear();
}
