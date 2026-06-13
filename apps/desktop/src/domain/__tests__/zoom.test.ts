import { expect, test } from "bun:test";

import { USER_MAX_ZOOM, USER_MIN_ZOOM, clampPanToCenter, zoomToCursorOffset } from "@/domain/zoom";

test("exposes the shared user-facing zoom range", () => {
  expect(USER_MIN_ZOOM).toBe(1);
  expect(USER_MAX_ZOOM).toBe(25);
});

test("zoomToCursorOffset keeps the point under the cursor fixed", () => {
  const cursor = { x: 120, y: -40 };
  const offset = { x: 30, y: 10 };
  const prevZoom = 2;
  const nextZoom = 5;
  // The world point currently under the cursor: screen = offset + world * zoom.
  const world = { x: (cursor.x - offset.x) / prevZoom, y: (cursor.y - offset.y) / prevZoom };

  const next = zoomToCursorOffset(cursor, offset, prevZoom, nextZoom);

  // After the offset change, that same world point still lands under the cursor.
  expect(next.x + world.x * nextZoom).toBeCloseTo(cursor.x);
  expect(next.y + world.y * nextZoom).toBeCloseTo(cursor.y);
});

test("zoomToCursorOffset is a no-op when the zoom does not change", () => {
  const offset = { x: 30, y: 10 };
  const next = zoomToCursorOffset({ x: 120, y: -40 }, offset, 3, 3);
  expect(next.x).toBeCloseTo(offset.x);
  expect(next.y).toBeCloseTo(offset.y);
});

test("clampPanToCenter centers a fitting axis with no slack", () => {
  // Content (300x200) at 1x fits the 800x600 viewport on both axes → centered,
  // whatever pan was requested. This is what makes zooming back out re-center.
  const content = { width: 300, height: 200 };
  const viewport = { width: 800, height: 600 };
  const clamped = clampPanToCenter({ x: 999, y: -999 }, content, viewport, 1);
  expect(clamped).toEqual({ x: 0, y: 0 });
});

test("clampPanToCenter lets an overflowing axis over-scroll edge-to-center, never past", () => {
  // 400-wide content at 3x = 1200 > 800 viewport → overflows. The pan is free to
  // travel ±scaled/2 (=600) so either edge reaches the viewport center.
  const content = { width: 400, height: 100 };
  const viewport = { width: 800, height: 800 };
  const zoom = 3;
  const half = (content.width * zoom) / 2; // 600

  const right = clampPanToCenter({ x: 99999, y: 0 }, content, viewport, zoom);
  expect(right.x).toBeCloseTo(half);
  const left = clampPanToCenter({ x: -99999, y: 0 }, content, viewport, zoom);
  expect(left.x).toBeCloseTo(-half);
  // It can never be pushed entirely past the center into one half.
  expect(Math.abs(right.x)).toBeLessThanOrEqual(half + 1e-6);
  // The vertical axis still fits (100*3=300 < 800) → stays centered.
  expect(right.y).toBe(0);
});

test("clampPanToCenter padding keeps a gutter before an axis unlocks panning", () => {
  // 500-wide content at 1x vs a 560 viewport: it fits with 60px total slack, but a
  // 40px-per-side padding (80 total) makes the available width 480 < 500, so the
  // axis counts as overflowing and unlocks ±250 of over-scroll.
  const content = { width: 500, height: 100 };
  const viewport = { width: 560, height: 800 };
  expect(clampPanToCenter({ x: 9999, y: 0 }, content, viewport, 1, 0).x).toBe(0);
  expect(clampPanToCenter({ x: 9999, y: 0 }, content, viewport, 1, 40).x).toBeCloseTo(250);
});
