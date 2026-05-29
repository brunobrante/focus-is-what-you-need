import { clamp } from "./geometry";
import type { Point, Rect, Size, ViewportMatrix } from "./types";

export type { Size, ViewportMatrix } from "./types";
export type ViewportState = { zoom: number; offsetX: number; offsetY: number };
export type ViewportTransformInput = {
  displayZoom: number;
  offsetX: number;
  offsetY: number;
  canvasRotation: number;
  canvasWidth: number;
  canvasHeight: number;
};
export type ViewportTransform = ViewportTransformInput & {
  matrix: ViewportMatrix;
  cssTransform: string;
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 25;
export const ZOOM_STEP = 0.25;
export const VIEWPORT_EPSILON = 0.01;
export const STAGE_VIEWPORT_PADDING = 24;
export const MAX_SAFE_TRANSFORMED_STAGE_SIDE = 10_000;
export const SCALED_DOM_PROJECTION_MIN_ZOOM = MIN_ZOOM;

const AUTO_ZOOM_FILL_RATIO = 0.88;
const AUTO_ZOOM_LONG_SIDE_RATIO = 0.72;
const AUTO_ZOOM_LONG_SIDE_MIN = 260;
const AUTO_ZOOM_SHORT_SIDE_RATIO = 0.46;
const AUTO_ZOOM_SHORT_SIDE_MIN = 300;

export function getCanvasDisplayScale(containerSize: Size, canvasSize: Size): number {
  const availableWidth = Math.max(1, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  return Math.min(
    1,
    availableWidth / Math.max(1, canvasSize.width),
    availableHeight / Math.max(1, canvasSize.height),
  );
}

export function getInitialZoomForCanvas(containerSize: Size, canvasSize: Size): number {
  const availableWidth = Math.max(1, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  const canvasWidth = Math.max(1, canvasSize.width);
  const canvasHeight = Math.max(1, canvasSize.height);
  const fitZoom = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);

  if (fitZoom <= MIN_ZOOM) return MIN_ZOOM;

  const longSide = Math.max(canvasWidth, canvasHeight);
  const shortSide = Math.min(canvasWidth, canvasHeight);
  const viewportLongSide = Math.max(availableWidth, availableHeight);
  const viewportShortSide = Math.min(availableWidth, availableHeight);
  const targetLongSide = Math.min(
    viewportLongSide * AUTO_ZOOM_FILL_RATIO,
    Math.max(AUTO_ZOOM_LONG_SIDE_MIN, viewportLongSide * AUTO_ZOOM_LONG_SIDE_RATIO),
  );
  const targetShortSide = Math.min(
    viewportShortSide * AUTO_ZOOM_FILL_RATIO,
    Math.max(AUTO_ZOOM_SHORT_SIDE_MIN, viewportShortSide * AUTO_ZOOM_SHORT_SIDE_RATIO),
  );
  const subjectZoom = Math.min(targetLongSide / longSide, targetShortSide / shortSide);
  const viewportZoom = fitZoom * AUTO_ZOOM_FILL_RATIO;
  const nextZoom = clamp(Math.min(subjectZoom, viewportZoom), MIN_ZOOM, MAX_ZOOM);

  return quantizeZoom(nextZoom);
}

export function getInitialZoomForSubjectSize(canvasSize: Size): number {
  const canvasWidth = Math.max(1, canvasSize.width);
  const canvasHeight = Math.max(1, canvasSize.height);
  const longSide = Math.max(canvasWidth, canvasHeight);
  const shortSide = Math.min(canvasWidth, canvasHeight);
  const subjectZoom = Math.min(720 / longSide, AUTO_ZOOM_SHORT_SIDE_MIN / shortSide);

  return quantizeZoom(clamp(subjectZoom, MIN_ZOOM, MAX_ZOOM));
}

export function clampViewportState(
  viewport: ViewportState,
  containerSize: Size,
  canvasSize: Size,
  preserveSmallCanvasOffset = false,
): ViewportState {
  // `zoom` is the user-facing zoom. `displayScale` is an internal fit scale used
  // so oversized subjects can still fit in the editor while the UI remains at
  // 100% and zoom-out stays disabled.
  const zoom = clamp(viewport.zoom, MIN_ZOOM, MAX_ZOOM);
  const displayScale = getCanvasDisplayScale(containerSize, canvasSize);
  const displayZoom = zoom * displayScale;
  const scaledWidth = canvasSize.width * displayZoom;
  const scaledHeight = canvasSize.height * displayZoom;
  const paddedWidth = Math.max(0, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const paddedHeight = Math.max(0, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  const offsetX =
    scaledWidth <= paddedWidth
      ? preserveSmallCanvasOffset
        ? clamp(viewport.offsetX, STAGE_VIEWPORT_PADDING, containerSize.width - scaledWidth - STAGE_VIEWPORT_PADDING)
        : STAGE_VIEWPORT_PADDING + (paddedWidth - scaledWidth) / 2
      : clamp(
          viewport.offsetX,
          containerSize.width - scaledWidth - STAGE_VIEWPORT_PADDING,
          STAGE_VIEWPORT_PADDING,
        );
  const offsetY =
    scaledHeight <= paddedHeight
      ? preserveSmallCanvasOffset
        ? clamp(viewport.offsetY, STAGE_VIEWPORT_PADDING, containerSize.height - scaledHeight - STAGE_VIEWPORT_PADDING)
        : STAGE_VIEWPORT_PADDING + (paddedHeight - scaledHeight) / 2
      : clamp(
          viewport.offsetY,
          containerSize.height - scaledHeight - STAGE_VIEWPORT_PADDING,
          STAGE_VIEWPORT_PADDING,
        );
  return { zoom, offsetX, offsetY };
}

export function viewportChanged(a: ViewportState, b: ViewportState): boolean {
  return (
    Math.abs(a.zoom - b.zoom) > VIEWPORT_EPSILON ||
    Math.abs(a.offsetX - b.offsetX) > VIEWPORT_EPSILON ||
    Math.abs(a.offsetY - b.offsetY) > VIEWPORT_EPSILON
  );
}

export function snapViewportOffset(value: number, pixelRatio = globalThis.devicePixelRatio ?? 1): number {
  const safeRatio = Math.max(1, pixelRatio);
  return Math.round(value * safeRatio) / safeRatio;
}

export function shouldUseScaledDomProjection({
  canvasSize,
  displayZoom,
  canvasRotation = 0,
}: {
  canvasSize: Size;
  displayZoom: number;
  canvasRotation?: number;
}): boolean {
  if (canvasRotation !== 0) return false;
  if (displayZoom >= SCALED_DOM_PROJECTION_MIN_ZOOM) return true;
  return (
    canvasSize.width * displayZoom > MAX_SAFE_TRANSFORMED_STAGE_SIDE ||
    canvasSize.height * displayZoom > MAX_SAFE_TRANSFORMED_STAGE_SIDE
  );
}

export function createViewportTransform(input: ViewportTransformInput): ViewportTransform {
  const matrix = createViewportMatrix(input);
  return {
    ...input,
    matrix,
    cssTransform: viewportMatrixToCss(matrix),
  };
}

export function createViewportMatrix(input: ViewportTransformInput): ViewportMatrix {
  const zoom = input.displayZoom;
  const rotation = input.canvasRotation || 0;

  if (rotation === 0) {
    return {
      a: zoom,
      b: 0,
      c: 0,
      d: zoom,
      e: input.offsetX,
      f: input.offsetY,
    };
  }

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = cos * zoom;
  const b = sin * zoom;
  const c = -sin * zoom;
  const d = cos * zoom;
  const hw = input.canvasWidth / 2;
  const hh = input.canvasHeight / 2;

  return {
    a,
    b,
    c,
    d,
    e: input.offsetX + hw * zoom - (a * hw + c * hh),
    f: input.offsetY + hh * zoom - (b * hw + d * hh),
  };
}

export function viewportMatrixToCss(matrix: ViewportMatrix): string {
  return `matrix(${cleanMatrixValue(matrix.a)}, ${cleanMatrixValue(matrix.b)}, ${cleanMatrixValue(matrix.c)}, ${cleanMatrixValue(matrix.d)}, ${cleanMatrixValue(matrix.e)}, ${cleanMatrixValue(matrix.f)})`;
}

export function canvasPointToViewport(point: Point, transform: ViewportTransform): Point {
  return applyViewportMatrix(point, transform.matrix);
}

export function canvasRectToViewport(rect: Rect, transform: ViewportTransform): Rect {
  const corners = [
    canvasPointToViewport({ x: rect.x, y: rect.y }, transform),
    canvasPointToViewport({ x: rect.x + rect.width, y: rect.y }, transform),
    canvasPointToViewport({ x: rect.x + rect.width, y: rect.y + rect.height }, transform),
    canvasPointToViewport({ x: rect.x, y: rect.y + rect.height }, transform),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);

  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

export function viewportPointToCanvas(point: Point, transform: ViewportTransform): Point {
  const { a, b, c, d, e, f } = transform.matrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 0.0000001) {
    return { x: 0, y: 0 };
  }
  const x = point.x - e;
  const y = point.y - f;

  return {
    x: (d * x - c * y) / det,
    y: (-b * x + a * y) / det,
  };
}

export function screenDeltaToWorldDelta(delta: Point, worldToScreenMatrix: ViewportMatrix): Point {
  const { a, b, c, d } = worldToScreenMatrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 0.0000001) {
    return { x: 0, y: 0 };
  }

  return {
    x: (d * delta.x - c * delta.y) / det,
    y: (-b * delta.x + a * delta.y) / det,
  };
}

export function clientPointToCanvas(
  viewport: HTMLElement,
  clientX: number,
  clientY: number,
  transform: ViewportTransform,
): Point {
  const viewportRect = viewport.getBoundingClientRect();
  return viewportPointToCanvas(
    { x: clientX - viewportRect.left, y: clientY - viewportRect.top },
    transform,
  );
}

function applyViewportMatrix(point: Point, matrix: ViewportMatrix): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function cleanMatrixValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) < 0.0000000001 ? 0 : value;
}

function quantizeZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
}
