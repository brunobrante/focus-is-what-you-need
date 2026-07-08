import { expect, test } from "bun:test";

import { canvasToPathSpace, pathSpaceToCanvas, canvasDeltaToPathSpace } from "../vectorGeometry";
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
    width: 100,
    height: 100,
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

test("canvas↔path round-trips for a plain root path (matches the legacy offset math)", () => {
  const d = doc(
    { p: node({ id: "p", type: "path", x: 30, y: 40, width: 80, height: 60, viewBox: { width: 40, height: 30 } }) },
    ["p"],
  );
  const pathNode = d.elements.p;
  const sp = canvasToPathSpace(d, pathNode, 30 + 20, 40 + 30); // canvas → path
  // scale sx=80/40=2, sy=60/30=2 → (20/2, 30/2) = (10, 15)
  expect(sp.x).toBeCloseTo(10, 6);
  expect(sp.y).toBeCloseTo(15, 6);
  const back = pathSpaceToCanvas(d, pathNode, sp.x, sp.y);
  expect(back.px).toBeCloseTo(50, 6);
  expect(back.py).toBeCloseTo(70, 6);
});

test("path→canvas→path round-trips for a rotated path nested under a rotated parent (M2)", () => {
  const d = doc(
    {
      parent: node({ id: "parent", children: ["p"], x: 60, y: 50, width: 200, height: 200, rotation: 30, styles: { borderWidth: 5 } }),
      p: node({ id: "p", type: "path", parentId: "parent", x: 20, y: 25, width: 80, height: 40, rotation: 22, viewBox: { width: 40, height: 20 } }),
    },
    ["parent"],
  );
  const pathNode = d.elements.p;
  for (const [x, y] of [[0, 0], [40, 20], [13, 7]]) {
    const canvas = pathSpaceToCanvas(d, pathNode, x, y);
    const round = canvasToPathSpace(d, pathNode, canvas.px, canvas.py);
    expect(round.x).toBeCloseTo(x, 4);
    expect(round.y).toBeCloseTo(y, 4);
  }
});

test("delta mapping un-rotates by the effective rotation before scaling", () => {
  // Path rotated 90°, scale 1: a canvas +x delta becomes a path −y delta.
  const d = doc(
    { p: node({ id: "p", type: "path", x: 0, y: 0, width: 40, height: 40, rotation: 90, viewBox: { width: 40, height: 40 } }) },
    ["p"],
  );
  const rel = canvasDeltaToPathSpace(d, d.elements.p, 10, 0);
  expect(rel.x).toBeCloseTo(0, 4);
  expect(rel.y).toBeCloseTo(-10, 4);
});
