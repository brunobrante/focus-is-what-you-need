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

function createRadiusInteraction(
  document: CanvasDocument,
  corner: RadiusInteraction["corner"],
  startPoint: { x: number; y: number } = { x: 100, y: 80 },
): RadiusInteraction {
  return {
    type: "radius",
    pointerId: 1,
    startPoint,
    elementId: "node",
    corner,
    beforeDocument: document,
    selectedIds: ["node"],
    moved: false,
    lastDocument: document,
    lastGuides: [],
  };
}

// node is { x: 100, y: 80, width: 50, height: 40 } → maxRadius = min(50, 40) / 2 = 20.
// At the max the short-edge handles stack: nw+sw at (120, 100), ne+se at (130, 100).

test("radius drag stays clamped while the pointer is dragged inward past the maximum", () => {
  const document = createDocument();
  const interaction = createRadiusInteraction(document, "nw");

  // Far inward (200px past the meeting point) at mid-height stays pinned at the max.
  const result = radiusDocument(interaction, { x: 300, y: 100 });

  expect(result.document.elements.node.styles.borderRadius).toBe(20);
});

// A grab that starts on stacked handles (radius already at the max). The box is wide,
// so the short edges are vertical and ne+se stack at (130, 100), where the grab lands.
function createStackedDocument(): CanvasDocument {
  const document = createDocument();
  document.elements.node.styles.borderRadius = 20;
  return document;
}

test("stacked radius grab commits to the corner of the first drag (up → ne)", () => {
  const interaction = createRadiusInteraction(createStackedDocument(), "ne", { x: 130, y: 100 });

  // First move pulls up toward the ne corner → radius shrinks.
  const up = radiusDocument(interaction, { x: 140, y: 90 });
  expect(up.document.elements.node.styles.borderRadius).toBeLessThan(20);

  // Dragging back down past the meeting point only returns to the lock; it cannot
  // cross into the se corner (would otherwise shrink again on the other side).
  const back = radiusDocument(interaction, { x: 140, y: 115 });
  expect(back.document.elements.node.styles.borderRadius).toBe(20);
});

test("stacked radius grab commits to the corner of the first drag (down → se)", () => {
  const interaction = createRadiusInteraction(createStackedDocument(), "ne", { x: 130, y: 100 });

  // The hit test reported ne, but the first move pulls down toward se → it must shrink.
  const down = radiusDocument(interaction, { x: 140, y: 110 });
  expect(down.document.elements.node.styles.borderRadius).toBeLessThan(20);

  // Dragging back up past the meeting point only returns to the lock, no crossing.
  const back = radiusDocument(interaction, { x: 140, y: 85 });
  expect(back.document.elements.node.styles.borderRadius).toBe(20);
});

// A square at the maximum radius collapses ALL FOUR handles onto the center
// (40×40 → maxRadius 20, every handle at (120, 100)). The grab must be able to commit
// toward any of the four corners, not just one short-edge pair.
function createSquareStackedDocument(): CanvasDocument {
  const document = createDocument();
  document.elements.node.width = 40;
  document.elements.node.height = 40;
  document.elements.node.styles.borderRadius = 20;
  return document;
}

test("square stacked radius grab commits to any of the four corners (up-right → ne)", () => {
  // The hit test reported nw, but the first drag pulls up-right toward ne.
  const interaction = createRadiusInteraction(createSquareStackedDocument(), "nw", { x: 120, y: 100 });

  const upRight = radiusDocument(interaction, { x: 130, y: 90 });
  expect(upRight.document.elements.node.styles.borderRadius).toBeLessThan(20);

  // Once committed to ne, dragging toward the opposite (sw) corner only returns to the
  // lock; it cannot cross the meeting point into another corner.
  const back = radiusDocument(interaction, { x: 110, y: 110 });
  expect(back.document.elements.node.styles.borderRadius).toBe(20);
});

test("square stacked radius grab commits toward the down-left (sw) corner", () => {
  const interaction = createRadiusInteraction(createSquareStackedDocument(), "ne", { x: 120, y: 100 });

  const downLeft = radiusDocument(interaction, { x: 110, y: 110 });
  expect(downLeft.document.elements.node.styles.borderRadius).toBeLessThan(20);

  // Cannot cross into the opposite (ne) corner.
  const back = radiusDocument(interaction, { x: 130, y: 90 });
  expect(back.document.elements.node.styles.borderRadius).toBe(20);
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

test("corner radius is stored verbatim, not clamped to min(w,h)/2 at write (D1)", () => {
  const document = createDocument(); // 50×40 rect
  const pill = updateElementStyles(document, "node", { borderRadius: 9999 });
  // Kept as-is (a pill), NOT corrected to 20; CSS caps at render.
  expect(pill.elements.node.styles.borderRadius).toBe(9999);
  // Still floored at zero.
  const negative = updateElementStyles(document, "node", { borderRadius: -5 });
  expect(negative.elements.node.styles.borderRadius).toBe(0);
});
