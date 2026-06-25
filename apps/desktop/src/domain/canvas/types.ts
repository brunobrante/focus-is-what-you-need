// Canvas value types shared between the domain layer (settings) and the canvas
// engine. They live in `domain/` so domain code doesn't have to reach up into
// `@/canvas/*` (a layering violation — see ORG-14). The canvas engine re-exports
// these from `@/canvas/engine/types` and `@/canvas/tools`, so existing canvas
// call sites are unchanged.

import type { Fill } from "./fill";

export type Tool =
  | "select"
  | "hand"
  | "scale"
  | "rect"
  | "ellipse"
  | "text"
  | "image"
  | "icon"
  | "wrapper"
  | "line"
  | "arrow"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "svg";

/**
 * Tools that insert a new element on the canvas. Excludes the non-inserting
 * "select", "scale" (a selection variant that resizes proportionally), and
 * "hand" (pan) tools.
 */
export type InsertTool = Exclude<Tool, "select" | "hand" | "scale">;

export type ShellGridType = "dots" | "squares";

// ── Effects (Inspector → Effects panel) ─────────────────────────────────────
// One unified list (Figma's model) where each entry has a type. The CSS the
// renderer emits is type-aware (paper.design's honesty): the same "Drop shadow"
// compiles to `box-shadow` on a box, `filter: drop-shadow()` on an image/vector,
// and `text-shadow` on text. See docs/planned/inspector-effects.md.
export type EffectType =
  | "drop-shadow"
  | "inner-shadow"
  | "layer-blur"
  | "background-blur"
  | "brightness"
  | "contrast"
  | "saturate"
  | "grayscale"
  | "invert"
  | "sepia"
  | "hue-rotate";

/**
 * A single effect entry. A flat bag of optional params (rather than a
 * discriminated union) so the inspector's merge/reorder and the persistence
 * round-trip stay trivial; each `type` reads only the fields that apply to it.
 */
export type Effect = {
  /** Stable id for React keys + reorder; unique within the element. */
  id: string;
  type: EffectType;
  /** Per-entry enable toggle. Absent or true = applied. */
  enabled?: boolean;
  // Shadow params — `drop-shadow` / `inner-shadow`:
  x?: number; // offset px
  y?: number; // offset px
  blur?: number; // px (≥ 0)
  spread?: number; // px — only honored on a box (box-shadow); ignored elsewhere
  color?: string; // shadow color (rgba/hex); falls back to a translucent black
  colorRef?: string; // System Design token ref ("colors:<id>"); resolved live
  // Blur params — `layer-blur` / `background-blur`:
  radius?: number; // px (≥ 0)
  // Filter-function param — brightness/contrast/saturate (multiplier, 1 = identity),
  // grayscale/invert/sepia (0..1), hue-rotate (degrees):
  amount?: number;
};

export type ElementStyles = {
  background?: string;
  // Inspector → Fill panel. The typed, stackable fill list (solid/gradient/
  // image/video). Optional + additive: absent means the simple `background` /
  // `backgroundRef` solid below IS the fill (today's behavior). When present it
  // is the COMPLETE fill description and the renderer composites from it; see
  // `domain/canvas/fill.ts` and `fillCompile.ts`.
  fills?: Fill[];
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  // ── Typography (Inspector → Typography panel; text only) ──────────────────
  // The "non-obvious conversion" fields (see docs/inspector-typography.md):
  // italic → font-style; letterSpacing in % → em; lineHeight unitless (absent =
  // Auto/`normal`); verticalAlign → flex-column justify on the text box; case →
  // text-transform; strike → text-decoration-line (combined with `underline`);
  // textBoxTrim → tight cap/baseline bounds (Safari 18.2+, no-ops on older WK).
  fontStyle?: "normal" | "italic";
  lineHeight?: number; // unitless multiplier; absent = Auto (`line-height: normal`)
  letterSpacing?: number; // percent (Figma's rule: 1% = 0.01em); compiled to em
  verticalAlign?: "top" | "middle" | "bottom";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  lineThrough?: boolean; // strikethrough; underline stays in the Border panel
  textBoxTrim?: boolean; // trim line-box half-leading to cap/baseline (opt-in)
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  // Box border (Inspector → Border/Stroke panel). `borderStyle` maps to CSS
  // border-style; `borderAlign` chooses the mechanism: Inside = `border`,
  // Outside = `outline` (Center is deferred — it needs an SVG render target;
  // see docs/inspector-border-stroke.md).
  borderStyle?: "solid" | "dashed" | "dotted" | "double";
  borderAlign?: "inside" | "outside";
  // System Design token bindings ($$ref, e.g. "colors:c-primary"). When set, the
  // renderer resolves the LIVE token value (reflecting the workspace master, or a
  // detached local copy); the matching string field above is the fallback. Kept
  // as separate optional fields so existing string consumers stay unaffected.
  backgroundRef?: string;
  colorRef?: string;
  borderColorRef?: string;
  opacity?: number;
  /** Ordered effects list. Order is load-bearing: filters chain left-to-right and
   *  shadows stack first-on-top — see compileEffects. */
  effects?: Effect[];
  display?: "block" | "flex";
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
  padding?: number;
  overflow?: "visible" | "hidden";
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  // ── Text stroke & underline (Inspector → Border/Stroke panel; text only) ──
  // Text stroke is `-webkit-text-stroke` (fixed-center; ~half the set width is
  // visible) plus `paint-order` for stroke above/below the fill. Underline maps
  // to the `text-decoration-*` family. See docs/inspector-border-stroke.md.
  textStrokeWidth?: number; // px
  textStrokeColor?: string;
  textStrokeColorRef?: string; // design-token ref, like borderColorRef
  textStrokePaintOrder?: "over" | "under"; // "under" = clean outline (default)
  underline?: boolean;
  underlineStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy";
  underlineColor?: string;
  underlineColorRef?: string;
  underlineThickness?: number; // px
  underlineOffset?: number; // px
  // ── Vector semantics (path/svg elements only; ignored by every other type) ──
  // Cheap in SVG, high value — Figma/paper.design expose all of these.
  fill?: string; // path fill ("none" allowed); falls back to `background`
  fillOpacity?: number; // 0..1
  fillRule?: "nonzero" | "evenodd"; // mirrors VectorPath.fillRule on the inspector
  stroke?: string; // stroke color
  strokeWidth?: number;
  strokeOpacity?: number; // 0..1
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  strokeDasharray?: string; // e.g. "4 2" — dashed/dotted strokes
  strokeAlign?: "center" | "inside" | "outside"; // see Versioning §9 (SVG caveat)
  strokeRef?: string; // design-token ref, like backgroundRef/colorRef
};

export type CanvasToolId =
  | "cursor"
  | "hand"
  | "scale"
  | "wrapper"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "image"
  | "svg"
  | "actions";
