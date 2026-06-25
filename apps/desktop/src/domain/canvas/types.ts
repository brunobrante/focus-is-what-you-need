// Canvas value types shared between the domain layer (settings) and the canvas
// engine. They live in `domain/` so domain code doesn't have to reach up into
// `@/canvas/*` (a layering violation — see ORG-14). The canvas engine re-exports
// these from `@/canvas/engine/types` and `@/canvas/tools`, so existing canvas
// call sites are unchanged.

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
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
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
