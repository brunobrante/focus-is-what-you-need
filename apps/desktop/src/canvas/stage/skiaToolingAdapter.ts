import CanvasKitInit, {
  type Canvas,
  type CanvasKit,
  type Font,
  type Paint,
  type Path,
  type Surface,
  type Typeface,
} from "canvaskit-wasm";
import geistLatinFontUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
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
  ToolingGhostCommand,
  ToolingOutlineCommand,
  ToolingRadiusLabelCommand,
  ToolingRenderFrame,
  ToolingRendererAdapter,
  ToolingSizeLabelCommand,
} from "./toolingRenderAdapter";

const HANDLE_FILL = "#ffffff";
// Drag ghost for invisible elements: a soft blue drop shadow under a faint
// surface, framed with a dashed selection-blue outline.
const GHOST_FILL = "rgba(13, 153, 255, 0.10)";
const GHOST_SHADOW_COLOR = "rgba(13, 99, 168, 0.45)";
const GHOST_SHADOW_BLUR = 10;
const GHOST_SHADOW_OFFSET_Y = 4;
const HANDLE_BORDER_RADIUS = 2;
const GUIDE_COLOR = "#ff2ca8";
const MARQUEE_FILL = "rgba(13, 153, 255, 0.08)";
const DROP_INSERT_FILL = "rgba(13, 153, 255, 0.07)";
const DROP_DETACH_COLOR = "#ff453a";
const DROP_DETACH_FILL = "rgba(255, 69, 58, 0.08)";
const PARENT_DISTANCE_COLOR = "#ff7a00";
const PARENT_DISTANCE_TEXT_COLOR = "#ffffff";
const PARENT_DISTANCE_LABEL_HEIGHT = 18;
const PARENT_DISTANCE_LABEL_RADIUS = 4;
const PARENT_DISTANCE_LABEL_PADDING_X = 6;
const PARENT_DISTANCE_LABEL_FONT_SIZE = 11;
const PARENT_DISTANCE_LABEL_MARGIN = 4;
const PARENT_DISTANCE_SHORT_LABEL_OFFSET = 8;

// Selection value tags (size + radius). These mirror, pixel-for-pixel, the DOM
// `.selection-size-tag` / `.radius-value-tag` rules in editor.css — geometry,
// 4px corner radius, white 700-weight 11px text, and the drop shadow.
const VALUE_LABEL_TEXT_COLOR = "#ffffff";
const VALUE_LABEL_RADIUS = 4;
const VALUE_LABEL_FONT_SIZE = 11;
// box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28). A CSS blur radius of 12px maps to a
// Gaussian standard deviation of 6 (blur / 2), which is Skia's blur sigma.
const VALUE_LABEL_SHADOW_COLOR = "rgba(0, 0, 0, 0.28)";
const VALUE_LABEL_SHADOW_SIGMA = 6;
const VALUE_LABEL_SHADOW_OFFSET_Y = 4;

const SIZE_LABEL_HEIGHT = 22;
const SIZE_LABEL_MIN_WIDTH = 48;
const SIZE_LABEL_MAX_WIDTH = 160;
const SIZE_LABEL_PADDING_X = 8;

const RADIUS_LABEL_HEIGHT = 20;
const RADIUS_LABEL_MIN_WIDTH = 36;
const RADIUS_LABEL_PADDING_X = 6;

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
    a.ghosts === b.ghosts &&
    a.resizeBox === b.resizeBox &&
    a.radiusHandlePositions === b.radiusHandlePositions &&
    a.guides === b.guides &&
    a.viewportTransform === b.viewportTransform &&
    a.marqueeRect === b.marqueeRect &&
    a.dropTarget === b.dropTarget &&
    a.parentDistances === b.parentDistances &&
    a.sizeLabel === b.sizeLabel &&
    a.radiusLabel === b.radiusLabel
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
  // Blurred shadow paint for drag ghosts. Built lazily (needs a MaskFilter, which
  // the PaintPool does not manage) and disposed on destroy.
  private ghostShadowPaint: Paint | null = null;
  // Blurred drop-shadow paint shared by the size/radius value tags. Built lazily
  // (needs a MaskFilter the PaintPool does not manage) and disposed on destroy.
  private valueLabelShadowPaint: Paint | null = null;
  // Bold 11px Geist font for the value tags, matching the DOM `font-weight: 700`.
  private valueLabelFont: Font | null = null;
  // 11px font for the parent-distance labels, cached like valueLabelFont so the
  // drag loop doesn't allocate + free a WASM Font every rendered frame.
  private parentDistanceFont: Font | null = null;
  private parentDistanceTypeface: Typeface | null = null;
  private ownsParentDistanceTypeface = false;
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
    const loadedTypeface = await loadToolingTypeface(canvasKit);
    if (this.destroyed) {
      if (loadedTypeface.owned) loadedTypeface.typeface?.delete();
      return;
    }
    this.parentDistanceTypeface = loadedTypeface.typeface;
    this.ownsParentDistanceTypeface = loadedTypeface.owned;
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

      for (const ghost of frame.ghosts) {
        drawGhost(ck, canvas, pool, ghost, this.getGhostShadowPaint(ck));
      }

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

      if (frame.parentDistances) {
        drawParentDistances(ck, canvas, pool, frame.parentDistances, frame, this.getParentDistanceFont(ck));
      }

      if (frame.marqueeRect) {
        const rect = canvasRectToViewport(frame.marqueeRect, frame.viewportTransform);
        drawFilledRect(ck, canvas, pool, rect, MARQUEE_FILL);
        drawOutline(ck, canvas, pool, { rect, color: SELECTION_COLOR });
      }

      if (frame.dropTarget) {
        drawDropTarget(ck, canvas, pool, frame.dropTarget);
      }

      // Value tags paint last so they sit above every other piece of chrome,
      // matching the DOM tags' z-index 9 (the canvas chrome was z-index 8).
      if (frame.sizeLabel) {
        drawSizeLabel(
          ck,
          canvas,
          pool,
          frame.sizeLabel,
          this.getValueLabelFont(ck),
          this.getValueLabelShadowPaint(ck),
        );
      }

      if (frame.radiusLabel) {
        drawRadiusLabel(
          ck,
          canvas,
          pool,
          frame.radiusLabel,
          this.getValueLabelFont(ck),
          this.getValueLabelShadowPaint(ck),
        );
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
    this.ghostShadowPaint?.delete();
    this.ghostShadowPaint = null;
    this.valueLabelShadowPaint?.delete();
    this.valueLabelShadowPaint = null;
    this.valueLabelFont?.delete();
    this.valueLabelFont = null;
    this.parentDistanceFont?.delete();
    this.parentDistanceFont = null;
    if (this.ownsParentDistanceTypeface) this.parentDistanceTypeface?.delete();
    this.parentDistanceTypeface = null;
    this.ownsParentDistanceTypeface = false;
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

  private getGhostShadowPaint(ck: CanvasKit): Paint {
    if (!this.ghostShadowPaint) {
      const paint = createFillPaint(ck, GHOST_SHADOW_COLOR);
      paint.setMaskFilter(ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, GHOST_SHADOW_BLUR, false));
      this.ghostShadowPaint = paint;
    }
    return this.ghostShadowPaint;
  }

  private getValueLabelShadowPaint(ck: CanvasKit): Paint {
    if (!this.valueLabelShadowPaint) {
      const paint = createFillPaint(ck, VALUE_LABEL_SHADOW_COLOR);
      paint.setMaskFilter(
        ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, VALUE_LABEL_SHADOW_SIGMA, false),
      );
      this.valueLabelShadowPaint = paint;
    }
    return this.valueLabelShadowPaint;
  }

  private getParentDistanceFont(ck: CanvasKit): Font {
    if (!this.parentDistanceFont) {
      const font = new ck.Font(
        this.parentDistanceTypeface ?? ck.Typeface.GetDefault(),
        PARENT_DISTANCE_LABEL_FONT_SIZE,
      );
      font.setSubpixel(true);
      this.parentDistanceFont = font;
    }
    return this.parentDistanceFont;
  }

  private getValueLabelFont(ck: CanvasKit): Font {
    if (!this.valueLabelFont) {
      const font = new ck.Font(
        this.parentDistanceTypeface ?? ck.Typeface.GetDefault(),
        VALUE_LABEL_FONT_SIZE,
      );
      // Geist ships as a single variable typeface here, so synthesize the DOM's
      // 700 weight rather than loading a separate bold face.
      font.setEmbolden(true);
      font.setSubpixel(true);
      font.setEdging(ck.FontEdging.AntiAlias);
      this.valueLabelFont = font;
    }
    return this.valueLabelFont;
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

async function loadToolingTypeface(
  ck: CanvasKit,
): Promise<{ typeface: Typeface | null; owned: boolean }> {
  try {
    const response = await fetch(geistLatinFontUrl);
    if (response.ok) {
      const typeface = ck.Typeface.MakeTypefaceFromData(await response.arrayBuffer());
      if (typeface) return { typeface, owned: true };
    }
  } catch {
    // Fall back to CanvasKit's compiled default below. The adapter still renders,
    // but bundled Geist is the primary tooling font.
  }

  return { typeface: ck.Typeface.GetDefault(), owned: false };
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

function drawGhost(
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

function pathFromCorners(
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

function drawParentDistances(
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

function measureTextWidth(font: Font, text: string): number {
  const glyphs = font.getGlyphIDs(text);
  const widths = font.getGlyphWidths(glyphs);
  return widths.reduce((sum, width) => sum + width, 0);
}

function clampOverlayCoordinate(value: number, min: number, max: number): number {
  if (max < min) return Math.max(0, max);
  return Math.min(Math.max(value, min), max);
}

function drawSizeLabel(
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

function drawRadiusLabel(
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
