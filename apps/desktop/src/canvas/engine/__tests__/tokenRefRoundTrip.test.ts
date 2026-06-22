import { expect, test } from "bun:test";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import { defaultStyle } from "@/lib/canvas/htmlScene/styleUtils";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene";

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

const graph: HtmlCanvasDocument = {
  format: HTML_CANVAS_FORMAT,
  version: HTML_CANVAS_VERSION,
  rootId: "root",
  viewport: { width: 200, height: 200 },
  nodes: [
    mk({ id: "root", name: "Screen" }),
    mk({
      id: "card",
      parentId: "root",
      name: "Card",
      kind: "shape",
      style: { ...defaultStyle(), background: "#000000", backgroundRef: "colors:c-primary" },
    }),
  ],
  updatedAt: 1,
};

test("a token $$ref binding survives the engine round-trip", () => {
  const graphJSON = serializeHtmlCanvasDocument(graph);

  // graph -> engine document: the ref lands on the element styles.
  const canvasDoc = canvasDocumentFromHtmlGraphJSON(graphJSON);
  expect(canvasDoc).not.toBeNull();
  const card = Object.values(canvasDoc!.elements).find((el) => el.name === "Card");
  expect(card?.styles.backgroundRef).toBe("colors:c-primary");
  // The literal stays as the fallback.
  expect(card?.styles.background).toBe("#000000");

  // engine document -> graph: the ref persists.
  const backJSON = htmlGraphJSONFromCanvasDocument(canvasDoc!, graphJSON, "Canvas");
  const back = htmlCanvasDocumentFromJSON(backJSON);
  const cardNode = back!.nodes.find((n) => n.name === "Card");
  expect(cardNode?.style.backgroundRef).toBe("colors:c-primary");
});

test("clearing the binding (unbind) persists instead of resurrecting the ref", () => {
  const graphJSON = serializeHtmlCanvasDocument(graph);
  const canvasDoc = canvasDocumentFromHtmlGraphJSON(graphJSON)!;
  const card = Object.values(canvasDoc.elements).find((el) => el.name === "Card")!;

  // Simulate the inspector "revert to literal": drop the ref.
  const unbound = {
    ...canvasDoc,
    elements: {
      ...canvasDoc.elements,
      [card.id]: { ...card, styles: { ...card.styles, backgroundRef: undefined } },
    },
  };

  const backJSON = htmlGraphJSONFromCanvasDocument(unbound, graphJSON, "Canvas");
  const back = htmlCanvasDocumentFromJSON(backJSON)!;
  const cardNode = back.nodes.find((n) => n.name === "Card");
  expect(cardNode?.style.backgroundRef ?? undefined).toBeUndefined();
});
