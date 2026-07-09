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

// ── Layout engine vocabulary (Inspector → Layout panel) ─────────────────────
// See docs/inspector-layout.md. These describe how a CONTAINER lays out
// its children and how a CHILD sizes/aligns inside its parent. Compiled by
// domain/canvas/layout.ts; NOT yet applied by the canvas renderer — absolute
// positioning stays the default and the pure engine lands first.

/** Per-axis sizing of a child inside a flex/grid parent. "hug" = fit content,
 *  "fill" = take available space — but the CSS mechanism differs by axis: Fill
 *  on the main axis is `flex-grow`, Fill on the cross axis is `align-self:
 *  stretch` (trap #3). The engine picks by direction, not by this value alone. */
export type SizingMode = "fixed" | "hug" | "fill";

/** One grid track. `fill` → `<value>fr` (default 1), `fixed` → `<value>px`,
 *  `auto` → content-sized `auto`, `min` → `min-content`. Figma's "Auto" is
 *  really `1fr`; in real CSS we can also offer true `auto`/`min-content`. */
export type GridTrackKind = "fill" | "fixed" | "auto" | "min";
export type GridTrack = { kind: GridTrackKind; value?: number };

/** Packed alignment position on one visual axis (a cell of the 9-point pad). */
export type PadAlign = "start" | "center" | "end";

/** Main-axis distribution. Absent = "packed" (use the pad position). Figma's
 *  gap = "Auto" is `space-between` and suppresses `gap` (trap #2). */
export type Distribute = "space-between" | "space-around" | "space-evenly";

/** Absolute-child horizontal constraint when its frame resizes (trap #9). */
export type ConstraintH = "left" | "right" | "left-right" | "center" | "scale";
/** Absolute-child vertical constraint when its frame resizes (trap #9). */
export type ConstraintV = "top" | "bottom" | "top-bottom" | "center" | "scale";


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

// ── Blend mode (Inspector → Appearance panel) ───────────────────────────────
// Maps 1:1 to CSS `mix-blend-mode`. "plus-darker" is deliberately omitted: it is
// non-standard/WebKit-only and mathematically unstable (see docs/inspector-
// appearance.md). "plus-lighter" is kept — it is valid in WebKit.
export type BlendMode =
  | "normal"
  | "darken"
  | "multiply"
  | "color-burn"
  | "lighten"
  | "screen"
  | "color-dodge"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "plus-lighter";

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
  // Non-color token bindings (G14), same $$ref model. The matching concrete
  // fields (borderRadius / gap / padding / fontFamily+fontSize+fontWeight) are
  // written as fallbacks at bind time; the renderer resolves the LIVE token
  // value on top of them. Note: text-fit measurement reads the fallbacks, so a
  // master typography change re-renders live but does not re-measure fit boxes
  // until the element is next edited.
  radiusRef?: string; // "radius:<tokenId>" → borderRadius
  gapRef?: string; // "spacing:<tokenId>" → gap
  paddingRef?: string; // "spacing:<tokenId>" → padding
  typeStyleRef?: string; // "typography:<tokenId>" → font family/size/weight
  opacity?: number;
  // ── Appearance (Inspector → Appearance panel) ─────────────────────────────
  // Type-aware over the unified HTML/SVG render (see docs/inspector-appearance.md).
  // blendMode → `mix-blend-mode` (how the element composites with the backdrop);
  // absent / "normal" = no blend. isolation → `isolation: isolate` ("Normal" group
  // blending) vs absent ("Pass through"); only meaningful on a div with children.
  // cornerRadii → per-corner `border-*-radius` longhands [tl, tr, br, bl]; absent
  // = the uniform `borderRadius` above applies to every corner.
  blendMode?: BlendMode;
  isolation?: "isolate";
  cornerRadii?: [number, number, number, number];
  /** Ordered effects list. Order is load-bearing: filters chain left-to-right and
   *  shadows stack first-on-top — see compileEffects. */
  effects?: Effect[];
  display?: "block" | "flex" | "grid";
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
  padding?: number;
  overflow?: "visible" | "hidden";
  // ── Layout engine (Inspector → Layout panel) ──────────────────────────────
  // Compiled by domain/canvas/layout.ts. These are the engine's canonical
  // inputs; the legacy `justifyContent`/`alignItems` strings above predate it
  // and stay for the current childless-flex render path. Every field optional +
  // additive; not applied to the canvas yet (absolute stays default).
  //
  // Container — how this element lays out its children:
  flexDirection?: "row" | "column";
  flexWrap?: "nowrap" | "wrap";
  rowGap?: number;
  columnGap?: number;
  // Alignment is stored VISUALLY (alignX = horizontal, alignY = vertical); the
  // engine maps each to justify-content / align-items per `flexDirection` and
  // FLIPS which is which when direction is column (trap #1).
  alignX?: PadAlign;
  alignY?: PadAlign;
  distribute?: Distribute;             // main-axis distribution; space-between drops gap (#2)
  counterStretch?: boolean;            // stretch children on the cross axis (align-items: stretch)
  baseline?: boolean;                  // align-items: baseline — row flow only (advanced)
  alignContent?: "start" | "center" | "end" | "stretch" | "space-between"; // wrap rows (#5)
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  gridColumns?: GridTrack[];
  gridRows?: GridTrack[];
  strokesIncluded?: boolean;           // advanced: stroke participates in sizing → border-box (#8)
  canvasStacking?: "last" | "first";   // advanced: paint order; "first" = reversed z-index, NOT reverse (#7)
  // Child — how this element sits inside its flex/grid parent:
  widthMode?: SizingMode;
  heightMode?: SizingMode;
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch"; // cross-axis override / grid cell
  justifySelf?: "start" | "center" | "end" | "stretch";        // grid cell (main axis)
  order?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  // Absolute child — how it reflows when its frame resizes (trap #9):
  constraintH?: ConstraintH;
  constraintV?: ConstraintV;
  // Self transform — flips compose with `node.rotation` (trap #6: Figma's
  // rotation sign is inverted vs CSS; we keep the CSS convention here):
  flipH?: boolean;
  flipV?: boolean;
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

// The insert tools — every tool except the non-creating cursor/hand/scale modes.
// Lives here (not in the canvas app layer) so the pure htmlScene graph helpers can
// reference it without a domain → lib/app import (DOM-1).
export type CanvasInsertToolId = Exclude<CanvasToolId, "cursor" | "hand" | "scale">;
