import { describe, expect, test } from "bun:test";

import type {
  AssetBlobMeta,
  GraphPersistencePort,
  PersistencePort,
} from "@/domain/persistence/persistencePort";

/**
 * The one persistence-port contract suite (Architecture.md D9). The memory
 * adapter is the reference; every adapter (memory / sqlite / indexeddb) must pass
 * the exact same spec. It is a reusable function so each adapter wires its own
 * factory: `runRecordPortContract("memory", createMemoryPersistence)`.
 *
 * SQLite runs behind Tauri IPC and IndexedDB behind a browser object store, so
 * those two are exercised by their own integration harnesses (a fake-indexeddb
 * shim for web, the desktop app for SQLite) — but against THIS function, so the
 * three can never silently diverge.
 *
 * Coverage grows with the architecture: records + the `rev` guard now; graph
 * edges (both index directions + unique-live), `instance_usage`, and asset blobs
 * are appended here as each step lands.
 */
export function runRecordPortContract(
  name: string,
  makePort: () => PersistencePort,
): void {
  describe(`PersistencePort contract: ${name}`, () => {
    test("upserts and reads back one record", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "projects", id: "p1", json: '{"id":"p1","n":1}' },
      ]);
      expect(await port.getRecord("projects", "p1")).toBe('{"id":"p1","n":1}');
    });

    test("an un-revisioned upsert overwrites the same id", async () => {
      const port = makePort();
      await port.applyBatch([{ op: "upsertRecord", table: "t", id: "a", json: "1" }]);
      await port.applyBatch([{ op: "upsertRecord", table: "t", id: "a", json: "2" }]);
      expect(await port.getRecord("t", "a")).toBe("2");
      expect(await port.listRecords("t")).toEqual(["2"]);
    });

    test("deleteRecords removes by id", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "1" },
        { op: "upsertRecord", table: "t", id: "b", json: "2" },
      ]);
      await port.applyBatch([{ op: "deleteRecords", table: "t", ids: ["a"] }]);
      expect(await port.listRecords("t")).toEqual(["2"]);
      expect(await port.getRecord("t", "a")).toBeNull();
    });

    test("listRecords scopes to one table", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "x", id: "1", json: "x1" },
        { op: "upsertRecord", table: "y", id: "1", json: "y1" },
      ]);
      expect(await port.listRecords("x")).toEqual(["x1"]);
      expect(await port.listRecords("y")).toEqual(["y1"]);
    });

    // --- rev guard (D6) ---------------------------------------------------

    test("a higher rev wins over the stored row", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "r1", rev: 1 },
      ]);
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "r2", rev: 2 },
      ]);
      expect(await port.getRecord("t", "a")).toBe("r2");
    });

    test("a stale (lower) rev is rejected", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "r5", rev: 5 },
      ]);
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "r3", rev: 3 },
      ]);
      expect(await port.getRecord("t", "a")).toBe("r5");
    });

    test("an equal rev does not overwrite (idempotent replay)", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "first", rev: 4 },
      ]);
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "second", rev: 4 },
      ]);
      expect(await port.getRecord("t", "a")).toBe("first");
    });

    test("a re-inserted id after delete starts fresh", async () => {
      const port = makePort();
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "r9", rev: 9 },
      ]);
      await port.applyBatch([{ op: "deleteRecords", table: "t", ids: ["a"] }]);
      // After a hard delete there is no stored rev, so even rev 1 applies.
      await port.applyBatch([
        { op: "upsertRecord", table: "t", id: "a", json: "fresh", rev: 1 },
      ]);
      expect(await port.getRecord("t", "a")).toBe("fresh");
    });
  });
}

/**
 * Asset-blob half of the port contract (D5). Same shape as above: the memory
 * adapter is the reference; every graph-capable adapter must pass this.
 */
export function runAssetBlobContract(
  name: string,
  makePort: () => GraphPersistencePort,
): void {
  const meta = (blobKey: string, byteLength: number): AssetBlobMeta => ({
    blobKey,
    contentHash: null,
    mimeType: "image/svg+xml",
    byteLength,
    width: null,
    height: null,
    storageKind: "sqliteBlob",
  });

  describe(`AssetBlob contract: ${name}`, () => {
    test("put then get round-trips the exact bytes", async () => {
      const port = makePort();
      const bytes = new Uint8Array([1, 2, 3, 250, 0, 99]);
      await port.putAssetBlob(bytes, meta("k1", bytes.byteLength));
      expect(Array.from((await port.getAssetBlob("k1"))!)).toEqual(
        Array.from(bytes),
      );
    });

    test("get of an unknown key is null", async () => {
      const port = makePort();
      expect(await port.getAssetBlob("nope")).toBeNull();
    });

    test("put overwrites the same key", async () => {
      const port = makePort();
      await port.putAssetBlob(new Uint8Array([1]), meta("k", 1));
      await port.putAssetBlob(new Uint8Array([9, 9]), meta("k", 2));
      expect(Array.from((await port.getAssetBlob("k"))!)).toEqual([9, 9]);
    });

    test("delete removes the blob", async () => {
      const port = makePort();
      await port.putAssetBlob(new Uint8Array([7]), meta("k", 1));
      await port.deleteAssetBlob("k");
      expect(await port.getAssetBlob("k")).toBeNull();
    });

    test("getAssetBlobs batch-reads many keys, omitting the missing ones", async () => {
      const port = makePort();
      await port.putAssetBlob(new Uint8Array([1, 1]), meta("a", 2));
      await port.putAssetBlob(new Uint8Array([2, 2, 2]), meta("b", 3));

      const found = await port.getAssetBlobs(["a", "b", "missing"]);
      expect(found.size).toBe(2);
      expect(Array.from(found.get("a")!)).toEqual([1, 1]);
      expect(Array.from(found.get("b")!)).toEqual([2, 2, 2]);
      expect(found.has("missing")).toBe(false);
    });

    test("getAssetBlobs of an empty list is an empty map", async () => {
      const port = makePort();
      expect((await port.getAssetBlobs([])).size).toBe(0);
    });

    test("blobs never surface as records", async () => {
      const port = makePort();
      await port.putAssetBlob(new Uint8Array([1, 2]), meta("k", 2));
      // The asset store is a separate namespace — a record listing is untouched.
      expect(await port.listRecords("asset_blobs")).toEqual([]);
    });
  });
}
