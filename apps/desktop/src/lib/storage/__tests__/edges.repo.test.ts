import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { resetRecordStoreCache } from "@/lib/storage/store";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import {
  linkEdge,
  listEdges,
  ownerOf,
  relatedTargets,
  setEdges,
  setOwner,
  unlinkEdge,
} from "@/lib/storage/repos/edges.repo";
import type { EntityRef } from "@/domain/graph/edges";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
  removeItem(key: string): void {
    this.rows.delete(key);
  }
}

beforeEach(() => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

const ws: EntityRef = { type: "workspace", id: "w1" };
const p1: EntityRef = { type: "project", id: "p1" };
const p2: EntityRef = { type: "project", id: "p2" };
const comp: EntityRef = { type: "component", id: "c1" };

test("an edge is found from both directions", async () => {
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  expect((await listEdges({ from: ws, relation: "contains" })).map((e) => e.toId)).toEqual([
    "p1",
  ]);
  expect((await listEdges({ to: p1, relation: "contains" })).map((e) => e.fromId)).toEqual([
    "w1",
  ]);
});

test("linkEdge is idempotent per triple (unique-live)", async () => {
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  expect(await listEdges({ from: ws, relation: "contains" })).toHaveLength(1);
});

test("distinct targets coexist on the same from+relation", async () => {
  await linkEdge({ from: ws, relation: "contains", to: p1, order: 0 });
  await linkEdge({ from: ws, relation: "contains", to: p2, order: 1 });
  expect((await relatedTargets(ws, "contains")).map((r) => r.id)).toEqual(["p1", "p2"]);
});

test("unlinkEdge tombstones the edge (gone from both indexes)", async () => {
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  await unlinkEdge(ws, "contains", p1);
  expect(await listEdges({ from: ws, relation: "contains" })).toHaveLength(0);
  expect(await listEdges({ to: p1, relation: "contains" })).toHaveLength(0);
});

test("ownerOf resolves the incoming owns edge", async () => {
  await linkEdge({ from: p1, relation: "owns", to: comp });
  expect(await ownerOf(comp)).toEqual({ type: "project", id: "p1" });
  expect(await ownerOf({ type: "component", id: "missing" })).toBeNull();
});

test("setOwner re-homes the component to a new owner (promote shape)", async () => {
  await setOwner(p1, comp);
  expect(await ownerOf(comp)).toEqual({ type: "project", id: "p1" });
  // Re-home: the old owner edge is tombstoned, the new one is sole owner.
  await setOwner(p2, comp);
  expect(await ownerOf(comp)).toEqual({ type: "project", id: "p2" });
  expect(await listEdges({ to: comp, relation: "owns" })).toHaveLength(1);
  // Detach to a Draft: no owner edge at all.
  await setOwner(null, comp);
  expect(await ownerOf(comp)).toBeNull();
});

test("setEdges reconciles the full multi-target set (add + reap)", async () => {
  const ref: EntityRef = { type: "reference", id: "r1" };
  await setEdges(ref, "attached_to", [p1, p2]);
  expect((await listEdges({ from: ref, relation: "attached_to" })).map((e) => e.toId).sort()).toEqual(
    ["p1", "p2"],
  );
  // Drop p1, add a component target — the gone target is tombstoned.
  await setEdges(ref, "attached_to", [p2, comp]);
  expect(
    (await listEdges({ from: ref, relation: "attached_to" })).map((e) => e.toId).sort(),
  ).toEqual(["c1", "p2"]);
});

test("re-linking a tombstoned triple revives it as a fresh live edge", async () => {
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  await unlinkEdge(ws, "contains", p1);
  await linkEdge({ from: ws, relation: "contains", to: p1 });
  expect(await listEdges({ from: ws, relation: "contains" })).toHaveLength(1);
});
