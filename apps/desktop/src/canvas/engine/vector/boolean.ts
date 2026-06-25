// Boolean operations on vector paths (union / subtract / intersect / exclude) and
// a flatten/merge. Paths are flattened to polygons, combined with a dependency-free
// Greiner–Hornmann clip, and returned as corner-anchor subpaths.
//
// Caveat (honest limitation): GH handles simple, non-self-intersecting polygons.
// Each path's subpaths are flattened to polygons and the op is applied across the
// outer (largest-area) polygon of each operand. Holes / self-intersections are not
// resolved geometrically — for those, `flatten` merges subpaths losslessly instead.

import type { VectorAnchor, VectorPath, VectorSubpath } from "../types";
import { sampleSegment } from "./pathData";

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";

type P = { x: number; y: number };

const SAMPLES_PER_SEGMENT = 16;

/** Flatten one subpath to a closed polygon (array of points). */
function subpathToPolygon(sub: VectorSubpath): P[] {
  const poly: P[] = [];
  const { anchors } = sub;
  if (anchors.length === 0) return poly;
  const count = anchors.length;
  for (let i = 0; i < count; i++) {
    const from = anchors[i];
    const to = anchors[(i + 1) % count];
    poly.push({ x: from.x, y: from.y });
    const curved = from.outX !== undefined || from.outY !== undefined || to.inX !== undefined || to.inY !== undefined;
    if (curved && (i < count - 1 || sub.closed)) {
      for (let s = 1; s < SAMPLES_PER_SEGMENT; s++) {
        poly.push(sampleSegment(from, to, s / SAMPLES_PER_SEGMENT));
      }
    }
  }
  return poly;
}

function polygonArea(poly: P[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function largestPolygon(path: VectorPath): P[] {
  let best: P[] = [];
  let bestArea = -1;
  for (const sub of path.subpaths) {
    const poly = subpathToPolygon(sub);
    const area = Math.abs(polygonArea(poly));
    if (area > bestArea) {
      bestArea = area;
      best = poly;
    }
  }
  return best;
}

// ─── Greiner–Hornmann ───────────────────────────────────────────────────────────

type Vertex = {
  x: number;
  y: number;
  next: Vertex | null;
  prev: Vertex | null;
  neighbour: Vertex | null;
  intersect: boolean;
  entry: boolean;
  alpha: number;
  visited: boolean;
};

function makeVertex(x: number, y: number): Vertex {
  return { x, y, next: null, prev: null, neighbour: null, intersect: false, entry: false, alpha: 0, visited: false };
}

function buildList(poly: P[]): Vertex {
  const verts = poly.map((p) => makeVertex(p.x, p.y));
  for (let i = 0; i < verts.length; i++) {
    verts[i].next = verts[(i + 1) % verts.length];
    verts[i].prev = verts[(i - 1 + verts.length) % verts.length];
  }
  return verts[0];
}

function pointInPolygon(x: number, y: number, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type Intersection = { alphaP: number; alphaQ: number; x: number; y: number };

function segIntersect(p1: P, p2: P, q1: P, q2: P): Intersection | null {
  const dpx = p2.x - p1.x, dpy = p2.y - p1.y;
  const dqx = q2.x - q1.x, dqy = q2.y - q1.y;
  const denom = dpx * dqy - dpy * dqx;
  if (Math.abs(denom) < 1e-12) return null;
  const tp = ((q1.x - p1.x) * dqy - (q1.y - p1.y) * dqx) / denom;
  const tq = ((q1.x - p1.x) * dpy - (q1.y - p1.y) * dpx) / denom;
  if (tp <= 1e-9 || tp >= 1 - 1e-9 || tq <= 1e-9 || tq >= 1 - 1e-9) return null;
  return { alphaP: tp, alphaQ: tq, x: p1.x + tp * dpx, y: p1.y + tp * dpy };
}

function toArray(start: Vertex): Vertex[] {
  const out: Vertex[] = [];
  let v: Vertex | null = start;
  do {
    out.push(v!);
    v = v!.next;
  } while (v && v !== start);
  return out;
}

function insertBetween(a: Vertex, b: Vertex, v: Vertex): void {
  // Insert v between a and b along a.next chain ordered by alpha.
  let cur = a;
  while (cur.next && cur.next !== b && cur.next.intersect && cur.next.alpha < v.alpha) {
    cur = cur.next;
  }
  v.next = cur.next;
  v.prev = cur;
  if (cur.next) cur.next.prev = v;
  cur.next = v;
}

/** Greiner–Hornmann clip. Returns result polygons. */
function gh(subject: P[], clip: P[], op: BooleanOp): P[][] {
  if (subject.length < 3 || clip.length < 3) return [];
  const s = buildList(subject);
  const c = buildList(clip);

  // 1. Find intersections.
  const sVerts = toArray(s);
  const cVerts = toArray(c);
  let found = false;
  for (const sv of sVerts) {
    if (sv.intersect) continue;
    const sNext = nextNonIntersect(sv);
    for (const cv of cVerts) {
      if (cv.intersect) continue;
      const cNext = nextNonIntersect(cv);
      const inter = segIntersect(sv, sNext, cv, cNext);
      if (!inter) continue;
      found = true;
      const iv1 = makeVertex(inter.x, inter.y);
      const iv2 = makeVertex(inter.x, inter.y);
      iv1.intersect = iv2.intersect = true;
      iv1.alpha = inter.alphaP;
      iv2.alpha = inter.alphaQ;
      iv1.neighbour = iv2;
      iv2.neighbour = iv1;
      insertBetween(sv, sNext, iv1);
      insertBetween(cv, cNext, iv2);
    }
  }

  if (!found) {
    // No crossings → trivial containment result.
    const subInClip = pointInPolygon(subject[0].x, subject[0].y, clip);
    const clipInSub = pointInPolygon(clip[0].x, clip[0].y, subject);
    switch (op) {
      case "union":
        if (subInClip) return [clip];
        if (clipInSub) return [subject];
        return [subject, clip];
      case "intersect":
        if (subInClip) return [subject];
        if (clipInSub) return [clip];
        return [];
      case "subtract":
        if (clipInSub) return [subject, clip.slice().reverse()]; // hole
        if (subInClip) return [];
        return [subject];
      case "exclude":
        return [subject, clip];
    }
  }

  // 2. Mark entry/exit. Traversal is fixed (forward on entry, backward on exit), so
  //    the op is encoded in the entry flags: intersect inverts neither, union inverts
  //    both, subtract (A−B) inverts only the subject (verified empirically).
  markEntryExit(s, clip, op === "union" || op === "subtract");
  markEntryExit(c, subject, op === "union");

  // 3. Trace result.
  return trace(toArray(s));
}

function nextNonIntersect(v: Vertex): Vertex {
  let n = v.next!;
  while (n.intersect) n = n.next!;
  return n;
}

// Label each intersection on this polygon as entry/exit into `otherPoly`. When we
// are currently OUTSIDE otherPoly, the next crossing is an entry. `invert` flips the
// sense for the union/subtract operands (see gh()).
function markEntryExit(start: Vertex, otherPoly: P[], invert: boolean): void {
  let inside = pointInPolygon(start.x, start.y, otherPoly);
  let v: Vertex | null = start;
  do {
    if (v!.intersect) {
      v!.entry = invert ? inside : !inside;
      inside = !inside;
    }
    v = v!.next;
  } while (v && v !== start);
}

function trace(sVerts: Vertex[]): P[][] {
  const results: P[][] = [];
  for (const startV of sVerts) {
    if (!startV.intersect || startV.visited) continue;
    const poly: P[] = [];
    let current: Vertex | null = startV;
    do {
      current!.visited = true;
      if (current!.neighbour) current!.neighbour.visited = true;
      poly.push({ x: current!.x, y: current!.y });
      if (current!.entry) {
        do {
          current = current!.next;
          poly.push({ x: current!.x, y: current!.y });
        } while (current && !current.intersect);
      } else {
        do {
          current = current!.prev;
          poly.push({ x: current!.x, y: current!.y });
        } while (current && !current.intersect);
      }
      if (!current) break;
      current = current.neighbour;
    } while (current && current !== startV && !current.visited);
    if (poly.length >= 3) results.push(poly);
  }
  return results;
}

function polygonsToPath(polys: P[][], fillRule: "nonzero" | "evenodd" = "evenodd"): VectorPath {
  const subpaths: VectorSubpath[] = polys
    .filter((p) => p.length >= 3)
    .map((poly) => ({
      anchors: poly.map<VectorAnchor>((p) => ({ x: p.x, y: p.y, handleType: "corner" })),
      closed: true,
    }));
  return { subpaths, fillRule };
}

/** Apply a boolean op to two paths, returning a new flattened VectorPath. */
export function booleanPaths(a: VectorPath, b: VectorPath, op: BooleanOp): VectorPath {
  const subject = largestPolygon(a);
  const clip = largestPolygon(b);
  if (op === "exclude") {
    // XOR ≈ (A−B) ∪ (B−A); approximate as both outlines with evenodd fill.
    return polygonsToPath([subject, clip], "evenodd");
  }
  const polys = gh(subject, clip, op);
  return polygonsToPath(polys, op === "subtract" ? "evenodd" : "nonzero");
}

/** Merge every subpath of every path into one multi-subpath VectorPath (lossless). */
export function flattenPaths(paths: VectorPath[]): VectorPath {
  const subpaths: VectorSubpath[] = [];
  for (const p of paths) for (const s of p.subpaths) subpaths.push({ anchors: s.anchors.map((a) => ({ ...a })), closed: s.closed });
  return { subpaths, fillRule: "evenodd" };
}
