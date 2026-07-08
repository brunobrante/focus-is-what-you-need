import { expect, test } from "bun:test";

import { canvasPointToParentContentSpace, getAbsoluteCenter } from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";

function rectNode(overrides: Partial<ElementNode> & Pick<ElementNode, "id">): ElementNode {
  return {
    id: overrides.id,
    type: "rect",
    parentId: null,
    children: [],
    name: overrides.id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    styles: {},
    ...overrides,
  };
}

function createDocument(elements: Record<string, ElementNode>, rootIds: string[]): CanvasDocument {
  return {
    canvas: { width: 300, height: 200, background: "#ffffff", rotation: 0 },
    rootIds,
    elements,
  };
}

// The element's stored parent-content-local center — what node.x/node.y encode.
function localCenter(node: ElementNode) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function expectClose(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
}

test("root element: the mapping is the identity (x/y are canvas coords)", () => {
  const doc = createDocument(
    { a: rectNode({ id: "a", x: 40, y: 30, width: 20, height: 10 }) },
    ["a"],
  );
  const canvasCenter = getAbsoluteCenter(doc, "a")!;
  expect(canvasPointToParentContentSpace(doc, "a", canvasCenter)).toEqual(localCenter(doc.elements.a));
});

test("inverts getAbsoluteCenter under a rotated parent with a border", () => {
  const doc = createDocument(
    {
      parent: rectNode({
        id: "parent",
        children: ["child"],
        x: 50,
        y: 40,
        width: 120,
        height: 90,
        rotation: 37,
        styles: { borderWidth: 4 },
      }),
      child: rectNode({ id: "child", parentId: "parent", x: 10, y: 12, width: 30, height: 20 }),
    },
    ["parent"],
  );
  // Round-trip: local center → canvas (getAbsoluteCenter) → local center.
  const canvasCenter = getAbsoluteCenter(doc, "child")!;
  expectClose(canvasPointToParentContentSpace(doc, "child", canvasCenter)!, localCenter(doc.elements.child));
});

test("inverts a two-level rotated ancestor chain", () => {
  const doc = createDocument(
    {
      ancestor: rectNode({ id: "ancestor", children: ["parent"], x: 20, y: 20, width: 220, height: 160, rotation: -18 }),
      parent: rectNode({ id: "parent", parentId: "ancestor", children: ["child"], x: 30, y: 25, width: 100, height: 80, rotation: 25 }),
      child: rectNode({ id: "child", parentId: "parent", x: 7, y: 9, width: 20, height: 18, rotation: 40 }),
    },
    ["ancestor"],
  );
  const canvasCenter = getAbsoluteCenter(doc, "child")!;
  expectClose(canvasPointToParentContentSpace(doc, "child", canvasCenter)!, localCenter(doc.elements.child));
});
