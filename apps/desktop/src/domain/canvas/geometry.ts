// Neutral geometry primitives shared across canvas surfaces (the Main scene
// editor, Builder, and future Drafts/References surfaces).
//
// This module is dependency-free by contract: no React, DOM, Tauri, storage, or
// product-model imports are allowed here. It owns only pure scalar/vector/box
// math so every surface can share one implementation instead of duplicating it.

export type Vec2 = { x: number; y: number };

/**
 * Canonical axis-aligned box, using DOM-aligned `width`/`height` keys. This is
 * the single box vocabulary shared across surfaces: the Main canvas `Rect` and
 * the HTML-scene `HtmlCanvasBounds` are aliases of this type, so every surface
 * can consume the helpers below with no per-call conversion. The Builder keeps
 * its own `CropBox { w; h; r? }` and bridges at its geometry boundary.
 */
export type Box = { x: number; y: number; width: number; height: number };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Intersection of two axis-aligned boxes, or null when they do not overlap. */
export function intersectBox(a: Box, b: Box): Box | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Allocation-free overlap test (hot paths like marquee selection). */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Length of the boxes' overlap along the Y axis (0 when they do not overlap vertically). */
export function verticalOverlap(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** Length of the boxes' overlap along the X axis (0 when they do not overlap horizontally). */
export function horizontalOverlap(a: Box, b: Box): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}

/** Box spanning two corner points (drag-rectangle from a start and current point). */
export function boxFromPoints(start: Vec2, point: Vec2): Box {
  return {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y),
  };
}

/** Bounding box of a free-draw path, or null when fewer than two points exist. */
export function boundsOfPoints(points: readonly Vec2[]): Box | null {
  if (points.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}
