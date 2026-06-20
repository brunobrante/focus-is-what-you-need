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
import { TABLES, listTable, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
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
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
});

test("createComponent creates a component with a default variant under a screen", async () => {
  const result = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
    kind: "Layout",
  });

  expect(result.component).toMatchObject({
    projectId: "project-1",
    screenId: "screen-1",
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

  expect(result.component.screenId).toBeNull();
  expect(result.component.parentVariantId).toBe("variant-1");

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
  // A screen's scene lives on its main variant; the top-level component's subtree is
  // embedded there and must be removed on delete.
  const existingVariants = await listTable<VariantRow>(TABLES.variants);
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
    ...existingVariants,
  ]);
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
