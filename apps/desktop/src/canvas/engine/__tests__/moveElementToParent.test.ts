import { expect, test } from "bun:test";

import { moveElementToParent } from "@/canvas/engine/actions";
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

function createDocument(
  elements: Record<string, ElementNode>,
  rootIds: string[],
): CanvasDocument {
  return {
    canvas: { width: 400, height: 400, background: "#fff", rotation: 0 },
    rootIds,
    elements,
  };
}

test("nests a root element inside another (it gains the new parent)", () => {
  const doc = createDocument(
    {
      box: rectNode({ id: "box", x: 0, y: 0, width: 200, height: 200 }),
      dot: rectNode({ id: "dot", x: 300, y: 300, width: 20, height: 20 }),
    },
    ["box", "dot"],
  );

  const next = moveElementToParent(doc, "dot", "box", null);

  expect(next.rootIds).toEqual(["box"]);
  expect(next.elements.box.children).toEqual(["dot"]);
  expect(next.elements.dot.parentId).toBe("box");
});

test("emptying a parent's children leaves it childless (renders as a leaf again)", () => {
  const doc = createDocument(
    {
      parent: rectNode({ id: "parent", width: 200, height: 200, children: ["only"] }),
      only: rectNode({ id: "only", parentId: "parent", width: 20, height: 20 }),
    },
    ["parent"],
  );

  const next = moveElementToParent(doc, "only", null, null);

  // "only" left, so "parent" now has no children — the tree derives "component" vs
  // "element" purely from children.length, so it goes back to being a plain element.
  expect(next.elements.parent.children).toEqual([]);
  expect(next.rootIds).toContain("only");
  expect(next.elements.only.parentId).toBeNull();
});

test("reorders siblings via beforeId without changing parent", () => {
  const doc = createDocument(
    {
      a: rectNode({ id: "a" }),
      b: rectNode({ id: "b" }),
      c: rectNode({ id: "c" }),
    },
    ["a", "b", "c"],
  );

  const next = moveElementToParent(doc, "c", null, "a");
  expect(next.rootIds).toEqual(["c", "a", "b"]);
});

test("rejects dropping a node into its own descendant (no cycle)", () => {
  const doc = createDocument(
    {
      outer: rectNode({ id: "outer", width: 200, height: 200, children: ["inner"] }),
      inner: rectNode({ id: "inner", parentId: "outer", width: 100, height: 100 }),
    },
    ["outer"],
  );

  const next = moveElementToParent(doc, "outer", "inner", null);
  expect(next).toBe(doc);
});
