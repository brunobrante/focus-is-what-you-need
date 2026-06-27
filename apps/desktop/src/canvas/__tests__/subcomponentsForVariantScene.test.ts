import { beforeEach, expect, test } from "bun:test";
import { subcomponentsForVariantScene } from "@/canvas/canvasUtils";
import { linkifyChildComponentsInGraph } from "@/domain/canvas/graphTransforms";
import { resetPersistenceSingletons } from "@/application/persistence/saveQueueProvider";
import { TABLES, putRecord, resetRecordStoreCache } from "@/lib/storage/store";
import { primeEdgeIndex, resetEdgeIndex } from "@/application/graph/edgeIndex";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import type { VariantRow } from "@/lib/storage/schema";

class MemoryStorage {
  private rows = new Map<string, string>();
  getItem(k: string) { return this.rows.get(k) ?? null; }
  setItem(k: string, v: string) { this.rows.set(k, v); }
  removeItem(k: string) { this.rows.delete(k); }
}
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";
import type { ComponentRow } from "@/lib/storage/schema";

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

function doc(rootId: string, nodes: HtmlCanvasNode[]): HtmlCanvasDocument {
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: { width: 390, height: 844 },
    nodes,
    updatedAt: 1,
  };
}

// A realistic screen scene: "Home Canvas" wrapper → "Home" subject → "Header"/"Hero"
// top-level components (each with a child).
const screenJSON = serializeHtmlCanvasDocument(
  doc("root", [
    mk({ id: "root", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
    mk({ id: "subj", parentId: "root", name: "Home", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
    mk({ id: "header", parentId: "subj", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "logo", parentId: "header", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
    mk({ id: "hero", parentId: "subj", name: "Hero", bounds: { x: 0, y: 72, width: 390, height: 200 } }),
    mk({ id: "cta", parentId: "hero", name: "CTA", bounds: { x: 12, y: 12, width: 100, height: 40 } }),
  ]),
);

function comp(p: Partial<ComponentRow> & { id: string }): ComponentRow {
  return {
    id: p.id,
    projectId: p.projectId ?? "proj",
    workspaceId: p.workspaceId ?? null,
    name: p.name ?? p.id,
    kind: p.kind ?? "Custom",
    activeVariantId: p.activeVariantId ?? `${p.id}-v`,
    sourceNodeId: p.sourceNodeId ?? null,
    order: p.order ?? 0,
    createdAt: 1,
    updatedAt: 1,
  } as ComponentRow;
}

const headerMaster = comp({ id: "c-header", name: "Header", sourceNodeId: "header", activeVariantId: "v-header" });
const heroMaster = comp({ id: "c-hero", name: "Hero", sourceNodeId: "hero", activeVariantId: "v-hero" });
const projectComponents = [headerMaster, heroMaster];

// Ownership is the edge now: the masters are top-level on screen "screen", i.e.
// owned by its main variant. Seed that variant and the `owns` edges so the
// resolver inside subcomponentsForVariantScene resolves them as screen-owned.
beforeEach(async () => {
  resetPersistenceSingletons();
  resetRecordStoreCache();
  resetEdgeIndex();
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  putRecord<VariantRow>(TABLES.variants, {
    id: "v-screen-main",
    ownerKind: "screen",
    ownerId: "screen",
    name: "Default",
    order: 0,
    seedKey: null,
    createdAt: 1,
    updatedAt: 1,
  } as VariantRow);
  await setOwner({ type: "variant", id: "v-screen-main" }, { type: "component", id: "c-header" });
  await setOwner({ type: "variant", id: "v-screen-main" }, { type: "component", id: "c-hero" });
  await primeEdgeIndex();
});

test("linked version: resolves the subject's children as linked subcomponents", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: "header", name: "Header" },
    { id: "c-hero", activeVariantId: "v-hero", sourceNodeId: "hero", name: "Hero" },
  ])!;
  const { components, linkedIds } = subcomponentsForVariantScene({
    graphJSON: linked,
    variantId: "v1",
    screenId: "screen",
    projectComponents,
  });
  expect(components.map((c) => c.id).sort()).toEqual(["c-header", "c-hero"]);
  expect([...linkedIds].sort()).toEqual(["c-header", "c-hero"]);
});

test("main scene (no linkify): resolves the subject's children as owned, not linked", () => {
  const { components, linkedIds } = subcomponentsForVariantScene({
    graphJSON: screenJSON,
    variantId: "main",
    screenId: "screen",
    projectComponents,
  });
  expect(components.map((c) => c.id).sort()).toEqual(["c-header", "c-hero"]);
  expect(linkedIds.size).toBe(0);
});
