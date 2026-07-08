import { expect, test } from "bun:test";

import { alignElements, distributeElements } from "../elementAlign";
import type { CanvasDocument, ElementNode } from "../../types";

function rect(id: string, x: number, y: number, width: number, height: number, extra: Partial<ElementNode> = {}): ElementNode {
  return {
    id,
    type: "rect",
    parentId: null,
    children: [],
    name: id,
    x,
    y,
    width,
    height,
    rotation: 0,
    styles: {},
    ...extra,
  };
}

function docOf(nodes: ElementNode[]): CanvasDocument {
  const elements: Record<string, ElementNode> = {};
  for (const n of nodes) elements[n.id] = n;
  return {
    canvas: { width: 500, height: 500, background: "#fff", rotation: 0 },
    rootIds: nodes.filter((n) => !n.parentId).map((n) => n.id),
    elements,
  };
}

test("align left moves every element's left edge to the selection's left (G1)", () => {
  const doc = docOf([rect("a", 10, 0, 20, 20), rect("b", 50, 40, 30, 20), rect("c", 80, 80, 10, 20)]);
  const out = alignElements(doc, ["a", "b", "c"], "left");
  expect(out.elements.a.x).toBe(10);
  expect(out.elements.b.x).toBe(10);
  expect(out.elements.c.x).toBe(10);
});

test("align hcenter centers every box on the selection center (G1)", () => {
  const doc = docOf([rect("a", 0, 0, 20, 20), rect("b", 100, 0, 40, 20)]);
  // union: x 0..140, center 70. a→60, b→50.
  const out = alignElements(doc, ["a", "b"], "hcenter");
  expect(out.elements.a.x + out.elements.a.width / 2).toBeCloseTo(70);
  expect(out.elements.b.x + out.elements.b.width / 2).toBeCloseTo(70);
});

test("align bottom aligns bottom edges (G1)", () => {
  const doc = docOf([rect("a", 0, 0, 20, 20), rect("b", 40, 10, 20, 50)]);
  const out = alignElements(doc, ["a", "b"], "bottom");
  const bottom = (n: ElementNode) => n.y + n.height;
  expect(bottom(out.elements.a)).toBeCloseTo(60);
  expect(bottom(out.elements.b)).toBeCloseTo(60);
});

test("single-element align uses the parent/canvas frame (G1)", () => {
  const doc = docOf([rect("a", 30, 30, 40, 40)]);
  const out = alignElements(doc, ["a"], "left");
  expect(out.elements.a.x).toBe(0); // canvas left
});

test("distribute horizontal equalizes gaps, extremes fixed (G1)", () => {
  // widths 20,20,20; span from x0 to x120 (last right). total 60, 2 gaps → gap 30.
  const doc = docOf([rect("a", 0, 0, 20, 20), rect("b", 30, 0, 20, 20), rect("c", 100, 0, 20, 20)]);
  const out = distributeElements(doc, ["a", "b", "c"], "horizontal");
  expect(out.elements.a.x).toBe(0);
  expect(out.elements.c.x).toBe(100);
  expect(out.elements.b.x).toBeCloseTo(50); // 0 + 20 + 30
});

test("align skips locked elements but uses them as a reference anchor (G1)", () => {
  const doc = docOf([rect("a", 40, 0, 20, 20), rect("b", 10, 0, 20, 20, { locked: true })]);
  const out = alignElements(doc, ["a", "b"], "left");
  expect(out.elements.b.x).toBe(10); // locked: untouched, but its edge is the anchor
  expect(out.elements.a.x).toBe(10); // moved to the union-left (the locked element's edge)
});
