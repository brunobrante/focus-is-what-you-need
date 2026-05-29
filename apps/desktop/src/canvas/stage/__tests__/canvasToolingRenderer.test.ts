import { expect, test } from "bun:test";
import { createViewportTransform } from "../../engine/viewport";

import {
  canvasPaintRectToViewport,
  containmentOutlineSegments,
  drawOutline,
  elementToViewportBox,
  getRadiusHandlePositions,
  outsideOutlineSegments,
  snapOutlineRect,
} from "../canvasToolingRenderer";

test("snaps outline edges inward to the device-pixel grid", () => {
  // On a Retina display (pixelScale=2), the inner rect must align with the
  // device-pixel grid that the DOM element actually rasterizes onto. The
  // ceiling on left/top and floor on right/bottom guarantee the snapped rect
  // sits entirely inside the element's solid region, leaving the antialiased
  // edge exposed for the outside outline stroke to cover.
  const rect = { x: 10.26, y: 4.24, width: 20.5, height: 12.5 };

  expect(snapOutlineRect(rect, { x: 2, y: 2 })).toEqual({
    x: 10.5,
    y: 4.5,
    right: 30.5,
    bottom: 16.5,
  });
});

test("snaps outline edges where the bottom lands on an integer CSS px and the right on a half", () => {
  // Exercise both branches of the device-pixel rounding: right edge rounds
  // down to a half-CSS-px (because right_device = 321 is odd), bottom rounds
  // to an integer CSS px (because bottom_device = 220 is even).
  const rect = { x: 120.37, y: 80.12, width: 40.26, height: 30.36 };
  const snapped = snapOutlineRect(rect, { x: 2, y: 2 });

  expect(snapped).toEqual({
    x: 120.5,
    y: 80.5,
    right: 160.5,
    bottom: 110,
  });
});

test("draws selection outline outside the selected rect", () => {
  const segments = outsideOutlineSegments({
    x: 10,
    y: 20,
    right: 40,
    bottom: 60,
  });

  expect(segments).toEqual({
    top: { x: 9, y: 19, width: 32, height: 1 },
    bottom: { x: 9, y: 60, width: 32, height: 1 },
    left: { x: 9, y: 20, width: 1, height: 40 },
    right: { x: 40, y: 20, width: 1, height: 40 },
  });
});

test("containment outline wraps the device-pixel-aligned inner rect", () => {
  // Stroke must land *outside* the snapped inner rect so it covers the DOM
  // element's antialiased edge instead of leaving it exposed (the Chrome/WebKit
  // fringe at high zoom on Retina). With pixelScale=2 and a rect whose right
  // edge falls on a half-CSS-pixel, the snapped right is 845 (= 1690/2) and the
  // bottom is 575.5 (= 1151/2) — the outline straddles those boundaries.
  const segments = containmentOutlineSegments(
    { x: 38.9394, y: 113.9542, width: 806.4338, height: 461.6422 },
    { x: 2, y: 2 },
  );

  expect(segments).toEqual({
    top: { x: 38, y: 113, width: 808, height: 1 },
    bottom: { x: 38, y: 575.5, width: 808, height: 1 },
    left: { x: 38, y: 114, width: 1, height: 461.5 },
    right: { x: 845, y: 114, width: 1, height: 461.5 },
  });
});

test("drawOutline emits the same outside-fill rects as containmentOutlineSegments", () => {
  const strokeRects: number[][] = [];
  const fillRects: number[][] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    strokeRect: (...args: number[]) => strokeRects.push(args),
    fillRect: (...args: number[]) => fillRects.push(args),
  } as unknown as CanvasRenderingContext2D;

  drawOutline(
    ctx,
    { x: 38.9394, y: 113.9542, width: 806.4338, height: 461.6422 },
    "#0d99ff",
    { x: 2, y: 2 },
  );

  expect(strokeRects).toEqual([]);
  expect(fillRects).toEqual([
    [38, 113, 808, 1],
    [38, 575.5, 808, 1],
    [38, 114, 1, 461.5],
    [845, 114, 1, 461.5],
  ]);
  expect(ctx.lineWidth).toBe(0);
  expect(ctx.strokeStyle).toBe("");
  expect(ctx.fillStyle).toBe("#0d99ff");
});

test("keeps fractional canvas bounds exact before applying high zoom", () => {
  const rect = canvasPaintRectToViewport(
    { x: 10.32, y: 20.12, width: 30.21, height: 40.72 },
    createViewportTransform({
      displayZoom: 25,
      offsetX: 0,
      offsetY: 0,
      canvasRotation: 0,
      canvasWidth: 100,
      canvasHeight: 100,
    }),
  );

  expect(rect.x).toBeCloseTo(258);
  expect(rect.y).toBeCloseTo(503);
  expect(rect.width).toBeCloseTo(755.25);
  expect(rect.height).toBeCloseTo(1018);
});

test("returns oriented element corners instead of only the expanded AABB", () => {
  const box = elementToViewportBox(
    {
      canvas: { width: 300, height: 300, background: "#fff", rotation: 0 },
      rootIds: ["node"],
      elements: {
        node: {
          id: "node",
          type: "rect",
          parentId: null,
          children: [],
          name: "Node",
          x: 100,
          y: 80,
          width: 60,
          height: 40,
          rotation: 45,
          styles: {},
        },
      },
    },
    "node",
    createViewportTransform({
      displayZoom: 1,
      offsetX: 0,
      offsetY: 0,
      canvasRotation: 0,
      canvasWidth: 300,
      canvasHeight: 300,
    }),
  );

  expect(box).not.toBeNull();
  expect(box!.rect.width).toBeGreaterThan(60);
  expect(box!.rect.height).toBeGreaterThan(40);
  expect(box!.corners[0].x).not.toBeCloseTo(box!.rect.x);
  expect(box!.corners[0].y).toBeCloseTo(box!.rect.y);
});

test("snaps high-zoom outlines after viewport conversion", () => {
  const rect = canvasPaintRectToViewport(
    { x: 10.04, y: 20, width: 30, height: 40 },
    createViewportTransform({
      displayZoom: 25,
      offsetX: 0,
      offsetY: 0,
      canvasRotation: 0,
      canvasWidth: 100,
      canvasHeight: 100,
    }),
  );

  expect(snapOutlineRect(rect, { x: 1, y: 1 })).toEqual({
    x: 251,
    y: 500,
    right: 1001,
    bottom: 1500,
  });
});

test("snaps Chrome/Retina selection outline so it covers the DOM antialias", () => {
  // Reproduction of the bug payload from the user's log:
  //   displayZoom: 24.17 on Retina (pixelScale=2). Element rendered DOM edge
  //   at viewport CSS 284.9017. With Math.round snap the canvas stroke landed
  //   at integer CSS 285 (= device col 570) and the element's antialias at
  //   col 569 leaked as a pink fringe outside the blue stroke.
  // After the fix: snapped inner = 285 (device col 570), stroke drawn from
  // CSS 284 (= device col 568) to 285, so the stroke covers cols 568 + 569
  // (the antialias) and the element's first solid col (570) remains
  // unobstructed.
  const segments = containmentOutlineSegments(
    {
      x: 284.9017,
      y: -967.8874,
      width: 1680.9908,
      height: 1407.9384,
    },
    { x: 2, y: 2 },
  );

  expect(segments).toEqual({
    top: { x: 284, y: -968.5, width: 1682.5, height: 1 },
    bottom: { x: 284, y: 440, width: 1682.5, height: 1 },
    left: { x: 284, y: -967.5, width: 1, height: 1407.5 },
    right: { x: 1965.5, y: -967.5, width: 1, height: 1407.5 },
  });
});

test("keeps zero-radius handles inset from the rect edge", () => {
  const positions = getRadiusHandlePositions(
    { x: 100, y: 200, width: 80, height: 60 },
    0,
    1,
  );

  expect(positions[0]).toEqual({ x: 112, y: 212 });
  expect(positions[1]).toEqual({ x: 168, y: 212 });
  expect(positions[2]).toEqual({ x: 168, y: 248 });
  expect(positions[3]).toEqual({ x: 112, y: 248 });
});

test("allows radius handles to reach the edge while dragging", () => {
  const positions = getRadiusHandlePositions(
    { x: 100, y: 200, width: 80, height: 60 },
    0,
    1,
    0,
  );

  expect(positions[0]).toEqual({ x: 100, y: 200 });
  expect(positions[1]).toEqual({ x: 180, y: 200 });
  expect(positions[2]).toEqual({ x: 180, y: 260 });
  expect(positions[3]).toEqual({ x: 100, y: 260 });
});

test("clamps oversized radius handles to the smaller rect dimension", () => {
  const positions = getRadiusHandlePositions(
    { x: 100, y: 200, width: 100, height: 40 },
    999,
    1,
    0,
  );

  expect(positions[0]).toEqual({ x: 120, y: 220 });
  expect(positions[1]).toEqual({ x: 180, y: 220 });
  expect(positions[2]).toEqual({ x: 180, y: 220 });
  expect(positions[3]).toEqual({ x: 120, y: 220 });
});
