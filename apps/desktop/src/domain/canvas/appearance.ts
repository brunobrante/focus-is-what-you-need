// Pure compilation of an element's Appearance styles (corner radius, blend mode,
// group isolation) into CSS fragments. Zero I/O, zero React — given the styles
// and the element's render shape it returns the inline-style longhands the
// renderer spreads onto the element. The type-awareness lives here so both
// `nodeStyle` and `detachedNodeStyle` stay thin (mirrors effects/typography).
//
// Radius is the type-aware case (see docs/inspector-appearance.md):
//   • box (rect/image/div) → CSS `border-radius` (uniform) or the four
//     `border-*-radius` longhands (per-corner)
//   • ellipse              → already round, forced to "50%"
//   • clip-path shapes (star/polygon/arrow) → radius is path geometry, NOT CSS,
//     so it is suppressed here (the star's inner-radius is applied via clipPath)
//
// Opacity is intentionally NOT compiled here: the live main-stage render keeps a
// text element fully opaque while it is being edited, a per-call concern the
// renderer owns. Everything else (blend, isolation, radius) is unconditional.

import type { CSSProperties } from "react";
import type { BlendMode, ElementStyles } from "./types";

/** All `mix-blend-mode` values offered in the panel, paired with a friendly label.
 *  Order follows the Figma/paper grouping (separative → multiplicative → …). */
export const BLEND_MODES: ReadonlyArray<{ value: BlendMode; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "darken", label: "Darken" },
  { value: "multiply", label: "Multiply" },
  { value: "color-burn", label: "Color burn" },
  { value: "lighten", label: "Lighten" },
  { value: "screen", label: "Screen" },
  { value: "color-dodge", label: "Color dodge" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft light" },
  { value: "hard-light", label: "Hard light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Saturation" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosity" },
  { value: "plus-lighter", label: "Plus lighter" },
];

const BLEND_LABEL_BY_VALUE = new Map(BLEND_MODES.map((m) => [m.value, m.label]));
const BLEND_VALUE_BY_LABEL = new Map(BLEND_MODES.map((m) => [m.label, m.value]));

export function blendLabel(value: BlendMode | undefined): string {
  return BLEND_LABEL_BY_VALUE.get(value ?? "normal") ?? "Normal";
}

export function blendValueFromLabel(label: string): BlendMode {
  return BLEND_VALUE_BY_LABEL.get(label) ?? "normal";
}

function scaled(value: number, renderScale: number): number {
  return value * renderScale;
}

/** The render shape the radius compilation needs, derived by the renderer from
 *  the element type (it already computes the clip-path and ellipse cases). */
export type AppearanceShape = {
  isEllipse: boolean;
  /** True when the element renders through a CSS clip-path (star/polygon/arrow). */
  hasClipPath: boolean;
};

/**
 * Compile the Appearance styles into inline-style longhands. Returns only the
 * keys that are set so spreading never clobbers a base value.
 */
export function compileAppearance(
  styles: ElementStyles,
  shape: AppearanceShape,
  renderScale = 1,
): CSSProperties {
  const out: CSSProperties = {};

  // Blend mode — "normal" is the CSS default, so emit nothing for it.
  if (styles.blendMode && styles.blendMode !== "normal") {
    out.mixBlendMode = styles.blendMode;
  }

  // Group blending — "isolate" makes the box an isolated stacking context so
  // children's blends composite only among siblings (the "Normal" group option).
  if (styles.isolation === "isolate") {
    out.isolation = "isolate";
  }

  // ── Corner radius (type-aware) ──────────────────────────────────────────
  if (shape.isEllipse) {
    out.borderRadius = "50%";
    return out;
  }
  if (shape.hasClipPath) {
    // Radius is path geometry for these shapes (applied via clip-path), not CSS.
    return out;
  }

  const corners = styles.cornerRadii;
  if (corners && corners.some((c) => typeof c === "number")) {
    // Per-corner mode: any unset corner falls back to the uniform value.
    const uniform = styles.borderRadius ?? 0;
    const px = (c: number | undefined) => scaled(typeof c === "number" ? c : uniform, renderScale);
    out.borderTopLeftRadius = px(corners[0]);
    out.borderTopRightRadius = px(corners[1]);
    out.borderBottomRightRadius = px(corners[2]);
    out.borderBottomLeftRadius = px(corners[3]);
    return out;
  }

  if (typeof styles.borderRadius === "number") {
    out.borderRadius = scaled(styles.borderRadius, renderScale);
  }
  return out;
}
