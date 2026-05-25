import { Container, Graphics, WebGLRenderer } from "pixi.js";
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
  color: number;
  alpha: number;
};

export class PixiToolingAdapter implements ToolingRendererAdapter {
  private renderer: WebGLRenderer<HTMLCanvasElement> | null = null;
  private stage: Container | null = null;
  private graphics: Graphics | null = null;
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ready = false;
  private destroyed = false;
  private contextLost = false;
  private pendingFrame: ToolingRenderFrame | null = null;
  private size = { width: 0, height: 0, resolution: 1 };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    if (this.pendingFrame) this.render(this.pendingFrame);
  };

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    this.destroyed = false;
    this.contextLost = false;

    const renderer = new WebGLRenderer<HTMLCanvasElement>();
    await renderer.init({
      width: 1,
      height: 1,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: getResolution(),
    });

    if (this.destroyed) {
      destroyPixiRendererWithoutForcingContextLoss(renderer, null);
      return;
    }

    const stage = new Container();
    const graphics = new Graphics();
    stage.addChild(graphics);

    const canvas = renderer.canvas;
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
    this.renderer = renderer;
    this.stage = stage;
    this.graphics = graphics;
    this.canvas = canvas;
    this.ready = true;

    if (this.pendingFrame) this.render(this.pendingFrame);
  }

  render(frame: ToolingRenderFrame): void {
    this.pendingFrame = frame;
    if (!this.ready || !this.renderer || !this.stage || !this.graphics) return;
    if (this.contextLost || isPixiContextLost(this.renderer)) {
      this.contextLost = true;
      return;
    }

    try {
      this.syncCanvasStyle(frame);
      const width = Math.max(1, frame.width);
      const height = Math.max(1, frame.height);
      const resolution = getResolution();
      if (
        Math.abs(width - this.size.width) > 0.01 ||
        Math.abs(height - this.size.height) > 0.01 ||
        Math.abs(resolution - this.size.resolution) > 0.01
      ) {
        this.renderer.resize(width, height, resolution);
        this.size = { width, height, resolution };
      }

      const graphics = this.graphics;
      graphics.clear();

      for (const outline of frame.outlines) {
        drawOutline(graphics, outline);
      }

      if (frame.radiusHandlePositions) {
        drawRadiusHandles(graphics, frame.radiusHandlePositions);
      }

      if (frame.resizeBox) {
        drawResizeHandles(graphics, frame.resizeBox);
      }

      for (const guide of frame.guides) {
        drawGuide(graphics, guide, frame.viewportTransform);
      }

      if (frame.marqueeRect) {
        const rect = canvasRectToViewport(frame.marqueeRect, frame.viewportTransform);
        drawFilledRect(graphics, rect, MARQUEE_FILL);
        drawOutline(graphics, { rect, color: SELECTION_COLOR });
      }

      if (frame.dropTarget) {
        drawDropTarget(graphics, frame.dropTarget);
      }

      this.renderer.render(this.stage);
    } catch (error) {
      if (isContextLossError(error) || isPixiContextLost(this.renderer)) {
        this.contextLost = true;
        return;
      }
      throw error;
    }
  }

  private syncCanvasStyle(frame: ToolingRenderFrame): void {
    if (!this.canvas) return;
    this.canvas.style.left = `${frame.left}px`;
    this.canvas.style.top = `${frame.top}px`;
    this.canvas.style.width = `${Math.max(1, frame.width)}px`;
    this.canvas.style.height = `${Math.max(1, frame.height)}px`;
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.pendingFrame = null;
    this.contextLost = false;
    this.canvas?.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas?.removeEventListener("webglcontextrestored", this.handleContextRestored);
    detachCanvas(this.canvas);
    this.graphics = null;
    const stage = this.stage;
    this.size = { width: 0, height: 0, resolution: 1 };
    if (this.renderer) {
      destroyPixiRendererWithoutForcingContextLoss(this.renderer, stage);
    }
    this.renderer = null;
    this.stage = null;
    this.canvas = null;
    this.host = null;
  }
}

export function createPixiToolingAdapter(): ToolingRendererAdapter {
  return new PixiToolingAdapter();
}

function getResolution(): number {
  return globalThis.devicePixelRatio || 1;
}

type PixiRendererWithWebGlContext = WebGLRenderer<HTMLCanvasElement> & {
  context?: {
    gl?: {
      isContextLost?: () => boolean;
    };
    extensions?: {
      loseContext?: WEBGL_lose_context;
    };
  };
};

function destroyPixiRendererWithoutForcingContextLoss(
  renderer: WebGLRenderer<HTMLCanvasElement>,
  stage: Container | null,
): void {
  detachCanvas(renderer.canvas);
  stage?.destroy({ children: true, context: true, texture: true, textureSource: true });
  disablePixiForcedContextLoss(renderer);
  renderer.destroy({ removeView: false });
}

function disablePixiForcedContextLoss(renderer: WebGLRenderer<HTMLCanvasElement>): void {
  const webGlRenderer = renderer as PixiRendererWithWebGlContext;

  // Pixi calls WEBGL_lose_context during renderer destroy. Firefox reports that as
  // a lost WebGL context even for normal React remounts, so avoid forcing it here.
  if (webGlRenderer.context?.extensions?.loseContext) {
    delete webGlRenderer.context.extensions.loseContext;
  }
}

function detachCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas?.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
}

function isPixiContextLost(renderer: WebGLRenderer<HTMLCanvasElement>): boolean {
  const webGlRenderer = renderer as PixiRendererWithWebGlContext;
  return Boolean(webGlRenderer.context?.gl?.isContextLost?.());
}

function isContextLossError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /context.*lost|isContextLost/i.test(message);
}

function drawOutline(graphics: Graphics, outline: ToolingOutlineCommand): void {
  const rect = outline.rect;
  if (!rect || rect.width <= 0 || rect.height <= 0) return;

  if (outline.fill) {
    drawFilledRect(graphics, rect, outline.fill);
  }

  if (outline.corners && !isAxisAlignedBox(outline.rect, outline.corners)) {
    drawPolygonOutline(graphics, outline.corners, outline.color);
    return;
  }

  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  drawFilledRect(graphics, segments.top, outline.color);
  drawFilledRect(graphics, segments.bottom, outline.color);
  drawFilledRect(graphics, segments.left, outline.color);
  drawFilledRect(graphics, segments.right, outline.color);
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
  graphics: Graphics,
  corners: [Point, Point, Point, Point],
  color: string,
): void {
  graphics
    .moveTo(corners[0].x, corners[0].y)
    .lineTo(corners[1].x, corners[1].y)
    .lineTo(corners[2].x, corners[2].y)
    .lineTo(corners[3].x, corners[3].y)
    .lineTo(corners[0].x, corners[0].y)
    .stroke({ ...parseColor(color), width: 1, pixelLine: true });
}

function drawResizeHandles(graphics: Graphics, box: ToolingBoxCommand): void {
  const half = HANDLE_SIZE / 2;
  for (const corner of box.corners) {
    graphics
      .roundRect(
        corner.x - half,
        corner.y - half,
        HANDLE_SIZE,
        HANDLE_SIZE,
        HANDLE_BORDER_RADIUS,
      )
      .fill(parseColor(HANDLE_FILL))
      .stroke({ ...parseColor(SELECTION_COLOR), width: 1 });
  }
}

function drawRadiusHandles(graphics: Graphics, positions: Point[]): void {
  const radius = RADIUS_HANDLE_SIZE / 2;
  for (const pos of positions) {
    graphics
      .circle(pos.x, pos.y, radius)
      .fill(parseColor(HANDLE_FILL))
      .stroke({ ...parseColor(SELECTION_COLOR), width: 1 });
  }
}

function drawGuide(
  graphics: Graphics,
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

  graphics
    .moveTo(p1.x, p1.y)
    .lineTo(p2.x, p2.y)
    .stroke({ ...parseColor(GUIDE_COLOR), width: 1, pixelLine: true });
}

function drawDropTarget(graphics: Graphics, command: ToolingDropTargetCommand): void {
  const radius = Math.min(
    command.borderRadius * command.displayZoom,
    maxBorderRadiusForSize(command.rect.width, command.rect.height),
  );
  graphics
    .roundRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height, radius)
    .fill(parseColor(DROP_FILL));
  drawDashedRect(graphics, command.rect, SELECTION_COLOR, 4, 4);
}

function drawDashedRect(
  graphics: Graphics,
  rect: Rect,
  color: string,
  dashLength: number,
  gapLength: number,
): void {
  const segments = containmentOutlineSegments(rect);
  if (!segments) return;

  drawDashedHorizontalSegment(graphics, segments.top, color, dashLength, gapLength);
  drawDashedHorizontalSegment(graphics, segments.bottom, color, dashLength, gapLength);
  drawDashedVerticalSegment(graphics, segments.left, color, dashLength, gapLength);
  drawDashedVerticalSegment(graphics, segments.right, color, dashLength, gapLength);
}

function drawDashedHorizontalSegment(
  graphics: Graphics,
  segment: Rect,
  color: string,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.width) {
    const width = Math.min(dashLength, segment.width - offset);
    drawFilledRect(
      graphics,
      { x: segment.x + offset, y: segment.y, width, height: segment.height },
      color,
    );
    offset += dashLength + gapLength;
  }
}

function drawDashedVerticalSegment(
  graphics: Graphics,
  segment: Rect,
  color: string,
  dashLength: number,
  gapLength: number,
): void {
  let offset = 0;
  while (offset < segment.height) {
    const height = Math.min(dashLength, segment.height - offset);
    drawFilledRect(
      graphics,
      { x: segment.x, y: segment.y + offset, width: segment.width, height },
      color,
    );
    offset += dashLength + gapLength;
  }
}

function drawFilledRect(graphics: Graphics, rect: Rect, color: string): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  graphics.rect(rect.x, rect.y, rect.width, rect.height).fill(parseColor(color));
}

function parseColor(input: string): ParsedColor {
  if (input.startsWith("#")) {
    return {
      color: Number.parseInt(input.slice(1), 16),
      alpha: 1,
    };
  }

  const rgba = input.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((value) => value.trim());
    return {
      color:
        (clampColor(Number(r)) << 16) |
        (clampColor(Number(g)) << 8) |
        clampColor(Number(b)),
      alpha: Math.max(0, Math.min(1, Number(a))),
    };
  }

  return { color: 0x000000, alpha: 1 };
}

function clampColor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}
