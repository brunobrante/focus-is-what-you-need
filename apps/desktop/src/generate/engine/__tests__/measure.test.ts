import { expect, test } from "bun:test";
import { computeSpacing } from "../measure";

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

test("computeSpacing ignores overlapping boxes (no positive gap) and short lists", () => {
  expect(computeSpacing([{ x: 0, y: 0, w: 10, h: 10 }])).toEqual([]);
  const overlapping = [
    { x: 0, y: 0, w: 60, h: 20 },
    { x: 40, y: 0, w: 60, h: 20 },
  ];
  expect(computeSpacing(overlapping)).toEqual([]);
});
