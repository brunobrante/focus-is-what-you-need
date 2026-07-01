import { expect, test } from "bun:test";
import { snapAspect } from "../aspectSnap";

test("snaps a 1px-off square to a true square (grows the short side)", () => {
  expect(snapAspect(547, 546)).toEqual({ w: 547, h: 547 });
  expect(snapAspect(546, 547)).toEqual({ w: 547, h: 547 });
});

test("returns null when already exactly square", () => {
  expect(snapAspect(500, 500)).toBeNull();
});

test("small boxes still snap on the absolute-pixel floor", () => {
  expect(snapAspect(48, 47)).toEqual({ w: 48, h: 48 });
});

test("leaves a genuinely non-square crop alone", () => {
  expect(snapAspect(547, 500)).toBeNull(); // ~9% off
  expect(snapAspect(400, 300)).toBeNull(); // 4:3
});

test("a large box off by more than the relative tolerance is left alone", () => {
  // 1000×980 → gap 20 > max(2, 1%·1000 = 10).
  expect(snapAspect(1000, 980)).toBeNull();
});

test("rejects degenerate sizes", () => {
  expect(snapAspect(0, 100)).toBeNull();
  expect(snapAspect(100, -5)).toBeNull();
});
