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
  // ── Box, per-side widths → `border-*-width` longhands (always Inside) ──
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
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

/**
 * True when the element authors its border side by side rather than uniformly.
 *
 * A side left unset (not a number) inherits the uniform `borderWidth`, so a list of
 * all-zeros still counts as per-side — that is how you draw a bottom-only divider.
 */
export function hasPerSideWidths(styles: ElementStyles): boolean {
  return Array.isArray(styles.borderWidths) && styles.borderWidths.some((w) => typeof w === "number");
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

    // Per-side widths (G13) — the bottom-only divider, the tab underline. Only the
    // CSS `border` shorthand family has per-side longhands, so this is always the
    // Inside mechanism and `borderAlign` does not apply. An unset side falls back to
    // the uniform width, exactly as an unset corner falls back in `cornerRadii`.
    if (hasPerSideWidths(styles)) {
      const sides = styles.borderWidths!;
      const sideWidth = (index: number) =>
        px(typeof sides[index] === "number" ? Math.max(0, sides[index]) : width);
      out.borderTopWidth = sideWidth(0);
      out.borderRightWidth = sideWidth(1);
      out.borderBottomWidth = sideWidth(2);
      out.borderLeftWidth = sideWidth(3);
      out.borderStyle = styles.borderStyle ?? "solid";
      out.borderColor =
        resolveRef?.(styles.borderColorRef) ?? styles.borderColor ?? DEFAULT_BORDER_COLOR;
      return out;
    }

    if (width > 0) {
      const color = resolveRef?.(styles.borderColorRef) ?? styles.borderColor ?? DEFAULT_BORDER_COLOR;
      const style = styles.borderStyle ?? "solid";
      const align = styles.borderAlign ?? "inside";
      if (align === "outside" || align === "center") {
        // Outside: an `outline` hugging the box edge and growing outward. No
        // layout growth, follows border-radius (modern WebKit), keeps dashes.
        //
        // Center: the same outline, pulled inward by half its width (F3). An
        // outline is painted outward from the offset edge, so a width-`w` outline
        // at `outline-offset: -w/2` spans −w/2..+w/2 around the box edge — exactly
        // a centered stroke, with no layout shift and radius still followed. This
        // is why Center needs no SVG promotion for boxes, contrary to the original
        // plan's box-shadow-ring reading (see docs/inspector-border-stroke.md).
        out.outlineWidth = px(width);
        out.outlineStyle = style;
        out.outlineColor = color;
        out.outlineOffset = align === "center" ? -px(width) / 2 : 0;
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

/** A border painted as an SVG stroke along a shape's outline (F2/F3). */
export type CompiledShapeStroke = {
  stroke: string;
  /** Already doubled for inside/outside, where half the stroke is clipped away. */
  strokeWidth: number;
  /** How the drawn stroke relates to the outline — the caller clips or masks. */
  align: "inside" | "center" | "outside";
  strokeDasharray?: string;
  strokeLinecap?: "butt" | "round";
};

/**
 * Compile a box-authored border (width/color/style/align) into the SVG stroke that
 * traces a clip-path shape's outline — polygon, star, arrow. These shapes are drawn
 * by clipping their box, and a CSS border on a clipped box is clipped away with it,
 * so they carried no border at all (F2) and no alignment (F3).
 *
 * Inside and Outside both draw at 2× width and let the caller clip away the half
 * that falls on the wrong side of the outline — the standard SVG trick, since SVG
 * strokes are always centered. Center needs neither.
 *
 * Returns null when there is nothing to paint.
 */
export function compileShapeStroke(
  styles: ElementStyles,
  resolveRef?: (ref: string | undefined) => string | undefined,
): CompiledShapeStroke | null {
  const width = num(styles.borderWidth);
  if (width <= 0) return null;

  const align = styles.borderAlign ?? "inside";
  const out: CompiledShapeStroke = {
    stroke: resolveRef?.(styles.borderColorRef) ?? styles.borderColor ?? DEFAULT_BORDER_COLOR,
    strokeWidth: align === "center" ? width : width * 2,
    align,
  };

  // SVG has no `border-style`, so the CSS keywords become dash patterns scaled to
  // the authored width (not the doubled one — the pattern must read the same at
  // every alignment). `double` has no single-stroke equivalent; it falls back to
  // solid rather than silently drawing something else.
  switch (styles.borderStyle) {
    case "dashed":
      out.strokeDasharray = `${trimStroke(width * 3)} ${trimStroke(width * 2)}`;
      break;
    case "dotted":
      out.strokeDasharray = `0 ${trimStroke(width * 2)}`;
      out.strokeLinecap = "round";
      break;
    default:
      break;
  }
  return out;
}

function trimStroke(value: number): number {
  return Number(value.toFixed(3));
}
