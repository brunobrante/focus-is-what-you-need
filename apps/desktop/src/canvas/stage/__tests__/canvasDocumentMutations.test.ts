import { expect, test } from "bun:test";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CanvasDocument } from "@/canvas/engine/types";
import { fitTextElementToContent, setTextElementSizing, updateElementStyles, updateElementText } from "@/canvas/engine/actions";
import { createViewportTransform } from "@/canvas/engine/viewport";
import type { DragInteraction, RadiusInteraction, ResizeInteraction } from "../canvasInteractionTypes";
import {
  commitDragMove,
  computeDragMoveFromScreenDelta,
  radiusDocument,
  resizeDocument,
} from "../canvasDocumentMutations";

function createDocument(): CanvasDocument {
  return {
    canvas: {
      width: 500,
      height: 500,
      background: "#fff",
      rotation: 0,
    },
    rootIds: ["node"],
    elements: {
      node: {
        id: "node",
        type: "rect",
        parentId: null,
        children: [],
        name: "Node",
        x: 100,
        y: 80,
        width: 50,
        height: 40,
        rotation: 0,
        styles: {},
      },
    },
  };
}

test("drag movement converts screen pixels through the shared world matrix once", () => {
  const document = createDocument();
  const transform = createViewportTransform({
    displayZoom: 20,
    offsetX: 200,
    offsetY: 100,
    canvasRotation: 0,
    canvasWidth: document.canvas.width,
    canvasHeight: document.canvas.height,
  });
  const interaction: DragInteraction = {
    type: "drag",
    pointerId: 1,
    startPoint: { x: 100, y: 80 },
    beforeDocument: document,
    selectedIds: ["node"],
    transformIds: ["node"],
    startBox: { x: 100, y: 80, width: 50, height: 40 },
    commonParentId: null,
    parentBounds: { x: 0, y: 0, width: 500, height: 500 },
    moved: false,
    lastDocument: document,
    lastGuides: [],
    clickedId: "node",
    wasAlreadySelected: true,
    currentDelta: { x: 0, y: 0 },
    startScreenPoint: { x: 0, y: 0 },
    startWorldToScreenMatrix: transform.matrix,
  };

  const move = computeDragMoveFromScreenDelta(interaction, { x: 40, y: -20 });
  const next = commitDragMove(interaction, move.delta);

  expect(move.delta).toEqual({ x: 2, y: -1 });
  expect(next.elements.node.x).toBe(102);
  expect(next.elements.node.y).toBe(79);
});

test("radius drag stays clamped after the pointer passes the maximum corner radius", () => {
  const document = createDocument();
  const interaction: RadiusInteraction = {
    type: "radius",
    pointerId: 1,
    startPoint: { x: 100, y: 80 },
    elementId: "node",
    corner: "nw",
    beforeDocument: document,
    selectedIds: ["node"],
    moved: false,
    lastDocument: document,
    lastGuides: [],
  };

  const result = radiusDocument(interaction, { x: 1000, y: 1000 });

  expect(result.document.elements.node.styles.borderRadius).toBe(20);
});

test("resizes a 180 degree element from the visual handle direction", () => {
  const document = createDocument();
  document.elements.node.rotation = 180;
  const interaction: ResizeInteraction = {
    type: "resize",
    pointerId: 1,
    handle: "se",
    startPoint: { x: 100, y: 80 },
    beforeDocument: document,
    selectedIds: ["node"],
    transformIds: ["node"],
    startBox: { x: 100, y: 80, width: 50, height: 40 },
    startRects: {
      node: { x: 100, y: 80, width: 50, height: 40 },
    },
    commonParentId: null,
    parentBounds: { x: 0, y: 0, width: 500, height: 500 },
    moved: false,
    lastDocument: document,
    lastGuides: [],
  };

  const result = resizeDocument(
    interaction,
    { x: 90, y: 70 },
    { altKey: false, shiftKey: false } as ReactPointerEvent,
  );

  expect(result.document.elements.node).toMatchObject({
    x: 90,
    y: 70,
    width: 60,
    height: 50,
  });
});

test("fits text bounds to the current content and font size", () => {
  const document = createDocument();
  document.rootIds = ["node"];
  document.elements.node = {
    id: "node",
    type: "text",
    parentId: null,
    children: [],
    name: "Text",
    x: 100,
    y: 80,
    width: 180,
    height: 120,
    rotation: 0,
    styles: {
      fontSize: 20,
      fontWeight: "400",
      fontFamily: "Inter",
      padding: 4,
      borderWidth: 1,
    },
    content: "A\nBC",
  };

  const next = fitTextElementToContent(document, "node");

  expect(next.elements.node.sizing).toEqual({ width: "fit", height: "fit" });
  expect(next.elements.node.width).toBeGreaterThan(20);
  expect(next.elements.node.height).toBe(55);
});

test("fit text sizing follows content and font changes", () => {
  const document = createDocument();
  document.rootIds = ["node"];
  document.elements.node = {
    id: "node",
    type: "text",
    parentId: null,
    children: [],
    name: "Text",
    x: 100,
    y: 80,
    width: 60,
    height: 30,
    rotation: 0,
    styles: {
      fontSize: 10,
      fontWeight: "400",
      fontFamily: "Inter",
    },
    content: "A",
  };

  const fitted = fitTextElementToContent(document, "node");
  const wider = updateElementText(fitted, "node", "A much longer line");
  const larger = updateElementStyles(wider, "node", { fontSize: 24 });

  expect(wider.elements.node.width).toBeGreaterThan(fitted.elements.node.width);
  expect(larger.elements.node.width).toBeGreaterThan(wider.elements.node.width);
  expect(larger.elements.node.height).toBeGreaterThan(wider.elements.node.height);
});

test("fit text height can follow wrapping while width stays fixed", () => {
  const document = createDocument();
  document.rootIds = ["node"];
  document.elements.node = {
    id: "node",
    type: "text",
    parentId: null,
    children: [],
    name: "Text",
    x: 100,
    y: 80,
    width: 24,
    height: 12,
    rotation: 0,
    styles: {
      fontSize: 10,
      fontWeight: "400",
      fontFamily: "Inter",
    },
    content: "abc",
  };

  const fitted = setTextElementSizing(document, "node", { height: "fit" });
  const wrapped = updateElementText(fitted, "node", "abc abc abc");

  expect(wrapped.elements.node.sizing).toEqual({ height: "fit" });
  expect(wrapped.elements.node.width).toBe(24);
  expect(wrapped.elements.node.height).toBeGreaterThan(fitted.elements.node.height);
});

test("fit text height follows wrapping after fit width is constrained", () => {
  const document = createDocument();
  document.canvas.width = 120;
  document.rootIds = ["node"];
  document.elements.node = {
    id: "node",
    type: "text",
    parentId: null,
    children: [],
    name: "Text",
    x: 0,
    y: 0,
    width: 40,
    height: 12,
    rotation: 0,
    styles: {
      fontSize: 10,
      fontWeight: "400",
      fontFamily: "Inter",
    },
    content: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };

  const fitted = fitTextElementToContent(document, "node");

  expect(fitted.elements.node.sizing).toEqual({ width: "fit", height: "fit" });
  expect(fitted.elements.node.width).toBe(120);
  expect(fitted.elements.node.height).toBeGreaterThan(22);
});
