import { expect, test } from "bun:test";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";
import {
  bringElementsToFront,
  reorderElements,
  sendElementsToBack,
} from "@/canvas/engine/mutations/elementOrder";

function el(id: string, parentId: string | null = null, children: string[] = []): ElementNode {
  return {
    id,
    type: "rect",
    parentId,
    children,
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    styles: {},
  } as ElementNode;
}

// Root order a, b, c, d, e.
function doc(): CanvasDocument {
  const ids = ["a", "b", "c", "d", "e"];
  return {
    canvas: { width: 400, height: 300, background: "#fff", rotation: 0 },
    rootIds: [...ids],
    elements: Object.fromEntries(ids.map((id) => [id, el(id)])),
  };
}

test("bring multiple to front preserves the selection's relative order", () => {
  const next = bringElementsToFront(doc(), ["b", "d"]);
  expect(next.rootIds).toEqual(["a", "c", "e", "b", "d"]);
});

test("send multiple to back preserves the selection's relative order", () => {
  const next = sendElementsToBack(doc(), ["b", "d"]);
  expect(next.rootIds).toEqual(["b", "d", "a", "c", "e"]);
});

test("forward moves each selected one slot without leapfrogging the block", () => {
  const next = reorderElements(doc(), ["a", "b"], "forward");
  expect(next.rootIds).toEqual(["c", "a", "b", "d", "e"]);
});

test("backward at the start is a no-op that returns the same document", () => {
  const document = doc();
  const next = reorderElements(document, ["a", "b"], "backward");
  expect(next).toBe(document);
});

test("a selection spanning parents reorders within each sibling list", () => {
  const document = doc();
  document.elements.p = el("p", null, ["x", "y", "z"]);
  document.rootIds.push("p");
  for (const id of ["x", "y", "z"]) document.elements[id] = el(id, "p");

  const next = bringElementsToFront(document, ["a", "x"]);
  expect(next.rootIds).toEqual(["b", "c", "d", "e", "p", "a"]);
  expect(next.elements.p.children).toEqual(["y", "z", "x"]);
});
