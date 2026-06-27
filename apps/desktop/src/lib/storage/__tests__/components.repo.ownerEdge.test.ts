import { beforeEach, expect, test } from "bun:test";

import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import { createComponent, setComponentScreen } from "@/lib/storage/repos/components.repo";
import { ownerOf } from "@/lib/storage/repos/edges.repo";
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

// flip 1 (save-architecture-v3): the create/update paths emit the `owns` edge
// eagerly, so the graph is authoritative in-session — no reconcileAllGraphEdges()
// / reboot needed for a freshly created component to have its owner edge.

test("createComponent emits a project-owns edge immediately (no reconcile)", async () => {
  const { component } = await createComponent({
    projectId: "p1",
    parent: { kind: "project", projectId: "p1" },
    name: "Card",
  });

  expect(await ownerOf({ type: "component", id: component.id })).toEqual({
    type: "project",
    id: "p1",
  });
});

test("createComponent on a screen owns via the screen's MAIN variant", async () => {
  putRecord<ScreenRow>(TABLES.screens, {
    id: "s1",
    projectId: "p1",
    title: "S",
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

  const { component } = await createComponent({
    projectId: "p1",
    parent: { kind: "screen", screenId: "s1" },
    name: "Header",
  });

  // The screen-top-level component is owned by the screen's main variant — the
  // screenId/parentVariantId asymmetry collapse.
  expect(await ownerOf({ type: "component", id: component.id })).toEqual({
    type: "variant",
    id: "v-main",
  });
});

test("a draft component gets no owner edge on create", async () => {
  const { component } = await createComponent({
    parent: { kind: "draft" },
    name: "Loose",
    draftKind: "component",
  });

  expect(await ownerOf({ type: "component", id: component.id })).toBeNull();
});

test("updateComponent re-homes the owner edge when screenId changes", async () => {
  for (const screenId of ["s1", "s2"]) {
    putRecord<ScreenRow>(TABLES.screens, {
      id: screenId,
      projectId: "p1",
      title: screenId,
      order: 0,
      activeVariantId: `v-${screenId}`,
      createdAt: t,
      updatedAt: t,
    } as unknown as ScreenRow);
    putRecord<VariantRow>(TABLES.variants, {
      id: `v-${screenId}`,
      ownerKind: "screen",
      ownerId: screenId,
      name: "Main",
      order: 0,
      seedKey: null,
      createdAt: t,
      updatedAt: t,
    } as VariantRow);
  }

  const { component } = await createComponent({
    projectId: "p1",
    parent: { kind: "screen", screenId: "s1" },
    name: "Card",
  });
  expect(await ownerOf({ type: "component", id: component.id })).toEqual({
    type: "variant",
    id: "v-s1",
  });

  await setComponentScreen(component.id, "s2");
  expect(await ownerOf({ type: "component", id: component.id })).toEqual({
    type: "variant",
    id: "v-s2",
  });
});
