import type { Canvas, CanvasKit, Font, Paint, Path } from "canvaskit-wasm";
import { maxBorderRadiusForSize } from "@/canvas/engine/geometry";
import type { Point, Rect, SnapGuide } from "@/canvas/engine/types";
import { canvasPointToViewport } from "@/canvas/engine/viewport";
import {
  HANDLE_SIZE,
  RADIUS_HANDLE_SIZE,
  SELECTION_COLOR,
  containmentOutlineSegments,
} from "./canvasToolingRenderer";
import { PaintPool } from "./skiaColor";
import type {
  ToolingBoxCommand,
  ToolingDropTargetCommand,
  ToolingGhostCommand,
  ToolingOutlineCommand,
  ToolingPathEditCommand,
  ToolingRadiusLabelCommand,
  ToolingRenderFrame,
  ToolingSizeLabelCommand,
} from "./toolingRenderAdapter";

const HANDLE_FILL = "#ffffff";
// Drag ghost for invisible elements: a soft blue drop shadow under a faint
// surface, framed with a dashed selection-blue outline.
const GHOST_FILL = "rgba(13, 153, 255, 0.10)";
const GHOST_SHADOW_OFFSET_Y = 4;
const HANDLE_BORDER_RADIUS = 2;
const GUIDE_COLOR = "#ff2ca8";
const DROP_INSERT_FILL = "rgba(13, 153, 255, 0.07)";
const DROP_DETACH_COLOR = "#ff453a";
const DROP_DETACH_FILL = "rgba(255, 69, 58, 0.08)";
const PARENT_DISTANCE_COLOR = "#ff7a00";
const PARENT_DISTANCE_TEXT_COLOR = "#ffffff";
const PARENT_DISTANCE_LABEL_HEIGHT = 18;
const PARENT_DISTANCE_LABEL_RADIUS = 4;
const PARENT_DISTANCE_LABEL_PADDING_X = 6;
const PARENT_DISTANCE_LABEL_MARGIN = 4;
const PARENT_DISTANCE_SHORT_LABEL_OFFSET = 8;

// Selection value tags (size + radius). These mirror, pixel-for-pixel, the DOM
// `.selection-size-tag` / `.radius-value-tag` rules in editor.css — geometry,
// 4px corner radius, white 700-weight 11px text, and the drop shadow.
const VALUE_LABEL_TEXT_COLOR = "#ffffff";
const VALUE_LABEL_RADIUS = 4;
// box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28). A CSS blur radius of 12px maps to a
// Gaussian standard deviation of 6 (blur / 2), which is Skia's blur sigma.
const VALUE_LABEL_SHADOW_OFFSET_Y = 4;

const SIZE_LABEL_HEIGHT = 22;
const SIZE_LABEL_MIN_WIDTH = 48;
const SIZE_LABEL_MAX_WIDTH = 160;
const SIZE_LABEL_PADDING_X = 8;

const RADIUS_LABEL_HEIGHT = 20;
const RADIUS_LABEL_MIN_WIDTH = 36;
const RADIUS_LABEL_PADDING_X = 6;

export function drawOutline(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  outline: ToolingOutlineCommand,
): void {
  const rect = outline.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return;

  if (outline.fill) {
    drawFilledRect(ck, canvas, pool, rect, outline.fill);
  }

  if (outline.corners && !isAxisAlignedBox(outline.rect, outline.corners)) {
    drawPolygonOutline(ck, canvas, pool, outline.corners, outline.color);
    return;
  }

  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  const paint = pool.getFill(outline.color);
  drawFilledRectWithPaint(ck, canvas, segments.top, paint);
  drawFilledRectWithPaint(ck, canvas, segments.bottom, paint);
  drawFilledRectWithPaint(ck, canvas, segments.left, paint);
  drawFilledRectWithPaint(ck, canvas, segments.right, paint);
}

export function isAxisAlignedBox(rect: Rect, corners: [Point, Point, Point, Point]): boolean {
  const epsilon = 0.01;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  return corners.every((corner) => {
    const onX = Math.abs(corner.x - left) <= epsilon || Math.abs(corner.x - right) <= epsilon;
    const onY = Math.abs(corner.y - top) <= epsilon || Math.abs(corner.y - bottom) <= epsilon;
    return onX && onY;
  });
}

export function drawPolygonOutline(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  corners: [Point, Point, Point, Point],
  color: string,
): void {
  const paint = pool.getStroke(color, 1);
  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    canvas.drawLine(from.x, from.y, to.x, to.y, paint);
  }
}

export function resolveSkiaHandlePoints(box: ToolingBoxCommand): Point[] {
  const [nw, ne, se, sw] = box.corners;
  const allowed = box.allowedHandles;
  if (!allowed) return [nw, ne, se, sw];
  const positions: Record<string, Point> = {
    nw, ne, se, sw,
    n: { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 },
    e: { x: (ne.x + se.x) / 2, y: (ne.y + se.y) / 2 },
    s: { x: (se.x + sw.x) / 2, y: (se.y + sw.y) / 2 },
    w: { x: (sw.x + nw.x) / 2, y: (sw.y + nw.y) / 2 },
  };
  return allowed.map((h) => positions[h]).filter(Boolean) as Point[];
}

export function drawResizeHandles(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  box: ToolingBoxCommand,
): void {
  const half = HANDLE_SIZE / 2;
  const fillPaint = pool.getFill(HANDLE_FILL);
  const strokePaint = pool.getStroke(box.color ?? SELECTION_COLOR, 1);

  for (const pos of resolveSkiaHandlePoints(box)) {
    const handleRect = {
      x: pos.x - half,
      y: pos.y - half,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    };
    drawRoundRectWithPaint(ck, canvas, handleRect, HANDLE_BORDER_RADIUS, fillPaint);
    drawRoundRectWithPaint(ck, canvas, handleRect, HANDLE_BORDER_RADIUS, strokePaint);
  }
}

export function drawRadiusHandles(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  positions: Point[],
): void {
  const radius = RADIUS_HANDLE_SIZE / 2;
  const fillPaint = pool.getFill(HANDLE_FILL);
  const strokePaint = pool.getStroke(SELECTION_COLOR, 1);
  for (const pos of positions) {
    canvas.drawCircle(pos.x, pos.y, radius, fillPaint);
    canvas.drawCircle(pos.x, pos.y, radius, strokePaint);
  }
}

const ANCHOR_SIZE = 7;
const ANCHOR_RADIUS = 1.5;
const HANDLE_KNOB_RADIUS = 3.5;
const CLOSE_TARGET_RADIUS = 6;

// Anchor/handle affordances for path edit mode. Segment skeleton first (the
// blue polylines connecting the anchors), then handle lines + knobs, then
// anchor squares on top, then the close-target ring.
export function drawPathEdit(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  cmd: ToolingPathEditCommand,
): void {
  const linePaint = pool.getStroke(SELECTION_COLOR, 1);
  const knobFill = pool.getFill(HANDLE_FILL);
  const knobStroke = pool.getStroke(SELECTION_COLOR, 1);
  const half = ANCHOR_SIZE / 2;

  if (cmd.segments.length > 0) {
    const skeleton = new ck.Path();
    try {
      for (const samples of cmd.segments) {
        if (samples.length < 2) continue;
        skeleton.moveTo(samples[0].x, samples[0].y);
        for (let i = 1; i < samples.length; i++) skeleton.lineTo(samples[i].x, samples[i].y);
      }
      canvas.drawPath(skeleton, linePaint);
    } finally {
      skeleton.delete();
    }
  }

  for (const a of cmd.anchors) {
    if (a.inHandle) {
      canvas.drawLine(a.point.x, a.point.y, a.inHandle.x, a.inHandle.y, linePaint);
      canvas.drawCircle(a.inHandle.x, a.inHandle.y, HANDLE_KNOB_RADIUS, knobFill);
      canvas.drawCircle(a.inHandle.x, a.inHandle.y, HANDLE_KNOB_RADIUS, knobStroke);
    }
    if (a.outHandle) {
      canvas.drawLine(a.point.x, a.point.y, a.outHandle.x, a.outHandle.y, linePaint);
      canvas.drawCircle(a.outHandle.x, a.outHandle.y, HANDLE_KNOB_RADIUS, knobFill);
      canvas.drawCircle(a.outHandle.x, a.outHandle.y, HANDLE_KNOB_RADIUS, knobStroke);
    }
  }

  for (const a of cmd.anchors) {
    const rect = { x: a.point.x - half, y: a.point.y - half, width: ANCHOR_SIZE, height: ANCHOR_SIZE };
    if (a.selected) {
      drawRoundRectWithPaint(ck, canvas, rect, ANCHOR_RADIUS, pool.getFill(SELECTION_COLOR));
      drawRoundRectWithPaint(ck, canvas, rect, ANCHOR_RADIUS, pool.getStroke(HANDLE_FILL, 1));
    } else {
      drawRoundRectWithPaint(ck, canvas, rect, ANCHOR_RADIUS, knobFill);
      drawRoundRectWithPaint(ck, canvas, rect, ANCHOR_RADIUS, pool.getStroke(SELECTION_COLOR, 1));
    }
  }

  if (cmd.closeTarget) {
    canvas.drawCircle(cmd.closeTarget.x, cmd.closeTarget.y, CLOSE_TARGET_RADIUS, pool.getStroke(SELECTION_COLOR, 1.5));
  }
}

export function drawGuide(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  guide: SnapGuide,
  t: ToolingRenderFrame["viewportTransform"],
): void {
  const from = Math.min(guide.from, guide.to);
  const to = Math.max(guide.from, guide.to);
  const p1 =
    guide.orientation === "vertical"
      ? canvasPointToViewport({ x: guide.position, y: from }, t)
      : canvasPointToViewport({ x: from, y: guide.position }, t);
  const p2 =
    guide.orientation === "vertical"
      ? canvasPointToViewport({ x: guide.position, y: to }, t)
      : canvasPointToViewport({ x: to, y: guide.position }, t);

  const paint = pool.getStroke(GUIDE_COLOR, 1);
  canvas.drawLine(p1.x, p1.y, p2.x, p2.y, paint);
}

export function drawGhost(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  command: ToolingGhostCommand,
  shadowPaint: Paint,
): void {
  const { rect, corners } = command;
  if (rect.width <= 0 || rect.height <= 0) return;

  const rotated = Boolean(corners && !isAxisAlignedBox(rect, corners));

  if (rotated && corners) {
    const path = pathFromCorners(ck, corners);
    try {
      const shadow = pathFromCorners(ck, corners, GHOST_SHADOW_OFFSET_Y);
      try {
        canvas.drawPath(shadow, shadowPaint);
      } finally {
        shadow.delete();
      }
      canvas.drawPath(path, pool.getFill(GHOST_FILL));
    } finally {
      path.delete();
    }
    drawPolygonOutline(ck, canvas, pool, corners, SELECTION_COLOR);
    return;
  }

  const radius = Math.min(
    command.borderRadius * command.displayZoom,
    maxBorderRadiusForSize(rect.width, rect.height),
  );
  drawRoundRectWithPaint(
    ck,
    canvas,
    { ...rect, y: rect.y + GHOST_SHADOW_OFFSET_Y },
    radius,
    shadowPaint,
  );
  drawRoundRectWithPaint(ck, canvas, rect, radius, pool.getFill(GHOST_FILL));
  drawDashedRect(ck, canvas, pool, rect, SELECTION_COLOR, 4, 4);
}

export function pathFromCorners(
  ck: CanvasKit,
  corners: [Point, Point, Point, Point],
  offsetY = 0,
): Path {
  const path = new ck.Path();
  path.moveTo(corners[0].x, corners[0].y + offsetY);
  path.lineTo(corners[1].x, corners[1].y + offsetY);
  path.lineTo(corners[2].x, corners[2].y + offsetY);
  path.lineTo(corners[3].x, corners[3].y + offsetY);
  path.close();
  return path;
}

export function drawDropTarget(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  command: ToolingDropTargetCommand,
): void {
  const color = command.intent === "detach" ? DROP_DETACH_COLOR : SELECTION_COLOR;
  const fill = command.intent === "detach" ? DROP_DETACH_FILL : DROP_INSERT_FILL;
  const radius = Math.min(
    command.borderRadius * command.displayZoom,
    maxBorderRadiusForSize(command.rect.width, command.rect.height),
  );
  drawRoundRectWithPaint(ck, canvas, command.rect, radius, pool.getFill(fill));
  drawDashedRect(ck, canvas, pool, command.rect, color, 4, 4);
}

export function drawParentDistances(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  command: ToolingRenderFrame["parentDistances"],
  frame: ToolingRenderFrame,
  font: Font,
): void {
  if (!command) return;

  const parent = command.parentRect;
  const child = command.childRect;
  const childCenterX = child.x + child.width / 2;
  const childCenterY = child.y + child.height / 2;
  const parentRight = parent.x + parent.width;
  const parentBottom = parent.y + parent.height;
  const childRight = child.x + child.width;
  const childBottom = child.y + child.height;
  const stroke = pool.getStroke(PARENT_DISTANCE_COLOR, 1);
  const fill = pool.getFill(PARENT_DISTANCE_COLOR);
  const textPaint = pool.getFill(PARENT_DISTANCE_TEXT_COLOR);

  drawParentDistanceSegment(ck, canvas, {
    from: { x: childCenterX, y: child.y },
    to: { x: childCenterX, y: parent.y },
    value: command.distances.top,
    orientation: "vertical",
    frame,
    stroke,
    fill,
    textPaint,
    font,
  });
  drawParentDistanceSegment(ck, canvas, {
    from: { x: childRight, y: childCenterY },
    to: { x: parentRight, y: childCenterY },
    value: command.distances.right,
    orientation: "horizontal",
    frame,
    stroke,
    fill,
    textPaint,
    font,
  });
  drawParentDistanceSegment(ck, canvas, {
    from: { x: childCenterX, y: childBottom },
    to: { x: childCenterX, y: parentBottom },
    value: command.distances.bottom,
    orientation: "vertical",
    frame,
    stroke,
    fill,
    textPaint,
    font,
  });
  drawParentDistanceSegment(ck, canvas, {
    from: { x: child.x, y: childCenterY },
    to: { x: parent.x, y: childCenterY },
    value: command.distances.left,
    orientation: "horizontal",
    frame,
    stroke,
    fill,
    textPaint,
    font,
  });
}

/** Selection ↔ hovered element measurements (G12): the same line+label segment
 *  primitive as the parent distances, over an arbitrary segment list. */
export function drawMeasureSegments(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  segments: ToolingRenderFrame["measureSegments"],
  frame: ToolingRenderFrame,
  font: Font,
): void {
  if (!segments || segments.length === 0) return;
  const stroke = pool.getStroke(PARENT_DISTANCE_COLOR, 1);
  const fill = pool.getFill(PARENT_DISTANCE_COLOR);
  const textPaint = pool.getFill(PARENT_DISTANCE_TEXT_COLOR);
  for (const segment of segments) {
    drawParentDistanceSegment(ck, canvas, {
      from: segment.from,
      to: segment.to,
      value: segment.value,
      orientation: segment.orientation,
      frame,
      stroke,
      fill,
      textPaint,
      font,
    });
  }
}

function drawParentDistanceSegment(
  ck: CanvasKit,
  canvas: Canvas,
  input: {
    from: Point;
    to: Point;
    value: number;
    orientation: "horizontal" | "vertical";
    frame: ToolingRenderFrame;
    stroke: Paint;
    fill: Paint;
    textPaint: Paint;
    font: Font;
  },
): void {
  const from = canvasPointToViewport(input.from, input.frame.viewportTransform);
  const to = canvasPointToViewport(input.to, input.frame.viewportTransform);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length > 0.5) {
    canvas.drawLine(from.x, from.y, to.x, to.y, input.stroke);
  }

  const anchor = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  drawParentDistanceLabel(ck, canvas, {
    text: String(Math.round(input.value)),
    anchor,
    orientation: input.orientation,
    lineLength: length,
    overlayWidth: input.frame.width,
    overlayHeight: input.frame.height,
    fill: input.fill,
    textPaint: input.textPaint,
    font: input.font,
  });
}

function drawParentDistanceLabel(
  ck: CanvasKit,
  canvas: Canvas,
  input: {
    text: string;
    anchor: Point;
    orientation: "horizontal" | "vertical";
    lineLength: number;
    overlayWidth: number;
    overlayHeight: number;
    fill: Paint;
    textPaint: Paint;
    font: Font;
  },
): void {
  const textWidth = measureTextWidth(input.font, input.text);
  const width = Math.ceil(textWidth + PARENT_DISTANCE_LABEL_PADDING_X * 2);
  const height = PARENT_DISTANCE_LABEL_HEIGHT;
  let left = input.anchor.x - width / 2;
  let top = input.anchor.y - height / 2;

  if (
    input.orientation === "vertical" &&
    input.lineLength < PARENT_DISTANCE_LABEL_HEIGHT + PARENT_DISTANCE_LABEL_MARGIN
  ) {
    left = input.anchor.x + PARENT_DISTANCE_SHORT_LABEL_OFFSET;
  }
  if (
    input.orientation === "horizontal" &&
    input.lineLength < width + PARENT_DISTANCE_LABEL_MARGIN
  ) {
    top = input.anchor.y - height - PARENT_DISTANCE_SHORT_LABEL_OFFSET;
  }

  left = clampOverlayCoordinate(
    left,
    PARENT_DISTANCE_LABEL_MARGIN,
    input.overlayWidth - width - PARENT_DISTANCE_LABEL_MARGIN,
  );
  top = clampOverlayCoordinate(
    top,
    PARENT_DISTANCE_LABEL_MARGIN,
    input.overlayHeight - height - PARENT_DISTANCE_LABEL_MARGIN,
  );

  drawRoundRectWithPaint(
    ck,
    canvas,
    { x: left, y: top, width, height },
    PARENT_DISTANCE_LABEL_RADIUS,
    input.fill,
  );

  const metrics = input.font.getMetrics();
  const baseline = top + (height - metrics.ascent - metrics.descent) / 2;
  canvas.drawText(
    input.text,
    left + PARENT_DISTANCE_LABEL_PADDING_X,
    baseline,
    input.textPaint,
    input.font,
  );
}

export function measureTextWidth(font: Font, text: string): number {
  const glyphs = font.getGlyphIDs(text);
  const widths = font.getGlyphWidths(glyphs);
  return widths.reduce((sum, width) => sum + width, 0);
}

function clampOverlayCoordinate(value: number, min: number, max: number): number {
  if (max < min) return Math.max(0, max);
  return Math.min(Math.max(value, min), max);
}

export function drawSizeLabel(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  command: ToolingSizeLabelCommand,
  font: Font,
  shadowPaint: Paint,
): void {
  const textWidth = measureTextWidth(font, command.text);
  // Shrink-to-fit border-box width, clamped to the CSS min/max (border-box, so
  // padding is included in the clamp bounds — matching the DOM tag exactly).
  const width = Math.min(
    Math.max(textWidth + SIZE_LABEL_PADDING_X * 2, SIZE_LABEL_MIN_WIDTH),
    SIZE_LABEL_MAX_WIDTH,
  );
  drawValuePill(ck, canvas, pool, {
    text: command.text,
    x: command.centerX - width / 2,
    y: command.top,
    width,
    height: SIZE_LABEL_HEIGHT,
    background: command.color,
    font,
    shadowPaint,
    textWidth,
  });
}

export function drawRadiusLabel(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  command: ToolingRadiusLabelCommand,
  font: Font,
  shadowPaint: Paint,
): void {
  const textWidth = measureTextWidth(font, command.text);
  const width = Math.max(textWidth + RADIUS_LABEL_PADDING_X * 2, RADIUS_LABEL_MIN_WIDTH);
  drawValuePill(ck, canvas, pool, {
    text: command.text,
    x: command.align === "end" ? command.x - width : command.x,
    y: command.centerY - RADIUS_LABEL_HEIGHT / 2,
    width,
    height: RADIUS_LABEL_HEIGHT,
    background: SELECTION_COLOR,
    font,
    shadowPaint,
    textWidth,
  });
}

function drawValuePill(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  input: {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    background: string;
    font: Font;
    shadowPaint: Paint;
    // Pre-measured by the caller (which already needs it to size the pill), so the
    // glyph-width measurement isn't repeated for the same text+font every frame.
    textWidth: number;
  },
): void {
  const rect = { x: input.x, y: input.y, width: input.width, height: input.height };

  drawRoundRectWithPaint(
    ck,
    canvas,
    { ...rect, y: rect.y + VALUE_LABEL_SHADOW_OFFSET_Y },
    VALUE_LABEL_RADIUS,
    input.shadowPaint,
  );
  drawRoundRectWithPaint(ck, canvas, rect, VALUE_LABEL_RADIUS, pool.getFill(input.background));

  const metrics = input.font.getMetrics();
  const baseline = rect.y + (rect.height - metrics.ascent - metrics.descent) / 2;
  canvas.drawText(
    input.text,
    rect.x + (rect.width - input.textWidth) / 2,
    baseline,
    pool.getFill(VALUE_LABEL_TEXT_COLOR),
    input.font,
  );
}

export function drawDashedRect(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  rect: Rect,
  color: string,
  dashLength: number,
  gapLength: number,
): void {
  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  const paint = pool.getFill(color);
  drawDashedHorizontalSegment(ck, canvas, paint, segments.top, dashLength, gapLength);
  drawDashedHorizontalSegment(ck, canvas, paint, segments.bottom, dashLength, gapLength);
  drawDashedVerticalSegment(ck, canvas, paint, segments.left, dashLength, gapLength);
  drawDashedVerticalSegment(ck, canvas, paint, segments.right, dashLength, gapLength);
}

function drawDashedHorizontalSegment(
  ck: CanvasKit,
  canvas: Canvas,
  paint: Paint,
  segment: Rect,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.width) {
    const width = Math.min(dashLength, segment.width - offset);
    drawFilledRectWithPaint(ck, canvas, {
      x: segment.x + offset,
      y: segment.y,
      width,
      height: segment.height,
    }, paint);
    offset += dashLength + gapLength;
  }
}

function drawDashedVerticalSegment(
  ck: CanvasKit,
  canvas: Canvas,
  paint: Paint,
  segment: Rect,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.height) {
    const height = Math.min(dashLength, segment.height - offset);
    drawFilledRectWithPaint(ck, canvas, {
      x: segment.x,
      y: segment.y + offset,
      width: segment.width,
      height,
    }, paint);
    offset += dashLength + gapLength;
  }
}

export function drawFilledRect(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  rect: Rect,
  color: string,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  drawFilledRectWithPaint(ck, canvas, rect, pool.getFill(color));
}

function drawFilledRectWithPaint(
  ck: CanvasKit,
  canvas: Canvas,
  rect: Rect,
  paint: Paint,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  canvas.drawRect(ck.XYWHRect(rect.x, rect.y, rect.width, rect.height), paint);
}

function drawRoundRectWithPaint(
  ck: CanvasKit,
  canvas: Canvas,
  rect: Rect,
  radius: number,
  paint: Paint,
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const skRect = ck.XYWHRect(rect.x, rect.y, rect.width, rect.height);
  if (radius > 0) {
    canvas.drawRRect(ck.RRectXY(skRect, radius, radius), paint);
  } else {
    canvas.drawRect(skRect, paint);
  }
}
