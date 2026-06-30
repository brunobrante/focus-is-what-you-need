import { expect, test } from "bun:test";
import {
  cubicAt,
  flattenPen,
  growPenPath,
  hitTestPen,
  mirrorHandle,
  moveAnchor,
  nearFirstAnchor,
  penBounds,
  penPathFromPolygon,
  pointInPath,
  transformPenPath,
  type PenPath,
} from "../pen";

test("cubicAt hits the endpoints and the symmetric midpoint", () => {
  const p0 = { x: 0, y: 0 };
  const c1 = { x: 0, y: 10 };
  const c2 = { x: 10, y: 10 };
  const p3 = { x: 10, y: 0 };
  expect(cubicAt(p0, c1, c2, p3, 0)).toEqual(p0);
  expect(cubicAt(p0, c1, c2, p3, 1)).toEqual(p3);
  const mid = cubicAt(p0, c1, c2, p3, 0.5);
  expect(mid.x).toBeCloseTo(5, 6);
  expect(mid.y).toBeCloseTo(7.5, 6); // 3/4 of the control height
});

test("mirrorHandle reflects across the anchor", () => {
  expect(mirrorHandle({ x: 10, y: 10 }, { x: 13, y: 14 })).toEqual({ x: 7, y: 6 });
});

test("flattenPen on corner anchors is straight-line sampling", () => {
  // Two corner anchors (no handles) → the segment is the straight line a→b.
  const path: PenPath = { anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false };
  const pts = flattenPen(path, 4);
  expect(pts[0]).toEqual({ x: 0, y: 0 });
  expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  for (const p of pts) expect(p.y).toBeCloseTo(0, 6); // stays on the line
});

test("flattenPen closes the loop when closed", () => {
  const path: PenPath = {
    anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    closed: true,
  };
  const open = flattenPen({ ...path, closed: false }, 8).length;
  const closed = flattenPen(path, 8).length;
  expect(closed).toBe(open + 8); // one extra segment (last → first)
});

test("penBounds covers a curved segment's bulge, not just the anchors", () => {
  // A single curve bulging downward to y≈10 between two anchors on y=0.
  const path: PenPath = {
    anchors: [
      { x: 0, y: 0, out: { x: 0, y: 13.33 } },
      { x: 10, y: 0, in: { x: 10, y: 13.33 } },
    ],
    closed: false,
  };
  const b = penBounds(path, 32)!;
  expect(b.x).toBeCloseTo(0, 4);
  expect(b.w).toBeCloseTo(10, 4);
  expect(b.h).toBeGreaterThan(9); // peak ≈ 10 from the symmetric handles
});

test("hitTestPen prefers a handle over its nearby anchor", () => {
  const path: PenPath = {
    anchors: [{ x: 0, y: 0, out: { x: 3, y: 0 } }, { x: 50, y: 0 }],
    closed: false,
  };
  expect(hitTestPen(path, { x: 3, y: 0 }, 4)).toEqual({ type: "out", index: 0 });
  expect(hitTestPen(path, { x: 50, y: 1 }, 4)).toEqual({ type: "anchor", index: 1 });
  expect(hitTestPen(path, { x: 200, y: 200 }, 4)).toBeNull();
});

test("nearFirstAnchor gates closing on proximity to anchor 0", () => {
  const path: PenPath = {
    anchors: [{ x: 5, y: 5 }, { x: 40, y: 5 }, { x: 40, y: 40 }],
    closed: false,
  };
  expect(nearFirstAnchor(path, { x: 6, y: 6 }, 5)).toBe(true);
  expect(nearFirstAnchor(path, { x: 40, y: 5 }, 5)).toBe(false);
});

test("pointInPath is true inside a closed triangle and false outside", () => {
  const tri: PenPath = {
    anchors: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }],
    closed: true,
  };
  expect(pointInPath(tri, { x: 50, y: 20 })).toBe(true); // interior
  expect(pointInPath(tri, { x: 5, y: 70 })).toBe(false); // outside, below a leg
  expect(pointInPath(tri, { x: 200, y: 200 })).toBe(false); // far away
});

test("pointInPath returns false for an open or degenerate path", () => {
  const open: PenPath = { anchors: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false };
  expect(pointInPath(open, { x: 5, y: 0 })).toBe(false);
});

test("penPathFromPolygon builds a smooth closed path through every vertex", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const path = penPathFromPolygon(square);
  expect(path.closed).toBe(true);
  expect(path.anchors.length).toBe(4);
  // Each anchor sits on its vertex with mirrored (smooth) handles.
  path.anchors.forEach((a, i) => {
    expect(a.x).toBe(square[i].x);
    expect(a.y).toBe(square[i].y);
    expect(a.in!.x + a.out!.x).toBeCloseTo(2 * a.x, 6);
    expect(a.in!.y + a.out!.y).toBeCloseTo(2 * a.y, 6);
  });
  // Anchor 0 (0,0): prev=(0,10), next=(10,0) → tangent ((10-0)/6, (0-10)/6).
  expect(path.anchors[0].out).toEqual({ x: 10 / 6, y: -10 / 6 });
});

test("penPathFromPolygon falls back to corner anchors below 3 points", () => {
  const path = penPathFromPolygon([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  expect(path.anchors).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
});

test("transformPenPath maps anchors and handles, preserving closed", () => {
  const path: PenPath = {
    anchors: [{ x: 10, y: 10, in: { x: 8, y: 10 }, out: { x: 12, y: 10 } }, { x: 20, y: 20 }],
    closed: true,
  };
  const scaled = transformPenPath(path, (p) => ({ x: p.x * 2, y: p.y * 2 }));
  expect(scaled.closed).toBe(true);
  expect(scaled.anchors[0]).toEqual({ x: 20, y: 20, in: { x: 16, y: 20 }, out: { x: 24, y: 20 } });
  expect(scaled.anchors[1]).toEqual({ x: 40, y: 40, in: undefined, out: undefined });
});

test("growPenPath pushes every anchor outward from the centroid by `distance`", () => {
  // Diamond centred at the origin; each anchor is 10 from the centre.
  const path: PenPath = {
    anchors: [{ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }, { x: 0, y: -10 }],
    closed: true,
  };
  const grown = growPenPath(path, 5);
  // Each anchor moves 5 further out along its radial → magnitude 15.
  expect(grown.anchors[0]).toEqual({ x: 15, y: 0, in: undefined, out: undefined });
  expect(grown.anchors[1]).toEqual({ x: 0, y: 15, in: undefined, out: undefined });
  expect(grown.anchors[2]).toEqual({ x: -15, y: 0, in: undefined, out: undefined });
  expect(grown.anchors[3]).toEqual({ x: 0, y: -15, in: undefined, out: undefined });
});

test("growPenPath carries handles along with their anchor", () => {
  // Symmetric diamond (centroid at origin); anchor 0 on the +x radial.
  const path: PenPath = {
    anchors: [
      { x: 10, y: 0, in: { x: 10, y: -2 }, out: { x: 10, y: 2 } },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ],
    closed: true,
  };
  const grown = growPenPath(path, 3); // anchor 0 moves +3 in x; handles too
  expect(grown.anchors[0].x).toBeCloseTo(13, 6);
  expect(grown.anchors[0].in).toEqual({ x: 13, y: -2 });
  expect(grown.anchors[0].out).toEqual({ x: 13, y: 2 });
});

test("moveAnchor translates the anchor and both handles together", () => {
  const moved = moveAnchor({ x: 10, y: 10, in: { x: 8, y: 10 }, out: { x: 12, y: 10 } }, 5, -3);
  expect(moved).toEqual({ x: 15, y: 7, in: { x: 13, y: 7 }, out: { x: 17, y: 7 } });
});
