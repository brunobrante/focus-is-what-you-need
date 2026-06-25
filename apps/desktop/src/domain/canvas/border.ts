// Pure compilation of an element's border / stroke styles into CSS fragments.
// Zero I/O, zero React — given the styles, the element's render target, and a
// color-token resolver, it returns the strings the renderer drops onto the
// element's inline style. The type-awareness (CSS `border` vs `outline` vs
// `-webkit-text-stroke` vs `text-decoration`) lives here so both `nodeStyle` and
// `detachedNodeStyle` stay thin. SVG vector strokes (`stroke-*` on a <path>) are
// rendered directly by ElementRenderer's vector branch and are not compiled here.
//
// See docs/inspector-border-stroke.md for the WebKit caveats this encodes.

import type { ElementStyles } from "./types";

/** Which CSS mechanism a given element renders its border/stroke through. */
export type BorderTarget = "box" | "text" | "vector";

export type CompiledBorder = {
  // ── Box, Inside alignment → real CSS `border` (lives inside the box edge) ──
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  // ── Box, Outside alignment → `outline` (grows outward, follows radius on
  //    modern WebKit, and — unlike a box-shadow ring — honors dashed/dotted/
  //    double, so it never collides with the Effects box-shadow list). ──
  outlineWidth?: number;
  outlineStyle?: string;
  outlineColor?: string;
  outlineOffset?: number;
  // ── Text → `-webkit-text-stroke` + `paint-order` ──
  webkitTextStroke?: string;
  paintOrder?: string;
  // ── Text → `text-decoration` (underline) ──
  textDecorationLine?: string;
  textDecorationStyle?: string;
  textDecorationColor?: string;
  textDecorationThickness?: string;
  textUnderlineOffset?: string;
};

const DEFAULT_BORDER_COLOR = "#CBD5E1";
const DEFAULT_TEXT_STROKE_COLOR = "#000000";

function num(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The render target for an element type (mirrors ElementRenderer's branches). */
export function borderTargetForType(type: string): BorderTarget {
  if (type === "text") return "text";
  if (type === "path" || type === "svg") return "vector";
  return "box";
}

/**
 * Compile the border / stroke styles into CSS fragments for `target`.
 *
 * @param renderScale multiplies every px length (width/thickness/offset) so the
 *   border scales with the zoomed render, matching how other px styles scale.
 * @param resolveRef resolves a token color ref to a live CSS color.
 */
export function compileBorder(
  styles: ElementStyles,
  target: BorderTarget,
  renderScale = 1,
  resolveRef?: (ref: string | undefined) => string | undefined,
): CompiledBorder {
  if (target === "vector") return {}; // <path> stroke-* is rendered directly
  const out: CompiledBorder = {};
  const px = (v: number | undefined, fallback = 0) => num(v, fallback) * renderScale;

  if (target === "box") {
    const width = num(styles.borderWidth);
    if (width > 0) {
      const color = resolveRef?.(styles.borderColorRef) ?? styles.borderColor ?? DEFAULT_BORDER_COLOR;
      const style = styles.borderStyle ?? "solid";
      if ((styles.borderAlign ?? "inside") === "outside") {
        // Outside: an `outline` hugging the box edge and growing outward. No
        // layout growth, follows border-radius (modern WebKit), keeps dashes.
        out.outlineWidth = px(width);
        out.outlineStyle = style;
        out.outlineColor = color;
        out.outlineOffset = 0;
      } else {
        // Inside: a normal border (the box already uses border-box sizing).
        out.borderWidth = px(width);
        out.borderStyle = style;
        out.borderColor = color;
      }
    }
    return out;
  }

  // target === "text"
  const strokeWidth = num(styles.textStrokeWidth);
  if (strokeWidth > 0) {
    const color = resolveRef?.(styles.textStrokeColorRef) ?? styles.textStrokeColor ?? DEFAULT_TEXT_STROKE_COLOR;
    out.webkitTextStroke = `${px(strokeWidth)}px ${color}`;
    // "under" = stroke painted below the fill = a clean outline (the default);
    // "over" = the browser default where the stroke covers the inner half.
    out.paintOrder = styles.textStrokePaintOrder === "over" ? "fill stroke" : "stroke fill";
  }

  if (styles.underline) {
    out.textDecorationLine = "underline";
    out.textDecorationStyle = styles.underlineStyle ?? "solid";
    const color = resolveRef?.(styles.underlineColorRef) ?? styles.underlineColor;
    if (color) out.textDecorationColor = color;
    if (typeof styles.underlineThickness === "number") {
      out.textDecorationThickness = `${px(styles.underlineThickness)}px`;
    }
    if (typeof styles.underlineOffset === "number") {
      out.textUnderlineOffset = `${px(styles.underlineOffset)}px`;
    }
  }

  return out;
}
