import { expect, test } from "bun:test";
import { hitTestTooling } from "../canvasHitTesting";

test("hit-tests the local handle at its rotated visual position", () => {
  const hit = hitTestTooling(100, 80, {
    selectionBox: {
      rect: { x: 100, y: 80, width: 50, height: 40 },
      corners: [
        { x: 150, y: 120 },
        { x: 100, y: 120 },
        { x: 100, y: 80 },
        { x: 150, y: 80 },
      ],
    },
    radiusHandlePositions: null,
    canResize: true,
    canRotate: true,
    hasRadiusHandles: false,
    cursorRotation: 180,
    scaleMode: false,
    allowedResizeHandles: null,
  });

  expect(hit).toMatchObject({ type: "resize", handle: "se" });
});

test("hit-tests radius handles with a larger target than the visual dot", () => {
  const hit = hitTestTooling(107, 100, {
    selectionBox: null,
    radiusHandlePositions: [{ x: 100, y: 100 }],
    canResize: false,
    canRotate: false,
    hasRadiusHandles: true,
    cursorRotation: 0,
    scaleMode: false,
    allowedResizeHandles: null,
  });

  expect(hit).toMatchObject({ type: "radius", corner: "nw" });
});
