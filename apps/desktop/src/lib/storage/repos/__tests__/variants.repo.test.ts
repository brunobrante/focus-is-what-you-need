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
import { ownerOf } from "@/lib/storage/repos/edges.repo";
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
  expect(await ownerOf({ type: "component", id: clone.id })).toEqual({ type: "variant", id: copy.id });
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

/** A variant scene with the given named child nodes under the frame, so linkify/embed can
 *  match them by `sourceNodeId`. Reuses the default doc for a valid frame + style shape. */
function sceneWithChildNodes(children: Array<{ id: string; name: string }>): string {
  const doc = createDefaultHtmlCanvasDocument({
    name: "Card",
    projectType: "mobile",
    targetKind: "variant",
  });
  const template = doc.nodes.find((n) => n.parentId === doc.rootId) ?? doc.nodes[0]!;
  const childNodes: HtmlCanvasNode[] = children.map((c, i) => ({
    ...template,
    id: c.id,
    parentId: doc.rootId,
    name: c.name,
    order: 99 + i,
    instanceOf: null,
  }));
  return serializeHtmlCanvasDocument({ ...doc, nodes: [...doc.nodes, ...childNodes] });
}

function sceneWithChildNode(childNodeId: string, childName: string): string {
  return sceneWithChildNodes([{ id: childNodeId, name: childName }]);
}

/** Drops a node (and would-be subtree) from a serialized scene, as the user deleting it. */
function sceneWithoutNode(graphJSON: string, nodeId: string): string {
  const doc = htmlCanvasDocumentFromJSON(graphJSON)!;
  return serializeHtmlCanvasDocument({ ...doc, nodes: doc.nodes.filter((n) => n.id !== nodeId) });
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
  expect(await ownerOf({ type: "component", id: child.id })).toEqual({ type: "variant", id: version.id });

  // 3. The new main embeds real content; the demoted old main holds the linked instance.
  expect(nodeById((await getSceneByOwner("variant", version.id))!.graphJSON, "title-node")?.instanceOf)
    .toBeNull();
  expect(nodeById((await getSceneByOwner("variant", defaultVariant.id))!.graphJSON, "title-node")?.instanceOf)
    .toMatchObject({ componentId: child.id });
});

test("promoteVariantToMain leaves a child the version dropped as the old main's local copy", async () => {
  const { component, defaultVariant } = await createComponent({
    projectId: "project-1",
    parent: { kind: "screen", screenId: "screen-1" },
    name: "Card",
  });
  // Two children the main embeds: "kept" stays linked in the version, "dropped" is removed.
  const { component: kept } = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Title",
  });
  const { component: dropped } = await createComponent({
    projectId: "project-1",
    parent: { kind: "variant", variantId: defaultVariant.id },
    name: "Subtitle",
  });
  const components = await listTable<ComponentRow>(TABLES.components);
  await replaceTable<ComponentRow>(
    TABLES.components,
    components.map((c) =>
      c.id === kept.id
        ? { ...c, sourceNodeId: "kept-node" }
        : c.id === dropped.id
          ? { ...c, sourceNodeId: "dropped-node" }
          : c,
    ),
  );

  await upsertScene({
    ownerType: "variant",
    ownerId: defaultVariant.id,
    graphJSON: sceneWithChildNodes([
      { id: "kept-node", name: "Title" },
      { id: "dropped-node", name: "Subtitle" },
    ]),
  });
  for (const child of [kept, dropped]) {
    await upsertScene({
      ownerType: "variant",
      ownerId: child.activeVariantId,
      graphJSON: serializeHtmlCanvasDocument(
        createDefaultHtmlCanvasDocument({ name: child.name, projectType: "mobile", targetKind: "variant" }),
      ),
    });
  }

  const version = await duplicateVariant({
    ownerKind: "component",
    ownerId: component.id,
    sourceVariantId: defaultVariant.id,
    name: "Variant 2",
    mode: "linked",
  });
  // The user unlinks + deletes "dropped" inside the version: its instance node is gone.
  const versionScene = (await getSceneByOwner("variant", version.id))!.graphJSON;
  await upsertScene({
    ownerType: "variant",
    ownerId: version.id,
    graphJSON: sceneWithoutNode(versionScene, "dropped-node"),
  });

  await promoteVariantToMain(version.id);

  // Kept child moves with the crown; dropped child stays owned by the demoted old main.
  expect(await ownerOf({ type: "component", id: kept.id })).toEqual({ type: "variant", id: version.id });
  expect(await ownerOf({ type: "component", id: dropped.id })).toEqual({
    type: "variant",
    id: defaultVariant.id,
  });

  // The dropped child is NOT a phantom subcomponent of the new main…
  expect((await listChildrenOfVariant(version.id)).map((c) => c.id)).toEqual([kept.id]);
  // …and is still the old main's child (a local copy, not a dangling link).
  expect((await listChildrenOfVariant(defaultVariant.id)).map((c) => c.id)).toEqual([dropped.id]);

  // The old main holds a linked instance for the kept child but keeps "dropped" embedded.
  const oldMainGraph = (await getSceneByOwner("variant", defaultVariant.id))!.graphJSON;
  expect(nodeById(oldMainGraph, "kept-node")?.instanceOf).toMatchObject({ componentId: kept.id });
  expect(nodeById(oldMainGraph, "dropped-node")?.instanceOf ?? null).toBeNull();
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
  expect(await ownerOf({ type: "component", id: copyChild.id })).toEqual({ type: "variant", id: copy.id });
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
