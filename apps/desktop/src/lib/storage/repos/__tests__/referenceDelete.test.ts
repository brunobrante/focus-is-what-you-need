import { beforeEach, expect, test } from "bun:test";

import {
  listReferences,
  listReferenceLinkUsages,
} from "@/lib/storage/repos/references.repo";
import { applyReferenceDeleteDecisions } from "@/application/references/applyReferenceDeleteDecisions";
import { resetRecordStoreCache, replaceTable, TABLES } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import type { ReferenceRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }
}

const LIB_ID = "lib-1";

function masterRow(): ReferenceRow {
  return {
    id: LIB_ID,
    title: "hero.png",
    source: "upload",
    origin: "upload",
    visibility: "external",
    bg: "#000",
    accent: "#fff",
    kind: "hero",
    description: "",
    metadata: [],
    thumbnailUrl: null,
    projectIds: ["p1"],
    attachments: [
      { workspaceId: null, projectId: "p1", screenId: "s1", componentId: null },
      { workspaceId: null, projectId: "p1", screenId: "s2", componentId: null },
    ],
    linkable: true,
    createdAt: 1,
  };
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ReferenceRow>(TABLES.references, [masterRow()]);
});

test("listReferenceLinkUsages enumerates one entry per attachment", async () => {
  const usages = await listReferenceLinkUsages(LIB_ID);
  expect(usages).toHaveLength(2);
  expect(usages.map((u) => u.ownerId).sort()).toEqual(["s1", "s2"]);
  expect(usages.every((u) => u.ownerType === "screen" && u.referenceId === LIB_ID)).toBe(true);
});

test("copy decision detaches an independent local copy that resolves the master blob", async () => {
  const { keptCopy } = await applyReferenceDeleteDecisions([
    { referenceId: LIB_ID, ownerType: "screen", ownerId: "s1", action: "copy" },
  ]);
  expect(keptCopy).toBe(true);

  const rows = await listReferences();
  const master = rows.find((r) => r.id === LIB_ID)!;
  // The copied place is dropped from the master.
  expect(master.attachments.map((a) => a.screenId).sort()).toEqual(["s2"]);

  // An independent local copy now owns just that place and points at the master blob.
  const copy = rows.find((r) => r.id !== LIB_ID && r.detachedFrom === LIB_ID)!;
  expect(copy).toBeDefined();
  expect(copy.linkable).toBe(false);
  expect(copy.visibility).toBe("local");
  expect(copy.sourceReferenceId).toBe(LIB_ID);
  expect(copy.attachments).toHaveLength(1);
  expect(copy.attachments[0]!.screenId).toBe("s1");
});

test("delete decision drops the link with no copy kept", async () => {
  const { keptCopy } = await applyReferenceDeleteDecisions([
    { referenceId: LIB_ID, ownerType: "screen", ownerId: "s1", action: "delete" },
  ]);
  expect(keptCopy).toBe(false);

  const rows = await listReferences();
  expect(rows.some((r) => r.detachedFrom === LIB_ID)).toBe(false);
  const master = rows.find((r) => r.id === LIB_ID)!;
  expect(master.attachments.map((a) => a.screenId).sort()).toEqual(["s2"]);
});

test("mixed decisions: master is emptied, one copy kept", async () => {
  const { keptCopy } = await applyReferenceDeleteDecisions([
    { referenceId: LIB_ID, ownerType: "screen", ownerId: "s1", action: "copy" },
    { referenceId: LIB_ID, ownerType: "screen", ownerId: "s2", action: "delete" },
  ]);
  expect(keptCopy).toBe(true);

  const rows = await listReferences();
  // Master had both attachments removed → pruned entirely.
  expect(rows.some((r) => r.id === LIB_ID)).toBe(false);
  const copies = rows.filter((r) => r.detachedFrom === LIB_ID);
  expect(copies).toHaveLength(1);
  expect(copies[0]!.attachments[0]!.screenId).toBe("s1");
});
