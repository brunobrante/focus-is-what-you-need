import type { CanvasDocument, ElementNode, Point, Rect } from "../types";
import {
  bboxFromPoints,
  clamp,
  MIN_ELEMENT_SIZE,
  rectBottom,
  rectCenterX,
  rectCenterY,
  rectRight,
  rotatePoint,
  snapToLayoutUnit,
  unionRects,
} from "./transforms";

export type ParentDistanceMeasurements = {
  parentRect: Rect;
  childRect: Rect;
  distances: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

// A single measured segment in canvas space (drawn as a line + px label).
export type MeasureSegment = {
  from: Point;
  to: Point;
  value: number;
  orientation: "horizontal" | "vertical";
};

/**
 * Distance measurements between two arbitrary rects (selection ↔ hovered
 * element, G12). Disjoint on an axis → one gap segment through the middle of
 * the shared band (or the source's center when the bands don't overlap);
 * containment → the four inset distances, like the parent measurements.
 */
export function getRectDistanceSegments(a: Rect, b: Rect): MeasureSegment[] {
  const aRight = rectRight(a);
  const aBottom = rectBottom(a);
  const bRight = rectRight(b);
  const bBottom = rectBottom(b);

  const contains = (outer: Rect, inner: Rect) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer);

  const insetSegments = (outer: Rect, inner: Rect): MeasureSegment[] => {
    const cx = rectCenterX(inner);
    const cy = rectCenterY(inner);
    return [
      { from: { x: cx, y: inner.y }, to: { x: cx, y: outer.y }, value: inner.y - outer.y, orientation: "vertical" },
      { from: { x: rectRight(inner), y: cy }, to: { x: rectRight(outer), y: cy }, value: rectRight(outer) - rectRight(inner), orientation: "horizontal" },
      { from: { x: cx, y: rectBottom(inner) }, to: { x: cx, y: rectBottom(outer) }, value: rectBottom(outer) - rectBottom(inner), orientation: "vertical" },
      { from: { x: inner.x, y: cy }, to: { x: outer.x, y: cy }, value: inner.x - outer.x, orientation: "horizontal" },
    ];
  };

  if (contains(b, a)) return insetSegments(b, a);
  if (contains(a, b)) return insetSegments(a, b);

  const segments: MeasureSegment[] = [];

  // Horizontal gap — measured through the middle of the vertical overlap band,
  // falling back to a's vertical center when the bands don't overlap.
  const bandY0 = Math.max(a.y, b.y);
  const bandY1 = Math.min(aBottom, bBottom);
  const y = bandY0 < bandY1 ? (bandY0 + bandY1) / 2 : rectCenterY(a);
  if (bRight <= a.x) {
    segments.push({ from: { x: a.x, y }, to: { x: bRight, y }, value: a.x - bRight, orientation: "horizontal" });
  } else if (b.x >= aRight) {
    segments.push({ from: { x: aRight, y }, to: { x: b.x, y }, value: b.x - aRight, orientation: "horizontal" });
  }

  // Vertical gap — symmetric.
  const bandX0 = Math.max(a.x, b.x);
  const bandX1 = Math.min(aRight, bRight);
  const x = bandX0 < bandX1 ? (bandX0 + bandX1) / 2 : rectCenterX(a);
  if (bBottom <= a.y) {
    segments.push({ from: { x, y: a.y }, to: { x, y: bBottom }, value: a.y - bBottom, orientation: "vertical" });
  } else if (b.y >= aBottom) {
    segments.push({ from: { x, y: aBottom }, to: { x, y: b.y }, value: b.y - aBottom, orientation: "vertical" });
  }

  return segments;
}

export function getAbsoluteRect(document: CanvasDocument, id: string): Rect | null {
  const node = document.elements[id];
  if (!node) return null;

  let x = snapToLayoutUnit(node.x);
  let y = snapToLayoutUnit(node.y);
  let parentId = node.parentId;

  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) break;
    const bw = parent.styles.borderWidth ?? 0;
    x += snapToLayoutUnit(parent.x) + snapToLayoutUnit(bw);
    y += snapToLayoutUnit(parent.y) + snapToLayoutUnit(bw);
    parentId = parent.parentId;
  }

  return {
    x,
    y,
    width: snapToLayoutUnit(node.width),
    height: snapToLayoutUnit(node.height),
  };
}

function getCanvasFrameRect(document: CanvasDocument): Rect {
  return {
    x: 0,
    y: 0,
    width: snapToLayoutUnit(document.canvas.width),
    height: snapToLayoutUnit(document.canvas.height),
  };
}

function getImmediateParentContentRect(document: CanvasDocument, id: string): Rect | null {
  const node = document.elements[id];
  if (!node) return null;
  if (!node.parentId) return getCanvasFrameRect(document);

  const parent = document.elements[node.parentId];
  if (!parent) return null;

  const parentRect = getAbsoluteRect(document, node.parentId);
  if (!parentRect) return null;

  const borderWidth = snapToLayoutUnit(parent.styles.borderWidth ?? 0);
  return {
    x: parentRect.x + borderWidth,
    y: parentRect.y + borderWidth,
    width: Math.max(0, parentRect.width - borderWidth * 2),
    height: Math.max(0, parentRect.height - borderWidth * 2),
  };
}

export function getParentDistanceMeasurements(
  document: CanvasDocument,
  selectedElementId: string,
): ParentDistanceMeasurements | null {
  const childRect = getAbsoluteRect(document, selectedElementId);
  const parentRect = getImmediateParentContentRect(document, selectedElementId);
  if (!childRect || !parentRect) return null;

  return {
    parentRect,
    childRect,
    distances: {
      top: Math.max(0, childRect.y - parentRect.y),
      right: Math.max(0, rectRight(parentRect) - rectRight(childRect)),
      bottom: Math.max(0, rectBottom(parentRect) - rectBottom(childRect)),
      left: Math.max(0, childRect.x - parentRect.x),
    },
  };
}

/**
 * Returns the visual center of an element in canvas space, correctly propagating
 * each ancestor's rotation so that children of rotated parents land in the right spot.
 *
 * CSS detail: children are positioned relative to the parent's **content area**
 * (inside the border), but `transform-origin: center center` rotates around the
 * **border-box** center.  We must offset by the parent's borderWidth before
 * rotating so the pivot point matches what the browser uses.
 */
export function getAbsoluteCenter(document: CanvasDocument, id: string): Point | null {
  const node = document.elements[id];
  if (!node) return null;

  let cx = node.x + node.width / 2;
  let cy = node.y + node.height / 2;
  let parentId = node.parentId;

  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) break;

    const bw = parent.styles.borderWidth ?? 0;
    cx += bw;
    cy += bw;

    const rotated = rotatePoint(
      { x: cx, y: cy },
      { x: parent.width / 2, y: parent.height / 2 },
      parent.rotation,
    );

    cx = parent.x + rotated.x;
    cy = parent.y + rotated.y;
    parentId = parent.parentId;
  }

  return { x: cx, y: cy };
}

/**
 * Returns a rect whose center is the element's true visual center in canvas space
 * (accounting for ancestor rotations) and whose size equals the element's own size.
 * Use this for display (selection outlines, hover outlines) instead of getAbsoluteRect
 * when any ancestor may be rotated.
 */
export function getVisualRect(document: CanvasDocument, id: string): Rect | null {
  const node = document.elements[id];
  if (!node) return null;
  const center = getAbsoluteCenter(document, id);
  if (!center) return null;
  return {
    x: center.x - node.width / 2,
    y: center.y - node.height / 2,
    width: node.width,
    height: node.height,
  };
}

function transformElementPointToCanvas(
  document: CanvasDocument,
  id: string,
  point: Point,
): Point | null {
  let currentId: string | null = id;
  let transformed = { ...point };

  while (currentId) {
    const node: ElementNode | undefined = document.elements[currentId];
    if (!node) return null;

    const nodeWidth = snapToLayoutUnit(node.width);
    const nodeHeight = snapToLayoutUnit(node.height);
    transformed = rotatePoint(
      transformed,
      { x: nodeWidth / 2, y: nodeHeight / 2 },
      node.rotation,
    );
    transformed = {
      x: transformed.x + snapToLayoutUnit(node.x),
      y: transformed.y + snapToLayoutUnit(node.y),
    };

    currentId = node.parentId;
    if (currentId) {
      const parent = document.elements[currentId];
      if (!parent) return null;
      const borderWidth = snapToLayoutUnit(parent.styles.borderWidth ?? 0);
      transformed = { x: transformed.x + borderWidth, y: transformed.y + borderWidth };
    }
  }

  return transformed;
}

export function getElementTransformedCorners(
  document: CanvasDocument,
  id: string,
): [Point, Point, Point, Point] | null {
  const node = document.elements[id];
  if (!node) return null;

  const w = snapToLayoutUnit(node.width);
  const h = snapToLayoutUnit(node.height);
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((corner) => transformElementPointToCanvas(document, id, corner));

  if (corners.some((corner) => !corner)) return null;
  return corners as [Point, Point, Point, Point];
}

/**
 * Returns the effective rotation of an element in canvas space — the sum of the
 * element's own rotation and every ancestor's rotation.
 */
export function getEffectiveRotation(document: CanvasDocument, id: string): number {
  const node = document.elements[id];
  if (!node) return 0;

  let rotation = node.rotation;
  let parentId = node.parentId;

  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) break;
    rotation += parent.rotation;
    parentId = parent.parentId;
  }

  return rotation;
}

/**
 * Inverse of {@link getAbsoluteCenter}: maps a canvas-space point into the
 * element's own parent-content-local space — the coordinate system in which
 * `node.x`/`node.y` are expressed — by undoing every ancestor's border offset,
 * rotation and translation from the root down. For a root element (no parent)
 * this is the identity, since its `x`/`y` are already canvas coordinates.
 *
 * Use this to convert a resized/edited element's new visual center back into a
 * storable `node.x`/`node.y` when any ancestor is rotated (M1/M2).
 */
export function canvasPointToParentContentSpace(
  document: CanvasDocument,
  id: string,
  point: Point,
): Point | null {
  const node = document.elements[id];
  if (!node) return null;

  // Ancestor chain, immediate parent → root.
  const chain: ElementNode[] = [];
  let parentId = node.parentId;
  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) return null;
    chain.push(parent);
    parentId = parent.parentId;
  }

  // Undo each ancestor step in reverse order (root → immediate parent), mirroring
  // the forward chain in getAbsoluteCenter: translate by −(x,y), rotate by −θ about
  // the ancestor's border-box center, then subtract the ancestor's border offset.
  let p = { x: point.x, y: point.y };
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const a = chain[i];
    p = { x: p.x - a.x, y: p.y - a.y };
    p = rotatePoint(p, { x: a.width / 2, y: a.height / 2 }, -a.rotation);
    const bw = a.styles.borderWidth ?? 0;
    p = { x: p.x - bw, y: p.y - bw };
  }
  return p;
}

/**
 * Exact element-local → canvas transform (accumulated ancestor border offset,
 * rotation and translation plus the element's own rotation), with no layout-unit
 * snapping — so it matches where the element (and its inner SVG) actually renders.
 * Element-local space has the element's box at (0,0)–(width,height). Used for path
 * anchor/handle mapping (M2). Null on a broken ancestor chain.
 */
export function elementLocalToCanvas(
  document: CanvasDocument,
  id: string,
  point: Point,
): Point | null {
  let currentId: string | null = id;
  let p = { x: point.x, y: point.y };
  while (currentId) {
    const node: ElementNode | undefined = document.elements[currentId];
    if (!node) return null;
    p = rotatePoint(p, { x: node.width / 2, y: node.height / 2 }, node.rotation);
    p = { x: p.x + node.x, y: p.y + node.y };
    currentId = node.parentId;
    if (currentId) {
      const parent = document.elements[currentId];
      if (!parent) return null;
      const bw = parent.styles.borderWidth ?? 0;
      p = { x: p.x + bw, y: p.y + bw };
    }
  }
  return p;
}

/** Exact inverse of {@link elementLocalToCanvas}: canvas → element-local space. */
export function canvasToElementLocal(
  document: CanvasDocument,
  id: string,
  point: Point,
): Point | null {
  const node = document.elements[id];
  if (!node) return null;
  const pc = canvasPointToParentContentSpace(document, id, point);
  if (!pc) return null;
  const q = { x: pc.x - node.x, y: pc.y - node.y };
  return rotatePoint(q, { x: node.width / 2, y: node.height / 2 }, -node.rotation);
}

export function getParentBounds(document: CanvasDocument, id: string): Rect {
  const node = document.elements[id];
  if (!node?.parentId) {
    return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
  }

  const parent = document.elements[node.parentId];
  const parentRect = getAbsoluteRect(document, node.parentId);
  if (!parentRect || !parent) {
    return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
  }

  const bw = parent.styles.borderWidth ?? 0;
  return {
    x: parentRect.x,
    y: parentRect.y,
    width: Math.max(0, parentRect.width - bw * 2),
    height: Math.max(0, parentRect.height - bw * 2),
  };
}

export function getParentSize(
  document: CanvasDocument,
  id: string,
): { width: number; height: number } {
  const node = document.elements[id];
  if (!node?.parentId) {
    return { width: document.canvas.width, height: document.canvas.height };
  }
  const parent = document.elements[node.parentId];
  return {
    width: parent?.width ?? document.canvas.width,
    height: parent?.height ?? document.canvas.height,
  };
}

export function getDescendantIds(document: CanvasDocument, id: string): string[] {
  const node = document.elements[id];
  if (!node) return [];
  const descendants: string[] = [];
  for (const childId of node.children) {
    descendants.push(childId, ...getDescendantIds(document, childId));
  }
  return descendants;
}

export function isDescendantOf(
  document: CanvasDocument,
  id: string,
  possibleAncestorId: string,
): boolean {
  let parentId = document.elements[id]?.parentId ?? null;
  while (parentId) {
    if (parentId === possibleAncestorId) return true;
    parentId = document.elements[parentId]?.parentId ?? null;
  }
  return false;
}

// Returns the outermost linked-instance ancestor of `id` (or `id` itself when it is
// an instance). Null when `id` is not part of any linked instance. Used to keep an
// instance read-only as a single unit: selecting anything inside it resolves to the
// instance root (see Versioning.md §2 — instances are read-only; detach to edit).
export function getInstanceRootId(
  document: CanvasDocument,
  id: string | null,
): string | null {
  if (!id) return null;
  let current: string | null = id;
  let outermost: string | null = null;
  while (current) {
    const node = document.elements[current];
    if (!node) break;
    if (node.instanceOf) outermost = current;
    current = node.parentId ?? null;
  }
  return outermost;
}

// True when `id` lives INSIDE a linked instance (has an instance ancestor strictly
// above it). The instance root itself returns false — it is editable as a whole, while
// its children are read-only (see Versioning.md §3.2).
export function isInsideInstance(document: CanvasDocument, id: string | null): boolean {
  if (!id) return false;
  let parentId = document.elements[id]?.parentId ?? null;
  while (parentId) {
    if (document.elements[parentId]?.instanceOf) return true;
    parentId = document.elements[parentId]?.parentId ?? null;
  }
  return false;
}

export function filterTopLevelIds(document: CanvasDocument, ids: string[]): string[] {
  const idSet = new Set(ids);
  return ids.filter((id) => {
    let parentId = document.elements[id]?.parentId ?? null;
    while (parentId) {
      if (idSet.has(parentId)) return false;
      parentId = document.elements[parentId]?.parentId ?? null;
    }
    return true;
  });
}

export function getCommonParentId(
  document: CanvasDocument,
  ids: string[],
): string | null | undefined {
  if (ids.length === 0) return undefined;
  const first = document.elements[ids[0]]?.parentId ?? null;
  return ids.every((id) => (document.elements[id]?.parentId ?? null) === first) ? first : undefined;
}

export function getSelectionBox(document: CanvasDocument, ids: string[]): Rect | null {
  const rects: Rect[] = [];
  for (const id of ids) {
    const rect = getAbsoluteRect(document, id);
    if (rect) rects.push(rect);
  }
  return unionRects(rects);
}

export function getElementAABB(document: CanvasDocument, id: string): Rect | null {
  const corners = getElementTransformedCorners(document, id);
  if (!corners) return null;
  return bboxFromPoints(corners);
}

export function getSelectionAABB(document: CanvasDocument, ids: string[]): Rect | null {
  const rects: Rect[] = [];
  for (const id of ids) {
    const rect = getElementAABB(document, id);
    if (rect) rects.push(rect);
  }
  return unionRects(rects);
}

export function clampRectToBounds(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(Math.max(rect.width, MIN_ELEMENT_SIZE), bounds.width);
  const height = Math.min(Math.max(rect.height, MIN_ELEMENT_SIZE), bounds.height);
  return {
    x: clamp(rect.x, bounds.x, rectRight(bounds) - width),
    y: clamp(rect.y, bounds.y, rectBottom(bounds) - height),
    width,
    height,
  };
}

export function clampNodeRectToParent(document: CanvasDocument, id: string, rect: Rect): Rect {
  const bounds = getParentBounds(document, id);
  return clampRectToBounds(rect, bounds);
}

export function isPointInElement(
  document: CanvasDocument,
  id: string,
  point: Point,
): boolean {
  const node = document.elements[id];
  if (!node || node.width <= 0 || node.height <= 0) return false;
  const corners = getElementTransformedCorners(document, id);
  if (!corners) return false;

  let hasPositive = false;
  let hasNegative = false;
  const epsilon = 0.0001;

  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross > epsilon) {
      hasPositive = true;
    } else if (cross < -epsilon) {
      hasNegative = true;
    }
    if (hasPositive && hasNegative) return false;
  }

  return true;
}
