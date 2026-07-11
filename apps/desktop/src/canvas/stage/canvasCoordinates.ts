import type { CanvasDocument, ContentAxis, Point, ViewportMode } from "@/canvas/engine/types";
import {
  canvasPointToViewport,
  createViewportTransform,
  getCanvasDisplayScale,
  snapViewportOffset,
  type Size,
  type ViewportTransform,
} from "@/canvas/engine/viewport";

export function getCanvasSize(document: CanvasDocument): Size {
  return { width: document.canvas.width, height: document.canvas.height };
}

export function getViewportSize(element: HTMLElement): Size {
  return { width: element.clientWidth, height: element.clientHeight };
}

export function isPointInsideCanvas(point: Point, document: CanvasDocument): boolean {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= document.canvas.width &&
    point.y <= document.canvas.height
  );
}

// Screen pages: pointer points arrive in content coordinates (the scroll-shifted
// transform), so "inside the frame" means inside the visible window — the
// device-sized slice starting at `contentScroll` along the content axis. With one
// page / scroll 0 this is exactly `isPointInsideCanvas`.
export function isPointInsideVisibleWindow(
  point: Point,
  document: CanvasDocument,
  contentScroll: number,
  axis: ContentAxis,
): boolean {
  const scrollX = axis === "horizontal" ? contentScroll : 0;
  const scrollY = axis === "horizontal" ? 0 : contentScroll;
  return (
    point.x >= scrollX &&
    point.x <= scrollX + document.canvas.width &&
    point.y >= scrollY &&
    point.y <= scrollY + document.canvas.height
  );
}

export function screenDeltaToCanvasDelta(
  deltaX: number,
  deltaY: number,
  rotation: number,
  zoom: number,
): Point {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const safeZoom = Math.max(zoom, 0.0001);
  return {
    x: (deltaX * cos + deltaY * sin) / safeZoom,
    y: (-deltaX * sin + deltaY * cos) / safeZoom,
  };
}

export function canvasDeltaToScreenDelta(
  deltaX: number,
  deltaY: number,
  rotation: number,
  zoom: number,
): Point {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: (deltaX * cos - deltaY * sin) * zoom,
    y: (deltaX * sin + deltaY * cos) * zoom,
  };
}

export function buildViewportTransform(
  document: CanvasDocument,
  viewportSize: { width: number; height: number },
  zoom: number,
  offsetX: number,
  offsetY: number,
  viewportMode: ViewportMode = "frame",
): ViewportTransform {
  const canvasSize = getCanvasSize(document);
  const displayScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? getCanvasDisplayScale(viewportSize, canvasSize, viewportMode)
      : 1;
  return createViewportTransform({
    displayZoom: zoom * displayScale,
    offsetX: snapViewportOffset(offsetX),
    offsetY: snapViewportOffset(offsetY),
    canvasRotation: document.canvas.rotation ?? 0,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  });
}

export { canvasPointToViewport };
