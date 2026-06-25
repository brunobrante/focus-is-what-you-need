import { expect, test } from "bun:test";
import type { ElementStyles } from "../types";
import { BLEND_MODES, blendLabel, blendValueFromLabel, compileAppearance } from "../appearance";

const box = { isEllipse: false, hasClipPath: false };

// ── blend mode ────────────────────────────────────────────────────────────────

test("blend mode compiles to mix-blend-mode, omitting the 'normal' default", () => {
  expect(compileAppearance({ blendMode: "multiply" }, box).mixBlendMode).toBe("multiply");
  expect(compileAppearance({ blendMode: "normal" }, box).mixBlendMode).toBeUndefined();
  expect(compileAppearance({}, box).mixBlendMode).toBeUndefined();
});

test("plus-darker is not an offered blend mode; plus-lighter is", () => {
  const values = BLEND_MODES.map((m) => m.value);
  expect(values).toContain("plus-lighter");
  expect(values).not.toContain("plus-darker");
});

test("blend label/value round-trip", () => {
  expect(blendLabel("color-burn")).toBe("Color burn");
  expect(blendLabel(undefined)).toBe("Normal");
  expect(blendValueFromLabel("Color burn")).toBe("color-burn");
  expect(blendValueFromLabel("nonsense")).toBe("normal");
});

// ── group isolation ─────────────────────────────────────────────────────────

test("isolation: isolate models the 'Normal' group blending option", () => {
  expect(compileAppearance({ isolation: "isolate" }, box).isolation).toBe("isolate");
  expect(compileAppearance({}, box).isolation).toBeUndefined();
});

// ── corner radius (type-aware) ──────────────────────────────────────────────

test("uniform radius compiles to border-radius and scales", () => {
  expect(compileAppearance({ borderRadius: 8 }, box).borderRadius).toBe(8);
  expect(compileAppearance({ borderRadius: 8 }, box, 2).borderRadius).toBe(16);
});

test("ellipse is forced round regardless of borderRadius", () => {
  const out = compileAppearance({ borderRadius: 4 }, { isEllipse: true, hasClipPath: false });
  expect(out.borderRadius).toBe("50%");
});

test("clip-path shapes suppress CSS radius (it is path geometry)", () => {
  const out = compileAppearance({ borderRadius: 30 }, { isEllipse: false, hasClipPath: true });
  expect(out.borderRadius).toBeUndefined();
  expect(out.borderTopLeftRadius).toBeUndefined();
});

test("per-corner radii compile to the four longhands, unset corners fall back to uniform", () => {
  const styles: ElementStyles = { borderRadius: 5, cornerRadii: [10, 20, 30, 40] };
  const out = compileAppearance(styles, box);
  expect(out.borderTopLeftRadius).toBe(10);
  expect(out.borderTopRightRadius).toBe(20);
  expect(out.borderBottomRightRadius).toBe(30);
  expect(out.borderBottomLeftRadius).toBe(40);
  expect(out.borderRadius).toBeUndefined();
});

test("per-corner radii scale with renderScale", () => {
  const out = compileAppearance({ cornerRadii: [4, 4, 4, 4] }, box, 1.5);
  expect(out.borderTopLeftRadius).toBe(6);
});
