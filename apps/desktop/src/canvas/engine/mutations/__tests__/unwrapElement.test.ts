import { expect, test } from "bun:test";

import { unwrapElement, wrapElements } from "../elementHierarchy";
import type { CanvasDocument, ElementNode } from "../../types";

function node(overrides: Partial<ElementNode> & Pick<ElementNode, "id">): ElementNode {
  return {
    id: overrides.id,
    type: "rect",
    parentId: null,
    children: [],
    name: overrides.id,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    styles: {},
    ...overrides,
  };
}

function docOf(nodes: ElementNode[], rootIds: string[]): CanvasDocument {
  const elements: Record<string, ElementNode> = {};
  for (const n of nodes) elements[n.id] = n;
  return { canvas: { width: 500, height: 500, background: "#fff", rotation: 0 }, rootIds, elements };
}

test("unwrap reparents children to the grandparent and removes the container (G7)", () => {
  const doc = docOf(
    [
      node({ id: "frame", children: ["group"], x: 0, y: 0, width: 300, height: 300 }),
      node({ id: "group", parentId: "frame", children: ["a", "b"], x: 40, y: 40, width: 120, height: 120 }),
      node({ id: "a", parentId: "group", x: 10, y: 10 }),
      node({ id: "b", parentId: "group", x: 60, y: 60 }),
    ],
    ["frame"],
  );
  const { document: out, selectedIds } = unwrapElement(doc, "group");
  expect(out.elements.group).toBeUndefined(); // container removed
  expect(out.elements.a.parentId).toBe("frame");
  expect(out.elements.b.parentId).toBe("frame");
  expect(out.elements.frame.children).toEqual(["a", "b"]); // took the group's slot, in order
  expect(selectedIds).toEqual(["a", "b"]);
});

test("wrap then unwrap round-trips absolute child positions (G7)", () => {
  const doc = docOf(
    [node({ id: "a", x: 50, y: 60, width: 30, height: 30 }), node({ id: "b", x: 120, y: 40, width: 20, height: 20 })],
    ["a", "b"],
  );
  const { document: wrapped, wrapperId } = wrapElements(doc, ["a", "b"]);
  expect(wrapperId).toBeTruthy();
  const { document: out } = unwrapElement(wrapped, wrapperId!);
  // Absolute positions preserved (they were roots at these coords before wrapping).
  expect(out.elements.a).toMatchObject({ parentId: null, x: 50, y: 60 });
  expect(out.elements.b).toMatchObject({ parentId: null, x: 120, y: 40 });
});

test("unwrap an empty container just deletes it (G7)", () => {
  const doc = docOf([node({ id: "empty", x: 10, y: 10 })], ["empty"]);
  const { document: out, selectedIds } = unwrapElement(doc, "empty");
  expect(out.elements.empty).toBeUndefined();
  expect(selectedIds).toEqual([]);
});
