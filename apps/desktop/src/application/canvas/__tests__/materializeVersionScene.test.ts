import { beforeEach, expect, test } from "bun:test";

import { materializeVersionScene } from "@/application/canvas/canvasMaterializer";
import { canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { listChildrenOfVariant, listTopLevelByScreen } from "@/lib/storage/repos/components.repo";
import { ownerOf } from "@/lib/storage/repos/edges.repo";
import { promoteVariantToMain } from "@/lib/storage/repos/variants.repo";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/lib/canvas/htmlScene/styleUtils";
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
    bounds: p.bounds ?? { x: 0, y: 0, width: 390, height: 80 },
    style: p.style ?? defaultStyle(),
    text: p.text ?? null,
    imageUrl: p.imageUrl ?? null,
    appearance: p.appearance ?? "rect",
    visible: p.visible ?? true,
    locked: p.locked ?? false,
    instanceOf: p.instanceOf ?? null,
  };
}

function htmlDoc(nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId: "root",
    viewport: { width: 390, height: 844 },
    nodes,
    updatedAt: 1,
  };
}

test("materializeVersionScene creates version-owned components for owned content, skips linked instances", async () => {
  const versionVariantId = "variant-v1";
  // A version scene: "Home Canvas" wrapper → "Home" subject → an OWNED "Header" (detached
  // or drawn, with a child) and a LINKED "Hero" instance.
  const json = serializeHtmlCanvasDocument(
    htmlDoc([
      mk({ id: "root", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "subj", parentId: "root", name: "Home", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "header", parentId: "subj", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
      // Logo has a child (Icon) → it is itself a component, nested under Header.
      mk({ id: "logo", parentId: "header", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
      mk({ id: "icon", parentId: "logo", name: "Icon", bounds: { x: 0, y: 0, width: 24, height: 24 } }),
      mk({
        id: "hero",
        parentId: "subj",
        name: "Hero",
        bounds: { x: 0, y: 72, width: 390, height: 200 },
        instanceOf: { componentId: "some-master", variantId: "some-variant" },
      }),
    ]),
  );
  const document = canvasDocumentFromHtmlGraphJSON(json, { promoteSubjectRoot: true });
  expect(document).not.toBeNull();

  await materializeVersionScene({
    versionVariantId,
    document: document!,
    projectId: "project-1",
  });

  const components = await listTable<ComponentRow>(TABLES.components);

  // "Header" is owned content → a version-owned component (parented to the version variant).
  const header = components.find((c) => c.sourceNodeId === "header");
  expect(header).toBeTruthy();
  expect(await ownerOf({ type: "component", id: header!.id })).toEqual({
    type: "variant",
    id: versionVariantId,
  });
  expect(header!.name).toBe("Header");

  // "Logo" (nested under Header) → owned by Header's own variant, not the version variant.
  const logo = components.find((c) => c.sourceNodeId === "logo");
  expect(logo).toBeTruthy();
  expect(await ownerOf({ type: "component", id: logo!.id })).toEqual({
    type: "variant",
    id: header!.activeVariantId,
  });

  // "Hero" is a linked instance → never materialized into a component.
  expect(components.some((c) => c.sourceNodeId === "hero")).toBe(false);
});

test("a component unlinked in a version survives in the new main after promote (regression)", async () => {
  // The reported bug: in a linked version, unlink (detach) a component, then make the
  // version the main — the component vanished. With version materialization the detached
  // content becomes a version-owned component, and promote re-homes it onto the new main.
  const projectId = "project-1";
  const screenId = "screen-1";
  const main = { id: "m", ownerKind: "screen" as const, ownerId: screenId, name: "Default", order: 0, seedKey: null, createdAt: 1, updatedAt: 1 };
  const version = { ...main, id: "v", order: 1 };
  await replaceTable<VariantRow>(TABLES.variants, [
    main,
    version,
    { id: "cv", ownerKind: "component", ownerId: "c", name: "Default", order: 0, seedKey: null, createdAt: 1, updatedAt: 1 },
  ]);
  await replaceTable(TABLES.screens, [
    { id: screenId, projectId, title: "Home", variant: "blank", order: 0, activeVariantId: "m", createdAt: 1, updatedAt: 1 },
  ]);
  // The original master "Header", screen-owned, embedded in the main.
  await replaceTable<ComponentRow>(TABLES.components, [
    {
      id: "c", projectId, screenId, parentVariantId: null, name: "Header", kind: null, category: null,
      description: null, assignedScreenIds: [], sourceNodeId: "header", activeVariantId: "cv", order: 0,
      createdAt: 1, updatedAt: 1,
    },
  ]);

  const sceneNodes = (headerInstanceOf: HtmlCanvasNode["instanceOf"]) =>
    htmlDoc([
      mk({ id: "root", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "subj", parentId: "root", name: "Home", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "header", parentId: "subj", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 }, instanceOf: headerInstanceOf }),
      mk({ id: "title", parentId: "header", name: "Title", bounds: { x: 12, y: 12, width: 100, height: 20 } }),
    ]);
  // Main embeds Header; the component's own scene holds Header; the version has Header
  // DETACHED (no instanceOf → owned content), as if the user clicked unlink.
  await upsertScene({ ownerType: "variant", ownerId: "m", graphJSON: serializeHtmlCanvasDocument(sceneNodes(null)) }, { propagate: false });
  await upsertScene({ ownerType: "variant", ownerId: "cv", graphJSON: serializeHtmlCanvasDocument(sceneNodes(null)) }, { propagate: false });
  const versionJSON = serializeHtmlCanvasDocument(sceneNodes(null));
  await upsertScene({ ownerType: "variant", ownerId: "v", graphJSON: versionJSON }, { propagate: false });

  // Version save materializes the detached Header into a version-owned component.
  const versionDoc = canvasDocumentFromHtmlGraphJSON(versionJSON, { promoteSubjectRoot: true })!;
  await materializeVersionScene({ versionVariantId: "v", document: versionDoc, projectId });

  const detachedCopy = (await listChildrenOfVariant("v")).find(
    (c) => c.sourceNodeId === "header",
  );
  expect(detachedCopy).toBeTruthy();

  await promoteVariantToMain("v");

  // The detached copy is now a top-level component of the new main ("v") — it shows
  // up in the subcomponents list instead of vanishing.
  const topLevel = await listTopLevelByScreen(projectId, screenId);
  expect(topLevel.map((c) => c.id)).toContain(detachedCopy!.id);
  // Ownership is the edge: still owned by "v", which is now the screen's main variant.
  expect(await ownerOf({ type: "component", id: detachedCopy!.id })).toEqual({
    type: "variant",
    id: "v",
  });
});

test("materializeVersionScene is idempotent — re-running does not duplicate components", async () => {
  const versionVariantId = "variant-v1";
  const json = serializeHtmlCanvasDocument(
    htmlDoc([
      mk({ id: "root", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "subj", parentId: "root", name: "Home", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
      mk({ id: "header", parentId: "subj", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
      mk({ id: "logo", parentId: "header", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
      mk({ id: "icon", parentId: "logo", name: "Icon", bounds: { x: 0, y: 0, width: 24, height: 24 } }),
    ]),
  );
  const document = canvasDocumentFromHtmlGraphJSON(json, { promoteSubjectRoot: true })!;

  await materializeVersionScene({ versionVariantId, document, projectId: "project-1" });
  await materializeVersionScene({ versionVariantId, document, projectId: "project-1" });

  const components = await listTable<ComponentRow>(TABLES.components);
  expect(components.filter((c) => c.sourceNodeId === "header")).toHaveLength(1);
  expect(components.filter((c) => c.sourceNodeId === "logo")).toHaveLength(1);
});
