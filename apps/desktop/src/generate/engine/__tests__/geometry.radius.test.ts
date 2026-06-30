import { expect, test } from "bun:test";
import type { CropBox, RadiusHandle } from "../types";
import { maxCropRadius, roundCropBox } from "../geometry";

type RadiusInteraction = {
  handle: RadiusHandle;
  startPoint: { x: number; y: number };
  startBox: CropBox;
  committedCorner?: RadiusHandle;
};

function interaction(
  handle: RadiusHandle,
  startBox: CropBox,
  startPoint: { x: number; y: number },
): RadiusInteraction {
  return { handle, startBox, startPoint };
}

// A wide box: its short edges are vertical, so the nw/sw handles stack at the max.
const wide: CropBox = { x: 0, y: 0, w: 200, h: 100 };

test("radius tracks the cursor's projected distance from the grabbed corner", () => {
  const ix = interaction("nw", wide, { x: 0, y: 0 });
  // Drag the cursor 30 in, 30 down from the nw corner → projected offset 30.
  const next = roundCropBox(ix, { x: 30, y: 30 });
  expect(next.r).toBeCloseTo(30, 5);
  expect(ix.committedCorner).toBe("nw");
});

test("perpendicular drift along the 45° rail does not change the radius", () => {
  const ix = interaction("nw", wide, { x: 0, y: 0 });
  // Both points project to the same rail offset (x+y stays 60).
  const a = roundCropBox(ix, { x: 30, y: 30 });
  const b = roundCropBox(ix, { x: 50, y: 10 });
  expect(b.r).toBeCloseTo(a.r, 5);
});

test("radius clamps to half the shorter side", () => {
  const ix = interaction("nw", wide, { x: 0, y: 0 });
  const next = roundCropBox(ix, { x: 999, y: 999 });
  expect(next.r).toBe(maxCropRadius(wide)); // 50
});

test("an unstacked grab commits immediately to the reported corner", () => {
  const ix = interaction("se", { ...wide, r: 0 }, { x: 200, y: 100 });
  roundCropBox(ix, { x: 180, y: 80 });
  expect(ix.committedCorner).toBe("se");
});

test("a stacked (maxed) handle commits to the corner the drag heads toward", () => {
  const maxed: CropBox = { ...wide, r: maxCropRadius(wide) }; // r = 50, nw/sw stacked
  // Grab the stacked pair (reported as nw); drag toward the sw corner (downward).
  const ix = interaction("nw", maxed, { x: 50, y: 50 });
  const next = roundCropBox(ix, { x: 50, y: 80 });
  expect(ix.committedCorner).toBe("sw");
  // The sw offset shrinks as the cursor leaves that corner, so the radius drops.
  expect(next.r).toBeLessThan(maxCropRadius(wide));
});

test("on a square, a stacked grab commits to any of the four corners", () => {
  // A perfect square maxes all four radius handles onto the centre, so the grab
  // (reported as nw) must be able to commit to a corner off its short-edge pair.
  const square: CropBox = { x: 0, y: 0, w: 100, h: 100, r: maxCropRadius({ x: 0, y: 0, w: 100, h: 100 }) };
  const ix = interaction("nw", square, { x: 50, y: 50 });
  // Drag toward the ne corner (right + up) — not the nw/sw pair the old math allowed.
  const next = roundCropBox(ix, { x: 80, y: 20 });
  expect(ix.committedCorner).toBe("ne");
  expect(next.r).toBeLessThan(maxCropRadius(square)); // 20 < 50
});

test("once committed, the opposite corner cannot drive the radius", () => {
  const maxed: CropBox = { ...wide, r: maxCropRadius(wide) };
  const ix = interaction("nw", maxed, { x: 50, y: 50 });
  // Commit toward sw...
  roundCropBox(ix, { x: 50, y: 80 });
  expect(ix.committedCorner).toBe("sw");
  // ...then drag back across the lock toward nw: it returns to the max but the
  // committed corner stays sw (it never flips to nw).
  const back = roundCropBox(ix, { x: 50, y: 20 });
  expect(ix.committedCorner).toBe("sw");
  expect(back.r).toBe(maxCropRadius(wide));
});
