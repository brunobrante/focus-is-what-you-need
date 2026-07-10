import { expect, test } from "bun:test";

import { getElementTransformedCorners } from "@/canvas/engine/geometry";
import { shallowCloneDocument, mutateElementShallow } from "@/canvas/engine/mutations/coreUtils";
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

function docWithChild(): CanvasDocument {
  return createDocument(
    {
      parent: rectNode({ id: "parent", x: 100, y: 50, width: 80, height: 80, children: ["child"] }),
      child: rectNode({ id: "child", parentId: "parent", x: 10, y: 10, width: 20, height: 20 }),
    },
    ["parent"],
  );
}

test("memoizes corners per document: same document returns the identical array", () => {
  const doc = docWithChild();
  const first = getElementTransformedCorners(doc, "child");
  const second = getElementTransformedCorners(doc, "child");
  expect(first).not.toBeNull();
  // Identity, not just equality — the whole point of the cache (P9).
  expect(second).toBe(first);
});

test("a new document recomputes: moving an ANCESTOR moves the child's corners", () => {
  const doc = docWithChild();
  const before = getElementTransformedCorners(doc, "child");
  expect(before?.[0]).toEqual({ x: 110, y: 60 });

  // Shallow clone + touched-node copy, exactly as the engine's mutations do. The
  // child node object is UNCHANGED here — only its ancestor moved — so a cache
  // keyed on the node would go stale. Keying on the document cannot.
  const next = shallowCloneDocument(doc);
  const parent = mutateElementShallow(next, "parent");
  expect(parent).not.toBeNull();
  parent!.x = 200;

  expect(next.elements.child).toBe(doc.elements.child);
  const after = getElementTransformedCorners(next, "child");
  expect(after?.[0]).toEqual({ x: 210, y: 60 });
  // ...and the old document still reports its old geometry.
  expect(getElementTransformedCorners(doc, "child")?.[0]).toEqual({ x: 110, y: 60 });
});

test("rotating an ancestor re-derives the child's corners on the new document", () => {
  const doc = docWithChild();
  getElementTransformedCorners(doc, "child");

  const next = shallowCloneDocument(doc);
  mutateElementShallow(next, "parent")!.rotation = 90;

  const rotated = getElementTransformedCorners(next, "child");
  const plain = getElementTransformedCorners(doc, "child");
  expect(rotated).not.toEqual(plain);
});

test("a missing element caches its null instead of recomputing the walk", () => {
  const doc = docWithChild();
  expect(getElementTransformedCorners(doc, "ghost")).toBeNull();
  expect(getElementTransformedCorners(doc, "ghost")).toBeNull();
});
