import { expect, test } from "bun:test";

import { getParentDistanceMeasurements } from "@/canvas/engine/geometry";
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
    canvas: {
      width: 300,
      height: 200,
      background: "#ffffff",
      rotation: 0,
    },
    rootIds,
    elements,
  };
}

test("measures a top-level element against the canvas frame", () => {
  const document = createDocument(
    {
      child: rectNode({
        id: "child",
        x: 10,
        y: 20,
        width: 50,
        height: 40,
      }),
    },
    ["child"],
  );

  expect(getParentDistanceMeasurements(document, "child")).toEqual({
    parentRect: { x: 0, y: 0, width: 300, height: 200 },
    childRect: { x: 10, y: 20, width: 50, height: 40 },
    distances: {
      top: 20,
      right: 240,
      bottom: 140,
      left: 10,
    },
  });
});

test("measures a nested child against its immediate parent content bounds", () => {
  const document = createDocument(
    {
      parent: rectNode({
        id: "parent",
        children: ["child"],
        x: 50,
        y: 40,
        width: 120,
        height: 90,
        styles: { borderWidth: 4 },
      }),
      child: rectNode({
        id: "child",
        parentId: "parent",
        x: 10,
        y: 12,
        width: 30,
        height: 20,
      }),
    },
    ["parent"],
  );

  expect(getParentDistanceMeasurements(document, "child")).toEqual({
    parentRect: { x: 54, y: 44, width: 112, height: 82 },
    childRect: { x: 64, y: 56, width: 30, height: 20 },
    distances: {
      top: 12,
      right: 72,
      bottom: 50,
      left: 10,
    },
  });
});

test("uses the immediate parent instead of an ancestor", () => {
  const document = createDocument(
    {
      ancestor: rectNode({
        id: "ancestor",
        children: ["parent"],
        x: 20,
        y: 20,
        width: 220,
        height: 160,
      }),
      parent: rectNode({
        id: "parent",
        parentId: "ancestor",
        children: ["child"],
        x: 30,
        y: 25,
        width: 100,
        height: 80,
      }),
      child: rectNode({
        id: "child",
        parentId: "parent",
        x: 7,
        y: 9,
        width: 20,
        height: 18,
      }),
    },
    ["ancestor"],
  );

  const measurements = getParentDistanceMeasurements(document, "child");

  expect(measurements?.parentRect).toEqual({ x: 50, y: 45, width: 100, height: 80 });
  expect(measurements?.distances).toEqual({
    top: 9,
    right: 73,
    bottom: 53,
    left: 7,
  });
});

test("clamps displayed distances to non-negative values outside parent bounds", () => {
  const document = createDocument(
    {
      parent: rectNode({
        id: "parent",
        children: ["child"],
        x: 50,
        y: 40,
        width: 80,
        height: 60,
      }),
      child: rectNode({
        id: "child",
        parentId: "parent",
        x: -10,
        y: -8,
        width: 100,
        height: 80,
      }),
    },
    ["parent"],
  );

  expect(getParentDistanceMeasurements(document, "child")?.distances).toEqual({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
});
