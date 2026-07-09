import { expect, test } from "bun:test";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";
import { applyChildConstraintsInPlace } from "@/canvas/engine/mutations/elementConstraints";
import { shallowCloneDocument } from "@/canvas/engine/mutations/coreUtils";

function el(partial: Partial<ElementNode> & { id: string }): ElementNode {
  return {
    type: "rect",
    parentId: null,
    children: [],
    name: partial.id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    styles: {},
    ...partial,
  } as ElementNode;
}

// A 400×300 frame with one container child; constraints applied on the child.
function docWith(children: ElementNode[]): CanvasDocument {
  const elements: Record<string, ElementNode> = {};
  for (const node of children) elements[node.id] = node;
  return {
    canvas: { width: 400, height: 300, background: "#fff", rotation: 0 },
    rootIds: children.filter((n) => !n.parentId).map((n) => n.id),
    elements,
  };
}

test("right/bottom pins preserve the far inset on frame resize", () => {
  const doc = docWith([
    el({ id: "a", x: 300, y: 220, width: 80, height: 60, styles: { constraintH: "right", constraintV: "bottom" } }),
  ]);
  const next = shallowCloneDocument(doc);
  next.canvas.width = 500;
  next.canvas.height = 400;
  applyChildConstraintsInPlace(next, null, { width: 400, height: 300 }, { width: 500, height: 400 });

  // Right inset 400-(300+80)=20 → x = 500-20-80 = 400; bottom inset 20 → y = 320.
  expect(next.elements.a.x).toBe(400);
  expect(next.elements.a.y).toBe(320);
  expect(next.elements.a.width).toBe(80);
});

test("left-right/top-bottom stretch the child by the size delta", () => {
  const doc = docWith([
    el({ id: "a", x: 50, y: 40, width: 300, height: 200, styles: { constraintH: "left-right", constraintV: "top-bottom" } }),
  ]);
  const next = shallowCloneDocument(doc);
  next.canvas.width = 500;
  next.canvas.height = 400;
  applyChildConstraintsInPlace(next, null, { width: 400, height: 300 }, { width: 500, height: 400 });

  expect(next.elements.a.x).toBe(50);
  expect(next.elements.a.width).toBe(400);
  expect(next.elements.a.height).toBe(300);
});

test("scale scales both position and size; center keeps the relative center", () => {
  const doc = docWith([
    el({ id: "s", x: 100, y: 50, width: 200, height: 100, styles: { constraintH: "scale", constraintV: "scale" } }),
    el({ id: "c", x: 60, y: 0, width: 80, height: 40, styles: { constraintH: "center" } }),
  ]);
  const next = shallowCloneDocument(doc);
  next.canvas.width = 800;
  next.canvas.height = 600;
  applyChildConstraintsInPlace(next, null, { width: 400, height: 300 }, { width: 800, height: 600 });

  expect(next.elements.s.x).toBe(200);
  expect(next.elements.s.width).toBe(400);
  expect(next.elements.s.height).toBe(200);
  // center at (60+40)/400 = 25% → new center 200 → x = 200-40 = 160.
  expect(next.elements.c.x).toBe(160);
  expect(next.elements.c.width).toBe(80);
});

test("default (left/top) pins keep children untouched", () => {
  const doc = docWith([el({ id: "a", x: 10, y: 10, width: 50, height: 50 })]);
  const next = shallowCloneDocument(doc);
  next.canvas.width = 800;
  applyChildConstraintsInPlace(next, null, { width: 400, height: 300 }, { width: 800, height: 300 });

  expect(next.elements.a).toBe(doc.elements.a); // not even cloned
});

test("a stretched container cascades constraints into its own children", () => {
  const child = el({ id: "inner", parentId: "outer", x: 220, y: 0, width: 60, height: 40, styles: { constraintH: "right" } });
  const outer = el({
    id: "outer",
    x: 50,
    y: 40,
    width: 300,
    height: 200,
    children: ["inner"],
    styles: { constraintH: "left-right" },
  });
  const doc = docWith([outer, child]);
  doc.elements.inner = child;
  const next = shallowCloneDocument(doc);
  next.canvas.width = 500;
  applyChildConstraintsInPlace(next, null, { width: 400, height: 300 }, { width: 500, height: 300 });

  // outer stretched 300 → 400; inner pinned right: inset 300-(220+60)=20 → x=400-20-60=320.
  expect(next.elements.outer.width).toBe(400);
  expect(next.elements.inner.x).toBe(320);
});

test("flex/grid containers are excluded — the layout engine owns their children", () => {
  const child = el({ id: "inner", parentId: "box", x: 0, y: 0, width: 50, height: 50, styles: { constraintH: "right" } });
  const box = el({ id: "box", x: 0, y: 0, width: 300, height: 200, children: ["inner"], styles: { display: "flex" } });
  const doc = docWith([box, child]);
  doc.elements.inner = child;
  const next = shallowCloneDocument(doc);
  applyChildConstraintsInPlace(next, "box", { width: 300, height: 200 }, { width: 400, height: 200 });

  expect(next.elements.inner.x).toBe(0);
});
