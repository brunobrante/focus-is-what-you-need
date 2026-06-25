// Freehand → editable path: Ramer–Douglas–Peucker simplification followed by a
// Catmull-Rom → Bézier fit so the pencil stroke becomes a smooth, editable path
// with a modest anchor count. Pure.

import type { VectorAnchor } from "../types";

type P = { x: number; y: number };

function perpDistance(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Ramer–Douglas–Peucker. Returns a subset of `points` preserving shape. */
export function rdp(points: P[], tolerance: number): P[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = rdp(points.slice(0, index + 1), tolerance);
    const right = rdp(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Simplify a freehand point stream into smooth anchors. `tolerance` is in the
 * same units as the points (path/viewBox space).
 */
export function simplifyToAnchors(points: P[], tolerance = 2): VectorAnchor[] {
  // Drop consecutive duplicates first (a stationary pointer emits repeats).
  const cleaned: P[] = [];
  for (const p of points) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) cleaned.push(p);
  }
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return [{ x: cleaned[0].x, y: cleaned[0].y, handleType: "corner" }];

  const pts = rdp(cleaned, tolerance);
  const anchors: VectorAnchor[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1] ?? pts[i];
    const next = pts[i + 1] ?? pts[i];
    // Catmull-Rom tangent → Bézier handle (1/6 of the chord between neighbors).
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    const isEnd = i === 0 || i === pts.length - 1;
    anchors.push({
      x: pts[i].x,
      y: pts[i].y,
      ...(isEnd
        ? {}
        : { inX: -tx, inY: -ty, outX: tx, outY: ty, handleType: "mirrored" as const }),
      ...(isEnd ? { handleType: "corner" as const } : {}),
    });
  }
  return anchors;
}
