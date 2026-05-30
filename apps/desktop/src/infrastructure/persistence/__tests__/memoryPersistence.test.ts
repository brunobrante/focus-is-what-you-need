import { expect, test } from "bun:test";

import { createMemoryPersistence } from "@/infrastructure/persistence/memoryPersistence";

test("applyBatch upserts and getRecord reads one record", async () => {
  const port = createMemoryPersistence();
  await port.applyBatch([
    { op: "upsertRecord", table: "projects", id: "p1", json: '{"id":"p1","n":1}' },
  ]);
  expect(await port.getRecord("projects", "p1")).toBe('{"id":"p1","n":1}');
});

test("upsert overwrites the same id", async () => {
  const port = createMemoryPersistence();
  await port.applyBatch([
    { op: "upsertRecord", table: "t", id: "a", json: "1" },
  ]);
  await port.applyBatch([
    { op: "upsertRecord", table: "t", id: "a", json: "2" },
  ]);
  expect(await port.getRecord("t", "a")).toBe("2");
  expect(await port.listRecords("t")).toEqual(["2"]);
});

test("deleteRecords removes by id", async () => {
  const port = createMemoryPersistence();
  await port.applyBatch([
    { op: "upsertRecord", table: "t", id: "a", json: "1" },
    { op: "upsertRecord", table: "t", id: "b", json: "2" },
  ]);
  await port.applyBatch([{ op: "deleteRecords", table: "t", ids: ["a"] }]);
  expect(await port.listRecords("t")).toEqual(["2"]);
  expect(await port.getRecord("t", "a")).toBeNull();
});

test("listRecords scopes to one table", async () => {
  const port = createMemoryPersistence();
  await port.applyBatch([
    { op: "upsertRecord", table: "x", id: "1", json: "x1" },
    { op: "upsertRecord", table: "y", id: "1", json: "y1" },
  ]);
  expect(await port.listRecords("x")).toEqual(["x1"]);
  expect(await port.listRecords("y")).toEqual(["y1"]);
});
