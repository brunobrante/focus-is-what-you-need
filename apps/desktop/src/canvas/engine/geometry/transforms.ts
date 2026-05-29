import type { Point, Rect, ResizeHandle } from "../types";

export const MIN_ELEMENT_SIZE = 8;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
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
  if (!enabled) return value;
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
    y: center.y + dx * sin + dy * cos,
  };
}

export function getRotatedRectCorners(
  rect: Rect,
  rotation: number,
): [Point, Point, Point, Point] {
  const center = { x: rectCenterX(rect), y: rectCenterY(rect) };
  return [
    { x: rect.x, y: rect.y },
    { x: rectRight(rect), y: rect.y },
    { x: rectRight(rect), y: rectBottom(rect) },
    { x: rect.x, y: rectBottom(rect) },
  ].map((corner) => rotatePoint(corner, center, rotation)) as [Point, Point, Point, Point];
}

export function getRotatedAABB(rect: Rect, rotation: number): Rect {
  const corners = getRotatedRectCorners(rect, rotation);
  return bboxFromPoints(corners) ?? { x: 0, y: 0, width: 0, height: 0 };
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

  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export function bboxFromPoints(points: readonly Point[]): Rect | null {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = minX;
  let maxY = minY;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    else if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    else if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let left = rects[0].x;
  let top = rects[0].y;
  let right = left + rects[0].width;
  let bottom = top + rects[0].height;
  for (let i = 1; i < rects.length; i += 1) {
    const r = rects[i];
    if (r.x < left) left = r.x;
    if (r.y < top) top = r.y;
    const rRight = r.x + r.width;
    const rBottom = r.y + r.height;
    if (rRight > right) right = rRight;
    if (rBottom > bottom) bottom = rBottom;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
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

export function rectFromPoints(start: Point, current: Point): Rect {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  return { x, y, width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) };
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
  return { x: handle.includes("w") ? -1 : 1, y: handle.includes("n") ? -1 : 1 };
}

function projectOnRotatedAxes(vector: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const vx = -Math.sin(radians);
  const vy = Math.cos(radians);
  return { x: vector.x * ux + vector.y * uy, y: vector.x * vx + vector.y * vy };
}

function addRotatedVector(origin: Point, vector: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const vx = -Math.sin(radians);
  const vy = Math.cos(radians);
  return {
    x: origin.x + vector.x * ux + vector.y * vx,
    y: origin.y + vector.x * uy + vector.y * vy,
  };
}

function constrainAspect(
  width: number,
  height: number,
  aspect: number,
): { width: number; height: number } {
  if (width / Math.max(height, 1) >= aspect) {
    return { width, height: width / aspect };
  }
  return { width: height * aspect, height };
}

export function resizeBoxFromHandle(
  startBox: Rect,
  startPointer: Point,
  currentPointer: Point,
  handle: ResizeHandle,
  options: { shiftKey: boolean; altKey: boolean },
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

  return { x, y, width, height };
}

export function resizeRotatedRectFromHandle(
  startRect: Rect,
  handle: ResizeHandle,
  currentPointer: Point,
  rotation: number,
  options: { shiftKey: boolean; altKey: boolean },
): Rect {
  const aspect = startRect.width / Math.max(startRect.height, 1);
  const startCenter = { x: rectCenterX(startRect), y: rectCenterY(startRect) };

  if (options.altKey) {
    const projected = projectOnRotatedAxes(
      { x: currentPointer.x - startCenter.x, y: currentPointer.y - startCenter.y },
      rotation,
    );

    const isEdge = !isCornerResizeHandle(handle);
    let width =
      isEdge && (handle === "n" || handle === "s")
        ? startRect.width
        : Math.max(Math.abs(projected.x) * 2, MIN_ELEMENT_SIZE);
    let height =
      isEdge && (handle === "e" || handle === "w")
        ? startRect.height
        : Math.max(Math.abs(projected.y) * 2, MIN_ELEMENT_SIZE);

    if (options.shiftKey) {
      ({ width, height } = constrainAspect(width, height, aspect));
    }

    return { x: startCenter.x - width / 2, y: startCenter.y - height / 2, width, height };
  }

  if (!isCornerResizeHandle(handle)) {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

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

    const fixedWorld = rotatePoint({ x: fixedLocalX, y: fixedLocalY }, startCenter, rotation);
    const dx = currentPointer.x - fixedWorld.x;
    const dy = currentPointer.y - fixedWorld.y;

    if (isHoriz) {
      const proj = dx * cos + dy * sin;
      const sign = Math.sign(proj) || (handle === "e" ? 1 : -1);
      const width = Math.max(Math.abs(proj), MIN_ELEMENT_SIZE);
      const height = options.shiftKey ? width / aspect : startRect.height;

      const newCenterX = fixedWorld.x + ((sign * width) / 2) * cos;
      const newCenterY = fixedWorld.y + ((sign * width) / 2) * sin;

      return { x: newCenterX - width / 2, y: newCenterY - height / 2, width, height };
    } else {
      const proj = dx * -sin + dy * cos;
      const sign = Math.sign(proj) || (handle === "s" ? 1 : -1);
      const height = Math.max(Math.abs(proj), MIN_ELEMENT_SIZE);
      const width = options.shiftKey ? height * aspect : startRect.width;

      const newCenterX = fixedWorld.x + ((sign * height) / 2) * -sin;
      const newCenterY = fixedWorld.y + ((sign * height) / 2) * cos;

      return { x: newCenterX - width / 2, y: newCenterY - height / 2, width, height };
    }
  }

  const fixedCorner = oppositeCorner(startRect, handle);
  const fixedRotated = rotatePoint(fixedCorner, startCenter, rotation);
  const projected = projectOnRotatedAxes(
    { x: currentPointer.x - fixedRotated.x, y: currentPointer.y - fixedRotated.y },
    rotation,
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
    { x: signX * width, y: signY * height },
    rotation,
  );
  const newCenter = {
    x: (fixedRotated.x + adjustedDragged.x) / 2,
    y: (fixedRotated.y + adjustedDragged.y) / 2,
  };
  const newFixed = rotatePoint(fixedRotated, newCenter, -rotation);
  const newDragged = rotatePoint(adjustedDragged, newCenter, -rotation);
  const x = Math.min(newFixed.x, newDragged.x);
  const y = Math.min(newFixed.y, newDragged.y);

  return {
    x,
    y,
    width: Math.max(Math.abs(newDragged.x - newFixed.x), MIN_ELEMENT_SIZE),
    height: Math.max(Math.abs(newDragged.y - newFixed.y), MIN_ELEMENT_SIZE),
  };
}
