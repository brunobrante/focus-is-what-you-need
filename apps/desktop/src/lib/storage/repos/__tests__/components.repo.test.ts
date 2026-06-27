import { beforeEach, expect, test } from "bun:test";

import {
  createComponent,
  deleteComponentTree,
  listChildrenOfVariant,
  listTopLevelByScreen,
} from "@/lib/storage/repos/components.repo";
import {
  createDefaultHtmlCanvasDocument,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { getSceneByOwner } from "@/lib/storage/repos/scenes.repo";
import { TABLES, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { resetEdgeIndex } from "@/application/graph/edgeIndex";
import type { ComponentRow, SceneRow, ThumbnailRow, VariantRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();

  getItem(key: string): string | null {
    return this.rows.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.rows.set(key, value);
  }

  clear(): void {
    this.rows.clear();
  }
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
});

test("createComponent creates a component with a default variant under a screen", async () => {
  // A screen owns a main variant; its top-level components are owned by that
  // variant (the edge the ownership queries read).
  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-screen-1",
      ownerKind: "screen",
      ownerId: "screen-1",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    } as VariantRow,
  ]);

  const result = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
    kind: "Layout",
  });

  expect(result.component).toMatchObject({
    projectId: "project-1",
    // screenId/parentVariantId are vestigial (always null) — ownership is the edge,
    // verified by listTopLevelByScreen below.
    screenId: null,
    parentVariantId: null,
    name: "Header",
    kind: "Layout",
    order: 0,
  });
  expect(result.defaultVariant).toMatchObject({
    ownerKind: "component",
    ownerId: result.component.id,
    name: "Default",
    order: 0,
    seedKey: null,
  });
  expect(result.component.activeVariantId).toBe(result.defaultVariant.id);

  const topLevel = await listTopLevelByScreen("project-1", "screen-1");
  expect(topLevel.map((c) => c.id)).toEqual([result.component.id]);
});

test("createComponent creates children under a variant", async () => {
  const result = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: "variant-1" },
    name: "Logo",
  });

  // Vestigial fields stay null — ownership is the edge, verified below.
  expect(result.component.screenId).toBeNull();
  expect(result.component.parentVariantId).toBeNull();

  const children = await listChildrenOfVariant("variant-1");
  expect(children.map((c) => c.id)).toEqual([result.component.id]);
});

test("createComponent rejects duplicate sibling names case-insensitively", async () => {
  await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
  });

  await expect(
    createComponent({
      projectId: "project-1",
      parent: { kind: "screen", screenId: "screen-1" },
      name: "header",
    }),
  ).rejects.toThrow("already exists");
});

test("deleteComponentTree removes a component, descendants, and their variants", async () => {
  // A screen's scene lives on its main variant; the top-level component's subtree is
  // embedded there. Seed the main variant FIRST so the screen-top-level component's
  // `owns` edge points at it (ownership is the edge now).
  await replaceTable<VariantRow>(TABLES.variants, [
    {
      id: "variant-screen-1",
      ownerKind: "screen",
      ownerId: "screen-1",
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const parent = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
    sourceNodeId: "node-panel",
  });
  const child = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: parent.defaultVariant.id },
    name: "Logo",
  });
  const screenDocument = createDefaultHtmlCanvasDocument({
    name: "Home",
    projectType: "mobile",
    targetKind: "screen",
  });
  screenDocument.nodes = screenDocument.nodes.map((node) =>
    node.id === "node-panel" ? { ...node, name: "Header" } : node,
  );
  await replaceTable<SceneRow>(TABLES.scenes, [
    {
      id: "variant:variant-screen-1",
      ownerType: "variant",
      ownerId: "variant-screen-1",
      graphJSON: serializeHtmlCanvasDocument(screenDocument),
      sceneVersion: 1,
      updatedAt: 1,
    },
  ]);

  await deleteComponentTree(parent.component.id);

  expect(await listTopLevelByScreen("project-1", "screen-1")).toEqual([]);
  expect(await listChildrenOfVariant(parent.defaultVariant.id)).toEqual([]);
  expect(await listChildrenOfVariant(child.defaultVariant.id)).toEqual([]);
  const screenScene = await getSceneByOwner("variant", "variant-screen-1");
  const nextDocument = htmlCanvasDocumentFromJSON(screenScene?.graphJSON ?? null);
  expect(nextDocument?.nodes.some((node) => node.id === "node-panel")).toBe(false);
  expect(nextDocument?.nodes.some((node) => node.id === "node-action")).toBe(false);
  expect(screenScene?.sceneVersion).toBe(2);
});
