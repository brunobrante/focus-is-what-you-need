import { expect, test } from "bun:test";

import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasPointToViewport,
  canvasRectToViewport,
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
