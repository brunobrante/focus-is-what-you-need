import { expect, test } from "bun:test";

import { createClipboard } from "../clipboard";
import type { CanvasDocument, ElementNode } from "../types";

function node(overrides: Partial<ElementNode> & Pick<ElementNode, "id">): ElementNode {
  return {
    id: overrides.id,
    type: "rect",
    parentId: null,
    children: [],
    name: overrides.id,
    x: 10,
    y: 10,
    width: 40,
    height: 30,
    rotation: 0,
    styles: {},
    ...overrides,
  };
}

function doc(elements: Record<string, ElementNode>, rootIds: string[]): CanvasDocument {
  return {
    canvas: { width: 400, height: 400, background: "#fff", rotation: 0 },
    rootIds,
    elements,
  };
}

test("paste lands back into the source parent when it still exists (L22)", () => {
  const d = doc(
    {
      frame: node({ id: "frame", children: ["child"], x: 0, y: 0, width: 300, height: 300 }),
      child: node({ id: "child", parentId: "frame", x: 20, y: 20 }),
    },
    ["frame"],
  );
  const clip = createClipboard();
  clip.copy(d, ["child"]);
  const result = clip.paste(d)!;
  expect(result).not.toBeNull();
  expect(result.selectedIds).toHaveLength(1);
  const pasted = result.document.elements[result.selectedIds[0]];
  expect(pasted.parentId).toBe("frame"); // not the root
  // The clone was added to the frame's children, and the root set is unchanged.
  expect(result.document.elements.frame.children).toContain(result.selectedIds[0]);
  expect(result.document.rootIds).toEqual(["frame"]);
});

test("paste falls back to the root when the source parent is absent (cross-document)", () => {
  const source = doc(
    {
      frame: node({ id: "frame", children: ["child"], x: 0, y: 0, width: 300, height: 300 }),
      child: node({ id: "child", parentId: "frame", x: 20, y: 20 }),
    },
    ["frame"],
  );
  const clip = createClipboard();
  clip.copy(source, ["child"]);
  // Paste into a *different* document that has no "frame".
  const target = doc({ other: node({ id: "other" }) }, ["other"]);
  const result = clip.paste(target)!;
  const pasted = result.document.elements[result.selectedIds[0]];
  expect(pasted.parentId).toBeNull();
  expect(result.document.rootIds).toContain(result.selectedIds[0]);
});
