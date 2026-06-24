import { beforeEach, expect, test } from "bun:test";

import {
  createComponent,
  deleteComponentTree,
  getComponent,
  listChildrenOfVariant,
} from "@/lib/storage/repos/components.repo";
import {
  duplicateVariant,
  listVariantsByComponent,
  promoteVariantToMain,
} from "@/lib/storage/repos/variants.repo";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import {
  createDefaultHtmlCanvasDocument,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { flushThumbnailJobs } from "@/application/thumbnails/thumbnailQueue";
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

test("copy-mode version clones child components into independent masters", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Card",
  });
  // A nested child owned by the source variant.
  const { component: child } = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Title",
  });

  // duplicateVariant only clones when the source variant has a scene.
  await upsertScene({
    ownerType: "variant",
    ownerId: defaultVariant.id,
    graphJSON: serializeHtmlCanvasDocument(
      createDefaultHtmlCanvasDocument({ name: "Card", projectType: "mobile", targetKind: "variant" }),
    ),
  });

  const copy = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
    mode: "copy",
  });

  // The new version owns a fresh child master, not the original.
  const cloned = await listChildrenOfVariant(copy.id);
  expect(cloned).toHaveLength(1);
  const clone = cloned[0]!;
  expect(clone.id).not.toBe(child.id);
  expect(clone.name).toBe("Title");
  expect(clone.parentVariantId).toBe(copy.id);
  expect(clone.linkable).toBe(false);

  // Deleting the copied version's child must NOT delete the original.
  await deleteComponentTree(clone.id);
  expect(await getComponent(child.id)).not.toBeNull();
  expect(await getComponent(clone.id)).toBeNull();
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

/** A variant scene with a single named child node under the frame, so linkify/embed can
 *  match it by `sourceNodeId`. Reuses the default doc for a valid frame + style shape. */
function sceneWithChildNode(childNodeId: string, childName: string): string {
  const doc = createDefaultHtmlCanvasDocument({
    name: "Card",
    projectType: "mobile",
    targetKind: "variant",
  });
  const template = doc.nodes.find((n) => n.parentId === doc.rootId) ?? doc.nodes[0]!;
  const childNode: HtmlCanvasNode = {
    ...template,
    id: childNodeId,
    parentId: doc.rootId,
    name: childName,
    order: 99,
    instanceOf: null,
  };
  return serializeHtmlCanvasDocument({ ...doc, nodes: [...doc.nodes, childNode] });
}

function nodeById(graphJSON: string, nodeId: string): HtmlCanvasNode | undefined {
  return htmlCanvasDocumentFromJSON(graphJSON)?.nodes.find((n) => n.id === nodeId);
}

test("promoteVariantToMain on a linked version moves the masters with the crown", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Card",
  });
  // A nested child whose node lives at "title-node" in the parent scene.
  const { component: child } = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Title",
  });
  const components = await listTable<ComponentRow>(TABLES.components);
  await replaceTable<ComponentRow>(
    TABLES.components,
    components.map((c) => (c.id === child.id ? { ...c, sourceNodeId: "title-node" } : c)),
  );

  // Main embeds the child; the child owns its own scene (the master content to inline).
  await upsertScene({
    ownerType: "variant",
    ownerId: defaultVariant.id,
    graphJSON: sceneWithChildNode("title-node", "Title"),
  });
  await upsertScene({
    ownerType: "variant",
    ownerId: child.activeVariantId,
    graphJSON: serializeHtmlCanvasDocument(
      createDefaultHtmlCanvasDocument({ name: "Title", projectType: "mobile", targetKind: "variant" }),
    ),
  });

  // A linked version collapses the child into an instance node.
  const version = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
    mode: "linked",
  });
  expect(nodeById((await getSceneByOwner("variant", version.id))!.graphJSON, "title-node")?.instanceOf)
    .toMatchObject({ componentId: child.id });

  await promoteVariantToMain(version.id);

  // 1. The crown moved: the version is now the main (order 0), the old main is a version.
  const variants = await listVariantsByComponent(component.id);
  expect(variants.find((v) => v.id === version.id)!.order).toBe(0);
  expect(variants.find((v) => v.id === defaultVariant.id)!.order).toBeGreaterThan(0);
  expect((await getComponent(component.id))!.activeVariantId).toBe(version.id);

  // 2. The child master is now owned by the new main variant (a re-parent, not a clone).
  expect((await getComponent(child.id))!.parentVariantId).toBe(version.id);

  // 3. The new main embeds real content; the demoted old main holds the linked instance.
  expect(nodeById((await getSceneByOwner("variant", version.id))!.graphJSON, "title-node")?.instanceOf)
    .toBeNull();
  expect(nodeById((await getSceneByOwner("variant", defaultVariant.id))!.graphJSON, "title-node")?.instanceOf)
    .toMatchObject({ componentId: child.id });
});

test("promoteVariantToMain on a copy version is a plain swap with independent children", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Card",
  });
  await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Title",
  });
  await upsertScene({
    ownerType: "variant",
    ownerId: defaultVariant.id,
    graphJSON: serializeHtmlCanvasDocument(
      createDefaultHtmlCanvasDocument({ name: "Card", projectType: "mobile", targetKind: "variant" }),
    ),
  });

  const copy = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
    mode: "copy",
  });
  const copyChild = (await listChildrenOfVariant(copy.id))[0]!;

  await promoteVariantToMain(copy.id);

  const variants = await listVariantsByComponent(component.id);
  expect(variants.find((v) => v.id === copy.id)!.order).toBe(0);
  expect(variants.find((v) => v.id === defaultVariant.id)!.order).toBeGreaterThan(0);
  expect((await getComponent(component.id))!.activeVariantId).toBe(copy.id);
  // The copy already owned its own child; promotion does not re-parent or clone again.
  expect((await getComponent(copyChild.id))!.parentVariantId).toBe(copy.id);
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
