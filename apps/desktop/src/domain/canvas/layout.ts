// Pure compilation of an element's Layout styles into CSS fragments. Zero I/O,
// zero React — given the styles (and, for a child, its parent's flow) it returns
// the inline-style longhands a renderer would spread. This is the layout ENGINE:
// it is where every "auto layout ≠ naive flexbox" trap from
// docs/inspector-layout.md is paid, so the eventual renderer/panel stay
// thin. It is intentionally NOT wired to the canvas yet — absolute positioning
// remains the default; this module lands first and is exercised only by tests
// and the inspector panel.
//
// The traps this encodes (numbers match the doc):
//   #1 The 9-point pad is ONE control → TWO props (justify-content + align-
//      items), and WHICH dot maps to WHICH prop flips when direction flips.
//      Alignment is stored visually (alignX/alignY); the flip lives here.
//   #2 "Auto" gap = `justify-content: space-between` (and NO `gap`). Never
//      emit `gap: auto`.
//   #3 "Fill" is two mechanisms: main axis → `flex-grow`; cross axis →
//      `align-self: stretch`. Picked by the PARENT's direction, not the label.
//   #4 "Hug" → `fit-content`, but downgrades to Fixed if a child Fills that
//      axis (caller passes the hint).
//   #5 Wrap does not stretch rows by default — emit `align-content` explicitly.
//   #6 Rotation sign is inverted in Figma; we keep CSS's (positive = CW). Flips
//      compose as `scaleX/Y(-1)` around the element center.
//   #7 "First on top" ≠ `*-reverse` (that moves geometry); it is reversed
//      `z-index` only.
//   #8 Strokes Included → `box-sizing: border-box`; Excluded → no layout impact.
//   #9 Constraints map to `left`/`right`/both/center/`%` for absolute children.
//   #10 Text resize (Auto-width / Auto-height / Fixed) is its OWN enum.

import type { CSSProperties } from "react";
import type {
  ElementStyles,
  GridTrack,
  PadAlign,
  SizingMode,
  TextResize,
} from "./types";

// ─── Small helpers ──────────────────────────────────────────────────────────

function num(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A packed pad position → the matching flex keyword. */
function packedToFlex(pad: PadAlign | undefined): "flex-start" | "center" | "flex-end" {
  return pad === "center" ? "center" : pad === "end" ? "flex-end" : "flex-start";
}

/** Distribution / pad keyword → the equivalent `align-content` keyword. */
function toAlignContent(
  value: NonNullable<ElementStyles["alignContent"]>,
): CSSProperties["alignContent"] {
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value; // center | stretch | space-between
}

// ─── Container layout (flex / grid) ─────────────────────────────────────────

/**
 * Compile the CONTAINER half of the layout — `display`, direction, gaps, the
 * resolved alignment pad, padding, wrap, and grid templates. Returns only the
 * keys it sets, so spreading it never clobbers a base value.
 *
 * Pass `renderScale` to multiply every px length (gaps, padding, fixed tracks)
 * so the box scales with a zoomed render, matching the other engines.
 */
export function compileContainerLayout(styles: ElementStyles, renderScale = 1): CSSProperties {
  const display = styles.display;
  if (display !== "flex" && display !== "grid") return {};

  const out: CSSProperties = {};
  out.display = display;
  const px = (v: number | undefined) => num(v) * renderScale;

  // Strokes Included → the box counts its border in its size (trap #8). When
  // excluded the stroke is treated like an outline elsewhere (no layout impact),
  // so we emit nothing and let the box keep its content-box-free default.
  if (styles.strokesIncluded) out.boxSizing = "border-box";

  // Gaps. A single `gap` covers both axes; `rowGap`/`columnGap` (the wrap split)
  // override per axis when present.
  if (typeof styles.gap === "number") out.gap = px(styles.gap);
  if (typeof styles.rowGap === "number") out.rowGap = px(styles.rowGap);
  if (typeof styles.columnGap === "number") out.columnGap = px(styles.columnGap);

  if (display === "grid") {
    if (styles.gridColumns?.length) out.gridTemplateColumns = compileTracks(styles.gridColumns, renderScale);
    if (styles.gridRows?.length) out.gridTemplateRows = compileTracks(styles.gridRows, renderScale);
    // The pad still aligns grid content (justify-items / align-items on the grid).
    if (styles.alignX) out.justifyItems = styles.alignX;
    if (styles.alignY) out.alignItems = styles.alignY;
    return out;
  }

  // ── Flex ──
  const direction = styles.flexDirection ?? "row";
  if (direction === "column") out.flexDirection = "column";

  // Trap #1: resolve the visual pad against the flow direction. In a row the
  // main axis is horizontal (alignX → justify-content) and the cross axis is
  // vertical (alignY → align-items); in a column they swap.
  const isRow = direction === "row";
  const mainPad = isRow ? styles.alignX : styles.alignY;
  const crossPad = isRow ? styles.alignY : styles.alignX;

  // Trap #2: distribution owns the main axis. space-between is the "Auto" gap —
  // it (and the other distributions) replace any explicit gap on that axis.
  if (styles.distribute) {
    out.justifyContent = styles.distribute;
    delete out.gap; // never let `gap` fight a distribution
  } else {
    out.justifyContent = packedToFlex(mainPad);
  }

  // Cross axis: baseline (row flow only) and stretch are modifiers that win over
  // the packed pad position.
  if (styles.baseline && isRow) {
    out.alignItems = "baseline";
  } else if (styles.counterStretch) {
    out.alignItems = "stretch";
  } else {
    out.alignItems = packedToFlex(crossPad);
  }

  // Trap #5: wrap does not stretch rows by default — make `align-content`
  // explicit. Default to flex-start so multi-row layouts pack to the top
  // instead of inheriting the stretch-y default some engines apply.
  if (styles.flexWrap === "wrap") {
    out.flexWrap = "wrap";
    out.alignContent = toAlignContent(styles.alignContent ?? "start");
  }

  return paddingInto(out, styles, px);
}

/** Apply the padding longhands (individual override the uniform value). */
function paddingInto(
  out: CSSProperties,
  styles: ElementStyles,
  px: (v: number | undefined) => number,
): CSSProperties {
  const hasIndividual =
    styles.paddingTop !== undefined ||
    styles.paddingRight !== undefined ||
    styles.paddingBottom !== undefined ||
    styles.paddingLeft !== undefined;

  if (hasIndividual) {
    const uniform = styles.padding;
    out.paddingTop = px(styles.paddingTop ?? uniform);
    out.paddingRight = px(styles.paddingRight ?? uniform);
    out.paddingBottom = px(styles.paddingBottom ?? uniform);
    out.paddingLeft = px(styles.paddingLeft ?? uniform);
  } else if (typeof styles.padding === "number") {
    out.padding = px(styles.padding);
  }
  return out;
}

/** Compile a track list to a `grid-template-*` value. */
function compileTracks(tracks: GridTrack[], renderScale: number): string {
  return tracks
    .map((t) => {
      switch (t.kind) {
        case "fill":
          return `${num(t.value, 1)}fr`;
        case "fixed":
          return `${num(t.value) * renderScale}px`;
        case "min":
          return "min-content";
        case "auto":
        default:
          return "auto";
      }
    })
    .join(" ");
}

// ─── Child-in-parent layout (sizing / alignment / order / grid placement) ───

export type ChildContext = {
  /** The parent's resolved display. Grid placement only applies under "grid";
   *  Fill's grow-vs-stretch split only applies under "flex". */
  parentDisplay?: "block" | "flex" | "grid";
  /** The parent's flex-direction (default "row"). Decides which of this child's
   *  axes is the main axis, and therefore how Fill compiles (trap #3). */
  parentDirection?: "row" | "column";
  renderScale?: number;
};

/**
 * Compile the CHILD half — how this element sizes and aligns inside its parent:
 * Fixed/Hug/Fill per axis (with the main-vs-cross Fill split), min/max clamps,
 * an explicit cross-axis `align-self`, `order`, and grid placement.
 *
 * Sizing notes:
 *  • Fixed leaves width/height to the caller (the node's px size).
 *  • Hug → `fit-content` (trap #4: pass `hugDowngrade*` when a child Fills that
 *    axis so Hug correctly falls back to the fixed px size instead).
 *  • Fill main axis → `flex-grow: 1; flex-basis: 0` (proportional share).
 *  • Fill cross axis → `align-self: stretch`.
 */
export function compileChildLayout(
  styles: ElementStyles,
  ctx: ChildContext = {},
  hint: { hugDowngradeWidth?: boolean; hugDowngradeHeight?: boolean } = {},
): CSSProperties {
  const out: CSSProperties = {};
  const renderScale = ctx.renderScale ?? 1;
  const px = (v: number | undefined) => num(v) * renderScale;
  const parentDir = ctx.parentDirection ?? "row";
  const isFlex = ctx.parentDisplay === "flex";
  const isGrid = ctx.parentDisplay === "grid";

  // ── Per-axis sizing ──
  // The main axis is horizontal in a row parent, vertical in a column parent.
  const widthIsMain = parentDir === "row";
  applySizing(out, "width", styles.widthMode, widthIsMain, isFlex, isGrid, hint.hugDowngradeWidth);
  applySizing(out, "height", styles.heightMode, !widthIsMain, isFlex, isGrid, hint.hugDowngradeHeight);

  // ── Min / max clamp (stacks on the sizing mode) ──
  if (typeof styles.minWidth === "number") out.minWidth = px(styles.minWidth);
  if (typeof styles.maxWidth === "number") out.maxWidth = px(styles.maxWidth);
  if (typeof styles.minHeight === "number") out.minHeight = px(styles.minHeight);
  if (typeof styles.maxHeight === "number") out.maxHeight = px(styles.maxHeight);

  // ── Explicit cross-axis alignment override (wins over a Fill stretch) ──
  if (styles.alignSelf && styles.alignSelf !== "auto") {
    out.alignSelf = styles.alignSelf === "start" ? "flex-start" : styles.alignSelf === "end" ? "flex-end" : styles.alignSelf;
  }

  // ── Order ──
  if (typeof styles.order === "number") out.order = styles.order;

  // ── Grid cell placement ──
  if (isGrid) {
    if (typeof styles.gridColumnSpan === "number") out.gridColumn = `span ${Math.max(1, Math.round(styles.gridColumnSpan))}`;
    if (typeof styles.gridRowSpan === "number") out.gridRow = `span ${Math.max(1, Math.round(styles.gridRowSpan))}`;
    if (styles.justifySelf) out.justifySelf = styles.justifySelf === "start" ? "start" : styles.justifySelf;
  }

  return out;
}

function applySizing(
  out: CSSProperties,
  axis: "width" | "height",
  mode: SizingMode | undefined,
  isMainAxis: boolean,
  parentIsFlex: boolean,
  parentIsGrid: boolean,
  hugDowngrade?: boolean,
) {
  if (!mode || mode === "fixed") return; // caller supplies the px size

  if (mode === "hug") {
    // Trap #4: a child Fills this axis → the parent can't hug it; fall back to
    // the fixed px size (emit nothing and let the caller's width/height stand).
    if (hugDowngrade) return;
    out[axis] = "fit-content";
    return;
  }

  // mode === "fill"
  if (parentIsGrid) {
    // In a grid cell, Fill = stretch to the track on that axis.
    if (axis === "width") out.justifySelf = "stretch";
    else out.alignSelf = "stretch";
    return;
  }
  if (!parentIsFlex) return; // Fill is meaningless without a flow parent

  if (isMainAxis) {
    // Trap #3a: Fill on the main axis shares free space → grow from a 0 basis.
    out.flexGrow = 1;
    out.flexBasis = 0;
  } else {
    // Trap #3b: Fill on the cross axis is a stretch, not a grow.
    out.alignSelf = "stretch";
  }
}

// ─── Self transform (flip ∘ rotation) ───────────────────────────────────────

/**
 * The flip half of an element's transform — `scaleX(-1)` / `scaleY(-1)` (trap
 * #6). Returned separately from rotation so the renderer can compose it around
 * the same center: `rotate(...) <flip>`. Returns undefined when neither flip is
 * set. (Rotation sign: we keep CSS's positive-is-clockwise; Figma's is the
 * opposite — note it for any Figma import, but the engine does not invert.)
 */
export function compileFlip(styles: ElementStyles): string | undefined {
  const parts: string[] = [];
  if (styles.flipH) parts.push("scaleX(-1)");
  if (styles.flipV) parts.push("scaleY(-1)");
  return parts.length ? parts.join(" ") : undefined;
}

// ─── Text auto-resize (its own enum) ────────────────────────────────────────

/**
 * Compile the text-resize enum (trap #10). Distinct from the Fixed/Hug/Fill
 * container modes:
 *  • auto-width  → `width: max-content` (grows horizontally; honors explicit
 *    breaks, so no soft-wrap).
 *  • auto-height → fixed width, `height: auto` (wraps and grows downward).
 *  • fixed       → fixed W+H, clipped (caller supplies W/H; we add the clip).
 */
export function compileTextResize(mode: TextResize | undefined): CSSProperties {
  switch (mode) {
    case "auto-width":
      return { width: "max-content", whiteSpace: "pre" };
    case "auto-height":
      return { height: "auto", whiteSpace: "normal" };
    case "fixed":
      return { overflow: "hidden" };
    default:
      return {};
  }
}

// ─── Canvas stacking (paint order) ──────────────────────────────────────────

/**
 * The z-index a child at `index` should take given the container's stacking
 * (trap #7). "First on top" is a PAINT-ORDER change only — reversed z-index —
 * NOT `flex-direction: *-reverse`, which would also move the geometry. Returns
 * undefined for the natural "last on top" order (no z-index needed).
 */
export function childZIndex(
  index: number,
  count: number,
  stacking: ElementStyles["canvasStacking"],
): number | undefined {
  if (stacking !== "first") return undefined;
  return count - 1 - index;
}

// ─── Absolute-child constraints ─────────────────────────────────────────────

export type Rect = { x: number; y: number; width: number; height: number };
export type FrameSize = { width: number; height: number };

/**
 * Compile the constraint anchors for an ABSOLUTE child (trap #9) — how it
 * reflows when its `frame` resizes. Honest CSS positioning, not a Figma solver:
 *  • left / top      → pin that edge (`left`/`top`).
 *  • right / bottom  → pin the far edge (`right`/`bottom`).
 *  • left-right / top-bottom → pin BOTH edges; the size then tracks the frame.
 *  • center          → `left/top: <center>%` + a centering `translate`.
 *  • scale           → position AND size in `%` of the frame.
 *
 * `rect` is the child's box and `frame` the parent frame size, both in the same
 * units. Defaults (no constraint set) pin top-left, matching `left`/`top`.
 */
export function compileConstraints(
  rect: Rect,
  frame: FrameSize,
  styles: ElementStyles,
): CSSProperties {
  const out: CSSProperties = {};
  const pct = (v: number, total: number) => (total === 0 ? 0 : (v / total) * 100);

  // ── Horizontal ──
  switch (styles.constraintH ?? "left") {
    case "right":
      out.right = frame.width - (rect.x + rect.width);
      break;
    case "left-right":
      out.left = rect.x;
      out.right = frame.width - (rect.x + rect.width);
      break; // width is driven by both edges → leave it auto
    case "center":
      out.left = `${pct(rect.x + rect.width / 2, frame.width)}%`;
      break;
    case "scale":
      out.left = `${pct(rect.x, frame.width)}%`;
      out.width = `${pct(rect.width, frame.width)}%`;
      break;
    case "left":
    default:
      out.left = rect.x;
      break;
  }

  // ── Vertical ──
  switch (styles.constraintV ?? "top") {
    case "bottom":
      out.bottom = frame.height - (rect.y + rect.height);
      break;
    case "top-bottom":
      out.top = rect.y;
      out.bottom = frame.height - (rect.y + rect.height);
      break;
    case "center":
      out.top = `${pct(rect.y + rect.height / 2, frame.height)}%`;
      break;
    case "scale":
      out.top = `${pct(rect.y, frame.height)}%`;
      out.height = `${pct(rect.height, frame.height)}%`;
      break;
    case "top":
    default:
      out.top = rect.y;
      break;
  }

  // Centering on an axis pins the box's CENTER to a `%` point, so it must shift
  // back by half its own size on that axis.
  const cx = styles.constraintH === "center";
  const cy = styles.constraintV === "center";
  if (cx || cy) out.transform = `translate(${cx ? "-50%" : "0"}, ${cy ? "-50%" : "0"})`;

  return out;
}
