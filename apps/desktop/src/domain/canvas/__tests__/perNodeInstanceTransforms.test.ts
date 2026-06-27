import { expect, test } from "bun:test";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/domain/canvas/htmlScene/styleUtils";
import { materializeInstancesInGraph } from "@/domain/canvas/graphTransforms";
import { removeInstancesInGraph } from "@/lib/storage/repos/scenes.repo";

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
  return { format: HTML_CANVAS_FORMAT, version: HTML_CANVAS_VERSION, rootId, viewport: { width: 200, height: 200 }, nodes, updatedAt: 1 };
}

const master = serializeHtmlCanvasDocument(
  doc("m-root", [mk({ id: "m-root", name: "Header" }), mk({ id: "m-a", parentId: "m-root", name: "Logo" })]),
);
const getMaster = (vid: string) => (vid === "mv" ? master : null);

const host = serializeHtmlCanvasDocument(
  doc("h-root", [
    mk({ id: "h-root", name: "Screen" }),
    mk({ id: "instA", parentId: "h-root", kind: "component", name: "A", instanceOf: { componentId: "C", variantId: "mv" } }),
    mk({ id: "instB", parentId: "h-root", kind: "component", name: "B", instanceOf: { componentId: "C", variantId: "mv" } }),
  ]),
);

test("materialize is per-node: only the targeted instance is detached", () => {
  const next = materializeInstancesInGraph(host, (node) => node.id === "instA", getMaster);
  expect(next).not.toBeNull();
  const out = htmlCanvasDocumentFromJSON(next!)!;
  const a = out.nodes.find((n) => n.id === "instA")!;
  const b = out.nodes.find((n) => n.id === "instB")!;
  expect(a.instanceOf).toBeNull(); // detached
  expect(out.nodes.some((n) => n.parentId === "instA")).toBe(true); // master content inlined
  expect(b.instanceOf).toEqual({ componentId: "C", variantId: "mv" }); // untouched
});

test("remove is per-node: only the targeted instance is dropped", () => {
  const next = removeInstancesInGraph(host, (node) => node.id === "instB");
  expect(next).not.toBeNull();
  const out = htmlCanvasDocumentFromJSON(next!)!;
  expect(out.nodes.some((n) => n.id === "instB")).toBe(false);
  expect(out.nodes.some((n) => n.id === "instA")).toBe(true);
});

test("copy one + delete the other in one graph", () => {
  const removed = removeInstancesInGraph(host, (node) => node.id === "instB")!;
  const materialized = materializeInstancesInGraph(removed, (node) => node.id === "instA", getMaster)!;
  const out = htmlCanvasDocumentFromJSON(materialized)!;
  expect(out.nodes.some((n) => n.id === "instB")).toBe(false); // deleted
  const a = out.nodes.find((n) => n.id === "instA")!;
  expect(a.instanceOf).toBeNull(); // copied (detached)
});
