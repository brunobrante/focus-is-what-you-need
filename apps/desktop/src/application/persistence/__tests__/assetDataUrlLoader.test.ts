import { beforeEach, expect, test } from "bun:test";

import { putAssetText } from "@/application/persistence/assetStore";
import {
  invalidateAssetDataUrl,
  loadAssetDataUrl,
  peekAssetDataUrl,
  resetAssetDataUrlCacheForTests,
} from "@/application/persistence/assetDataUrlLoader";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";

// Flip 3: the batching loader resolves blob-keyed thumbnail data URLs, coalescing
// concurrent reads into one round-trip and caching the result.

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetAssetDataUrlCacheForTests();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

test("loads a stored data URL and caches it for synchronous peek", async () => {
  await putAssetText("data:image/svg+xml;utf8,<svg/>", {
    blobKey: "thumb-1",
    mimeType: "image/svg+xml",
  });

  expect(peekAssetDataUrl("thumb-1")).toBeUndefined(); // not loaded yet
  const url = await loadAssetDataUrl("thumb-1");
  expect(url).toBe("data:image/svg+xml;utf8,<svg/>");
  expect(peekAssetDataUrl("thumb-1")).toBe(url); // now cached
});

test("a missing key resolves and caches null", async () => {
  expect(await loadAssetDataUrl("nope")).toBeNull();
  expect(peekAssetDataUrl("nope")).toBeNull();
});

test("concurrent loads of several keys all resolve", async () => {
  await putAssetText("A", { blobKey: "a", mimeType: "text/plain" });
  await putAssetText("B", { blobKey: "b", mimeType: "text/plain" });

  const [a, b, c] = await Promise.all([
    loadAssetDataUrl("a"),
    loadAssetDataUrl("b"),
    loadAssetDataUrl("c"),
  ]);
  expect([a, b, c]).toEqual(["A", "B", null]);
});

test("invalidate forces a refetch of rewritten bytes under a reused key", async () => {
  await putAssetText("v1", { blobKey: "k", mimeType: "text/plain" });
  expect(await loadAssetDataUrl("k")).toBe("v1");

  // Rewrite in place (stable key) — without invalidation the cache stays stale.
  await putAssetText("v2", { blobKey: "k", mimeType: "text/plain" });
  expect(await loadAssetDataUrl("k")).toBe("v1"); // cached
  invalidateAssetDataUrl("k");
  expect(await loadAssetDataUrl("k")).toBe("v2"); // refetched
});
