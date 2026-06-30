import { expect, test } from "bun:test";
import {
  foregroundBoundingBox,
  simplifyPath,
  traceObjectContour,
  type Point,
} from "../contour";

// Builds a width×height mask (255 = foreground) from a predicate over (x, y).
function mask(
  width: number,
  height: number,
  fg: (x: number, y: number) => boolean,
): Uint8Array {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = fg(x, y) ? 255 : 0;
    }
  }
  return data;
}

function bounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

test("returns null for an all-background mask", () => {
  expect(traceObjectContour(new Uint8Array(64), 8, 8)).toBeNull();
});

test("returns null when the mask is smaller than its declared size", () => {
  expect(traceObjectContour(new Uint8Array(10), 8, 8)).toBeNull();
});

test("traces a filled rectangle's boundary tight to its edges", () => {
  // A 10×6 rectangle inset inside a 40×40 field.
  const data = mask(40, 40, (x, y) => x >= 5 && x <= 14 && y >= 8 && y <= 13);
  const contour = traceObjectContour(data, 40, 40, { simplifyEpsilon: 0.5 });
  expect(contour).not.toBeNull();
  const c = contour as Point[];
  expect(c.length).toBeGreaterThanOrEqual(3);
  const b = bounds(c);
  expect(b.minX).toBe(5);
  expect(b.minY).toBe(8);
  expect(b.maxX).toBe(14);
  expect(b.maxY).toBe(13);
  // Every vertex sits inside the image.
  for (const p of c) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThan(40);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThan(40);
  }
});

test("a near-rectangular blob simplifies to a handful of corners", () => {
  const data = mask(40, 40, (x, y) => x >= 4 && x <= 30 && y >= 4 && y <= 24);
  const contour = traceObjectContour(data, 40, 40);
  expect(contour).not.toBeNull();
  // Four dominant corners (+ a couple of stragglers from the trace start), not
  // one vertex per boundary pixel.
  expect((contour as Point[]).length).toBeLessThanOrEqual(8);
});

test("picks the largest blob and ignores smaller specks", () => {
  // A big 16×16 square on the left, a tiny 2×2 speck on the right.
  const big = (x: number, y: number) => x >= 2 && x <= 17 && y >= 2 && y <= 17;
  const speck = (x: number, y: number) => x >= 36 && x <= 37 && y >= 36 && y <= 37;
  const data = mask(40, 40, (x, y) => big(x, y) || speck(x, y));
  const contour = traceObjectContour(data, 40, 40, { simplifyEpsilon: 0.5 });
  expect(contour).not.toBeNull();
  const b = bounds(contour as Point[]);
  // The contour belongs to the big square, nowhere near the speck.
  expect(b.maxX).toBeLessThanOrEqual(17);
  expect(b.maxY).toBeLessThanOrEqual(17);
});

test("foregroundBoundingBox spans separate blobs (whole word, not one glyph)", () => {
  // Two separated squares, like two letters of a word.
  const left = (x: number, y: number) => x >= 3 && x <= 9 && y >= 4 && y <= 12;
  const right = (x: number, y: number) => x >= 20 && x <= 30 && y >= 3 && y <= 14;
  const data = mask(40, 20, (x, y) => left(x, y) || right(x, y));
  const bb = foregroundBoundingBox(data, 40, 20);
  expect(bb).toEqual({ x: 3, y: 3, w: 28, h: 12 }); // covers both, 3..30 / 3..14
});

test("foregroundBoundingBox drops a tiny speck below the noise floor", () => {
  const big = (x: number, y: number) => x >= 4 && x <= 24 && y >= 4 && y <= 24;
  const speck = (x: number, y: number) => x === 38 && y === 1; // 1px noise
  const data = mask(40, 30, (x, y) => big(x, y) || speck(x, y));
  const bb = foregroundBoundingBox(data, 40, 30);
  expect(bb).toEqual({ x: 4, y: 4, w: 21, h: 21 }); // speck ignored
});

test("foregroundBoundingBox returns null for an empty mask", () => {
  expect(foregroundBoundingBox(new Uint8Array(64), 8, 8)).toBeNull();
});

test("simplifyPath collapses collinear points but keeps corners", () => {
  const straightWithCorner: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 3 },
  ];
  const out = simplifyPath(straightWithCorner, 0.1);
  expect(out).toEqual([
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 3 },
  ]);
});
