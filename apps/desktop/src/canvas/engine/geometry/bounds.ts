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
