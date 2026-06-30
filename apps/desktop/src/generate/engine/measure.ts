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

/** Union bounding box of the objects (their overall content extent). */
function unionBox(boxes: MaskBox[]): MaskBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The four margins between the objects' content extent and the crop frame — the
 * padding on each side — drawn from the crop edge to the nearest content edge at
 * the content's centre line. Only sides with a positive margin are returned.
 */
export function computeEdgeMargins(boxes: MaskBox[], crop: MaskBox): Spacing[] {
  if (boxes.length === 0) return [];
  const c = unionBox(boxes);
  const midX = c.x + c.w / 2;
  const midY = c.y + c.h / 2;
  const cropRight = crop.x + crop.w;
  const cropBottom = crop.y + crop.h;
  const out: Spacing[] = [];

  const left = c.x - crop.x;
  if (left > 0.5) out.push({ axis: "x", ax: crop.x, ay: midY, bx: c.x, by: midY, distance: left });
  const right = cropRight - (c.x + c.w);
  if (right > 0.5) out.push({ axis: "x", ax: c.x + c.w, ay: midY, bx: cropRight, by: midY, distance: right });
  const top = c.y - crop.y;
  if (top > 0.5) out.push({ axis: "y", ax: midX, ay: crop.y, bx: midX, by: c.y, distance: top });
  const bottom = cropBottom - (c.y + c.h);
  if (bottom > 0.5) out.push({ axis: "y", ax: midX, ay: c.y + c.h, bx: midX, by: cropBottom, distance: bottom });

  return out;
}

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
