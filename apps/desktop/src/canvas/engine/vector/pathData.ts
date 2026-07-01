// Pure codec between our structured VectorPath (the edit source of truth) and the
// SVG `d` attribute (the render form + import form). No I/O, no DOM.
//
// Anchors store handles RELATIVE to the anchor (inX/inY, outX/outY). The `d`
// string uses absolute cubic control points, so conversion adds/subtracts the
// anchor position on each side.

import type { VectorAnchor, VectorPath, VectorSubpath } from "../types";

// The `d`-string serializer is pure and shared with the persisted htmlScene format,
// so it lives in the domain layer; re-export it so engine call sites are unchanged.
export { pathToSvgPathData } from "@/domain/canvas/vector";

// ─── Parsing ────────────────────────────────────────────────────────────────────

const NUMBER_RE = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

type Token = { cmd: string; args: number[] };

function tokenize(d: string): Token[] {
  const tokens: Token[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    const cmd = match[1];
    const nums = match[2].match(NUMBER_RE)?.map(Number) ?? [];
    tokens.push({ cmd, args: nums });
  }
  return tokens;
}

// Arc → cubic bezier segments (endpoint-parameterization, per SVG impl notes).
function arcToCubics(
  x1: number, y1: number,
  rx: number, ry: number,
  phiDeg: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number,
): Array<[number, number, number, number, number, number]> {
  if (rx === 0 || ry === 0) return [[x2, y2, x2, y2, x2, y2]]; // degenerate → line-ish cubic
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxAbs *= s;
    ryAbs *= s;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const num = rxAbs * rxAbs * ryAbs * ryAbs - rxAbs * rxAbs * y1p * y1p - ryAbs * ryAbs * x1p * x1p;
  const den = rxAbs * rxAbs * y1p * y1p + ryAbs * ryAbs * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * (rxAbs * y1p)) / ryAbs;
  const cyp = (co * -(ryAbs * x1p)) / rxAbs;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs);
  let dTheta = angle((x1p - cxp) / rxAbs, (y1p - cyp) / ryAbs, (-x1p - cxp) / rxAbs, (-y1p - cyp) / ryAbs);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segCount;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: Array<[number, number, number, number, number, number]> = [];
  let theta = theta1;
  for (let i = 0; i < segCount; i++) {
    const thetaNext = theta + delta;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const cosN = Math.cos(thetaNext), sinN = Math.sin(thetaNext);
    const p0x = cx + rxAbs * cosT * cosP - ryAbs * sinT * sinP;
    const p0y = cy + rxAbs * cosT * sinP + ryAbs * sinT * cosP;
    const p3x = cx + rxAbs * cosN * cosP - ryAbs * sinN * sinP;
    const p3y = cy + rxAbs * cosN * sinP + ryAbs * sinN * cosP;
    const d0x = -rxAbs * sinT * cosP - ryAbs * cosT * sinP;
    const d0y = -rxAbs * sinT * sinP + ryAbs * cosT * cosP;
    const d3x = -rxAbs * sinN * cosP - ryAbs * cosN * sinP;
    const d3y = -rxAbs * sinN * sinP + ryAbs * cosN * cosP;
    out.push([p0x + t * d0x, p0y + t * d0y, p3x - t * d3x, p3y - t * d3y, p3x, p3y]);
    theta = thetaNext;
  }
  return out;
}

// Attach a cubic from the current anchor to a new anchor, storing relative handles.
function pushCubic(
  anchors: VectorAnchor[],
  c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number,
): void {
  const prev = anchors[anchors.length - 1];
  if (prev) {
    prev.outX = c1x - prev.x;
    prev.outY = c1y - prev.y;
    if (prev.handleType === undefined) prev.handleType = "asymmetric";
  }
  anchors.push({ x: ex, y: ey, inX: c2x - ex, inY: c2y - ey, handleType: "asymmetric" });
}

/**
 * Parse an SVG `d` string into a VectorPath. Handles M m L l H h V v C c S s Q q
 * T t A a Z z (quadratics promoted to cubics, arcs flattened to cubics).
 */
export function svgPathDataToPath(d: string, fillRule?: "nonzero" | "evenodd"): VectorPath {
  const subpaths: VectorSubpath[] = [];
  let anchors: VectorAnchor[] = [];
  let startX = 0, startY = 0;
  let curX = 0, curY = 0;
  let prevCmd = "";
  let prevC2x = 0, prevC2y = 0; // reflection point for S
  let prevQx = 0, prevQy = 0; // reflection point for T

  const flush = (closed: boolean) => {
    if (anchors.length > 0) subpaths.push({ anchors, closed });
    anchors = [];
  };

  for (const { cmd, args } of tokenize(d)) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    let i = 0;
    const take = () => args[i++];
    if (C === "Z") {
      flush(true);
      curX = startX;
      curY = startY;
      prevCmd = C;
      continue;
    }
    do {
      switch (C) {
        case "M": {
          let mx = take(), my = take();
          if (rel) { mx += curX; my += curY; }
          // A new M starts a fresh subpath. Subsequent coordinate pairs are L.
          if (anchors.length > 0) flush(false);
          curX = startX = mx; curY = startY = my;
          anchors.push({ x: curX, y: curY, handleType: "corner" });
          // Following pairs in the same M token behave as lineto.
          while (i < args.length) {
            let lx = take(), ly = take();
            if (rel) { lx += curX; ly += curY; }
            curX = lx; curY = ly;
            anchors.push({ x: curX, y: curY, handleType: "corner" });
          }
          break;
        }
        case "L": {
          let lx = take(), ly = take();
          if (rel) { lx += curX; ly += curY; }
          curX = lx; curY = ly;
          anchors.push({ x: curX, y: curY, handleType: "corner" });
          break;
        }
        case "H": {
          let hx = take();
          if (rel) hx += curX;
          curX = hx;
          anchors.push({ x: curX, y: curY, handleType: "corner" });
          break;
        }
        case "V": {
          let vy = take();
          if (rel) vy += curY;
          curY = vy;
          anchors.push({ x: curX, y: curY, handleType: "corner" });
          break;
        }
        case "C": {
          let c1x = take(), c1y = take(), c2x = take(), c2y = take(), ex = take(), ey = take();
          if (rel) { c1x += curX; c1y += curY; c2x += curX; c2y += curY; ex += curX; ey += curY; }
          pushCubic(anchors, c1x, c1y, c2x, c2y, ex, ey);
          prevC2x = c2x; prevC2y = c2y;
          curX = ex; curY = ey;
          break;
        }
        case "S": {
          let c2x = take(), c2y = take(), ex = take(), ey = take();
          if (rel) { c2x += curX; c2y += curY; ex += curX; ey += curY; }
          const reflect = prevCmd === "C" || prevCmd === "S";
          const c1x = reflect ? 2 * curX - prevC2x : curX;
          const c1y = reflect ? 2 * curY - prevC2y : curY;
          pushCubic(anchors, c1x, c1y, c2x, c2y, ex, ey);
          prevC2x = c2x; prevC2y = c2y;
          curX = ex; curY = ey;
          break;
        }
        case "Q": {
          let qx = take(), qy = take(), ex = take(), ey = take();
          if (rel) { qx += curX; qy += curY; ex += curX; ey += curY; }
          // Quadratic → cubic.
          const c1x = curX + (2 / 3) * (qx - curX);
          const c1y = curY + (2 / 3) * (qy - curY);
          const c2x = ex + (2 / 3) * (qx - ex);
          const c2y = ey + (2 / 3) * (qy - ey);
          pushCubic(anchors, c1x, c1y, c2x, c2y, ex, ey);
          prevQx = qx; prevQy = qy;
          curX = ex; curY = ey;
          break;
        }
        case "T": {
          let ex = take(), ey = take();
          if (rel) { ex += curX; ey += curY; }
          const reflect = prevCmd === "Q" || prevCmd === "T";
          const qx = reflect ? 2 * curX - prevQx : curX;
          const qy = reflect ? 2 * curY - prevQy : curY;
          const c1x = curX + (2 / 3) * (qx - curX);
          const c1y = curY + (2 / 3) * (qy - curY);
          const c2x = ex + (2 / 3) * (qx - ex);
          const c2y = ey + (2 / 3) * (qy - ey);
          pushCubic(anchors, c1x, c1y, c2x, c2y, ex, ey);
          prevQx = qx; prevQy = qy;
          curX = ex; curY = ey;
          break;
        }
        case "A": {
          const rx = take(), ry = take(), rot = take();
          const large = take() !== 0, sweep = take() !== 0;
          let ex = take(), ey = take();
          if (rel) { ex += curX; ey += curY; }
          for (const c of arcToCubics(curX, curY, rx, ry, rot, large, sweep, ex, ey)) {
            pushCubic(anchors, c[0], c[1], c[2], c[3], c[4], c[5]);
          }
          curX = ex; curY = ey;
          break;
        }
        default:
          i = args.length; // unknown — skip
      }
      prevCmd = C;
    } while (i < args.length && C !== "M");
  }
  flush(false);
  return { subpaths, ...(fillRule ? { fillRule } : {}) };
}

// ─── Bounds + sampling helpers (used by edit mode / bounds recompute) ────────────

/** Sample a point on the cubic between two anchors at parameter t ∈ [0,1]. */
export function sampleSegment(from: VectorAnchor, to: VectorAnchor, t: number): { x: number; y: number } {
  const p0x = from.x, p0y = from.y;
  const p1x = from.x + (from.outX ?? 0), p1y = from.y + (from.outY ?? 0);
  const p2x = to.x + (to.inX ?? 0), p2y = to.y + (to.inY ?? 0);
  const p3x = to.x, p3y = to.y;
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0x + b * p1x + c * p2x + d * p3x,
    y: a * p0y + b * p1y + c * p2y + d * p3y,
  };
}

/** Tight bounding box over every anchor + sampled segment. */
export function pathBounds(path: VectorPath): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const sub of path.subpaths) {
    const { anchors, closed } = sub;
    for (const a of anchors) acc(a.x, a.y);
    const pairs = closed ? anchors.length : anchors.length - 1;
    for (let i = 0; i < pairs; i++) {
      const from = anchors[i];
      const to = anchors[(i + 1) % anchors.length];
      if (!from || !to) continue;
      if (from.outX === undefined && from.outY === undefined && to.inX === undefined && to.inY === undefined) {
        continue; // straight segment — endpoints already accounted for
      }
      for (let s = 1; s < 16; s++) {
        const p = sampleSegment(from, to, s / 16);
        acc(p.x, p.y);
      }
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
