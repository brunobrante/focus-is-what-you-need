import { expect, test } from "bun:test";
import { materializeInstancesInGraph } from "@/domain/canvas/graphTransforms";
import { removeInstancesInGraph } from "@/lib/storage/repos/scenes.repo";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/lib/canvas/htmlScene/styleUtils";

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
    viewport: { width: 100, height: 100 },
    nodes,
    updatedAt: 1,
  };
}

const masterJSON = serializeHtmlCanvasDocument(
  doc("m-root", [
    mk({ id: "m-root", name: "Header" }),
    mk({ id: "m-a", parentId: "m-root", name: "Logo" }),
  ]),
);

const parentJSON = serializeHtmlCanvasDocument(
  doc("p-root", [
    mk({ id: "p-root", name: "Screen" }),
    mk({ id: "inst", parentId: "p-root", name: "Header", instanceOf: { componentId: "c1", variantId: "v1" } }),
  ]),
);

test("materializeInstancesInGraph turns matching instances into editable own content", () => {
  const next = materializeInstancesInGraph(
    parentJSON,
    (cid) => cid === "c1",
    (vid) => (vid === "v1" ? masterJSON : null),
  );
  expect(next).not.toBeNull();
  const result = htmlCanvasDocumentFromJSON(next!)!;
  const byId = new Map(result.nodes.map((n) => [n.id, n]));

  // The instance container loses its link and becomes editable.
  const container = byId.get("inst")!;
  expect(container.instanceOf).toBeNull();
  expect(container.locked).toBe(false);

  // Master content is now real, unlocked content under it.
  const child = byId.get("inst~m-a");
  expect(child?.parentId).toBe("inst");
  expect(child?.locked).toBe(false);
  expect(child?.name).toBe("Logo");
});

test("materializeInstancesInGraph leaves non-matching instances untouched", () => {
  const next = materializeInstancesInGraph(
    parentJSON,
    (cid) => cid === "other",
    (vid) => (vid === "v1" ? masterJSON : null),
  );
  expect(next).toBeNull();
});

test("removeInstancesInGraph drops matching instance nodes (cascade)", () => {
  const next = removeInstancesInGraph(parentJSON, (cid) => cid === "c1");
  expect(next).not.toBeNull();
  const result = htmlCanvasDocumentFromJSON(next!)!;
  expect(result.nodes.map((n) => n.id).sort()).toEqual(["p-root"]);
});

test("removeInstancesInGraph is a no-op when nothing matches", () => {
  expect(removeInstancesInGraph(parentJSON, (cid) => cid === "other")).toBeNull();
});
