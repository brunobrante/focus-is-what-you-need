import { expect, test } from "bun:test";
import {
  cubicAt,
  flattenPen,
  hitTestPen,
  mirrorHandle,
  moveAnchor,
  nearFirstAnchor,
  penBounds,
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

test("moveAnchor translates the anchor and both handles together", () => {
  const moved = moveAnchor({ x: 10, y: 10, in: { x: 8, y: 10 }, out: { x: 12, y: 10 } }, 5, -3);
  expect(moved).toEqual({ x: 15, y: 7, in: { x: 13, y: 7 }, out: { x: 17, y: 7 } });
});
