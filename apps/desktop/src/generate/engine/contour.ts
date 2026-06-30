// Pure mask → contour tracing for the "Adjust crop" object segmentation. Given a
// binary mask (SAM's object mask), it isolates the largest blob, follows its
// outer boundary (Moore-neighbor tracing), and simplifies the loop
// (Douglas–Peucker) into a compact closed polygon the overlay can draw as a
// smooth silhouette. Framework-free and unit-tested — no canvas/DOM here.

export type Point = { x: number; y: number };

/** A mask pixel counts as foreground when its value is at/above this (0–255). */
const FG_THRESHOLD = 128;

// 8-neighborhood offsets, clockwise starting from west. Used by the boundary
// tracer; west-first so a left-most start pixel begins by probing outward.
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
];

/**
 * Traces the outer silhouette of the dominant object in a grayscale `mask`
 * (row-major, one byte per pixel, white = object). Returns a closed polygon in
 * mask-pixel coordinates, or `null` when the mask has no foreground. The polygon
 * is simplified; the caller is free to smooth it further at draw time.
 */
export function traceObjectContour(
  mask: Uint8Array | Uint8ClampedArray | number[],
  width: number,
  height: number,
  options: { threshold?: number; simplifyEpsilon?: number } = {},
): Point[] | null {
  const threshold = options.threshold ?? FG_THRESHOLD;
  // Tolerance scales with the image so big masks don't keep thousands of points.
  const epsilon =
    options.simplifyEpsilon ?? Math.max(1, Math.round(Math.min(width, height) * 0.004));
  if (width <= 0 || height <= 0 || mask.length < width * height) return null;

  const fg = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) fg[i] = mask[i] >= threshold ? 1 : 0;

  const component = largestComponent(fg, width, height);
  if (!component) return null;

  const boundary = traceBoundary(component.grid, width, height, component.start);
  if (boundary.length < 3) return null;

  const simplified = simplifyPath(boundary, epsilon);
  return simplified.length >= 3 ? simplified : boundary;
}

export type MaskBox = { x: number; y: number; w: number; h: number };

/**
 * Bounding box of every SIGNIFICANT 4-connected foreground blob in a mask — each
 * blob whose area clears a noise floor of `max(6px, 2% of the largest blob)`, so
 * small-but-real parts count and stray specks don't. These are the individual
 * objects inside a crop (the two buttons, the letters of a word), used both to
 * find a multi-part subject's overall bounds and to measure the gaps between
 * objects. Returned in scan order (no size sort).
 */
export function componentBoxes(
  mask: Uint8Array | Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold = FG_THRESHOLD,
): MaskBox[] {
  if (width <= 0 || height <= 0 || mask.length < width * height) return [];
  const labels = new Int32Array(width * height);
  const stack: number[] = [];
  const comps: { size: number; minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const isFg = (i: number) => mask[i] >= threshold;

  let label = 0;
  for (let seed = 0; seed < width * height; seed += 1) {
    if (!isFg(seed) || labels[seed] !== 0) continue;
    label += 1;
    let size = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    stack.length = 0;
    stack.push(seed);
    labels[seed] = label;
    while (stack.length) {
      const p = stack.pop() as number;
      size += 1;
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && isFg(p - 1) && labels[p - 1] === 0) {
        labels[p - 1] = label;
        stack.push(p - 1);
      }
      if (x < width - 1 && isFg(p + 1) && labels[p + 1] === 0) {
        labels[p + 1] = label;
        stack.push(p + 1);
      }
      if (y > 0 && isFg(p - width) && labels[p - width] === 0) {
        labels[p - width] = label;
        stack.push(p - width);
      }
      if (y < height - 1 && isFg(p + width) && labels[p + width] === 0) {
        labels[p + width] = label;
        stack.push(p + width);
      }
    }
    comps.push({ size, minX, minY, maxX, maxY });
  }

  if (comps.length === 0) return [];
  const maxSize = comps.reduce((m, c) => Math.max(m, c.size), 0);
  const minKeep = Math.max(6, maxSize * 0.02);
  return comps
    .filter((c) => c.size >= minKeep)
    .map((c) => ({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 }));
}

/**
 * Bounding box of ALL significant foreground — the union of every `componentBoxes`
 * blob. Spans a multi-part subject like the separate glyphs of a word, so "Adjust
 * crop" on text snaps the rectangle around the whole word, not just its first
 * letter. Returns null when there is no foreground.
 */
export function foregroundBoundingBox(
  mask: Uint8Array | Uint8ClampedArray | number[],
  width: number,
  height: number,
  threshold = FG_THRESHOLD,
): MaskBox | null {
  const boxes = componentBoxes(mask, width, height, threshold);
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Largest 4-connected foreground blob, as a 1/0 grid plus the flat index of its
 * top-most, then left-most pixel — a guaranteed boundary start whose west
 * neighbor is background, which the Moore tracer relies on.
 */
function largestComponent(
  fg: Uint8Array,
  w: number,
  h: number,
): { grid: Uint8Array; start: number } | null {
  const labels = new Int32Array(w * h);
  const stack: number[] = [];
  let label = 0;
  let bestLabel = 0;
  let bestSize = 0;
  let bestStart = -1;

  for (let seed = 0; seed < w * h; seed += 1) {
    if (fg[seed] !== 1 || labels[seed] !== 0) continue;
    label += 1;
    let size = 0;
    let topLeft = seed; // smallest flat index reached = top-most, then left-most
    stack.length = 0;
    stack.push(seed);
    labels[seed] = label;
    while (stack.length) {
      const p = stack.pop() as number;
      size += 1;
      if (p < topLeft) topLeft = p;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && fg[p - 1] === 1 && labels[p - 1] === 0) {
        labels[p - 1] = label;
        stack.push(p - 1);
      }
      if (x < w - 1 && fg[p + 1] === 1 && labels[p + 1] === 0) {
        labels[p + 1] = label;
        stack.push(p + 1);
      }
      if (y > 0 && fg[p - w] === 1 && labels[p - w] === 0) {
        labels[p - w] = label;
        stack.push(p - w);
      }
      if (y < h - 1 && fg[p + w] === 1 && labels[p + w] === 0) {
        labels[p + w] = label;
        stack.push(p + w);
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
      bestStart = topLeft;
    }
  }

  if (bestLabel === 0) return null;
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) grid[i] = labels[i] === bestLabel ? 1 : 0;
  return { grid, start: bestStart };
}

/**
 * Moore-neighbor boundary following (clockwise) over a 1/0 component grid,
 * starting from its top-left pixel with the backtrack seeded to the west. Yields
 * the ordered boundary pixels of the outer contour. A step budget guards against
 * pathological masks rather than trusting the stop condition alone.
 */
function traceBoundary(grid: Uint8Array, w: number, h: number, start: number): Point[] {
  const isFg = (x: number, y: number) =>
    x >= 0 && x < w && y >= 0 && y < h && grid[y * w + x] === 1;

  const startX = start % w;
  const startY = (start - startX) / w;
  const points: Point[] = [];

  let cx = startX;
  let cy = startY;
  let backX = startX - 1; // came from the west (background)
  let backY = startY;
  let stepped = false;
  const maxSteps = w * h * 8 + 16;

  for (let safety = 0; safety < maxSteps; safety += 1) {
    points.push({ x: cx, y: cy });

    // Direction index pointing at the backtrack pixel.
    let from = 0;
    for (let i = 0; i < 8; i += 1) {
      if (cx + NEIGHBORS[i][0] === backX && cy + NEIGHBORS[i][1] === backY) {
        from = i;
        break;
      }
    }

    // Sweep clockwise from just past the backtrack until the next foreground.
    let found = false;
    for (let k = 1; k <= 8; k += 1) {
      const i = (from + k) % 8;
      const nx = cx + NEIGHBORS[i][0];
      const ny = cy + NEIGHBORS[i][1];
      if (isFg(nx, ny)) {
        const prev = (from + k - 1) % 8;
        backX = cx + NEIGHBORS[prev][0];
        backY = cy + NEIGHBORS[prev][1];
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel

    if (stepped && cx === startX && cy === startY) break; // looped back to start
    stepped = true;
  }

  return points;
}

/** Perpendicular distance from `p` to the segment `a`–`b`. */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/**
 * Iterative Ramer–Douglas–Peucker: drops vertices that lie within `epsilon` of
 * the line between the points that bracket them. Run over the open boundary
 * sequence (its first/last points sit at the start pixel, so the loop stays
 * closed). Iterative to avoid deep recursion on long contours.
 */
export function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > epsilon && index !== -1) {
      keep[index] = 1;
      stack.push([first, index]);
      stack.push([index, last]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i]);
  return out;
}
