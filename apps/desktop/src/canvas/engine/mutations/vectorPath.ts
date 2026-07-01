// Pure, immutable anchor/handle mutations on a `path` element. Each returns a NEW
// CanvasDocument (existing mutation style). Anchor coordinates are in the node's
// intrinsic viewBox space (see vector/vectorGeometry.ts).

import type { CanvasDocument, ElementNode, VectorAnchor, VectorPath } from "../types";
import { cloneDocument } from "./coreUtils";
import { pathBounds } from "../vector/pathData";
import { pathScale } from "../vector/vectorGeometry";

function getPathNode(doc: CanvasDocument, id: string): ElementNode | null {
  const node = doc.elements[id];
  return node && node.type === "path" ? node : null;
}

function emptyPath(): VectorPath {
  return { subpaths: [{ anchors: [], closed: false }] };
}

/** Create a path node skeleton (used by the pen tool on first click). */
export function makePathNode(
  id: string,
  x: number,
  y: number,
  styles: ElementNode["styles"],
  name = "Path",
): ElementNode {
  return {
    id,
    type: "path",
    parentId: null,
    children: [],
    name,
    x,
    y,
    width: 1,
    height: 1,
    rotation: 0,
    visible: true,
    locked: false,
    styles,
    viewBox: { width: 1, height: 1 },
    path: emptyPath(),
  };
}

/**
 * Deep-clone a path with every anchor + handle multiplied by (sx, sy). Used to
 * BAKE a box resize into path-local coordinates (Penpot's model): the scale is
 * absorbed into the geometry instead of being left on the element, so the stroke
 * never distorts on a non-uniform resize. The result is a fresh object graph —
 * safe to assign onto a shallow-cloned node without mutating the source. See B1.
 */
export function scaledPath(path: VectorPath, sx: number, sy: number): VectorPath {
  return {
    ...path,
    subpaths: path.subpaths.map((sub) => ({
      ...sub,
      anchors: sub.anchors.map((a) => {
        const na: VectorAnchor = { ...a, x: a.x * sx, y: a.y * sy };
        if (a.inX !== undefined) na.inX = a.inX * sx;
        if (a.inY !== undefined) na.inY = a.inY * sy;
        if (a.outX !== undefined) na.outX = a.outX * sx;
        if (a.outY !== undefined) na.outY = a.outY * sy;
        return na;
      }),
    })),
  };
}

/** Append an anchor to the end of a subpath. */
export function appendAnchor(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  anchor: VectorAnchor,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  const path = node.path ?? emptyPath();
  const sub = path.subpaths[subpathIndex];
  if (!sub) return doc;
  sub.anchors.push(anchor);
  node.path = path;
  return next;
}

/** Move an anchor or one of its handles. `patch` is merged onto the anchor. */
export function updateAnchor(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  index: number,
  patch: Partial<VectorAnchor>,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  const sub = node.path?.subpaths[subpathIndex];
  const anchor = sub?.anchors[index];
  if (!anchor) return doc;
  Object.assign(anchor, patch);
  return next;
}

// Apply handle continuity: when dragging the OUT handle of a non-corner anchor,
// "mirrored" mirrors the IN handle exactly, "asymmetric" only matches direction.
function applyContinuity(anchor: VectorAnchor, dragged: "in" | "out"): void {
  const type = anchor.handleType ?? "corner";
  if (type === "corner") return;
  const src = dragged === "out" ? { x: anchor.outX ?? 0, y: anchor.outY ?? 0 } : { x: anchor.inX ?? 0, y: anchor.inY ?? 0 };
  if (type === "mirrored") {
    if (dragged === "out") { anchor.inX = -src.x; anchor.inY = -src.y; }
    else { anchor.outX = -src.x; anchor.outY = -src.y; }
    return;
  }
  // asymmetric: keep the opposite handle's length, align its direction to -src.
  const len = Math.hypot(src.x, src.y);
  if (len === 0) return;
  const ux = -src.x / len, uy = -src.y / len;
  if (dragged === "out") {
    const oppLen = Math.hypot(anchor.inX ?? 0, anchor.inY ?? 0) || len;
    anchor.inX = ux * oppLen; anchor.inY = uy * oppLen;
  } else {
    const oppLen = Math.hypot(anchor.outX ?? 0, anchor.outY ?? 0) || len;
    anchor.outX = ux * oppLen; anchor.outY = uy * oppLen;
  }
}

/** Move one handle and propagate continuity to the opposite handle. */
export function updateHandle(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  index: number,
  which: "in" | "out",
  relX: number,
  relY: number,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  const anchor = node.path?.subpaths[subpathIndex]?.anchors[index];
  if (!anchor) return doc;
  if (which === "out") { anchor.outX = relX; anchor.outY = relY; }
  else { anchor.inX = relX; anchor.inY = relY; }
  applyContinuity(anchor, which);
  return next;
}

/**
 * Split a segment at parameter t (0..1), inserting an anchor ON the curve without
 * changing its shape. A straight segment gets a plain corner. A curved segment is
 * split with De Casteljau: the two neighbours' facing handles are shortened and the
 * new anchor receives the exact in/out tangents so the drawn curve is identical.
 */
export function insertAnchorOnSegment(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  segIndex: number,
  t: number,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  const sub = node.path?.subpaths[subpathIndex];
  if (!sub) return doc;
  const from = sub.anchors[segIndex];
  const to = sub.anchors[(segIndex + 1) % sub.anchors.length];
  if (!from || !to) return doc;

  const curved =
    from.outX !== undefined || from.outY !== undefined || to.inX !== undefined || to.inY !== undefined;
  if (!curved) {
    // Straight segment: the split point is a plain linear interpolation; neighbours
    // stay untouched and the new anchor is a corner.
    const newAnchor: VectorAnchor = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      handleType: "corner",
    };
    sub.anchors.splice(segIndex + 1, 0, newAnchor);
    return next;
  }

  // Cubic control polygon in absolute coordinates.
  const p0 = { x: from.x, y: from.y };
  const p1 = { x: from.x + (from.outX ?? 0), y: from.y + (from.outY ?? 0) };
  const p2 = { x: to.x + (to.inX ?? 0), y: to.y + (to.inY ?? 0) };
  const p3 = { x: to.x, y: to.y };
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123); // the point on the curve at t

  // Rewrite the two neighbours' facing handles (De Casteljau leaves the rest intact).
  from.outX = p01.x - from.x;
  from.outY = p01.y - from.y;
  to.inX = p23.x - to.x;
  to.inY = p23.y - to.y;

  // The new anchor's tangents are collinear (curve is continuous) but generally of
  // unequal length → asymmetric.
  const newAnchor: VectorAnchor = {
    x: mid.x,
    y: mid.y,
    inX: p012.x - mid.x,
    inY: p012.y - mid.y,
    outX: p123.x - mid.x,
    outY: p123.y - mid.y,
    handleType: "asymmetric",
  };
  sub.anchors.splice(segIndex + 1, 0, newAnchor);
  return next;
}

/** Remove an anchor; drops the subpath if it falls below 1 anchor. */
export function deleteAnchor(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  index: number,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  const path = node.path;
  const sub = path?.subpaths[subpathIndex];
  if (!path || !sub) return doc;
  sub.anchors.splice(index, 1);
  if (sub.anchors.length === 0) path.subpaths.splice(subpathIndex, 1);
  return next;
}

export function closeSubpath(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  closed = true,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const sub = next.elements[id].path?.subpaths[subpathIndex];
  if (!sub) return doc;
  sub.closed = closed;
  return next;
}

export function setHandleType(
  doc: CanvasDocument,
  id: string,
  subpathIndex: number,
  index: number,
  type: NonNullable<VectorAnchor["handleType"]>,
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const anchor = next.elements[id].path?.subpaths[subpathIndex]?.anchors[index];
  if (!anchor) return doc;
  anchor.handleType = type;
  if (type === "corner") {
    delete anchor.inX; delete anchor.inY; delete anchor.outX; delete anchor.outY;
  } else if (type === "mirrored") {
    // Mirror IN from OUT (or vice-versa) so both sides are symmetric.
    if (anchor.outX !== undefined || anchor.outY !== undefined) {
      anchor.inX = -(anchor.outX ?? 0); anchor.inY = -(anchor.outY ?? 0);
    } else if (anchor.inX !== undefined || anchor.inY !== undefined) {
      anchor.outX = -(anchor.inX ?? 0); anchor.outY = -(anchor.inY ?? 0);
    }
  }
  return next;
}

export function setFillRule(
  doc: CanvasDocument,
  id: string,
  fillRule: "nonzero" | "evenodd",
): CanvasDocument {
  if (!getPathNode(doc, id)) return doc;
  const next = cloneDocument(doc);
  const node = next.elements[id];
  if (node.path) node.path.fillRule = fillRule;
  return next;
}

/**
 * Normalize node.viewBox to the path's tight anchor bbox and re-base anchors so
 * move/resize/rotate keep working through the existing pipeline. Preserves the
 * visual position + canvas-space scale (px-per-viewBox-unit).
 */
export function recomputePathBounds(doc: CanvasDocument, id: string): CanvasDocument {
  const source = getPathNode(doc, id);
  if (!source || !source.path) return doc;
  const hasAnchors = source.path.subpaths.some((s) => s.anchors.length > 0);
  if (!hasAnchors) return doc;
  const { sx, sy } = pathScale(source);
  const b = pathBounds(source.path);
  const newVbW = Math.max(1, b.maxX - b.minX);
  const newVbH = Math.max(1, b.maxY - b.minY);

  const next = cloneDocument(doc);
  const node = next.elements[id];
  const path = node.path!;
  for (const sub of path.subpaths) {
    for (const a of sub.anchors) {
      a.x -= b.minX;
      a.y -= b.minY;
    }
  }
  node.viewBox = { width: newVbW, height: newVbH };
  node.width = sx * newVbW;
  node.height = sy * newVbH;
  node.x += b.minX * sx;
  node.y += b.minY * sy;
  return next;
}
