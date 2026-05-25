import type { CanvasDocument, ElementNode, Point, Rect, ResizeHandle } from "./types";

export const MIN_ELEMENT_SIZE = 8;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function maxBorderRadiusForSize(width: number, height: number): number {
  return Math.max(0, Math.min(Math.abs(width), Math.abs(height)) / 2);
}

export function clampBorderRadiusForSize(radius: number, width: number, height: number): number {
  return clamp(radius, 0, maxBorderRadiusForSize(width, height));
}

export function roundPixel(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Snap a CSS pixel value to the precision the browser layout engine actually uses
 * (LayoutUnit in Blink/WebKit is 1/64 CSS px, applied with floor toward zero).
 *
 * The DOM renders `top: 8.3px` as 8.296875px internally; at 25x zoom that 1/64-step
 * difference becomes a visible viewport pixel offset between the DOM element and the
 * canvas overlay outline. Applying the same snap in JS makes the canvas-space rect
 * match exactly what the browser paints.
 */
export function snapToLayoutUnit(value: number): number {
  return Math.floor(value * 64) / 64;
}

export function roundAngle(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeAngle(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function angleBetweenPoints(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function angleDelta(startAngle: number, currentAngle: number): number {
  return ((currentAngle - startAngle + 540) % 360) - 180;
}

export function snapAngle(value: number, enabled: boolean, step = 15): number {
  if (!enabled) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

export function getRotatedRectCorners(rect: Rect, rotation: number): [Point, Point, Point, Point] {
  const center = {
    x: rectCenterX(rect),
    y: rectCenterY(rect)
  };

  return [
    { x: rect.x, y: rect.y },
    { x: rectRight(rect), y: rect.y },
    { x: rectRight(rect), y: rectBottom(rect) },
    { x: rect.x, y: rectBottom(rect) }
  ].map((corner) => rotatePoint(corner, center, rotation)) as [Point, Point, Point, Point];
}

export function getRotatedAABB(rect: Rect, rotation: number): Rect {
  const corners = getRotatedRectCorners(rect, rotation);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

export function clampRotatedRectToBounds(rect: Rect, rotation: number, bounds: Rect): Rect {
  const aabb = getRotatedAABB(rect, rotation);
  let dx = 0;
  let dy = 0;

  if (aabb.width > bounds.width) {
    dx = rectCenterX(bounds) - rectCenterX(aabb);
  } else if (aabb.x < bounds.x) {
    dx = bounds.x - aabb.x;
  } else if (rectRight(aabb) > rectRight(bounds)) {
    dx = rectRight(bounds) - rectRight(aabb);
  }

  if (aabb.height > bounds.height) {
    dy = rectCenterY(bounds) - rectCenterY(aabb);
  } else if (aabb.y < bounds.y) {
    dy = bounds.y - aabb.y;
  } else if (rectBottom(aabb) > rectBottom(bounds)) {
    dy = rectBottom(bounds) - rectBottom(aabb);
  }

  return {
    ...rect,
    x: rect.x + dx,
    y: rect.y + dy
  };
}

export function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

export function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

export function rectCenterX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

export function rectCenterY(rect: Rect): number {
  return rect.y + rect.height / 2;
}

export function getAbsoluteRect(document: CanvasDocument, id: string): Rect | null {
  const node = document.elements[id];
  if (!node) {
    return null;
  }

  let x = snapToLayoutUnit(node.x);
  let y = snapToLayoutUnit(node.y);
  let parentId = node.parentId;

  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) {
      break;
    }
    const bw = parent.styles.borderWidth ?? 0;
    x += snapToLayoutUnit(parent.x) + snapToLayoutUnit(bw);
    y += snapToLayoutUnit(parent.y) + snapToLayoutUnit(bw);
    parentId = parent.parentId;
  }

  return {
    x,
    y,
    width: snapToLayoutUnit(node.width),
    height: snapToLayoutUnit(node.height)
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

  // Start with the element's center in its parent's content-area space
  let cx = node.x + node.width / 2;
  let cy = node.y + node.height / 2;
  let parentId = node.parentId;

  while (parentId) {
    const parent = document.elements[parentId];
    if (!parent) break;

    // Content-area → border-box: shift by the parent's border so the point
    // is relative to the same origin CSS uses for transform-origin.
    const bw = parent.styles.borderWidth ?? 0;
    cx += bw;
    cy += bw;

    // Rotate around the border-box center (what CSS transform-origin uses)
    const rotated = rotatePoint(
      { x: cx, y: cy },
      { x: parent.width / 2, y: parent.height / 2 },
      parent.rotation
    );

    // Translate into the grandparent's content-area space
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
    height: node.height
  };
}

function transformElementPointToCanvas(document: CanvasDocument, id: string, point: Point): Point | null {
  let currentId: string | null = id;
  let transformed = { ...point };

  while (currentId) {
    const node: ElementNode | undefined = document.elements[currentId];
    if (!node) {
      return null;
    }

    const nodeWidth = snapToLayoutUnit(node.width);
    const nodeHeight = snapToLayoutUnit(node.height);
    transformed = rotatePoint(
      transformed,
      { x: nodeWidth / 2, y: nodeHeight / 2 },
      node.rotation
    );
    transformed = {
      x: transformed.x + snapToLayoutUnit(node.x),
      y: transformed.y + snapToLayoutUnit(node.y)
    };

    currentId = node.parentId;
    if (currentId) {
      const parent = document.elements[currentId];
      if (!parent) {
        return null;
      }
      const borderWidth = snapToLayoutUnit(parent.styles.borderWidth ?? 0);
      transformed = {
        x: transformed.x + borderWidth,
        y: transformed.y + borderWidth
      };
    }
  }

  return transformed;
}

export function getElementTransformedCorners(document: CanvasDocument, id: string): [Point, Point, Point, Point] | null {
  const node = document.elements[id];
  if (!node) {
    return null;
  }

  const w = snapToLayoutUnit(node.width);
  const h = snapToLayoutUnit(node.height);
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h }
  ].map((corner) => transformElementPointToCanvas(document, id, corner));

  if (corners.some((corner) => !corner)) {
    return null;
  }

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
    return {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height
    };
  }

  const parent = document.elements[node.parentId];
  const parentRect = getAbsoluteRect(document, node.parentId);
  if (!parentRect || !parent) {
    return {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height
    };
  }

  const bw = parent.styles.borderWidth ?? 0;
  return {
    x: parentRect.x,
    y: parentRect.y,
    width: Math.max(0, parentRect.width - bw * 2),
    height: Math.max(0, parentRect.height - bw * 2)
  };
}

export function getParentSize(document: CanvasDocument, id: string): { width: number; height: number } {
  const node = document.elements[id];
  if (!node?.parentId) {
    return {
      width: document.canvas.width,
      height: document.canvas.height
    };
  }
  const parent = document.elements[node.parentId];
  return {
    width: parent?.width ?? document.canvas.width,
    height: parent?.height ?? document.canvas.height
  };
}

export function getDescendantIds(document: CanvasDocument, id: string): string[] {
  const node = document.elements[id];
  if (!node) {
    return [];
  }

  const descendants: string[] = [];
  for (const childId of node.children) {
    descendants.push(childId, ...getDescendantIds(document, childId));
  }
  return descendants;
}

export function isDescendantOf(document: CanvasDocument, id: string, possibleAncestorId: string): boolean {
  let parentId = document.elements[id]?.parentId ?? null;
  while (parentId) {
    if (parentId === possibleAncestorId) {
      return true;
    }
    parentId = document.elements[parentId]?.parentId ?? null;
  }
  return false;
}

export function filterTopLevelIds(document: CanvasDocument, ids: string[]): string[] {
  const idSet = new Set(ids);
  return ids.filter((id) => {
    let parentId = document.elements[id]?.parentId ?? null;
    while (parentId) {
      if (idSet.has(parentId)) {
        return false;
      }
      parentId = document.elements[parentId]?.parentId ?? null;
    }
    return true;
  });
}

export function getCommonParentId(document: CanvasDocument, ids: string[]): string | null | undefined {
  if (ids.length === 0) {
    return undefined;
  }
  const first = document.elements[ids[0]]?.parentId ?? null;
  return ids.every((id) => (document.elements[id]?.parentId ?? null) === first) ? first : undefined;
}

export function getSelectionBox(document: CanvasDocument, ids: string[]): Rect | null {
  const rects = ids
    .map((id) => getAbsoluteRect(document, id))
    .filter((rect): rect is Rect => Boolean(rect));

  if (rects.length === 0) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map(rectRight));
  const bottom = Math.max(...rects.map(rectBottom));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function getElementAABB(document: CanvasDocument, id: string): Rect | null {
  const corners = getElementTransformedCorners(document, id);
  if (!corners) {
    return null;
  }
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

export function getSelectionAABB(document: CanvasDocument, ids: string[]): Rect | null {
  const rects = ids
    .map((id) => getElementAABB(document, id))
    .filter((rect): rect is Rect => Boolean(rect));

  if (rects.length === 0) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map(rectRight));
  const bottom = Math.max(...rects.map(rectBottom));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function clampRectToBounds(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(Math.max(rect.width, MIN_ELEMENT_SIZE), bounds.width);
  const height = Math.min(Math.max(rect.height, MIN_ELEMENT_SIZE), bounds.height);
  return {
    x: clamp(rect.x, bounds.x, rectRight(bounds) - width),
    y: clamp(rect.y, bounds.y, rectBottom(bounds) - height),
    width,
    height
  };
}

export function clampNodeRectToParent(document: CanvasDocument, id: string, rect: Rect): Rect {
  const bounds = getParentBounds(document, id);
  return clampRectToBounds(rect, bounds);
}

export function resizeBoxFromHandle(
  startBox: Rect,
  startPointer: Point,
  currentPointer: Point,
  handle: ResizeHandle,
  options: { shiftKey: boolean; altKey: boolean }
): Rect {
  const dx = currentPointer.x - startPointer.x;
  const dy = currentPointer.y - startPointer.y;
  const dirX = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const dirY = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const centerX = rectCenterX(startBox);
  const centerY = rectCenterY(startBox);
  const aspect = startBox.width / Math.max(startBox.height, 1);

  let width = dirX === 0 ? startBox.width : startBox.width + dx * dirX * (options.altKey ? 2 : 1);
  let height = dirY === 0 ? startBox.height : startBox.height + dy * dirY * (options.altKey ? 2 : 1);

  width = Math.max(width, MIN_ELEMENT_SIZE);
  height = Math.max(height, MIN_ELEMENT_SIZE);

  if (options.shiftKey) {
    if (dirX !== 0 && dirY !== 0) {
      const widthDelta = Math.abs(width - startBox.width);
      const heightDelta = Math.abs(height - startBox.height) * aspect;
      if (widthDelta >= heightDelta) {
        height = width / aspect;
      } else {
        width = height * aspect;
      }
    } else if (dirX !== 0) {
      height = width / aspect;
    } else if (dirY !== 0) {
      width = height * aspect;
    }
  }

  let x = startBox.x;
  let y = startBox.y;

  if (options.altKey) {
    x = centerX - width / 2;
    y = centerY - height / 2;
  } else {
    if (dirX < 0) {
      x = rectRight(startBox) - width;
    } else if (dirX === 0 && options.shiftKey && dirY !== 0) {
      x = centerX - width / 2;
    }

    if (dirY < 0) {
      y = rectBottom(startBox) - height;
    } else if (dirY === 0 && options.shiftKey && dirX !== 0) {
      y = centerY - height / 2;
    }
  }

  return {
    x,
    y,
    width,
    height
  };
}

export function isCornerResizeHandle(handle: ResizeHandle): boolean {
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw";
}

function oppositeCorner(rect: Rect, handle: ResizeHandle): Point {
  switch (handle) {
    case "nw":
      return { x: rectRight(rect), y: rectBottom(rect) };
    case "ne":
      return { x: rect.x, y: rectBottom(rect) };
    case "se":
      return { x: rect.x, y: rect.y };
    case "sw":
      return { x: rectRight(rect), y: rect.y };
    default:
      return { x: rect.x, y: rect.y };
  }
}

function fallbackHandleSign(handle: ResizeHandle): Point {
  return {
    x: handle.includes("w") ? -1 : 1,
    y: handle.includes("n") ? -1 : 1
  };
}

function projectOnRotatedAxes(vector: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const vx = -Math.sin(radians);
  const vy = Math.cos(radians);

  return {
    x: vector.x * ux + vector.y * uy,
    y: vector.x * vx + vector.y * vy
  };
}

function addRotatedVector(origin: Point, vector: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const vx = -Math.sin(radians);
  const vy = Math.cos(radians);

  return {
    x: origin.x + vector.x * ux + vector.y * vx,
    y: origin.y + vector.x * uy + vector.y * vy
  };
}

function constrainAspect(width: number, height: number, aspect: number): { width: number; height: number } {
  if (width / Math.max(height, 1) >= aspect) {
    return {
      width,
      height: width / aspect
    };
  }
  return {
    width: height * aspect,
    height
  };
}

export function resizeRotatedRectFromHandle(
  startRect: Rect,
  handle: ResizeHandle,
  currentPointer: Point,
  rotation: number,
  options: { shiftKey: boolean; altKey: boolean }
): Rect {
  const aspect = startRect.width / Math.max(startRect.height, 1);
  const startCenter = {
    x: rectCenterX(startRect),
    y: rectCenterY(startRect)
  };

  // --- Alt key: resize symmetrically from center ---
  if (options.altKey) {
    const projected = projectOnRotatedAxes(
      {
        x: currentPointer.x - startCenter.x,
        y: currentPointer.y - startCenter.y
      },
      rotation
    );

    const isEdge = !isCornerResizeHandle(handle);
    let width = isEdge && (handle === "n" || handle === "s")
      ? startRect.width
      : Math.max(Math.abs(projected.x) * 2, MIN_ELEMENT_SIZE);
    let height = isEdge && (handle === "e" || handle === "w")
      ? startRect.height
      : Math.max(Math.abs(projected.y) * 2, MIN_ELEMENT_SIZE);

    if (options.shiftKey) {
      ({ width, height } = constrainAspect(width, height, aspect));
    }

    return {
      x: startCenter.x - width / 2,
      y: startCenter.y - height / 2,
      width,
      height
    };
  }

  // --- Edge handles: only one axis changes ---
  if (!isCornerResizeHandle(handle)) {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // Determine the fixed edge midpoint in local space
    const isHoriz = handle === "e" || handle === "w";
    let fixedLocalX: number;
    let fixedLocalY: number;

    if (isHoriz) {
      fixedLocalX = handle === "e" ? startRect.x : rectRight(startRect);
      fixedLocalY = startRect.y + startRect.height / 2;
    } else {
      fixedLocalX = startRect.x + startRect.width / 2;
      fixedLocalY = handle === "s" ? startRect.y : rectBottom(startRect);
    }

    // Rotate fixed midpoint to world space
    const fixedWorld = rotatePoint({ x: fixedLocalX, y: fixedLocalY }, startCenter, rotation);

    // Project mouse vector from fixed point onto the relevant local axis
    const dx = currentPointer.x - fixedWorld.x;
    const dy = currentPointer.y - fixedWorld.y;

    if (isHoriz) {
      // Project onto element's local X axis (cos, sin)
      const proj = dx * cos + dy * sin;
      const sign = Math.sign(proj) || (handle === "e" ? 1 : -1);
      const width = Math.max(Math.abs(proj), MIN_ELEMENT_SIZE);
      const height = options.shiftKey ? width / aspect : startRect.height;

      // New center in world space: fixedWorld + (width/2) along local X axis
      const newCenterX = fixedWorld.x + (sign * width / 2) * cos;
      const newCenterY = fixedWorld.y + (sign * width / 2) * sin;

      return {
        x: newCenterX - width / 2,
        y: newCenterY - height / 2,
        width,
        height
      };
    } else {
      // Project onto element's local Y axis (-sin, cos)
      const proj = dx * (-sin) + dy * cos;
      const sign = Math.sign(proj) || (handle === "s" ? 1 : -1);
      const height = Math.max(Math.abs(proj), MIN_ELEMENT_SIZE);
      const width = options.shiftKey ? height * aspect : startRect.width;

      // New center in world space: fixedWorld + (height/2) along local Y axis
      const newCenterX = fixedWorld.x + (sign * height / 2) * (-sin);
      const newCenterY = fixedWorld.y + (sign * height / 2) * cos;

      return {
        x: newCenterX - width / 2,
        y: newCenterY - height / 2,
        width,
        height
      };
    }
  }

  // --- Corner handles ---
  const fixedCorner = oppositeCorner(startRect, handle);
  const fixedRotated = rotatePoint(fixedCorner, startCenter, rotation);
  const projected = projectOnRotatedAxes(
    {
      x: currentPointer.x - fixedRotated.x,
      y: currentPointer.y - fixedRotated.y
    },
    rotation
  );
  const fallbackSign = fallbackHandleSign(handle);
  const signX = Math.sign(projected.x) || fallbackSign.x;
  const signY = Math.sign(projected.y) || fallbackSign.y;
  let width = Math.max(Math.abs(projected.x), MIN_ELEMENT_SIZE);
  let height = Math.max(Math.abs(projected.y), MIN_ELEMENT_SIZE);

  if (options.shiftKey) {
    ({ width, height } = constrainAspect(width, height, aspect));
  }

  const adjustedDragged = addRotatedVector(
    fixedRotated,
    {
      x: signX * width,
      y: signY * height
    },
    rotation
  );
  const newCenter = {
    x: (fixedRotated.x + adjustedDragged.x) / 2,
    y: (fixedRotated.y + adjustedDragged.y) / 2
  };
  const newFixed = rotatePoint(fixedRotated, newCenter, -rotation);
  const newDragged = rotatePoint(adjustedDragged, newCenter, -rotation);
  const x = Math.min(newFixed.x, newDragged.x);
  const y = Math.min(newFixed.y, newDragged.y);

  return {
    x,
    y,
    width: Math.max(Math.abs(newDragged.x - newFixed.x), MIN_ELEMENT_SIZE),
    height: Math.max(Math.abs(newDragged.y - newFixed.y), MIN_ELEMENT_SIZE)
  };
}

export function rectFromPoints(start: Point, current: Point): Rect {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return {
    x,
    y,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y)
  };
}

export function isPointInElement(document: CanvasDocument, id: string, point: Point): boolean {
  const corners = getElementTransformedCorners(document, id);
  if (!corners) {
    return false;
  }

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
    if (hasPositive && hasNegative) {
      return false;
    }
  }

  return true;
}
