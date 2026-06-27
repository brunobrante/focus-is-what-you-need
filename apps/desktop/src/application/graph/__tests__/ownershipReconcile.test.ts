import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import { reconcileAllGraphEdges } from "@/application/graph/ownershipReconcile";
import { listEdges, ownerOf } from "@/lib/storage/repos/edges.repo";
import type { ComponentRow, ScreenRow, VariantRow, WorkspaceRow } from "@/lib/storage/schema";

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

const t = 0;

test("reconcile derives containment, version, and ownership edges from fields", async () => {
  putRecord<WorkspaceRow>(TABLES.workspaces, {
    id: "w1",
    name: "W",
    projectIds: ["p1"],
    createdAt: t,
    updatedAt: t,
  } as WorkspaceRow);
  putRecord<ScreenRow>(TABLES.screens, {
    id: "s1",
    projectId: "p1",
    title: "S",
    variant: "mobile",
    order: 0,
    activeVariantId: "v-main",
    createdAt: t,
    updatedAt: t,
  } as unknown as ScreenRow);
  putRecord<VariantRow>(TABLES.variants, {
    id: "v-main",
    ownerKind: "screen",
    ownerId: "s1",
    name: "Main",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  } as VariantRow);
  // A screen-top-level component (screenId set) must be owned by the screen's MAIN
  // variant — the asymmetry collapse.
  putRecord<ComponentRow>(TABLES.components, {
    id: "c1",
    projectId: "p1",
    screenId: "s1",
    parentVariantId: null,
    name: "Card",
    kind: null,
    category: null,
    description: null,
    assignedScreenIds: [],
    activeVariantId: "cv",
    order: 0,
    createdAt: t,
    updatedAt: t,
  } as ComponentRow);

  await reconcileAllGraphEdges();

  // workspace ──contains──▶ project
  expect(
    (await listEdges({ from: { type: "workspace", id: "w1" }, relation: "contains" })).map(
      (e) => e.toId,
    ),
  ).toEqual(["p1"]);
  // project ──contains──▶ screen
  expect(
    (await listEdges({ to: { type: "screen", id: "s1" }, relation: "contains" })).map(
      (e) => e.fromId,
    ),
  ).toEqual(["p1"]);
  // screen ──has_version──▶ variant
  expect(
    (await listEdges({ from: { type: "screen", id: "s1" }, relation: "has_version" })).map(
      (e) => e.toId,
    ),
  ).toEqual(["v-main"]);
  // component owned by the screen's MAIN variant (not the screen)
  expect(await ownerOf({ type: "component", id: "c1" })).toEqual({
    type: "variant",
    id: "v-main",
  });
});

test("a draft component (no owner fields) gets no owner edge", async () => {
  putRecord<ComponentRow>(TABLES.components, {
    id: "draft1",
    projectId: null,
    screenId: null,
    parentVariantId: null,
    workspaceId: null,
    name: "Draft",
    kind: null,
    category: null,
    description: null,
    assignedScreenIds: [],
    draftKind: "component",
    activeVariantId: "dv",
    order: 0,
    createdAt: t,
    updatedAt: t,
  } as ComponentRow);

  await reconcileAllGraphEdges();
  expect(await ownerOf({ type: "component", id: "draft1" })).toBeNull();
});
