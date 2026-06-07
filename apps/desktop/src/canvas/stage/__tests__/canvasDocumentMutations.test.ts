import { expect, test } from "bun:test";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CanvasDocument } from "@/canvas/engine/types";
import { fitTextElementToContent, reparentElements, setTextElementSizing, updateElementStyles, updateElementText } from "@/canvas/engine/actions";
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

test("command drag can leave the current parent before detaching", () => {
  const document = createDocument();
  document.rootIds = ["parent"];
  document.elements = {
    parent: {
      id: "parent",
      type: "rect",
      parentId: null,
      children: ["child"],
      name: "Parent",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      styles: {},
    },
    child: {
      id: "child",
      type: "rect",
      parentId: "parent",
      children: [],
      name: "Child",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      rotation: 0,
      styles: {},
    },
  };
  const interaction: DragInteraction = {
    type: "drag",
    pointerId: 1,
    startPoint: { x: 60, y: 60 },
    beforeDocument: document,
    selectedIds: ["child"],
    transformIds: ["child"],
    startBox: { x: 60, y: 60, width: 20, height: 20 },
    commonParentId: "parent",
    parentBounds: { x: 50, y: 50, width: 100, height: 100 },
    moved: true,
    lastDocument: document,
    lastGuides: [],
    clickedId: "child",
    wasAlreadySelected: true,
    currentDelta: { x: 150, y: 0 },
    startScreenPoint: { x: 0, y: 0 },
    startWorldToScreenMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  };

  const normalMove = commitDragMove(interaction, interaction.currentDelta);
  const commandMove = commitDragMove(interaction, interaction.currentDelta, {
    clampBounds: { x: 0, y: 0, width: 500, height: 500 },
  });
  const detached = reparentElements(commandMove, ["child"], null);

  expect(normalMove.elements.child.x).toBe(80);
  expect(commandMove.elements.child.x).toBe(160);
  expect(detached.elements.child.parentId).toBeNull();
  expect(detached.elements.child.x).toBe(210);
  expect(detached.rootIds).toContain("child");
  expect(detached.elements.parent.children).toEqual([]);
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

test("scale tool resizes an element and its children proportionally", () => {
  const document = createDocument();
  document.rootIds = ["parent"];
  document.elements = {
    parent: {
      id: "parent",
      type: "rect",
      parentId: null,
      children: ["child"],
      name: "Parent",
      x: 100,
      y: 80,
      width: 100,
      height: 100,
      rotation: 0,
      styles: { borderRadius: 8 },
    },
    child: {
      id: "child",
      type: "text",
      parentId: "parent",
      children: [],
      name: "Child",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      rotation: 0,
      styles: { fontSize: 12 },
    },
  };

  const interaction: ResizeInteraction = {
    type: "resize",
    handle: "se",
    pointerId: 1,
    startPoint: { x: 200, y: 180 },
    beforeDocument: document,
    selectedIds: ["parent"],
    transformIds: ["parent"],
    startBox: { x: 100, y: 80, width: 100, height: 100 },
    startRects: { parent: { x: 100, y: 80, width: 100, height: 100 } },
    scaleMode: true,
    commonParentId: null,
    parentBounds: { x: 0, y: 0, width: 500, height: 500 },
    moved: true,
    lastDocument: document,
    lastGuides: [],
  };

  // Drag the SE corner by +100 in both axes → uniform 2x scale.
  const result = resizeDocument(
    interaction,
    { x: 300, y: 280 },
    { altKey: false, shiftKey: false } as ReactPointerEvent,
  );

  expect(result.document.elements.parent).toMatchObject({ x: 100, y: 80, width: 200, height: 200 });
  expect(result.document.elements.parent.styles.borderRadius).toBe(16);
  // Child keeps its proportional placement and grows with the parent.
  expect(result.document.elements.child).toMatchObject({ x: 20, y: 20, width: 40, height: 40 });
  expect(result.document.elements.child.styles.fontSize).toBe(24);
});

test("scale tool grows uniformly even when dragging a single-axis edge handle", () => {
  const document = createDocument();
  // node: 50x40 at (100,80); start box matches.
  const interaction: ResizeInteraction = {
    type: "resize",
    handle: "e",
    pointerId: 1,
    startPoint: { x: 150, y: 100 },
    beforeDocument: document,
    selectedIds: ["node"],
    transformIds: ["node"],
    startBox: { x: 100, y: 80, width: 50, height: 40 },
    startRects: { node: { x: 100, y: 80, width: 50, height: 40 } },
    scaleMode: true,
    commonParentId: null,
    parentBounds: { x: 0, y: 0, width: 500, height: 500 },
    moved: true,
    lastDocument: document,
    lastGuides: [],
  };

  // Drag the east edge by +50 → width doubles, and height scales to match (uniform).
  const result = resizeDocument(
    interaction,
    { x: 200, y: 100 },
    { altKey: false, shiftKey: false } as ReactPointerEvent,
  );

  expect(result.document.elements.node.width).toBe(100);
  expect(result.document.elements.node.height).toBe(80);
  // East-edge anchor keeps the west edge fixed; vertical center is preserved.
  expect(result.document.elements.node.x).toBe(100);
  expect(result.document.elements.node.y).toBe(60);
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
