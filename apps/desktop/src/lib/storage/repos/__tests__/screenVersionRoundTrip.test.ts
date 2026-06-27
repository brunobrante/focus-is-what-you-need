import { expect, test } from "bun:test";
import { linkifyChildComponentsInGraph } from "@/domain/canvas/graphTransforms";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { componentNodeIdsFromDocument } from "@/canvas/canvasUtils";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  buildMasterResolver,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";

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

// A realistic screen scene: "Home Canvas" wrapper → "Home" subject → "Header" (with a child).
const screenJSON = serializeHtmlCanvasDocument(
  doc("root", [
    mk({ id: "root", name: "Home Canvas", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
    mk({ id: "subj", parentId: "root", name: "Home", bounds: { x: 0, y: 0, width: 390, height: 844 } }),
    mk({ id: "header", parentId: "subj", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "logo", parentId: "header", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
  ]),
);

// The Header master variant scene.
const headerMasterJSON = serializeHtmlCanvasDocument(
  doc("h-root", [
    mk({ id: "h-root", name: "Header Canvas", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "h-subj", parentId: "h-root", name: "Header", bounds: { x: 0, y: 0, width: 390, height: 72 } }),
    mk({ id: "h-logo", parentId: "h-subj", name: "Logo", bounds: { x: 12, y: 12, width: 48, height: 48 } }),
  ]),
);

const resolver = buildMasterResolver([
  { ownerType: "variant", ownerId: "v-header", graphJSON: headerMasterJSON },
]);

test("linkify turns the screen's Header into an instance (by sourceNodeId)", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: "header", name: "Header" },
  ]);
  expect(linked).not.toBeNull();
  const d = htmlCanvasDocumentFromJSON(linked!)!;
  const header = d.nodes.find((n) => n.id === "header");
  expect(header?.instanceOf).toEqual({ componentId: "c-header", variantId: "v-header" });
  // The embedded child was removed (instance stores no children).
  expect(d.nodes.some((n) => n.id === "logo")).toBe(false);
});

test("linkify matches by name when sourceNodeId is absent", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: null, name: "Header" },
  ]);
  const d = htmlCanvasDocumentFromJSON(linked!)!;
  expect(d.nodes.find((n) => n.id === "header")?.instanceOf).toEqual({
    componentId: "c-header",
    variantId: "v-header",
  });
});

test("loaded linked screen exposes the Header element as a linked instance (purple)", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: "header", name: "Header" },
  ])!;
  const cdoc = canvasDocumentFromHtmlGraphJSON(linked, {
    promoteSubjectRoot: true,
    resolveMaster: resolver,
  })!;
  const headerEl = cdoc.elements["header"];
  expect(headerEl).toBeTruthy();
  expect(headerEl.instanceOf).toEqual({ componentId: "c-header", variantId: "v-header" });
});

test("the materializer ignores instance nodes (no re-save → no propagation reset)", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: "header", name: "Header" },
  ])!;
  const cdoc = canvasDocumentFromHtmlGraphJSON(linked, {
    promoteSubjectRoot: true,
    resolveMaster: resolver,
  })!;
  // The Header instance (and its inlined master content) must be excluded, so the
  // background materialize-on-save never matches it to the Header master and triggers
  // the propagation that previously stripped instanceOf.
  const ids = componentNodeIdsFromDocument(cdoc);
  expect(ids).not.toContain("header");
  expect(ids.some((id) => id.startsWith("header~"))).toBe(false);
});

test("instanceOf survives the canvas load→save round-trip (persistence)", () => {
  const linked = linkifyChildComponentsInGraph(screenJSON, [
    { id: "c-header", activeVariantId: "v-header", sourceNodeId: "header", name: "Header" },
  ])!;
  const cdoc = canvasDocumentFromHtmlGraphJSON(linked, {
    promoteSubjectRoot: true,
    resolveMaster: resolver,
  })!;
  const savedJSON = htmlGraphJSONFromCanvasDocument(cdoc, linked, "Home");
  const saved = htmlCanvasDocumentFromJSON(savedJSON)!;
  const header = saved.nodes.find((n) => n.id === "header");
  expect(header?.instanceOf).toEqual({ componentId: "c-header", variantId: "v-header" });
  // And the master content was NOT persisted back into the screen scene.
  expect(saved.nodes.some((n) => n.name === "Logo")).toBe(false);
});
