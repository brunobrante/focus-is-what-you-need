// Spacing measurement for the Builder's "Show sizes" overlay — the static-image
// analogue of holding a modifier on the canvas to see the gap between elements.
// Given the bounding boxes of the objects found inside a crop, it computes the
// gaps between adjacent objects along their dominant layout axis. Framework-free
// and unit-tested — no canvas/DOM here.

import type { MaskBox } from "./contour";

/** A measured gap between two adjacent objects, in the boxes' coordinate space. */
export type Spacing = {
  /** Layout axis the gap runs along: "x" = horizontal, "y" = vertical. */
  axis: "x" | "y";
  /** Gap segment endpoints (from the trailing edge of A to the leading edge of B). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Gap length in pixels. */
  distance: number;
};

const cx = (b: MaskBox) => b.x + b.w / 2;
const cy = (b: MaskBox) => b.y + b.h / 2;

/**
 * Gaps between adjacent objects. The dominant axis is whichever spreads the box
 * centres more (so two side-by-side buttons measure horizontally); boxes are
 * sorted along it and each consecutive pair with a positive gap yields one
 * measurement, drawn at the centre of the pair's shared cross-axis band.
 */
export function computeSpacing(boxes: MaskBox[]): Spacing[] {
  if (boxes.length < 2) return [];
  const xs = boxes.map(cx);
  const ys = boxes.map(cy);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  const axis: "x" | "y" = spreadX >= spreadY ? "x" : "y";

  const sorted = [...boxes].sort((a, b) => (axis === "x" ? cx(a) - cx(b) : cy(a) - cy(b)));
  const out: Spacing[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (axis === "x") {
      const gap = b.x - (a.x + a.w);
      if (gap <= 0) continue;
      const top = Math.max(a.y, b.y);
      const bottom = Math.min(a.y + a.h, b.y + b.h);
      const my = top <= bottom ? (top + bottom) / 2 : (cy(a) + cy(b)) / 2;
      out.push({ axis, ax: a.x + a.w, ay: my, bx: b.x, by: my, distance: gap });
    } else {
      const gap = b.y - (a.y + a.h);
      if (gap <= 0) continue;
      const left = Math.max(a.x, b.x);
      const right = Math.min(a.x + a.w, b.x + b.w);
      const mx = left <= right ? (left + right) / 2 : (cx(a) + cx(b)) / 2;
      out.push({ axis, ax: mx, ay: a.y + a.h, bx: mx, by: b.y, distance: gap });
    }
  }
  return out;
}
