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
  getFitZoomForRegion,
  getInitialZoomForCanvas,
  getInitialZoomForSubjectSize,
  resolveFrozenGestureScale,
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

test("lets a zoomed-in frame over-scroll until any edge reaches the viewport center", () => {
  // An ~800px frame that fits the viewport at 1x; zoom in so it overflows.
  const container = { width: 900, height: 900 };
  const canvas = { width: 390, height: 800 };
  const zoom = 1.2;
  const displayZoom = zoom; // displayScale is 1: the frame fits the padded width.
  const scaledHeight = canvas.height * displayZoom; // 960 > padded 852 → overflow.

  // Pan up as far as possible: the top edge (docY 0) must reach the center line.
  const pannedUp = clampViewportState({ zoom, offsetX: 0, offsetY: 9999 }, container, canvas);
  expect(pannedUp.offsetY).toBeCloseTo(container.height / 2); // top edge at center
  // ...and far beyond the old edge-to-padding stop (24px).
  expect(pannedUp.offsetY).toBeGreaterThan(100);

  // Pan down as far as possible: the bottom edge must reach the center line.
  const pannedDown = clampViewportState({ zoom, offsetX: 0, offsetY: -9999 }, container, canvas);
  expect(pannedDown.offsetY + scaledHeight).toBeCloseTo(container.height / 2); // bottom edge at center

  // The frame can never be pushed entirely past the center into one half.
  expect(pannedUp.offsetY).toBeLessThanOrEqual(container.height / 2 + 1e-6);
});

test("scrolls across the whole device overlay to reach a component placed on it", () => {
  // A small header component placed at (24, 60) on a 390x844 phone. With the
  // device overlay in "origin" alignment the navigable region is the device,
  // which extends far beyond the component.
  const container = { width: 900, height: 900 };
  const canvas = { width: 342, height: 72 };
  const device = { x: -24, y: -60, width: 390, height: 844 };
  const zoom = 2;
  const dz = zoom; // displayScale is 1 (the component fits the padded width).

  // The device's top edge can be panned to the viewport center...
  const top = clampViewportState({ zoom, offsetX: 0, offsetY: 99999 }, container, canvas, false, "frame", device);
  expect(top.offsetY + device.y * dz).toBeCloseTo(container.height / 2);
  // ...and its bottom edge too.
  const bottom = clampViewportState({ zoom, offsetX: 0, offsetY: -99999 }, container, canvas, false, "frame", device);
  expect(bottom.offsetY + (device.y + device.height) * dz).toBeCloseTo(container.height / 2);

  // The component (element) center is reachable somewhere within that range.
  const offsetToCenterElement = container.height / 2 - (canvas.height / 2) * dz;
  expect(offsetToCenterElement).toBeGreaterThanOrEqual(bottom.offsetY - 1e-6);
  expect(offsetToCenterElement).toBeLessThanOrEqual(top.offsetY + 1e-6);

  // Without the device bounds the component is locked centered — the rest of the
  // device is simply unreachable. The device bounds are what unlock the scroll.
  const lockedToComponent = clampViewportState({ zoom, offsetX: 0, offsetY: 99999 }, container, canvas, false, "frame");
  expect(lockedToComponent.offsetY).toBeCloseTo(offsetToCenterElement);
});

test("re-centers the device overlay at 100% and only allows scroll once zoomed in", () => {
  const container = { width: 1000, height: 640 }; // shorter than the 844 device
  const canvas = { width: 342, height: 72 };
  const device = { x: -24, y: -386, width: 390, height: 844 };

  // At minimum zoom the device snaps to centered regardless of the requested pan
  // (no scroll slack) — zooming back out to 100% always re-centers.
  const up = clampViewportState({ zoom: MIN_ZOOM, offsetX: 0, offsetY: 99999 }, container, canvas, false, "frame", device);
  const down = clampViewportState({ zoom: MIN_ZOOM, offsetX: 0, offsetY: -99999 }, container, canvas, false, "frame", device);
  expect(up.offsetY).toBeCloseTo(down.offsetY);
  const deviceCenterY = device.y + device.height / 2;
  expect(up.offsetY + deviceCenterY * MIN_ZOOM).toBeCloseTo(container.height / 2);

  // Once zoomed in, the same device is free to scroll (the two extremes differ).
  const zUp = clampViewportState({ zoom: 2, offsetX: 0, offsetY: 99999 }, container, canvas, false, "frame", device);
  const zDown = clampViewportState({ zoom: 2, offsetX: 0, offsetY: -99999 }, container, canvas, false, "frame", device);
  expect(Math.abs(zUp.offsetY - zDown.offsetY)).toBeGreaterThan(1);

  // Scroll unlocks *immediately* above 100% — centering is only exactly at the
  // floor, not a band around it — so a small zoom-in doesn't snap back to center.
  const aUp = clampViewportState({ zoom: 1.001, offsetX: 0, offsetY: 99999 }, container, canvas, false, "frame", device);
  const aDown = clampViewportState({ zoom: 1.001, offsetX: 0, offsetY: -99999 }, container, canvas, false, "frame", device);
  expect(Math.abs(aUp.offsetY - aDown.offsetY)).toBeGreaterThan(1);
});

test("frames the device overlay fully visible at ~100% in a normal viewport", () => {
  const component = { width: 342, height: 72 };
  const device = { width: 390, height: 844 };

  // A roomy editor viewport: the phone-sized device fits at 1x (100%), so the
  // screen simulator shows the device fully, exactly like opening the screen.
  const roomy = { width: 1400, height: 900 };
  const zoom = getFitZoomForRegion(roomy, device, component);
  expect(zoom).toBe(MIN_ZOOM);
  const displayScale = getCanvasDisplayScale(roomy, component); // component is 1:1 here
  expect(device.height * zoom * displayScale).toBeLessThanOrEqual(roomy.height - 48);

  // A viewport shorter than the device can't fit it without dropping below 1x,
  // so the fit clamps up to MIN_ZOOM (the device overflows and is panned).
  const short = { width: 1000, height: 640 };
  expect(getFitZoomForRegion(short, device, component)).toBe(MIN_ZOOM);
});

test("allows manual zoom beyond 1000 percent", () => {
  const viewport = clampViewportState(
    { zoom: 18, offsetX: 0, offsetY: 0 },
    { width: 900, height: 600 },
    { width: 24, height: 24 },
  );

  expect(viewport.zoom).toBe(18);
  expect(MAX_ZOOM).toBe(256);
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

test("draft canvas has no edge-to-center over-scroll: max scroll lands on the border", () => {
  const container = { width: 900, height: 600 };
  const draftCanvas = { width: 65_536, height: 65_536 };
  const displayZoom = 50 * DRAFT_VIEWPORT_SCALE; // zoom 50 → 5
  const scaled = draftCanvas.height * displayZoom;

  // Scroll all the way "up" (reveal the top edge): the region's near edge stops
  // flush at the viewport top — offset clamps to 0, never past it into a margin.
  const top = clampViewportState(
    { zoom: 50, offsetX: 0, offsetY: 99_999 },
    container,
    draftCanvas,
    false,
    "draft",
  );
  expect(top.offsetY).toBeCloseTo(0);

  // Scroll all the way "down": the far edge stops flush at the viewport bottom.
  const bottom = clampViewportState(
    { zoom: 50, offsetX: 0, offsetY: -9_999_999 },
    container,
    draftCanvas,
    false,
    "draft",
  );
  expect(bottom.offsetY).toBeCloseTo(container.height - scaled);

  // A frame, by contrast, keeps the over-scroll slack (edge reaches the center).
  const frame = clampViewportState(
    { zoom: 2, offsetX: 0, offsetY: 99_999 },
    { width: 300, height: 300 },
    { width: 390, height: 844 },
  );
  expect(frame.offsetY).toBeGreaterThan(0);
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

test("freezes the layout scale while a zoom gesture streams (P1)", () => {
  // Gesture idle, or a projection that is not scaled-DOM: no freeze.
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: false,
      scaledDomProjection: true,
      displayZoom: 12,
      previousFrozenScale: 10,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(null);
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: false,
      displayZoom: 12,
      previousFrozenScale: null,
      lastCommittedRenderScale: 1,
    }),
  ).toBe(null);

  // First gesture tick: freeze at the layout scale already on screen, so even
  // the first wheel event costs no relayout.
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 12.5,
      previousFrozenScale: null,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(10);

  // Streaming ticks keep the frozen scale while the corrective factor stays
  // within [0.5, 2]...
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 19.9,
      previousFrozenScale: 10,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(10);
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 5.1,
      previousFrozenScale: 10,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(10);

  // ...and re-anchor at the live zoom once per octave in either direction.
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 21,
      previousFrozenScale: 10,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(21);
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 4.9,
      previousFrozenScale: 10,
      lastCommittedRenderScale: 10,
    }),
  ).toBe(4.9);

  // No committed layout yet (first render mid-gesture): anchor at the live zoom.
  expect(
    resolveFrozenGestureScale({
      zoomGestureActive: true,
      scaledDomProjection: true,
      displayZoom: 3,
      previousFrozenScale: null,
      lastCommittedRenderScale: null,
    }),
  ).toBe(3);
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
