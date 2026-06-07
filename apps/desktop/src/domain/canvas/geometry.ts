// Neutral geometry primitives shared across canvas surfaces (the Main scene
// editor, Builder, and future Drafts/References surfaces).
//
// This module is dependency-free by contract: no React, DOM, Tauri, storage, or
// product-model imports are allowed here. It owns only pure scalar/vector/box
// math so every surface can share one implementation instead of duplicating it.

export type Vec2 = { x: number; y: number };

/**
 * Axis-aligned box using short `w`/`h` keys. This matches the Builder `CropBox`
 * shape (`CropBox` is `Box & { r?: number }`). The Main canvas uses a separate
 * `Rect { width; height }` shape and intentionally does not consume these box
 * helpers — only the scalar primitives below are shared with it.
 */
export type Box = { x: number; y: number; w: number; h: number };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Intersection of two axis-aligned boxes, or null when they do not overlap. */
export function intersectBox(a: Box, b: Box): Box | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Box spanning two corner points (drag-rectangle from a start and current point). */
export function boxFromPoints(start: Vec2, point: Vec2): Box {
  return {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    w: Math.abs(point.x - start.x),
    h: Math.abs(point.y - start.y),
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
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}
