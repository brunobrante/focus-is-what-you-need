import { expect, test } from "bun:test";

import { resizeBoxFromHandle } from "../transforms";
import type { Rect } from "../../types";

const BOX: Rect = { x: 100, y: 100, width: 80, height: 40 };
const NO_MODS = { shiftKey: false, altKey: false };

test("east drag grows to the right, anchoring the left edge (unchanged)", () => {
  const out = resizeBoxFromHandle(BOX, { x: 180, y: 120 }, { x: 200, y: 120 }, "e", NO_MODS);
  expect(out).toMatchObject({ x: 100, y: 100, width: 100, height: 40 });
});

test("west drag grows to the left, anchoring the right edge (unchanged)", () => {
  const out = resizeBoxFromHandle(BOX, { x: 100, y: 120 }, { x: 80, y: 120 }, "w", NO_MODS);
  // right edge stays at 180; width 100 → x = 80
  expect(out).toMatchObject({ x: 80, width: 100, height: 40 });
});

test("east drag past the left edge flips the box to the left of the anchor (F1)", () => {
  // Drag the E handle 120px left of its start (right edge 180 → 60), crossing the
  // left anchor at x=100. The box mirrors: right edge pinned at the anchor (100),
  // width = |80 - 120| = 40, so x = 60.
  const out = resizeBoxFromHandle(BOX, { x: 180, y: 120 }, { x: 60, y: 120 }, "e", NO_MODS);
  expect(out.width).toBeCloseTo(40);
  expect(out.x + out.width).toBeCloseTo(100); // right edge sits on the left anchor
});

test("south-east corner flip mirrors on both axes (F1)", () => {
  // Drag SE corner far past the NW anchor (100,100).
  const out = resizeBoxFromHandle(BOX, { x: 180, y: 140 }, { x: 40, y: 40 }, "se", NO_MODS);
  // NW anchor stays fixed; box is now up-left of it.
  expect(out.x + out.width).toBeCloseTo(100);
  expect(out.y + out.height).toBeCloseTo(100);
});

test("alt (from center) mirrors symmetrically when crossing the center (F1)", () => {
  const out = resizeBoxFromHandle(BOX, { x: 180, y: 120 }, { x: 100, y: 120 }, "e", { shiftKey: false, altKey: true });
  // Stays centered on the box center (140,120) whatever the sign.
  expect(out.x + out.width / 2).toBeCloseTo(140);
  expect(out.y + out.height / 2).toBeCloseTo(120);
});
