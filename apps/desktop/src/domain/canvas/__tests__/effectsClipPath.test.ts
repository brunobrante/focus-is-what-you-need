import { expect, test } from "bun:test";

import { compileEffects, effectTargetForType } from "../effects";
import type { Effect } from "../types";

const dropShadow: Effect = { type: "drop-shadow", x: 0, y: 4, blur: 8, spread: 0, color: "#000000" } as Effect;

test("clip-path shapes use the vector (drop-shadow) effect target (F2)", () => {
  for (const type of ["polygon", "star", "arrow"]) {
    expect(effectTargetForType(type)).toBe("vector");
  }
  // Boxes still use box-shadow.
  expect(effectTargetForType("rect")).toBe("box");
});

test("a shadow on a clip-path shape compiles to filter: drop-shadow, not box-shadow (F2)", () => {
  const box = compileEffects([dropShadow], effectTargetForType("rect"));
  expect(box.boxShadow).toBeTruthy();
  expect(box.filter ?? "").not.toContain("drop-shadow");

  const star = compileEffects([dropShadow], effectTargetForType("star"));
  expect(star.boxShadow).toBeUndefined();
  expect(star.filter ?? "").toContain("drop-shadow");
});
