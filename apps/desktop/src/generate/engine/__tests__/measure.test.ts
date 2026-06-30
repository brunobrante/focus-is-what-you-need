import { expect, test } from "bun:test";
import { computeEdgeMargins, computeSpacing } from "../measure";

test("computeSpacing measures the horizontal gap between two side-by-side boxes", () => {
  const a = { x: 0, y: 0, w: 100, h: 60 };
  const b = { x: 140, y: 10, w: 100, h: 60 };
  const gaps = computeSpacing([a, b]);
  expect(gaps.length).toBe(1);
  const g = gaps[0];
  expect(g.axis).toBe("x");
  expect(g.distance).toBe(40); // 140 - (0 + 100)
  expect(g.ax).toBe(100);
  expect(g.bx).toBe(140);
  // Drawn at the centre of the shared vertical band (10..60) → y = 35.
  expect(g.ay).toBe(35);
  expect(g.by).toBe(35);
});

test("computeSpacing picks the vertical axis for stacked boxes", () => {
  const a = { x: 0, y: 0, w: 80, h: 40 };
  const b = { x: 5, y: 70, w: 80, h: 40 };
  const gaps = computeSpacing([a, b]);
  expect(gaps.length).toBe(1);
  expect(gaps[0].axis).toBe("y");
  expect(gaps[0].distance).toBe(30); // 70 - (0 + 40)
});

test("computeSpacing sorts and yields a gap per adjacent pair", () => {
  const boxes = [
    { x: 300, y: 0, w: 50, h: 50 },
    { x: 0, y: 0, w: 50, h: 50 },
    { x: 150, y: 0, w: 50, h: 50 },
  ];
  const gaps = computeSpacing(boxes);
  expect(gaps.map((g) => g.distance)).toEqual([100, 100]); // 50→150, 200→300
});

test("computeEdgeMargins measures the four paddings to the crop frame", () => {
  // One object inset inside a 200×100 crop with asymmetric margins.
  const crop = { x: 0, y: 0, w: 200, h: 100 };
  const obj = { x: 20, y: 15, w: 100, h: 60 }; // L20 R80 T15 B25
  const margins = computeEdgeMargins([obj], crop);
  const byDist = margins.map((m) => Math.round(m.distance)).sort((a, b) => a - b);
  expect(byDist).toEqual([15, 20, 25, 80]);
  // Left margin runs from the crop's left edge to the object's left edge.
  const left = margins.find((m) => m.axis === "x" && m.ax === 0)!;
  expect(left.bx).toBe(20);
  expect(left.distance).toBe(20);
});

test("computeEdgeMargins skips a side flush with the crop edge", () => {
  const crop = { x: 0, y: 0, w: 100, h: 100 };
  const obj = { x: 0, y: 10, w: 100, h: 80 }; // flush left+right → only top/bottom
  const margins = computeEdgeMargins([obj], crop);
  expect(margins.every((m) => m.axis === "y")).toBe(true);
  expect(margins.map((m) => m.distance).sort((a, b) => a - b)).toEqual([10, 10]);
});

test("computeSpacing ignores overlapping boxes (no positive gap) and short lists", () => {
  expect(computeSpacing([{ x: 0, y: 0, w: 10, h: 10 }])).toEqual([]);
  const overlapping = [
    { x: 0, y: 0, w: 60, h: 20 },
    { x: 40, y: 0, w: 60, h: 20 },
  ];
  expect(computeSpacing(overlapping)).toEqual([]);
});
