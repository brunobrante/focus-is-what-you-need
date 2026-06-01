import CanvasKitInit, {
  type Canvas,
  type CanvasKit,
  type Paint,
  type Surface,
} from "canvaskit-wasm";
import canvasKitWasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import { maxBorderRadiusForSize } from "@/canvas/engine/geometry";
import type { Point, Rect, SnapGuide } from "@/canvas/engine/types";
import { canvasPointToViewport } from "@/canvas/engine/viewport";
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
const DROP_INSERT_FILL = "rgba(13, 153, 255, 0.07)";
const DROP_DETACH_COLOR = "#ff453a";
const DROP_DETACH_FILL = "rgba(255, 69, 58, 0.08)";

type ParsedColor = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

let canvasKitPromise: Promise<CanvasKit> | null = null;

function framesEqual(a: ToolingRenderFrame, b: ToolingRenderFrame): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.outlines === b.outlines &&
    a.resizeBox === b.resizeBox &&
    a.radiusHandlePositions === b.radiusHandlePositions &&
    a.guides === b.guides &&
    a.viewportTransform === b.viewportTransform &&
    a.marqueeRect === b.marqueeRect &&
    a.dropTarget === b.dropTarget
  );
}

type PaintKey = string;

class PaintPool {
  private readonly fills = new Map<PaintKey, Paint>();
  private readonly strokes = new Map<PaintKey, Paint>();

  constructor(private readonly ck: CanvasKit) {}

  getFill(color: string, alphaOverride?: number): Paint {
    const key = alphaOverride === undefined ? color : `${color}|${alphaOverride}`;
    let paint = this.fills.get(key);
    if (!paint) {
      paint = createFillPaint(this.ck, color, alphaOverride);
      this.fills.set(key, paint);
    }
    return paint;
  }

  getStroke(color: string, width: number, alphaOverride?: number): Paint {
    const key =
      alphaOverride === undefined ? `${color}|${width}` : `${color}|${width}|${alphaOverride}`;
    let paint = this.strokes.get(key);
    if (!paint) {
      paint = createStrokePaint(this.ck, color, width, alphaOverride);
      this.strokes.set(key, paint);
    }
    return paint;
  }

  dispose(): void {
    for (const paint of this.fills.values()) paint.delete();
    for (const paint of this.strokes.values()) paint.delete();
    this.fills.clear();
    this.strokes.clear();
  }
}

export class SkiaToolingAdapter implements ToolingRendererAdapter {
  private canvasKit: CanvasKit | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private host: HTMLElement | null = null;
  private surface: Surface | null = null;
  private paintPool: PaintPool | null = null;
  private ready = false;
  private destroyed = false;
  private contextLost = false;
  private pendingFrame: ToolingRenderFrame | null = null;
  private lastRenderedFrame: ToolingRenderFrame | null = null;
  private size = { width: 0, height: 0, resolution: 1 };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.lastRenderedFrame = null;
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
    this.paintPool = new PaintPool(canvasKit);
    this.ready = true;
    if (this.pendingFrame) this.render(this.pendingFrame);
  }

  render(frame: ToolingRenderFrame): void {
    this.pendingFrame = frame;
    if (!this.ready || !this.canvasKit || !this.canvas || !this.paintPool || this.contextLost) return;
    if (this.lastRenderedFrame !== null && framesEqual(this.lastRenderedFrame, frame)) return;

    try {
      this.syncCanvasStyle(frame);
      const surface = this.ensureSurface(frame);
      if (!surface) return;

      const ck = this.canvasKit;
      const pool = this.paintPool;
      const canvas = surface.getCanvas();
      canvas.clear(ck.TRANSPARENT);
      canvas.save();
      canvas.scale(this.size.resolution, this.size.resolution);

      for (const outline of frame.outlines) {
        drawOutline(ck, canvas, pool, outline);
      }

      if (frame.radiusHandlePositions) {
        drawRadiusHandles(ck, canvas, pool, frame.radiusHandlePositions);
      }

      if (frame.resizeBox) {
        drawResizeHandles(ck, canvas, pool, frame.resizeBox);
      }

      for (const guide of frame.guides) {
        drawGuide(ck, canvas, pool, guide, frame.viewportTransform);
      }

      if (frame.marqueeRect) {
        const rect = canvasRectToViewport(frame.marqueeRect, frame.viewportTransform);
        drawFilledRect(ck, canvas, pool, rect, MARQUEE_FILL);
        drawOutline(ck, canvas, pool, { rect, color: SELECTION_COLOR });
      }

      if (frame.dropTarget) {
        drawDropTarget(ck, canvas, pool, frame.dropTarget);
      }

      canvas.restore();
      surface.flush();
      this.lastRenderedFrame = frame;
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
    this.lastRenderedFrame = null;
    this.contextLost = false;
    this.disposeSurface();
    this.paintPool?.dispose();
    this.paintPool = null;
    // Remove listeners before losing the context so handleContextLost does not
    // fire re-entrantly during the loseContext() call below.
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.handleContextRestored);
    // Proactively free the WebGL context slot so the browser can reallocate it
    // immediately rather than waiting for GC after the canvas leaves the DOM.
    if (this.canvas) {
      try {
        const gl = this.canvas.getContext("webgl2");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // Ignore — context may already be lost or WebGL unavailable.
      }
    }
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

    // Pre-request the WebGL context with optimal flags. The browser returns the
    // same context object on repeated getContext calls for a given canvas, so
    // CanvasKit's MakeWebGLCanvasSurface will inherit these attributes.
    // - depth:false    — Skia does not need a depth buffer
    // - stencil:true   — Skia uses stencil for clipping
    // - desynchronized:true — lower-latency present path where supported
    // - powerPreference — prefer discrete GPU on multi-GPU machines
    // - preserveDrawingBuffer omitted (defaults to false) — avoids extra copy
    try {
      this.canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: true,
        desynchronized: true,
        powerPreference: "high-performance",
      });
    } catch {
      // Ignore — MakeWebGLCanvasSurface will still attempt its own getContext.
    }

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

function drawOutline(
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

function resolveSkiaHandlePoints(box: ToolingBoxCommand): Point[] {
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

function drawResizeHandles(
  ck: CanvasKit,
  canvas: Canvas,
  pool: PaintPool,
  box: ToolingBoxCommand,
): void {
  const half = HANDLE_SIZE / 2;
  const fillPaint = pool.getFill(HANDLE_FILL);
  const strokePaint = pool.getStroke(SELECTION_COLOR, 1);

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

function drawRadiusHandles(
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

function drawGuide(
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

function drawDropTarget(
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

function drawDashedRect(
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

function drawFilledRect(
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
