import { expect, test } from "bun:test";
import { snapAspect } from "../aspectSnap";

test("snaps a 1px-off square to a true square (grows the short side)", () => {
  const r = snapAspect(547, 546);
  expect(r).not.toBeNull();
  expect(r!.w).toBe(547);
  expect(r!.h).toBe(547);
  expect(r!.ratio).toEqual([1, 1]);
});

test("snaps a near-square in portrait orientation too", () => {
  const r = snapAspect(546, 547);
  expect(r).not.toBeNull();
  expect(r!.w).toBe(547);
  expect(r!.h).toBe(547);
});

test("returns null when already exactly square", () => {
  expect(snapAspect(500, 500)).toBeNull();
});

test("snaps a near 16:9 card onto exact 16:9", () => {
  // 1600 wide at exact 16:9 wants 900 tall; 904 is within tolerance.
  const r = snapAspect(1600, 904);
  expect(r).not.toBeNull();
  expect(r!.w).toBe(1600);
  expect(r!.h).toBeCloseTo(900, 5);
  expect(r!.ratio).toEqual([16, 9]);
});

test("leaves a genuinely off-ratio crop alone", () => {
  // 1.09:1 is not near any clean ratio in the table.
  expect(snapAspect(547, 500)).toBeNull();
});

test("small boxes still snap on the absolute-pixel floor", () => {
  const r = snapAspect(48, 47);
  expect(r).not.toBeNull();
  expect(r!.h).toBe(48);
});

test("does not snap a large square that is off by more than tolerance", () => {
  // 1000×980 is a 2% deviation — beyond max(2px, 0.8%·1000 = 8px) on the short side.
  expect(snapAspect(1000, 980)).toBeNull();
});

test("rejects degenerate sizes", () => {
  expect(snapAspect(0, 100)).toBeNull();
  expect(snapAspect(100, -5)).toBeNull();
});
