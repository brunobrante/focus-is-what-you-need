import CanvasKitInit, {
  type Canvas,
  type CanvasKit,
  type Paint,
  type Surface,
} from "canvaskit-wasm";
import canvasKitWasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import { maxBorderRadiusForSize } from "@/lib/editor/geometry";
import type { Point, Rect, SnapGuide } from "@/lib/editor/types";
import { canvasPointToViewport } from "@/lib/editor/viewport";
import {
  HANDLE_SIZE,
  RADIUS_HANDLE_SIZE,
  SELECTION_COLOR,
  canvasRectToViewport,
  containmentOutlineSegments,
} from "./canvasToolingRenderer";
import type {
  ToolingBoxCommand,
  ToolingDropTargetCommand,
  ToolingOutlineCommand,
  ToolingRenderFrame,
  ToolingRendererAdapter,
} from "./toolingRenderAdapter";

const HANDLE_FILL = "#ffffff";
const HANDLE_BORDER_RADIUS = 2;
const GUIDE_COLOR = "#ff2ca8";
const MARQUEE_FILL = "rgba(13, 153, 255, 0.08)";
const DROP_FILL = "rgba(13, 153, 255, 0.07)";

type ParsedColor = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

let canvasKitPromise: Promise<CanvasKit> | null = null;

export class SkiaToolingAdapter implements ToolingRendererAdapter {
  private canvasKit: CanvasKit | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLElement | null = null;
  private surface: Surface | null = null;
  private ready = false;
  private destroyed = false;
  private contextLost = false;
  private pendingFrame: ToolingRenderFrame | null = null;
  private size = { width: 0, height: 0, resolution: 1 };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.disposeSurface();
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    if (this.pendingFrame) this.render(this.pendingFrame);
  };

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    this.destroyed = false;
    this.contextLost = false;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "fixed";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "1px";
    canvas.style.height = "1px";
    canvas.style.overflow = "hidden";
    canvas.style.contain = "content";
    canvas.style.pointerEvents = "none";
    canvas.style.display = "block";
    canvas.style.zIndex = "8";
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

    host.appendChild(canvas);
    this.canvas = canvas;

    const canvasKit = await loadCanvasKit();
    if (this.destroyed) {
      canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
      detachCanvas(canvas);
      return;
    }

    this.canvasKit = canvasKit;
    this.ready = true;
    if (this.pendingFrame) this.render(this.pendingFrame);
  }

  render(frame: ToolingRenderFrame): void {
    this.pendingFrame = frame;
    if (!this.ready || !this.canvasKit || !this.canvas || this.contextLost) return;

    try {
      this.syncCanvasStyle(frame);
      const surface = this.ensureSurface(frame);
      if (!surface) return;

      const ck = this.canvasKit;
      const canvas = surface.getCanvas();
      canvas.clear(ck.TRANSPARENT);
      canvas.save();
      canvas.scale(this.size.resolution, this.size.resolution);

      for (const outline of frame.outlines) {
        drawOutline(ck, canvas, outline);
      }

      if (frame.radiusHandlePositions) {
        drawRadiusHandles(ck, canvas, frame.radiusHandlePositions);
      }

      if (frame.resizeBox) {
        drawResizeHandles(ck, canvas, frame.resizeBox);
      }

      for (const guide of frame.guides) {
        drawGuide(ck, canvas, guide, frame.viewportTransform);
      }

      if (frame.marqueeRect) {
        const rect = canvasRectToViewport(frame.marqueeRect, frame.viewportTransform);
        drawFilledRect(ck, canvas, rect, MARQUEE_FILL);
        drawOutline(ck, canvas, { rect, color: SELECTION_COLOR });
      }

      if (frame.dropTarget) {
        drawDropTarget(ck, canvas, frame.dropTarget);
      }

      canvas.restore();
      surface.flush();
    } catch (error) {
      if (isContextLossError(error)) {
        this.contextLost = true;
        this.disposeSurface();
        return;
      }
      throw error;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.pendingFrame = null;
    this.contextLost = false;
    this.disposeSurface();
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.handleContextRestored);
    detachCanvas(this.canvas);
    this.canvas = null;
    this.canvasKit = null;
    this.host = null;
    this.size = { width: 0, height: 0, resolution: 1 };
  }

  private ensureSurface(frame: ToolingRenderFrame): Surface | null {
    if (!this.canvasKit || !this.canvas) return null;

    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const resolution = getResolution();
    const backingWidth = Math.max(1, Math.ceil(width * resolution));
    const backingHeight = Math.max(1, Math.ceil(height * resolution));
    const sizeChanged =
      Math.abs(width - this.size.width) > 0.01 ||
      Math.abs(height - this.size.height) > 0.01 ||
      Math.abs(resolution - this.size.resolution) > 0.01;

    if (!this.surface || sizeChanged) {
      this.disposeSurface();
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
      this.surface = this.createSurface();
      this.size = { width, height, resolution };
    }

    return this.surface;
  }

  private syncCanvasStyle(frame: ToolingRenderFrame): void {
    if (!this.canvas) return;
    this.canvas.style.left = `${frame.left}px`;
    this.canvas.style.top = `${frame.top}px`;
    this.canvas.style.width = `${Math.max(1, frame.width)}px`;
    this.canvas.style.height = `${Math.max(1, frame.height)}px`;
  }

  private createSurface(): Surface | null {
    if (!this.canvasKit || !this.canvas) return null;

    try {
      const surface = this.canvasKit.MakeWebGLCanvasSurface(this.canvas, undefined, {
        alpha: 1,
        antialias: 0,
        premultipliedAlpha: 1,
      });
      if (surface) return surface;
    } catch (error) {
      if (!isContextLossError(error)) throw error;
      this.contextLost = true;
      return null;
    }

    return this.canvasKit.MakeSWCanvasSurface(this.canvas);
  }

  private disposeSurface(): void {
    try {
      this.surface?.dispose();
    } catch {
      // A lost WebGL context can make CanvasKit disposal fail after the browser
      // has already released the backing resources.
    }
    this.surface = null;
  }
}

export function createSkiaToolingAdapter(): ToolingRendererAdapter {
  return new SkiaToolingAdapter();
}

function loadCanvasKit(): Promise<CanvasKit> {
  canvasKitPromise ??= CanvasKitInit({
    locateFile: (file) => (file.endsWith(".wasm") ? canvasKitWasmUrl : file),
  });
  return canvasKitPromise;
}

function getResolution(): number {
  return globalThis.devicePixelRatio || 1;
}

function detachCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas?.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
}

function isContextLossError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context.*lost|isContextLost|webgl/i.test(message);
}

function drawOutline(ck: CanvasKit, canvas: Canvas, outline: ToolingOutlineCommand): void {
  const rect = outline.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return;

  if (outline.fill) {
    drawFilledRect(ck, canvas, rect, outline.fill);
  }

  if (outline.corners && !isAxisAlignedBox(outline.rect, outline.corners)) {
    drawPolygonOutline(ck, canvas, outline.corners, outline.color);
    return;
  }

  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  drawFilledRect(ck, canvas, segments.top, outline.color);
  drawFilledRect(ck, canvas, segments.bottom, outline.color);
  drawFilledRect(ck, canvas, segments.left, outline.color);
  drawFilledRect(ck, canvas, segments.right, outline.color);
}

function isAxisAlignedBox(rect: Rect, corners: [Point, Point, Point, Point]): boolean {
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

function drawPolygonOutline(
  ck: CanvasKit,
  canvas: Canvas,
  corners: [Point, Point, Point, Point],
  color: string,
): void {
  for (let index = 0; index < corners.length; index += 1) {
    drawLine(ck, canvas, corners[index], corners[(index + 1) % corners.length], color, 1);
  }
}

function drawResizeHandles(ck: CanvasKit, canvas: Canvas, box: ToolingBoxCommand): void {
  const half = HANDLE_SIZE / 2;

  for (const corner of box.corners) {
    const handleRect = {
      x: corner.x - half,
      y: corner.y - half,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    };
    drawRoundRect(ck, canvas, handleRect, HANDLE_BORDER_RADIUS, HANDLE_FILL);
    drawRoundRect(ck, canvas, handleRect, HANDLE_BORDER_RADIUS, SELECTION_COLOR, {
      strokeWidth: 1,
    });
  }
}

function drawRadiusHandles(ck: CanvasKit, canvas: Canvas, positions: Point[]): void {
  const radius = RADIUS_HANDLE_SIZE / 2;
  for (const pos of positions) {
    drawCircle(ck, canvas, pos.x, pos.y, radius, HANDLE_FILL);
    drawCircle(ck, canvas, pos.x, pos.y, radius, SELECTION_COLOR, {
      strokeWidth: 1,
    });
  }
}

function drawGuide(
  ck: CanvasKit,
  canvas: Canvas,
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

  drawLine(ck, canvas, p1, p2, GUIDE_COLOR, 1);
}

function drawDropTarget(
  ck: CanvasKit,
  canvas: Canvas,
  command: ToolingDropTargetCommand,
): void {
  const radius = Math.min(
    command.borderRadius * command.displayZoom,
    maxBorderRadiusForSize(command.rect.width, command.rect.height),
  );
  drawRoundRect(ck, canvas, command.rect, radius, DROP_FILL);
  drawDashedRect(ck, canvas, command.rect, SELECTION_COLOR, 4, 4);
}

function drawDashedRect(
  ck: CanvasKit,
  canvas: Canvas,
  rect: Rect,
  color: string,
  dashLength: number,
  gapLength: number,
): void {
  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  const paint = createFillPaint(ck, color);
  drawDashedHorizontalSegment(ck, canvas, paint, segments.top, dashLength, gapLength);
  drawDashedHorizontalSegment(ck, canvas, paint, segments.bottom, dashLength, gapLength);
  drawDashedVerticalSegment(ck, canvas, paint, segments.left, dashLength, gapLength);
  drawDashedVerticalSegment(ck, canvas, paint, segments.right, dashLength, gapLength);
  paint.delete();
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

function drawFilledRect(ck: CanvasKit, canvas: Canvas, rect: Rect, color: string): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const paint = createFillPaint(ck, color);
  drawFilledRectWithPaint(ck, canvas, rect, paint);
  paint.delete();
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

function drawRoundRect(
  ck: CanvasKit,
  canvas: Canvas,
  rect: Rect,
  radius: number,
  color: string,
  options: { strokeWidth?: number; alphaOverride?: number } = {},
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const paint = options.strokeWidth
    ? createStrokePaint(ck, color, options.strokeWidth, options.alphaOverride)
    : createFillPaint(ck, color, options.alphaOverride);
  const skRect = ck.XYWHRect(rect.x, rect.y, rect.width, rect.height);
  if (radius > 0) {
    canvas.drawRRect(ck.RRectXY(skRect, radius, radius), paint);
  } else {
    canvas.drawRect(skRect, paint);
  }
  paint.delete();
}

function drawCircle(
  ck: CanvasKit,
  canvas: Canvas,
  x: number,
  y: number,
  radius: number,
  color: string,
  options: { strokeWidth?: number; alphaOverride?: number } = {},
): void {
  const paint = options.strokeWidth
    ? createStrokePaint(ck, color, options.strokeWidth, options.alphaOverride)
    : createFillPaint(ck, color, options.alphaOverride);
  canvas.drawCircle(x, y, radius, paint);
  paint.delete();
}

function drawLine(
  ck: CanvasKit,
  canvas: Canvas,
  from: Point,
  to: Point,
  color: string,
  width: number,
): void {
  const paint = createStrokePaint(ck, color, width);
  canvas.drawLine(from.x, from.y, to.x, to.y, paint);
  paint.delete();
}

function createFillPaint(ck: CanvasKit, color: string, alphaOverride?: number): Paint {
  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(ck.PaintStyle.Fill);
  setPaintColor(ck, paint, color, alphaOverride);
  return paint;
}

function createStrokePaint(
  ck: CanvasKit,
  color: string,
  width: number,
  alphaOverride?: number,
): Paint {
  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(ck.PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  setPaintColor(ck, paint, color, alphaOverride);
  return paint;
}

function setPaintColor(
  ck: CanvasKit,
  paint: Paint,
  color: string,
  alphaOverride?: number,
): void {
  const parsed = parseColor(color);
  paint.setColor(ck.Color(parsed.r, parsed.g, parsed.b, alphaOverride ?? parsed.alpha));
}

function parseColor(input: string): ParsedColor {
  if (input.startsWith("#")) {
    const hex = input.slice(1);
    const value = Number.parseInt(hex.length === 3 ? expandShortHex(hex) : hex, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
      alpha: 1,
    };
  }

  const rgba = input.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((value) => value.trim());
    return {
      r: clampColor(Number(r)),
      g: clampColor(Number(g)),
      b: clampColor(Number(b)),
      alpha: Math.max(0, Math.min(1, Number(a))),
    };
  }

  return { r: 0, g: 0, b: 0, alpha: 1 };
}

function expandShortHex(hex: string): string {
  return hex
    .split("")
    .map((value) => value + value)
    .join("");
}

function clampColor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}
