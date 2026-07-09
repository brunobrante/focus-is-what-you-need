import { expect, test } from "bun:test";
import { getRectDistanceSegments } from "@/canvas/engine/geometry/bounds";

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

test("disjoint horizontally yields one gap segment through the shared band", () => {
  const segments = getRectDistanceSegments(rect(100, 0, 50, 100), rect(0, 20, 40, 100));
  expect(segments).toHaveLength(1);
  expect(segments[0].orientation).toBe("horizontal");
  expect(segments[0].value).toBe(60); // 100 - (0+40)
  expect(segments[0].from.y).toBe(60); // middle of the 20..100 overlap band
});

test("diagonal separation yields both a horizontal and a vertical segment", () => {
  const segments = getRectDistanceSegments(rect(200, 200, 50, 50), rect(0, 0, 50, 50));
  expect(segments).toHaveLength(2);
  const horizontal = segments.find((s) => s.orientation === "horizontal");
  const vertical = segments.find((s) => s.orientation === "vertical");
  expect(horizontal?.value).toBe(150);
  expect(vertical?.value).toBe(150);
});

test("containment yields the four inset distances", () => {
  const segments = getRectDistanceSegments(rect(10, 20, 50, 30), rect(0, 0, 200, 100));
  expect(segments).toHaveLength(4);
  const values = segments.map((s) => s.value).sort((a, b) => a - b);
  expect(values).toEqual([10, 20, 50, 140]); // left 10, top 20, bottom 100-50=50, right 200-60=140
});

test("overlapping rects yield no segments", () => {
  const segments = getRectDistanceSegments(rect(0, 0, 100, 100), rect(50, 50, 100, 100));
  expect(segments).toHaveLength(0);
});
