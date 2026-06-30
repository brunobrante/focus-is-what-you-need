// Pure geometry for the Bézier pen cut tool. A pen path is an ordered list of
// anchors; each anchor optionally carries two absolute control handles (`in`
// coming from the previous anchor, `out` going to the next). A click makes a
// corner anchor (no handles); a click-drag makes a smooth anchor (mirrored
// handles). Coordinates live in the same space as the rectangle selection
// (image-content pixels at zoom 1), so the overlay and pointer mapping are
// shared. Framework-free and unit-tested — no canvas/DOM here.

export type Point = { x: number; y: number };
export type PenAnchor = { x: number; y: number; in?: Point; out?: Point };
export type PenPath = { anchors: PenAnchor[]; closed: boolean };

/** What a pointer is over, for editing and for closing the path. */
export type PenHit =
  | { type: "anchor"; index: number }
  | { type: "in"; index: number }
  | { type: "out"; index: number };

const anchorPoint = (a: PenAnchor): Point => ({ x: a.x, y: a.y });

/** Reflects `handle` across `anchor` — the mirrored (symmetric) control point. */
export function mirrorHandle(anchor: Point, handle: Point): Point {
  return { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y };
}

/** Squared distance — cheaper than `hypot` when only comparing to a radius. */
function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Point on the cubic Bézier `p0→c1→c2→p3` at parameter `t` in [0, 1]. */
export function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/** The control points of the Bézier segment from anchor `a` to anchor `b`. */
export function segmentControls(a: PenAnchor, b: PenAnchor): [Point, Point, Point, Point] {
  return [anchorPoint(a), a.out ?? anchorPoint(a), b.in ?? anchorPoint(b), anchorPoint(b)];
}

/**
 * Flattens the path into a polyline by sampling each Bézier segment. Includes
 * the closing segment when `closed`. `steps` samples per segment. Returns the
 * anchor itself for a 0/1-anchor path.
 */
export function flattenPen(path: PenPath, steps = 16): Point[] {
  const { anchors, closed } = path;
  if (anchors.length === 0) return [];
  if (anchors.length === 1) return [anchorPoint(anchors[0])];
  const out: Point[] = [anchorPoint(anchors[0])];
  const segs = closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const [p0, c1, c2, p3] = segmentControls(a, b);
    for (let s = 1; s <= steps; s += 1) out.push(cubicAt(p0, c1, c2, p3, s / steps));
  }
  return out;
}

/** Axis-aligned bounds of the flattened path, or null when it has no points. */
export function penBounds(
  path: PenPath,
  steps = 16,
): { x: number; y: number; w: number; h: number } | null {
  const pts = flattenPen(path, steps);
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Nearest editable target (anchor or one of its handles) within `tol` of
 * `point`. Handles are checked before anchors so a handle sitting near its
 * anchor still wins. Returns null when nothing is in range.
 */
export function hitTestPen(path: PenPath, point: Point, tol: number): PenHit | null {
  const tol2 = tol * tol;
  let best: PenHit | null = null;
  let bestD = tol2;
  for (let i = 0; i < path.anchors.length; i += 1) {
    const a = path.anchors[i];
    if (a.in) {
      const d = dist2(a.in, point);
      if (d <= bestD) {
        bestD = d;
        best = { type: "in", index: i };
      }
    }
    if (a.out) {
      const d = dist2(a.out, point);
      if (d <= bestD) {
        bestD = d;
        best = { type: "out", index: i };
      }
    }
  }
  // Anchors only win when no handle was closer (strict, to favour handles).
  for (let i = 0; i < path.anchors.length; i += 1) {
    const d = dist2(anchorPoint(path.anchors[i]), point);
    if (d < bestD) {
      bestD = d;
      best = { type: "anchor", index: i };
    }
  }
  return best;
}

/** True when `point` is within `tol` of the path's first anchor (to close it). */
export function nearFirstAnchor(path: PenPath, point: Point, tol: number): boolean {
  if (path.anchors.length === 0) return false;
  return dist2(anchorPoint(path.anchors[0]), point) <= tol * tol;
}

/**
 * Whether `point` lies inside the path's filled region (ray-casting over the
 * flattened outline). Used to grab and move the whole closed path, like dragging
 * the interior of the rectangle selection.
 */
export function pointInPath(path: PenPath, point: Point, steps = 16): boolean {
  const poly = flattenPen(path, steps);
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Translates an anchor and its handles by (dx, dy) — used when dragging it. */
export function moveAnchor(anchor: PenAnchor, dx: number, dy: number): PenAnchor {
  return {
    x: anchor.x + dx,
    y: anchor.y + dy,
    in: anchor.in ? { x: anchor.in.x + dx, y: anchor.in.y + dy } : undefined,
    out: anchor.out ? { x: anchor.out.x + dx, y: anchor.out.y + dy } : undefined,
  };
}
