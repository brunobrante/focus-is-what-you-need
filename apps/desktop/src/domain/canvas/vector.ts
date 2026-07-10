// Pure vector-path data model + `d`-string codec, shared by the engine (edit
// source of truth) and the persisted htmlScene format (so a scene can round-trip
// vector nodes). No DOM, no I/O. The engine re-exports these from
// `canvas/engine/types` and `canvas/engine/vector/pathData` so existing call
// sites keep their imports; the parse/bounds helpers stay in the engine module.

export type VectorAnchor = {
  x: number;
  y: number;
  inX?: number; // in-handle, relative to anchor (absent = corner)
  inY?: number;
  outX?: number; // out-handle, relative to anchor
  outY?: number;
  handleType?: "corner" | "mirrored" | "asymmetric"; // continuity when dragging a handle
  // Variable-width multiplier at this anchor (1 = base strokeWidth). When any anchor
  // sets a non-1 width, the stroke is rendered as a filled outline (see
  // variableWidthOutline) instead of a uniform SVG stroke.
  width?: number;
};

export type VectorSubpath = { anchors: VectorAnchor[]; closed: boolean };

export type VectorPath = {
  subpaths: VectorSubpath[];
  fillRule?: "nonzero" | "evenodd"; // default "nonzero"
};

// ─── Serialize VectorPath → SVG `d` ────────────────────────────────────────────

const fmt = (n: number): string => {
  // Trim noise from float math without forcing a fixed precision on round values.
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

function anchorHasOut(a: VectorAnchor): boolean {
  return a.outX !== undefined || a.outY !== undefined;
}
function anchorHasIn(a: VectorAnchor): boolean {
  return a.inX !== undefined || a.inY !== undefined;
}

function segment(from: VectorAnchor, to: VectorAnchor): string {
  if (anchorHasOut(from) || anchorHasIn(to)) {
    const c1x = from.x + (from.outX ?? 0);
    const c1y = from.y + (from.outY ?? 0);
    const c2x = to.x + (to.inX ?? 0);
    const c2y = to.y + (to.inY ?? 0);
    return `C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(to.x)} ${fmt(to.y)}`;
  }
  return `L ${fmt(to.x)} ${fmt(to.y)}`;
}

function subpathToData(subpath: VectorSubpath): string {
  const { anchors, closed } = subpath;
  if (anchors.length === 0) return "";
  const parts: string[] = [`M ${fmt(anchors[0].x)} ${fmt(anchors[0].y)}`];
  for (let i = 1; i < anchors.length; i++) {
    parts.push(segment(anchors[i - 1], anchors[i]));
  }
  if (closed && anchors.length > 1) {
    parts.push(segment(anchors[anchors.length - 1], anchors[0]));
    parts.push("Z");
  }
  return parts.join(" ");
}

/** Serialize a VectorPath to an SVG `d` attribute. */
export function pathToSvgPathData(path: VectorPath | undefined): string {
  if (!path) return "";
  return path.subpaths.map(subpathToData).filter(Boolean).join(" ");
}

// ─── Variable-width stroke outline ─────────────────────────────────────────────

/** True when any anchor carries a non-default width multiplier. */
export function pathHasVariableWidth(path: VectorPath | undefined): boolean {
  if (!path) return false;
  return path.subpaths.some((sub) => sub.anchors.some((a) => a.width !== undefined && a.width !== 1));
}

// Cubic/linear point on a segment at t (self-contained so this stays I/O-free).
function pointOnSegment(from: VectorAnchor, to: VectorAnchor, t: number): { x: number; y: number } {
  const hasOut = from.outX !== undefined || from.outY !== undefined;
  const hasIn = to.inX !== undefined || to.inY !== undefined;
  if (!hasOut && !hasIn) {
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }
  const p0x = from.x, p0y = from.y;
  const p1x = from.x + (from.outX ?? 0), p1y = from.y + (from.outY ?? 0);
  const p2x = to.x + (to.inX ?? 0), p2y = to.y + (to.inY ?? 0);
  const p3x = to.x, p3y = to.y;
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * p0x + b * p1x + c * p2x + d * p3x,
    y: a * p0y + b * p1y + c * p2y + d * p3y,
  };
}

/**
 * Build a filled-outline `d` for a variable-width stroke (Figma's Variable width).
 * SVG has no native variable-width stroke, so the centerline is sampled, offset to
 * both sides by (strokeWidth/2 · anchor-width, interpolated along each segment), and
 * closed into a ribbon polygon per OPEN subpath. Closed subpaths are left to the
 * normal uniform stroke. Returns null when the path has no variable width or the
 * base stroke is zero — callers then render the ordinary stroked path.
 */
export function variableWidthOutline(path: VectorPath | undefined, strokeWidth: number): string | null {
  if (!path || strokeWidth <= 0 || !pathHasVariableWidth(path)) return null;
  const halfBase = strokeWidth / 2;
  const SAMPLES = 14;
  const parts: string[] = [];

  for (const sub of path.subpaths) {
    if (sub.closed) continue; // ribbons only for open subpaths
    const anchors = sub.anchors;
    if (anchors.length < 2) continue;

    const pts: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i], b = anchors[i + 1];
      const wa = a.width ?? 1, wb = b.width ?? 1;
      for (let s = 0; s <= SAMPLES; s++) {
        if (i > 0 && s === 0) continue; // skip the duplicated shared anchor
        const t = s / SAMPLES;
        const p = pointOnSegment(a, b, t);
        pts.push({ x: p.x, y: p.y, w: (wa + (wb - wa) * t) * halfBase });
      }
    }
    if (pts.length < 2) continue;

    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const nx = -ty, ny = tx; // left-hand normal
      left.push({ x: pts[i].x + nx * pts[i].w, y: pts[i].y + ny * pts[i].w });
      right.push({ x: pts[i].x - nx * pts[i].w, y: pts[i].y - ny * pts[i].w });
    }
    const poly = [...left, ...right.reverse()];
    const d = [`M ${fmt(poly[0].x)} ${fmt(poly[0].y)}`];
    for (let i = 1; i < poly.length; i++) d.push(`L ${fmt(poly[i].x)} ${fmt(poly[i].y)}`);
    d.push("Z");
    parts.push(d.join(" "));
  }
  return parts.length ? parts.join(" ") : null;
}

/**
 * True when every subpath closes, so the path encloses an area.
 *
 * Stroke alignment is only meaningful on a closed path: Inside/Outside are defined
 * against an interior, and clipping or masking an open path would silently treat it
 * as closed. Open paths are pinned to Center (F3).
 */
export function pathIsClosed(path: VectorPath | undefined): boolean {
  if (!path || path.subpaths.length === 0) return false;
  return path.subpaths.every((subpath) => subpath.closed && subpath.anchors.length > 1);
}
