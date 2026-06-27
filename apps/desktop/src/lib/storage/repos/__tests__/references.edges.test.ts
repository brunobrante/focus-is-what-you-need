import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, resetRecordStoreCache, replaceTable } from "@/lib/storage/store";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import { listEdges } from "@/lib/storage/repos/edges.repo";
import {
  createOrAttachReference,
  listReferenceLinkUsages,
  removeReferenceFromOwner,
  detachReference,
} from "@/lib/storage/repos/references.repo";
import type { ReferenceRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(k: string) { return this.rows.get(k) ?? null; }
  setItem(k: string, v: string) { this.rows.set(k, v); }
  removeItem(k: string) { this.rows.delete(k); }
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ReferenceRow>(TABLES.references, []);
});

const base = {
  title: "Ref",
  source: "ref.png",
  origin: "upload" as const,
  visibility: "external" as const,
  bg: "#000",
  accent: "#fff",
  kind: "hero" as const,
};

function attachedOwners(referenceId: string) {
  return listEdges({ from: { type: "reference", id: referenceId }, relation: "attached_to" });
}

// flip 1b: the `attached_to` edges are emitted on every reference write, so they are
// the authoritative multi-attach mechanism + the indexed usage source.

test("attaching a reference to two projects emits two attached_to edges", async () => {
  const ref = await createOrAttachReference({
    ...base,
    attachment: { projectId: "p1", screenId: null, componentId: null },
  });
  await createOrAttachReference({
    ...base,
    id: ref.id,
    attachment: { projectId: "p2", screenId: null, componentId: null },
  });

  const targets = (await attachedOwners(ref.id)).map((e) => `${e.toType}:${e.toId}`).sort();
  expect(targets).toEqual(["project:p1", "project:p2"]);

  const usages = await listReferenceLinkUsages(ref.id);
  expect(usages.map((u) => `${u.ownerType}:${u.ownerId}`).sort()).toEqual([
    "project:p1",
    "project:p2",
  ]);
});

test("removing a reference from one owner clears that attached_to edge", async () => {
  const ref = await createOrAttachReference({
    ...base,
    attachment: { projectId: "p1", screenId: null, componentId: null },
  });
  await createOrAttachReference({
    ...base,
    id: ref.id,
    attachment: { projectId: "p2", screenId: null, componentId: null },
  });

  await removeReferenceFromOwner(ref.id, "project", "p1");

  const targets = (await attachedOwners(ref.id)).map((e) => e.toId);
  expect(targets).toEqual(["p2"]);
});

test("detach drops the master's edge at that owner and gives the copy its own", async () => {
  const ref = await createOrAttachReference({
    ...base,
    attachment: { projectId: "p1", screenId: null, componentId: null },
  });

  const copy = await detachReference(ref.id, "project", "p1");
  expect(copy).not.toBeNull();

  // Master no longer attached at p1…
  expect(await attachedOwners(ref.id)).toEqual([]);
  // …and the local copy is attached there instead.
  expect((await attachedOwners(copy!.id)).map((e) => e.toId)).toEqual(["p1"]);
});
