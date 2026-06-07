import { expect, test } from "bun:test";

import {
  DRAFT_ELEMENT_SIZE_SCALE,
  DRAFT_MAX_ZOOM,
  DRAFT_VIEWPORT_SCALE,
  DRAFT_WORKING_AREA,
  MAX_ZOOM,
  MIN_ZOOM,
  canvasPointToViewport,
  canvasRectToViewport,
  centerViewportOnPoint,
  centerViewportState,
  clampViewportState,
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  getInitialZoomForSubjectSize,
  screenDeltaToWorldDelta,
  shouldUseScaledDomProjection,
  snapViewportOffset,
  viewportPointToCanvas,
} from "@/canvas/engine/viewport";
import { createElementForTool } from "@/canvas/engine/actions";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";

test("keeps screen-sized canvases at the minimum zoom", () => {
  expect(getInitialZoomForCanvas({ width: 900, height: 600 }, { width: 390, height: 844 })).toBe(MIN_ZOOM);
  expect(getInitialZoomForCanvas({ width: 900, height: 600 }, { width: 1440, height: 900 })).toBe(MIN_ZOOM);
});

test("fits oversized subjects with internal display scale at 100 percent zoom", () => {
  const container = { width: 862, height: 775 };
  const canvas = { width: 390, height: 844 };
  const displayScale = getCanvasDisplayScale(container, canvas);

  expect(displayScale).toBeCloseTo(727 / 844);

  const viewport = clampViewportState(
    { zoom: 1, offsetX: 0, offsetY: 0 },
    container,
    canvas,
  );

  expect(viewport.zoom).toBe(1);
  expect(canvas.height * displayScale).toBeLessThanOrEqual(775 - 48);
  expect(viewport.offsetY).toBeCloseTo(24);
});

test("starts small component canvases zoomed in without consuming the full viewport", () => {
  const container = { width: 900, height: 600 };

  const headerZoom = getInitialZoomForCanvas(container, { width: 342, height: 72 });
  expect(headerZoom).toBeGreaterThan(MIN_ZOOM);
  expect(headerZoom).toBeLessThan(2.5);

  const logoZoom = getInitialZoomForCanvas(container, { width: 52, height: 52 });
  expect(logoZoom).toBeGreaterThanOrEqual(5);
  expect(logoZoom).toBeLessThan(MAX_ZOOM);
});

test("derives the editor's initial zoom directly from the subject size", () => {
  expect(getInitialZoomForSubjectSize({ width: 60, height: 60 })).toBe(5);
  expect(getInitialZoomForSubjectSize({ width: 342, height: 72 })).toBeGreaterThan(MIN_ZOOM);
  expect(getInitialZoomForSubjectSize({ width: 390, height: 844 })).toBe(MIN_ZOOM);
});

test("clamps zoomed component viewports to the subject bounds", () => {
  const viewport = clampViewportState(
    { zoom: 4, offsetX: -999, offsetY: -999 },
    { width: 900, height: 600 },
    { width: 52, height: 52 },
  );

  expect(viewport.zoom).toBe(4);
  expect(viewport.offsetX).toBeGreaterThan(24);
  expect(viewport.offsetY).toBeGreaterThan(24);
});

test("allows manual zoom beyond 1000 percent", () => {
  const viewport = clampViewportState(
    { zoom: 18, offsetX: 0, offsetY: 0 },
    { width: 900, height: 600 },
    { width: 24, height: 24 },
  );

  expect(viewport.zoom).toBe(18);
  expect(MAX_ZOOM).toBe(25);
});

test("opens the draft canvas zoomed into a working area instead of fitting the whole free canvas", () => {
  const container = { width: 900, height: 600 };
  const draftCanvas = { width: 100_000, height: 100_000 };

  expect(getCanvasDisplayScale(container, draftCanvas, "draft")).toBe(DRAFT_VIEWPORT_SCALE);

  // Draft no longer pins to 1x (which renders at 0.1 and forces oversized
  // components). It starts proportional to a nominal working area so drawing
  // feels close to 1:1.
  const draftZoom = getInitialZoomForCanvas(container, draftCanvas, "draft");
  expect(draftZoom).toBeGreaterThan(MIN_ZOOM);
  expect(draftZoom).toBeLessThanOrEqual(DRAFT_MAX_ZOOM);
  // The working area should fill most of the viewport at the chosen zoom.
  const workingAreaScreenHeight = DRAFT_WORKING_AREA.height * draftZoom * DRAFT_VIEWPORT_SCALE;
  expect(workingAreaScreenHeight).toBeLessThanOrEqual(600 - 48);
  expect(workingAreaScreenHeight).toBeGreaterThan((600 - 48) * 0.7);

  const viewport = clampViewportState(
    { zoom: 120, offsetX: 0, offsetY: 0 },
    container,
    draftCanvas,
    false,
    "draft",
  );

  expect(viewport.zoom).toBe(120);
  expect(DRAFT_MAX_ZOOM).toBeGreaterThan(MAX_ZOOM);
});

test("keeps the frame zoom cap separate from draft zoom", () => {
  const viewport = clampViewportState(
    { zoom: DRAFT_MAX_ZOOM, offsetX: 0, offsetY: 0 },
    { width: 900, height: 600 },
    { width: 390, height: 844 },
  );

  expect(viewport.zoom).toBe(MAX_ZOOM);
});

test("scales the proportional subject zoom up in draft mode", () => {
  const frameZoom = getInitialZoomForSubjectSize({ width: 60, height: 60 });
  const draftZoom = getInitialZoomForSubjectSize({ width: 60, height: 60 }, "draft");

  // Same proportional rule, scaled by 1 / DRAFT_VIEWPORT_SCALE so a small
  // selected component still fills a comfortable portion of the draft viewport.
  expect(draftZoom).toBeCloseTo(frameZoom / DRAFT_VIEWPORT_SCALE);
  expect(draftZoom).toBeLessThanOrEqual(DRAFT_MAX_ZOOM);
});

test("re-centers the subject at the viewport center keeping zoom", () => {
  const container = { width: 900, height: 600 };
  const canvas = { width: 390, height: 844 };

  // A subject smaller than the viewport: centered with symmetric margins.
  const small = centerViewportState(1, container, { width: 200, height: 200 }, "frame");
  expect(small.zoom).toBe(1);
  expect(small.offsetX).toBeCloseTo((900 - 200) / 2);
  expect(small.offsetY).toBeCloseTo((600 - 200) / 2);

  // A subject taller than the viewport (uses internal display scale): still
  // centered, overflowing symmetrically (negative offset is allowed).
  const tall = centerViewportState(1, container, canvas, "frame");
  const displayScale = getCanvasDisplayScale(container, canvas, "frame");
  expect(tall.offsetX).toBeCloseTo((900 - canvas.width * displayScale) / 2);
  expect(tall.offsetY).toBeCloseTo((600 - canvas.height * displayScale) / 2);
});

test("centers an arbitrary focus point at the viewport center", () => {
  const container = { width: 900, height: 600 };
  const canvas = { width: 390, height: 844 };
  const displayScale = getCanvasDisplayScale(container, canvas, "frame");

  const focus = { x: 100, y: 700 };
  const viewport = centerViewportOnPoint(2, container, canvas, focus, "frame");

  // The focus point, projected through the resulting transform, lands dead
  // center of the viewport.
  const displayZoom = viewport.zoom * displayScale;
  expect(viewport.offsetX + focus.x * displayZoom).toBeCloseTo(900 / 2);
  expect(viewport.offsetY + focus.y * displayZoom).toBeCloseTo(600 / 2);
});

test("scales draft element defaults back to the draft visual proportion", () => {
  const normal = createElementForTool("rect", 0, 0, { width: 390, height: 390 });
  const draft = createElementForTool(
    "rect",
    0,
    0,
    { width: 100_000, height: 100_000 },
    DEFAULT_GLOBAL_SETTINGS,
    { sizeScale: DRAFT_ELEMENT_SIZE_SCALE },
  );

  expect(draft.width * DRAFT_VIEWPORT_SCALE).toBeCloseTo(normal.width);
  expect(draft.height * DRAFT_VIEWPORT_SCALE).toBeCloseTo(normal.height);
});

test("switches DOM rendering away from giant transformed layers", () => {
  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 1,
    }),
  ).toBe(true);

  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 13,
    }),
  ).toBe(true);

  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 8,
    }),
  ).toBe(true);

  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 21.5344,
    }),
  ).toBe(true);

  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 4,
    }),
  ).toBe(true);
});

test("keeps rotated canvases on the matrix projection path", () => {
  expect(
    shouldUseScaledDomProjection({
      canvasSize: { width: 390, height: 844 },
      displayZoom: 21.5344,
      canvasRotation: 12,
    }),
  ).toBe(false);
});

test("snaps viewport offsets to device pixels for crisper transforms", () => {
  expect(snapViewportOffset(10.26, 2)).toBe(10.5);
  expect(snapViewportOffset(10.24, 2)).toBe(10);
});

test("uses one matrix for CSS and canvas-space projection", () => {
  const transform = createViewportTransform({
    displayZoom: 17.3049,
    offsetX: 24,
    offsetY: -7,
    canvasRotation: 0,
    canvasWidth: 52,
    canvasHeight: 52,
  });

  expect(transform.cssTransform).toBe(
    "matrix(17.3049, 0, 0, 17.3049, 24, -7)",
  );
  const rect = canvasRectToViewport({ x: 5.32, y: 8.04, width: 41.36, height: 25.96 }, transform);
  expect(rect.x).toBeCloseTo(116.062068);
  expect(rect.y).toBeCloseTo(132.131396);
  expect(rect.width).toBeCloseTo(715.730664);
  expect(rect.height).toBeCloseTo(449.235204);
});

test("inverts the viewport matrix back to canvas space", () => {
  const transform = createViewportTransform({
    displayZoom: 12.5,
    offsetX: 30,
    offsetY: -14,
    canvasRotation: 18,
    canvasWidth: 52,
    canvasHeight: 52,
  });
  const canvasPoint = { x: 11.25, y: 8.75 };
  const viewportPoint = canvasPointToViewport(canvasPoint, transform);

  expect(viewportPointToCanvas(viewportPoint, transform).x).toBeCloseTo(canvasPoint.x);
  expect(viewportPointToCanvas(viewportPoint, transform).y).toBeCloseTo(canvasPoint.y);
});

test("converts CSS-pixel drag deltas through the world-to-screen matrix", () => {
  const transform = createViewportTransform({
    displayZoom: 20,
    offsetX: 300,
    offsetY: -120,
    canvasRotation: 0,
    canvasWidth: 100,
    canvasHeight: 100,
  });

  expect(screenDeltaToWorldDelta({ x: 40, y: -10 }, transform.matrix)).toEqual({
    x: 2,
    y: -0.5,
  });
});
