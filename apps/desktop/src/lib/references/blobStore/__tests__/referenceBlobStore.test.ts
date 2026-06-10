import { describe, expect, it } from "bun:test";
import { createMemoryReferenceBlobStore } from "../memoryReferenceBlobStore";

const blob = (text: string) => new Blob([text], { type: "image/png" });
const text = async (b: Blob | null) => (b ? b.text() : null);

describe("memory reference blob store", () => {
  it("round-trips the original media", async () => {
    const store = createMemoryReferenceBlobStore();
    await store.writeOriginal("ref-1", "png", blob("original"));
    expect(await text(await store.readOriginal("ref-1", "png"))).toBe("original");
  });

  it("isolates blobs per reference id", async () => {
    const store = createMemoryReferenceBlobStore();
    await store.writeOriginal("a", "png", blob("A"));
    await store.writeOriginal("b", "png", blob("B"));
    expect(await text(await store.readOriginal("a", "png"))).toBe("A");
    expect(await text(await store.readOriginal("b", "png"))).toBe("B");
  });

  it("replaces the whole stack subtree on each batch write", async () => {
    const store = createMemoryReferenceBlobStore();
    // btoa-encoded payloads so base64ToBlob can decode them.
    await store.writeStackBatch(
      "ref-1",
      [
        { fileName: "old.png", dataB64: btoa("old") },
        { fileName: "keep.png", dataB64: btoa("v1") },
      ],
      JSON.stringify({ components: ["a"] }),
    );
    await store.writeStackBatch(
      "ref-1",
      [{ fileName: "keep.png", dataB64: btoa("v2") }],
      JSON.stringify({ components: ["b"] }),
    );

    // "old.png" from the first batch is gone; "keep.png" reflects the latest write.
    expect(await store.readStackFile("ref-1", "old.png", "image/png")).toBeNull();
    expect(await text(await store.readStackFile("ref-1", "keep.png", "image/png"))).toBe("v2");
    expect(await store.readStackData("ref-1")).toBe(JSON.stringify({ components: ["b"] }));
  });

  it("deleteOriginal nukes original + stack + data, like removing the id directory", async () => {
    const store = createMemoryReferenceBlobStore();
    await store.writeOriginal("ref-1", "png", blob("original"));
    await store.writeStackBatch(
      "ref-1",
      [{ fileName: "cut.png", dataB64: btoa("cut") }],
      JSON.stringify({ components: [] }),
    );

    await store.deleteOriginal("ref-1");

    expect(await store.readOriginal("ref-1", "png")).toBeNull();
    expect(await store.readStackFile("ref-1", "cut.png", "image/png")).toBeNull();
    expect(await store.readStackData("ref-1")).toBeNull();
  });

  it("deleteStack leaves the original intact", async () => {
    const store = createMemoryReferenceBlobStore();
    await store.writeOriginal("ref-1", "png", blob("original"));
    await store.writeStackBatch(
      "ref-1",
      [{ fileName: "cut.png", dataB64: btoa("cut") }],
      JSON.stringify({ components: [] }),
    );

    await store.deleteStack("ref-1");

    expect(await text(await store.readOriginal("ref-1", "png"))).toBe("original");
    expect(await store.readStackFile("ref-1", "cut.png", "image/png")).toBeNull();
    expect(await store.readStackData("ref-1")).toBeNull();
  });

  it("reports ffmpeg unavailable and skips frame extraction", async () => {
    const store = createMemoryReferenceBlobStore();
    expect(await store.ffmpegAvailable()).toBe(false);
    expect(await store.extractVideoFrames("ref-1", "mp4")).toEqual([]);
    expect(await store.extractVideoFrameFull("ref-1", "mp4", 0)).toBeNull();
    expect(await store.readFrame("ref-1", "frame-0.jpg")).toBeNull();
  });
});
