import { beforeEach, expect, test } from "bun:test";

import { createComponent } from "@/lib/storage/repos/components.repo";
import {
  duplicateVariant,
  listVariantsByComponent,
} from "@/lib/storage/repos/variants.repo";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import {
  createDefaultHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import { flushThumbnailJobs } from "@/application/thumbnails/thumbnailQueue";
import { TABLES, replaceTable, resetRecordStoreCache } from "@/lib/storage/store";
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
}

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  await flushThumbnailJobs();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
});

test("duplicateVariant copies the source variant's scene into a new sibling variant", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
  });

  const graphJSON = serializeHtmlCanvasDocument(
    createDefaultHtmlCanvasDocument({
      name: "Header",
      projectType: "mobile",
      targetKind: "variant",
    }),
  );
  await upsertScene({
    ownerType: "variant",
    ownerId: defaultVariant.id,
    graphJSON,
  });

  const copy = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
  });

  expect(copy.ownerId).toBe(component.id);
  expect(copy.name).toBe("Variant 2");
  expect(copy.id).not.toBe(defaultVariant.id);

  const variants = await listVariantsByComponent(component.id);
  expect(variants.map((v) => v.name).sort()).toEqual(["Default", "Variant 2"]);

  const copyScene = await getSceneByOwner("variant", copy.id);
  expect(copyScene).not.toBeNull();
  expect(copyScene!.graphJSON).toBe(graphJSON);

  // The source scene is untouched by the duplication.
  const sourceScene = await getSceneByOwner("variant", defaultVariant.id);
  expect(sourceScene!.graphJSON).toBe(graphJSON);
});

test("duplicateVariant works when the source variant has no scene yet", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Header",
  });

  const copy = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
  });

  expect(copy.ownerId).toBe(component.id);
  const copyScene = await getSceneByOwner("variant", copy.id);
  expect(copyScene).toBeNull();
});

test("createComponent supports workspace-global scope", async () => {
  const { component } = await createComponent({
    parent: { kind: "workspace", workspaceId: "workspace-1" },
    name: "Button",
    kind: "Atom",
  });

  expect(component.workspaceId).toBe("workspace-1");
  expect(component.projectId).toBeNull();
  expect(component.screenId).toBeNull();
  expect(component.parentVariantId).toBeNull();
});
