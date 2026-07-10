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
