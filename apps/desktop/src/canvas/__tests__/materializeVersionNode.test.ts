import { beforeEach, expect, test } from "bun:test";
import { materializeVersionNodeAsComponent } from "@/application/canvas/canvasMaterializer";
import { canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import { listChildrenOfVariant } from "@/lib/storage/repos/components.repo";
import { ownerOf } from "@/lib/storage/repos/edges.repo";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";
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
  clear(): void {
    this.rows.clear();
  }
}

function mk(p: Partial<HtmlCanvasNode> & { id: string }): HtmlCanvasNode {
  return {
    id: p.id,
    parentId: p.parentId ?? null,
    name: p.name ?? p.id,
    kind: p.kind ?? "frame",
    tag: p.tag ?? "div",
    cssId: p.id,
    className: p.id,
    order: p.order ?? 0,
    bounds: p.bounds ?? { x: 0, y: 0, width: 100, height: 100 },
    style: p.style ?? defaultStyle(),
    text: p.text ?? null,
    imageUrl: p.imageUrl ?? null,
    appearance: p.appearance ?? "rect",
    visible: p.visible ?? true,
    locked: p.locked ?? false,
    instanceOf: p.instanceOf ?? null,
  };
}

function doc(rootId: string, nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: { width: 390, height: 72 },
    nodes,
    updatedAt: 1,
  };
}

const VERSION_VARIANT_ID = "v-version";
const versionSceneJSON = serializeHtmlCanvasDocument(
  doc("root", [
    mk({ id: "root", name: "Header Canvas", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "subj", parentId: "root", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "logo", parentId: "subj", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
    mk({ id: "glyph", parentId: "logo", name: "Glyph", bounds: { x: 4, y: 4, width: 40, height: 40 } }),
  ]),
);

beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  await replaceTable<ComponentRow>(TABLES.components, []);
  await replaceTable<SceneRow>(TABLES.scenes, []);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, []);
  await replaceTable<VariantRow>(TABLES.variants, []);
  await upsertScene(
    { ownerType: "variant", ownerId: VERSION_VARIANT_ID, graphJSON: versionSceneJSON },
    { propagate: false },
  );
});

test("opening a nested component from a version materializes a version-owned copy", async () => {
  const cdoc = canvasDocumentFromHtmlGraphJSON(versionSceneJSON, { promoteSubjectRoot: true })!;
  const created = await materializeVersionNodeAsComponent({
    versionVariantId: VERSION_VARIANT_ID,
    document: cdoc,
    versionGraphJSON: versionSceneJSON,
    canvasName: "Header",
    nodeId: "logo",
    projectId: "project-1",
  });

  expect(created).not.toBeNull();
  // Owned by the version's variant (the edge) — independent of any shared master.
  expect(await ownerOf({ type: "component", id: created!.id })).toEqual({
    type: "variant",
    id: VERSION_VARIANT_ID,
  });
  const children = await listChildrenOfVariant(VERSION_VARIANT_ID);
  expect(children.map((c) => c.id)).toContain(created!.id);
});

test("the copy's own scene is written (durable before navigation, not blank)", async () => {
  const cdoc = canvasDocumentFromHtmlGraphJSON(versionSceneJSON, { promoteSubjectRoot: true })!;
  const created = await materializeVersionNodeAsComponent({
    versionVariantId: VERSION_VARIANT_ID,
    document: cdoc,
    versionGraphJSON: versionSceneJSON,
    canvasName: "Header",
    nodeId: "logo",
    projectId: "project-1",
  });
  const scene = await getSceneByOwner("variant", created!.activeVariantId);
  expect(scene?.graphJSON).toBeTruthy();
  const copyDoc = htmlCanvasDocumentFromJSON(scene!.graphJSON)!;
  // The copy contains the Logo's own child content.
  expect(copyDoc.nodes.some((n) => n.name === "Glyph")).toBe(true);
});

test("the version node is collapsed into a linked instance of the copy", async () => {
  const cdoc = canvasDocumentFromHtmlGraphJSON(versionSceneJSON, { promoteSubjectRoot: true })!;
  const created = await materializeVersionNodeAsComponent({
    versionVariantId: VERSION_VARIANT_ID,
    document: cdoc,
    versionGraphJSON: versionSceneJSON,
    canvasName: "Header",
    nodeId: "logo",
    projectId: "project-1",
  });

  const scene = await getSceneByOwner("variant", VERSION_VARIANT_ID);
  const updated = htmlCanvasDocumentFromJSON(scene!.graphJSON)!;
  const logo = updated.nodes.find((n) => n.id === "logo");
  expect(logo?.instanceOf).toEqual({
    componentId: created!.id,
    variantId: created!.activeVariantId,
  });
  expect(updated.nodes.some((n) => n.id === "glyph")).toBe(false);
});

test("linked instances are not materializable (they keep their go-to-master link)", async () => {
  const instanceSceneJSON = serializeHtmlCanvasDocument(
    doc("root", [
      mk({ id: "root", name: "Header Canvas" }),
      mk({ id: "subj", parentId: "root", name: "Header" }),
      mk({
        id: "logo",
        parentId: "subj",
        name: "Logo",
        instanceOf: { componentId: "c-logo", variantId: "v-logo" },
      }),
    ]),
  );
  const cdoc = canvasDocumentFromHtmlGraphJSON(instanceSceneJSON, { promoteSubjectRoot: true })!;
  const created = await materializeVersionNodeAsComponent({
    versionVariantId: VERSION_VARIANT_ID,
    document: cdoc,
    versionGraphJSON: instanceSceneJSON,
    canvasName: "Header",
    nodeId: "logo",
    projectId: "project-1",
  });
  expect(created).toBeNull();
});
