import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import {
  createComponent,
  listChildrenOfVariant,
  listProjectGlobalComponents,
  listTopLevelByScreenId,
  listWorkspaceComponents,
} from "@/lib/storage/repos/components.repo";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import type { ScreenRow, VariantRow } from "@/lib/storage/schema";

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

function seedScreen(id: string, mainVariantId: string): void {
  putRecord<ScreenRow>(TABLES.screens, {
    id,
    projectId: "p1",
    title: id,
    order: 0,
    activeVariantId: mainVariantId,
    createdAt: t,
    updatedAt: t,
  } as unknown as ScreenRow);
  putRecord<VariantRow>(TABLES.variants, {
    id: mainVariantId,
    ownerKind: "screen",
    ownerId: id,
    name: "Main",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  } as VariantRow);
}

// The storage queries now read containment off `graph_edges`, not off the
// screenId/parentVariantId/projectId row fields (save-architecture-v3 flip 1).

test("listTopLevelByScreenId returns components owned by the screen's main variant", async () => {
  seedScreen("s1", "v-s1");
  const { component: a } = await createComponent({
    projectId: "p1",
    parent: { kind: "screen", screenId: "s1" },
    name: "A",
  });
  const { component: b } = await createComponent({
    projectId: "p1",
    parent: { kind: "screen", screenId: "s1" },
    name: "B",
  });

  const ids = (await listTopLevelByScreenId("s1")).map((r) => r.id).sort();
  expect(ids).toEqual([a.id, b.id].sort());
});

test("listChildrenOfVariant returns components owned by that variant", async () => {
  const { component: parent, defaultVariant } = await createComponent({
    projectId: "p1",
    parent: { kind: "project", projectId: "p1" },
    name: "Parent",
  });
  const { component: child } = await createComponent({
    projectId: "p1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Child",
  });

  const ids = (await listChildrenOfVariant(defaultVariant.id)).map((r) => r.id);
  expect(ids).toEqual([child.id]);
  // The project-global parent is not a child of its own variant.
  expect(ids).not.toContain(parent.id);
});

test("project-global vs workspace-global split by the owns edge", async () => {
  const { component: pg } = await createComponent({
    projectId: "p1",
    parent: { kind: "project", projectId: "p1" },
    name: "ProjectGlobal",
  });
  const { component: wg } = await createComponent({
    parent: { kind: "workspace", workspaceId: "w1" },
    name: "WorkspaceGlobal",
  });

  expect((await listProjectGlobalComponents("p1")).map((r) => r.id)).toEqual([pg.id]);
  expect((await listWorkspaceComponents("w1")).map((r) => r.id)).toEqual([wg.id]);
});

test("queries follow the edge, not the stale field (edge is authoritative)", async () => {
  seedScreen("s1", "v-s1");
  const { component } = await createComponent({
    projectId: "p1",
    parent: { kind: "project", projectId: "p1" },
    name: "Movable",
  });
  // Sanity: starts project-global.
  expect((await listProjectGlobalComponents("p1")).map((r) => r.id)).toEqual([
    component.id,
  ]);

  // Re-home ONLY the edge to the screen's main variant; the component's projectId
  // field is intentionally left stale, so the result can only be edge-sourced.
  await setOwner(
    { type: "variant", id: "v-s1" },
    { type: "component", id: component.id },
  );

  expect((await listProjectGlobalComponents("p1")).map((r) => r.id)).toEqual([]);
  expect((await listTopLevelByScreenId("s1")).map((r) => r.id)).toEqual([
    component.id,
  ]);
});
