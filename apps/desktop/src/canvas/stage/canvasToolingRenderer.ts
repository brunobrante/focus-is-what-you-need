import type { CanvasDocument, Point, Rect, SnapGuide } from "@/canvas/engine/types";
import {
  bboxFromPoints,
  getElementAABB,
  getElementTransformedCorners,
  maxBorderRadiusForSize,
} from "@/canvas/engine/geometry";
import {
  canvasPointToViewport,
  canvasRectToViewport as transformCanvasRectToViewport,
  type ViewportTransform,
} from "@/canvas/engine/viewport";
import type { ToolingBoxCommand } from "./toolingRenderAdapter";

export type { ViewportTransform } from "@/canvas/engine/viewport";

export const SELECTION_COLOR = "#0d99ff";
// Linked instances (external components) select in purple to distinguish them from
// editable content — outline and resize handles alike.
export const INSTANCE_SELECTION_COLOR = "#8638E5";
export const HOVER_COLOR = "rgba(13, 153, 255, 0.55)";
export const GROUP_FILL = "rgba(13, 153, 255, 0.06)";
const GUIDE_COLOR = "#ff2ca8";
const MARQUEE_FILL = "rgba(13, 153, 255, 0.08)";
const DROP_FILL = "rgba(13, 153, 255, 0.07)";

export const HANDLE_SIZE = 8;
const HANDLE_FILL = "#ffffff";
const HANDLE_BORDER_RADIUS = 2;

export const RADIUS_HANDLE_SIZE = 8;
export const RADIUS_MIN_OFFSET = 12;
export const RADIUS_MIN_ELEMENT_SCREEN = 24;

export const ROTATION_OFFSET = 4;
export const ROTATION_SIZE = 14;

export const EDGE_THICKNESS = 6;

export type PixelScale = {
  x: number;
  y: number;
};

export type OutlineRect = {
  x: number;
  y: number;
  right: number;
  bottom: number;
};

export type OutlineSegments = {
  top: Rect;
  bottom: Rect;
  left: Rect;
  right: Rect;
};

export type ToolingBox = ToolingBoxCommand;

export function canvasToViewport(cx: number, cy: number, t: ViewportTransform): Point {
  return canvasPointToViewport({ x: cx, y: cy }, t);
}

export function canvasRectToViewport(rect: Rect, t: ViewportTransform): Rect {
  return transformCanvasRectToViewport(rect, t);
}

function rectFromPoints(points: Point[]): Rect {
  return bboxFromPoints(points) ?? { x: 0, y: 0, width: 0, height: 0 };
}

export function rectToToolingBox(rect: Rect): ToolingBox {
  return {
    rect,
    corners: [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
  };
}

export function elementToViewportBox(
  doc: CanvasDocument,
  id: string,
  t: ViewportTransform,
): ToolingBox | null {
  const canvasCorners = getElementTransformedCorners(doc, id);
  if (!canvasCorners) return null;

  const corners = canvasCorners.map((corner) => canvasPointToViewport(corner, t)) as [
    Point,
    Point,
    Point,
    Point,
  ];
  return {
    rect: rectFromPoints(corners),
    corners,
  };
}

export function canvasPaintRectToViewport(rect: Rect, t: ViewportTransform): Rect {
  // The DOM scene is scaled by CSS transform, so fractional canvas-space bounds
  // must be scaled exactly. Rounding before zoom amplifies 0.01px drag values
  // into visible gaps at high zoom. The selection outline is drawn from these
  // exact viewport-space floats.
  return canvasRectToViewport(rect, t);
}

export function elementToViewportRect(
  doc: CanvasDocument,
  id: string,
  t: ViewportTransform,
): Rect | null {
  const aabb = getElementAABB(doc, id);
  if (!aabb) return null;
  return canvasRectToViewport(aabb, t);
}

export function elementToPaintViewportRect(
  doc: CanvasDocument,
  id: string,
  t: ViewportTransform,
): Rect | null {
  const aabb = getElementAABB(doc, id);
  if (!aabb) return null;
  return canvasPaintRectToViewport(aabb, t);
}

function normalizedVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.0001) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

export function getToolingBoxRotation(box: ToolingBox): number {
  const [nw, ne] = box.corners;
  return (Math.atan2(ne.y - nw.y, ne.x - nw.x) * 180) / Math.PI;
}

export function getRadiusHandlePositions(
  rect: Rect,
  radius: number,
  zoom: number,
  minOffset = RADIUS_MIN_OFFSET,
): Point[] {
  const radiusPx = radius * Math.max(zoom, 0.0001);
  const maxOffset = maxBorderRadiusForSize(rect.width, rect.height);
  const offset = Math.min(Math.max(radiusPx, minOffset), maxOffset);
  return [
    { x: rect.x + offset, y: rect.y + offset },
    { x: rect.x + rect.width - offset, y: rect.y + offset },
    { x: rect.x + rect.width - offset, y: rect.y + rect.height - offset },
    { x: rect.x + offset, y: rect.y + rect.height - offset },
  ];
}

export function getOrientedRadiusHandlePositions(
  box: ToolingBox,
  radius: number,
  zoom: number,
  minOffset = RADIUS_MIN_OFFSET,
): Point[] {
  const [nw, ne, se, sw] = box.corners;
  const ux = normalizedVector(nw, ne);
  const uy = normalizedVector(nw, sw);
  const width = Math.hypot(ne.x - nw.x, ne.y - nw.y);
  const height = Math.hypot(sw.x - nw.x, sw.y - nw.y);
  const radiusPx = radius * Math.max(zoom, 0.0001);
  const maxOffset = maxBorderRadiusForSize(width, height);
  const offset = Math.min(Math.max(radiusPx, minOffset), maxOffset);

  return [
    {
      x: nw.x + ux.x * offset + uy.x * offset,
      y: nw.y + ux.y * offset + uy.y * offset,
    },
    {
      x: ne.x - ux.x * offset + uy.x * offset,
      y: ne.y - ux.y * offset + uy.y * offset,
    },
    {
      x: se.x - ux.x * offset - uy.x * offset,
      y: se.y - ux.y * offset - uy.y * offset,
    },
    {
      x: sw.x + ux.x * offset - uy.x * offset,
      y: sw.y + ux.y * offset - uy.y * offset,
    },
  ];
}

/**
 * Snaps a rect to the device-pixel grid using an *inward* round so the snapped
 * rect represents the device-pixel-aligned area that the DOM element fully
 * covers (everything outside this rect is either antialias or background).
 *
 * Why this matters: the DOM element edge is at sub-pixel position
 * `rect.x * dpr` device-px. The browser rasterizes that edge with antialias
 * over the col containing it. If we instead snapped to integer CSS px
 * (`Math.round`), then on Retina (dpr=2) the canvas stroke could land 1
 * device-px off from the antialias col — visible as a thin fringe of element
 * color escaping the selection outline at high zoom.
 *
 * Used together with `containmentOutlineSegments`, which draws the stroke
 * immediately *outside* this inner rect so it covers the antialias.
 */
export function snapOutlineRect(
  rect: Rect,
  pixelScale: PixelScale = {
    x: globalThis.devicePixelRatio || 1,
    y: globalThis.devicePixelRatio || 1,
  },
): OutlineRect {
  const sx = pixelScale.x > 0 ? pixelScale.x : 1;
  const sy = pixelScale.y > 0 ? pixelScale.y : 1;
  return {
    x: Math.ceil(rect.x * sx) / sx,
    y: Math.ceil(rect.y * sy) / sy,
    right: Math.floor((rect.x + rect.width) * sx) / sx,
    bottom: Math.floor((rect.y + rect.height) * sy) / sy,
  };
}

export function outsideOutlineSegments(
  rect: Rect,
  lineWidth = 1,
): OutlineSegments | null {
  const width = rect.right - rect.x;
  const height = rect.bottom - rect.y;
  if (width <= 0 || height <= 0) return null;

  return {
    top: {
      x: rect.x - lineWidth,
      y: rect.y - lineWidth,
      width: width + lineWidth * 2,
      height: lineWidth,
    },
    bottom: {
      x: rect.x - lineWidth,
      y: rect.bottom,
      width: width + lineWidth * 2,
      height: lineWidth,
    },
    left: {
      x: rect.x - lineWidth,
      y: rect.y,
      width: lineWidth,
      height,
    },
    right: {
      x: rect.right,
      y: rect.y,
      width: lineWidth,
      height,
    },
  };
}

/**
 * Returns the 4 fill rects that make up a 1-CSS-px stroke drawn *immediately
 * outside* the device-pixel-snapped inner rect.
 *
 * The previous implementation drew the stroke *inside* the snapped rect using
 * `Math.round` for the snap. On Chrome/WebKit at high zoom on Retina, that
 * round could land the canvas stroke 1 device-pixel away from the DOM
 * element's antialiased edge, leaving a visible fringe of element color
 * outside the selection outline. Drawing outside the *device-pixel*-snapped
 * inner rect covers the antialias instead of bordering it.
 */
export function containmentOutlineSegments(
  rect: Rect,
  pixelScale: PixelScale = {
    x: globalThis.devicePixelRatio || 1,
    y: globalThis.devicePixelRatio || 1,
  },
  lineWidth = 1,
): OutlineSegments | null {
  if (rect.width <= 0 || rect.height <= 0 || lineWidth <= 0) return null;

  const snapped = snapOutlineRect(rect, pixelScale);
  return outsideOutlineSegments(snapped, lineWidth);
}

function drawOutlineRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  lineWidth = 1,
  _pixelScale: PixelScale = {
    x: globalThis.devicePixelRatio || 1,
    y: globalThis.devicePixelRatio || 1,
  },
): void {
  const segments = containmentOutlineSegments(rect, _pixelScale, lineWidth);
  if (!segments) return;

  ctx.fillStyle = color;
  ctx.fillRect(segments.top.x, segments.top.y, segments.top.width, segments.top.height);
  ctx.fillRect(
    segments.bottom.x,
    segments.bottom.y,
    segments.bottom.width,
    segments.bottom.height,
  );
  ctx.fillRect(segments.left.x, segments.left.y, segments.left.width, segments.left.height);
  ctx.fillRect(segments.right.x, segments.right.y, segments.right.width, segments.right.height);
}

export function drawOutline(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  pixelScale?: PixelScale,
): void {
  drawOutlineRect(ctx, rect, color, 1, pixelScale);
}

export function drawGroupOutline(ctx: CanvasRenderingContext2D, rect: Rect, pixelScale?: PixelScale): void {
  ctx.fillStyle = GROUP_FILL;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  drawOutlineRect(ctx, rect, SELECTION_COLOR, 1, pixelScale);
}

function edgeMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function resolveHandlePoints(box: ToolingBox): Point[] {
  const [nw, ne, se, sw] = box.corners;
  const allowed = box.allowedHandles;
  if (!allowed) return [nw, ne, se, sw];
  const positions: Record<string, Point> = {
    nw, ne, se, sw,
    n: edgeMidpoint(nw, ne),
    e: edgeMidpoint(ne, se),
    s: edgeMidpoint(se, sw),
    w: edgeMidpoint(sw, nw),
  };
  return allowed.map((h) => positions[h]).filter(Boolean) as Point[];
}

export function drawResizeHandles(ctx: CanvasRenderingContext2D, box: ToolingBox): void {
  const half = HANDLE_SIZE / 2;
  ctx.fillStyle = HANDLE_FILL;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  for (const pos of resolveHandlePoints(box)) {
    ctx.beginPath();
    ctx.roundRect(pos.x - half, pos.y - half, HANDLE_SIZE, HANDLE_SIZE, HANDLE_BORDER_RADIUS);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawRadiusHandles(
  ctx: CanvasRenderingContext2D,
  positions: Point[],
  opacity = 1,
): void {
  const r = RADIUS_HANDLE_SIZE / 2;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = HANDLE_FILL;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1;
  for (const pos of positions) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: SnapGuide[],
  t: ViewportTransform,
): void {
  ctx.strokeStyle = GUIDE_COLOR;
  ctx.lineWidth = 1;
  for (const guide of guides) {
    const from = Math.min(guide.from, guide.to);
    const to = Math.max(guide.from, guide.to);
    ctx.beginPath();
    if (guide.orientation === "vertical") {
      const p1 = canvasToViewport(guide.position, from, t);
      const p2 = canvasToViewport(guide.position, to, t);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    } else {
      const p1 = canvasToViewport(from, guide.position, t);
      const p2 = canvasToViewport(to, guide.position, t);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
  }
}

export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  t: ViewportTransform,
  pixelScale?: PixelScale,
): void {
  const vp = canvasRectToViewport(rect, t);
  ctx.fillStyle = MARQUEE_FILL;
  ctx.fillRect(vp.x, vp.y, vp.width, vp.height);
  drawOutlineRect(ctx, vp, SELECTION_COLOR, 1, pixelScale);
}

export function drawDropTarget(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  borderRadius: number,
  displayZoom: number,
): void {
  const r = Math.min(borderRadius * displayZoom, maxBorderRadiusForSize(rect.width, rect.height));
  ctx.fillStyle = DROP_FILL;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r);
  ctx.fill();
  drawDashedOutlineRect(ctx, rect, SELECTION_COLOR);
}

function drawDashedOutlineRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  dashLength = 4,
  gapLength = 4,
  lineWidth = 1,
): void {
  const segments = containmentOutlineSegments(rect, undefined, lineWidth);
  if (!segments) return;

  ctx.fillStyle = color;
  drawDashedHorizontalSegment(ctx, segments.top, dashLength, gapLength);
  drawDashedHorizontalSegment(ctx, segments.bottom, dashLength, gapLength);
  drawDashedVerticalSegment(ctx, segments.left, dashLength, gapLength);
  drawDashedVerticalSegment(ctx, segments.right, dashLength, gapLength);
}

function drawDashedHorizontalSegment(
  ctx: CanvasRenderingContext2D,
  segment: Rect,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.width) {
    const width = Math.min(dashLength, segment.width - offset);
    ctx.fillRect(segment.x + offset, segment.y, width, segment.height);
    offset += dashLength + gapLength;
  }
}

function drawDashedVerticalSegment(
  ctx: CanvasRenderingContext2D,
  segment: Rect,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.height) {
    const height = Math.min(dashLength, segment.height - offset);
    ctx.fillRect(segment.x, segment.y + offset, segment.width, height);
    offset += dashLength + gapLength;
  }
}
