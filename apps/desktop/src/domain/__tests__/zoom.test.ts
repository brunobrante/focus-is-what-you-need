import { expect, test } from "bun:test";

import { USER_MAX_ZOOM, USER_MIN_ZOOM, zoomToCursorOffset } from "@/domain/zoom";

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
