// Pure compilation of an element's typography styles into CSS fragments. Zero
// I/O, zero React — given the styles it returns the inline-style longhands the
// renderer drops onto a text element. The "non-obvious conversions" the design
// tools get right live here so the renderer stays thin (see paper.design's
// CSS-honest model and docs/inspector-typography.md):
//
//   • italic         → `font-style`
//   • letterSpacing% → `letter-spacing` in `em` (5% → 0.05em — survives a
//                      font-size change, unlike a precomputed px value)
//   • lineHeight     → unitless `line-height` (inherits as a raw ratio); absent
//                      means "Auto" = `line-height: normal` (font-metric ratio)
//   • verticalAlign  → a flex column on the text box (`vertical-align` only moves
//                      inline/table-cell boxes, so it can't do this)
//   • case           → `text-transform`
//   • strike         → `text-decoration-line` (combined with the Border panel's
//                      `underline` so the two decorations coexist)
//   • textBoxTrim    → tight cap-height/baseline bounds (Safari 18.2+; silently
//                      no-ops on older WKWebView, which is acceptable here)
//
// Only text elements carry these fields, so for every other type the result is
// an empty object — safe to spread unconditionally in the renderer.

import type { CSSProperties } from "react";
import type { TextRunStyles } from "./textRuns";
import type { ElementStyles } from "./types";

/** Whether an element type renders typography (mirrors the text render branch). */
export function isTypographyType(type: string): boolean {
  return type === "text";
}

/**
 * The inline style of one styled run (G10). Only the run's own overrides are
 * emitted — everything else inherits from the text element's box, which is what
 * makes a run a pure overlay. `line-through` is additive: an element-level
 * underline still paints through the span.
 */
export function compileRunStyles(run: TextRunStyles): CSSProperties {
  const out: CSSProperties = {};
  if (run.fontFamily) out.fontFamily = run.fontFamily;
  if (run.fontWeight) out.fontWeight = run.fontWeight;
  if (run.fontStyle) out.fontStyle = run.fontStyle;
  if (run.color) out.color = run.color;
  if (typeof run.letterSpacing === "number" && run.letterSpacing !== 0) {
    out.letterSpacing = `${run.letterSpacing / 100}em`;
  }
  if (run.lineThrough) out.textDecorationLine = "line-through";
  return out;
}

/**
 * Compile the typography styles into inline-style longhands. Returns only the
 * keys that are actually set, so spreading it never clobbers a value the base
 * style computed (e.g. it leaves `display` alone unless vertical-align needs it).
 */
export function compileTypography(styles: ElementStyles): CSSProperties {
  const out: CSSProperties = {};

  if (styles.fontStyle) out.fontStyle = styles.fontStyle;

  // Unitless line-height (recomputed per child); absent = Auto (`normal`).
  if (typeof styles.lineHeight === "number" && Number.isFinite(styles.lineHeight)) {
    out.lineHeight = styles.lineHeight;
  }

  // Percent → em so it tracks font-size (Figma's 1% = 0.01em). 0 = normal.
  if (typeof styles.letterSpacing === "number" && styles.letterSpacing !== 0) {
    out.letterSpacing = `${styles.letterSpacing / 100}em`;
  }

  if (styles.textTransform && styles.textTransform !== "none") {
    out.textTransform = styles.textTransform;
  }

  // Decoration line is owned here so underline + strike can coexist; the Border
  // panel still owns the decoration style/color/thickness/offset. Reading
  // `underline` keeps that value when both are on (this spread runs last).
  const lines: string[] = [];
  if (styles.underline) lines.push("underline");
  if (styles.lineThrough) lines.push("line-through");
  if (lines.length) out.textDecorationLine = lines.join(" ");

  // Vertical align = a flex column on the box (only visible when the box is
  // taller than the text, i.e. H is Fixed). `align-items: stretch` (the default)
  // keeps the text full-width so horizontal `text-align` still applies.
  if (styles.verticalAlign) {
    out.display = "flex";
    out.flexDirection = "column";
    out.justifyContent =
      styles.verticalAlign === "middle"
        ? "center"
        : styles.verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start";
  }

  // Tight cap/baseline bounds — opt-in (the Safari 18.2 floor + the metrics
  // fallback cost make default-on risky; see the doc's open question).
  if (styles.textBoxTrim) {
    // React hyphenates these unknown longhands to `text-box-trim` / `text-box-edge`.
    (out as Record<string, string>).textBoxTrim = "trim-both";
    (out as Record<string, string>).textBoxEdge = "cap alphabetic";
  }

  return out;
}
