import { USER_MAX_ZOOM, USER_MIN_ZOOM } from "@/domain/zoom";
import { clamp } from "./geometry";
import type { Point, Rect, Size, ViewportMatrix, ViewportMode } from "./types";

export type { Size, ViewportMatrix } from "./types";
export type ViewportState = { zoom: number; offsetX: number; offsetY: number };
export type ZoomLimits = { min: number; max: number; step: number };
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

export const MIN_ZOOM = USER_MIN_ZOOM;
export const MAX_ZOOM = USER_MAX_ZOOM;
export const DRAFT_MAX_ZOOM = 2560;
export const ZOOM_STEP = 0.25;
export const VIEWPORT_EPSILON = 0.01;
export const STAGE_VIEWPORT_PADDING = 24;
export const MAX_SAFE_TRANSFORMED_STAGE_SIDE = 10_000;
export const SCALED_DOM_PROJECTION_MIN_ZOOM = MIN_ZOOM;
export const DRAFT_VIEWPORT_SCALE = 0.1;
export const DRAFT_ELEMENT_SIZE_SCALE = 1 / DRAFT_VIEWPORT_SCALE;

// The draft canvas is freeform and large (Figma-scale, see DRAFT_CANVAS_SIZE),
// so there is no real
// "subject" to fit. Instead we open it at a nominal working area so newly drawn
// components come out at a realistic size instead of being created excessively
// large to compensate for the 0.1 display scale.
export const DRAFT_WORKING_AREA: Size = { width: 390, height: 844 };

const AUTO_ZOOM_FILL_RATIO = 0.88;
const AUTO_ZOOM_LONG_SIDE_RATIO = 0.72;
const AUTO_ZOOM_LONG_SIDE_MIN = 260;
const AUTO_ZOOM_SHORT_SIDE_RATIO = 0.46;
const AUTO_ZOOM_SHORT_SIDE_MIN = 300;

export function getViewportZoomLimits(mode: ViewportMode = "frame"): ZoomLimits {
  return mode === "draft"
    ? { min: MIN_ZOOM, max: DRAFT_MAX_ZOOM, step: ZOOM_STEP }
    : { min: MIN_ZOOM, max: MAX_ZOOM, step: ZOOM_STEP };
}

export function getCanvasDisplayScale(
  containerSize: Size,
  canvasSize: Size,
  mode: ViewportMode = "frame",
): number {
  if (mode === "draft") return DRAFT_VIEWPORT_SCALE;
  const availableWidth = Math.max(1, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  return Math.min(
    1,
    availableWidth / Math.max(1, canvasSize.width),
    availableHeight / Math.max(1, canvasSize.height),
  );
}

export function getInitialZoomForCanvas(
  containerSize: Size,
  canvasSize: Size,
  mode: ViewportMode = "frame",
): number {
  if (mode === "draft") return getDraftInitialZoom(containerSize);
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

// Draft initial zoom is proportional: fit the nominal working area into the
// viewport, then divide out the fixed draft display scale so the user-facing
// zoom lands where drawing feels 1:1-ish instead of pinned at 1x (which renders
// at 0.1 and pushes users to draw oversized components).
function getDraftInitialZoom(containerSize: Size): number {
  const availableWidth = Math.max(1, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  const fitDisplayZoom =
    Math.min(
      availableWidth / DRAFT_WORKING_AREA.width,
      availableHeight / DRAFT_WORKING_AREA.height,
    ) * AUTO_ZOOM_FILL_RATIO;
  return quantizeZoom(fitDisplayZoom / DRAFT_VIEWPORT_SCALE, "draft");
}

export function getInitialZoomForSubjectSize(
  canvasSize: Size,
  mode: ViewportMode = "frame",
): number {
  const canvasWidth = Math.max(1, canvasSize.width);
  const canvasHeight = Math.max(1, canvasSize.height);
  const longSide = Math.max(canvasWidth, canvasHeight);
  const shortSide = Math.min(canvasWidth, canvasHeight);
  const subjectZoom = Math.min(720 / longSide, AUTO_ZOOM_SHORT_SIDE_MIN / shortSide);
  // In draft mode every document unit renders at DRAFT_VIEWPORT_SCALE, so the
  // proportional subject zoom has to be scaled up by the same factor to make a
  // small selected component fill a comfortable portion of the viewport.
  if (mode === "draft") {
    return quantizeZoom(subjectZoom / DRAFT_VIEWPORT_SCALE, "draft");
  }
  return quantizeZoom(subjectZoom, "frame");
}

// Clamp one axis of the camera offset so the navigable region stays reachable.
// `rectStart`/`rectLength` describe the navigable region on this axis in canvas
// space — the edited component by default, or a larger region (e.g. the device
// overlay that extends beyond the component) when one is supplied. `displayZoom`
// maps canvas units to screen pixels, so the region's near edge lands at
// `rectStart * displayZoom` when the offset is 0.
//
//   - When the region fits the viewport it is centered (or, while the canvas is
//     being freely positioned, kept within the padding gutter).
//   - Once the region overflows, the offset is free to travel until either edge
//     of the region reaches the viewport center — half the scaled region of
//     over-scroll in each direction. This is what lets you scroll the very
//     top/bottom (or left/right) of a frame — or the whole device overlay — into
//     comfortable, centered view. The centered position is the midpoint of this
//     range, which strictly contains the old edge-to-padding bounds.
//   - With `allowOverscroll` off (the freeform draft canvas) there is no such
//     slack: an overflowing region is clamped so its edge stops flush against the
//     viewport edge, never past it. Scrolling to the maximum lands on the border
//     instead of leaving a half-viewport margin you can't fill — so an element at
//     the very top can actually be brought to the top of the view.
function clampAxisOffset(
  rawOffset: number,
  containerLength: number,
  rectStart: number,
  rectLength: number,
  displayZoom: number,
  preserveOffset: boolean,
  centerOnly: boolean,
  allowOverscroll: boolean,
): number {
  const scaled = rectLength * displayZoom;
  const startScreen = rectStart * displayZoom;
  const padded = Math.max(0, containerLength - STAGE_VIEWPORT_PADDING * 2);
  const centered = containerLength / 2 - startScreen - scaled / 2;
  if (scaled <= padded) {
    if (preserveOffset) {
      return clamp(
        rawOffset,
        STAGE_VIEWPORT_PADDING - startScreen,
        containerLength - STAGE_VIEWPORT_PADDING - startScreen - scaled,
      );
    }
    return centered;
  }
  // Overflowing. At the minimum zoom the region snaps to centered (symmetric
  // overflow) — matching how a screen sits at 100% — so zooming back out to 100%
  // always re-centers and there is no scroll slack. Once zoomed in past 100% the
  // offset is free to travel until either edge reaches the viewport center.
  if (centerOnly) return centered;
  // No over-scroll: the region edge can reach, but not pass, the viewport edge.
  if (!allowOverscroll) {
    return clamp(rawOffset, containerLength - startScreen - scaled, -startScreen);
  }
  return clamp(rawOffset, containerLength / 2 - startScreen - scaled, containerLength / 2 - startScreen);
}

// User zoom that fits an arbitrary region (e.g. the whole device overlay) into
// the viewport and centers it, given that the projection's display scale is
// still derived from the component canvas — not the region. This is what frames
// the device when the screen simulator is enabled: the device shows fully
// visible at ~100% zoom, exactly like opening the screen, while the component
// remains the 1:1 projection subject. In a viewport smaller than the device the
// fit would fall below 1x, so it clamps up to MIN_ZOOM (the device then overflows
// and is panned, matching how an oversized screen behaves).
export function getFitZoomForRegion(
  containerSize: Size,
  regionSize: Size,
  canvasSize: Size,
  mode: ViewportMode = "frame",
): number {
  const displayScale = getCanvasDisplayScale(containerSize, canvasSize, mode);
  const availableWidth = Math.max(1, containerSize.width - STAGE_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(1, containerSize.height - STAGE_VIEWPORT_PADDING * 2);
  const fitDisplayZoom =
    Math.min(
      availableWidth / Math.max(1, regionSize.width),
      availableHeight / Math.max(1, regionSize.height),
    ) * AUTO_ZOOM_FILL_RATIO;
  return quantizeZoom(fitDisplayZoom / Math.max(displayScale, 0.0001), mode);
}

export function clampViewportState(
  viewport: ViewportState,
  containerSize: Size,
  canvasSize: Size,
  preserveSmallCanvasOffset = false,
  mode: ViewportMode = "frame",
  navigableBounds?: Rect | null,
): ViewportState {
  // `zoom` is the user-facing zoom. `displayScale` is an internal fit scale used
  // so oversized subjects can still fit in the editor while the UI remains at
  // 100% and zoom-out stays disabled. Offsets are clamped against the navigable
  // region — the component by default, or a larger region (the component plus its
  // device overlay) when supplied — while `displayScale` always derives from the
  // component so "1x" stays 1:1 for the edited component and the device frame
  // simply overflows and is panned into view.
  const limits = getViewportZoomLimits(mode);
  const zoom = clamp(viewport.zoom, limits.min, limits.max);
  const displayScale = getCanvasDisplayScale(containerSize, canvasSize, mode);
  const displayZoom = zoom * displayScale;
  const bounds = navigableBounds ?? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
  // Centering at the floor means *exactly* the minimum zoom (zoom-out clamps to
  // it), not a band around it — otherwise small zoom-in steps just above 100%
  // would keep snapping back to centered instead of anchoring under the cursor.
  // The draft canvas is the exception: it is a large freeform space with no
  // meaningful center, so force-centering it at min zoom would dump the user's
  // real content (which lives in a tiny corner) thousands of px off-screen. There
  // the offset stays anchored/clamped to the pannable range instead.
  const atMinZoom = mode !== "draft" && zoom <= limits.min + 1e-6;
  // The freeform draft canvas has no edge-to-center over-scroll: panning stops
  // flush against the region edge so a max scroll lands on the border.
  const allowOverscroll = mode !== "draft";
  const offsetX = clampAxisOffset(viewport.offsetX, containerSize.width, bounds.x, bounds.width, displayZoom, preserveSmallCanvasOffset, atMinZoom, allowOverscroll);
  const offsetY = clampAxisOffset(viewport.offsetY, containerSize.height, bounds.y, bounds.height, displayZoom, preserveSmallCanvasOffset, atMinZoom, allowOverscroll);
  return { zoom, offsetX, offsetY };
}

// Place an arbitrary canvas-space point at the center of the viewport at a given
// zoom. This is the primitive behind every "look at X" camera move: re-centering
// the subject, centering the device overlay, or focusing a node.
export function centerViewportOnPoint(
  zoom: number,
  containerSize: Size,
  canvasSize: Size,
  focus: Point,
  mode: ViewportMode = "frame",
): ViewportState {
  const limits = getViewportZoomLimits(mode);
  const clampedZoom = clamp(zoom, limits.min, limits.max);
  const displayScale = getCanvasDisplayScale(containerSize, canvasSize, mode);
  const displayZoom = clampedZoom * displayScale;
  return {
    zoom: clampedZoom,
    offsetX: containerSize.width / 2 - focus.x * displayZoom,
    offsetY: containerSize.height / 2 - focus.y * displayZoom,
  };
}

// Zoom while keeping the canvas point currently under the viewport center fixed,
// then clamp. This is the button / keyboard / toolbar counterpart to the wheel's
// cursor-anchored zoom: those callers have no cursor, so they pivot on the middle
// of the viewport, which is what makes the zoom feel centered instead of growing
// out of the canvas top-left corner. Mirrors the wheel math so canvas rotation is
// handled correctly.
export function zoomViewportAroundCenter(
  viewport: ViewportState,
  nextZoom: number,
  containerSize: Size,
  canvasSize: Size,
  navigableBounds: Rect | null = null,
  mode: ViewportMode = "frame",
  canvasRotation = 0,
): ViewportState {
  const limits = getViewportZoomLimits(mode);
  const clampedZoom = clamp(nextZoom, limits.min, limits.max);
  const displayScale = getCanvasDisplayScale(containerSize, canvasSize, mode);
  const center = { x: containerSize.width / 2, y: containerSize.height / 2 };
  const currentTransform = createViewportTransform({
    displayZoom: viewport.zoom * displayScale,
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
    canvasRotation,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  });
  const centerCanvas = viewportPointToCanvas(center, currentTransform);
  const nextBaseTransform = createViewportTransform({
    displayZoom: clampedZoom * displayScale,
    offsetX: 0,
    offsetY: 0,
    canvasRotation,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  });
  const nextBaseCenter = canvasPointToViewport(centerCanvas, nextBaseTransform);
  const raw = {
    zoom: clampedZoom,
    offsetX: center.x - nextBaseCenter.x,
    offsetY: center.y - nextBaseCenter.y,
  };
  return clampViewportState(raw, containerSize, canvasSize, false, mode, navigableBounds);
}

// Recenter the subject in the viewport at a given zoom. Unlike
// `clampViewportState`, this always places the subject's center at the viewport
// center (symmetric overflow when the subject is larger than the viewport),
// which is what "re-center the element" means after a resize or overlay toggle.
export function centerViewportState(
  zoom: number,
  containerSize: Size,
  canvasSize: Size,
  mode: ViewportMode = "frame",
): ViewportState {
  return centerViewportOnPoint(
    zoom,
    containerSize,
    canvasSize,
    { x: canvasSize.width / 2, y: canvasSize.height / 2 },
    mode,
  );
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

/**
 * Which projection the stage uses: laying the scene out at `renderScale = zoom`
 * (scaled DOM — crisp text and borders, but a full restyle + relayout of every
 * element whenever the zoom changes), or leaving it at 1× under a CSS transform
 * (cheap — the compositor scales an already-rasterized layer, at the cost of
 * blurry text while scaled up).
 *
 * This is the SETTLED choice only. A streaming wheel/pinch zoom no longer flips
 * the projection (it used to drop to the 1×-layout CSS transform, whose
 * stretched raster visibly detached the selection chrome from the content):
 * `resolveFrozenGestureScale` below keeps the scaled-DOM layout frozen for the
 * duration of the gesture instead.
 *
 * The size guard: past `MAX_SAFE_TRANSFORMED_STAGE_SIDE` the CSS-transform path
 * hits browser rasterization limits, so a deep zoom must use the scaled DOM.
 */
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

// Bound on the compositor-only corrective scale a frozen zoom gesture may reach
// before the layout re-anchors at the live zoom. 2 = one octave: a long zoom run
// re-lays-out once per doubling instead of once per wheel tick, and the stretched
// raster never degrades past 2× (or shrinks past 0.5×).
export const GESTURE_REANCHOR_MAX_CORRECTIVE_SCALE = 2;

/**
 * Frozen-scale zoom gesture policy. While a wheel/pinch zoom streams over the
 * scaled-DOM projection, the stage keeps the layout scale it had when the
 * gesture started and reaches the live zoom with a compositor-only
 * translate+scale — re-laying-out a 10k–100k px stage per wheel tick makes
 * WebKit present stale tiles for a few frames while the (GPU) selection chrome
 * updates instantly, which is exactly the "chrome detaches from the content
 * while zooming" desync. Returns the layout scale to freeze at, or null when no
 * freeze applies (gesture idle, or the projection is not scaled-DOM). When the
 * corrective factor (displayZoom / frozen) drifts past the re-anchor bound, the
 * freeze re-anchors at the live zoom — one relayout per octave.
 */
export function resolveFrozenGestureScale({
  zoomGestureActive,
  scaledDomProjection,
  displayZoom,
  previousFrozenScale,
  lastCommittedRenderScale,
}: {
  zoomGestureActive: boolean;
  scaledDomProjection: boolean;
  displayZoom: number;
  previousFrozenScale: number | null;
  lastCommittedRenderScale: number | null;
}): number | null {
  if (!zoomGestureActive || !scaledDomProjection || displayZoom <= 0) return null;
  const frozen = previousFrozenScale ?? lastCommittedRenderScale ?? displayZoom;
  if (frozen <= 0) return displayZoom;
  const corrective = displayZoom / frozen;
  return corrective > GESTURE_REANCHOR_MAX_CORRECTIVE_SCALE ||
    corrective < 1 / GESTURE_REANCHOR_MAX_CORRECTIVE_SCALE
    ? displayZoom
    : frozen;
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

function quantizeZoom(value: number, mode: ViewportMode = "frame"): number {
  const limits = getViewportZoomLimits(mode);
  return clamp(Math.round(value / ZOOM_STEP) * ZOOM_STEP, limits.min, limits.max);
}
