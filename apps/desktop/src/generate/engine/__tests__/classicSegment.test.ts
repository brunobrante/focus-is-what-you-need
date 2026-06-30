import { expect, test } from "bun:test";
import { otsuThreshold, segmentByContrast } from "../classicSegment";
import { traceObjectContour } from "../contour";

// Builds an RGBA buffer from a per-pixel colour function.
function rgba(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const [r, g, b] = color(x, y);
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}

function maskBounds(mask: Uint8Array, w: number, h: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (mask[y * w + x] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, x === minX ? y : minY);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        minY = Math.min(minY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

test("otsuThreshold splits a clearly bimodal histogram between the modes", () => {
  const hist = new Array(256).fill(0);
  hist[20] = 1000; // background mode
  hist[200] = 1000; // foreground mode
  // The split sits between the modes: bins above it (the 200 mode) are foreground.
  const t = otsuThreshold(hist, 2000);
  expect(t).toBeGreaterThanOrEqual(20);
  expect(t).toBeLessThan(200);
});

test("segmentByContrast isolates a solid button on a contrasting background", () => {
  // White field with an orange rectangle inset (like a button with margin).
  const W = 40;
  const H = 24;
  const inB = (x: number, y: number) => x >= 6 && x <= 33 && y >= 5 && y <= 18;
  const data = rgba(W, H, (x, y) => (inB(x, y) ? [232, 96, 58] : [255, 255, 255]));
  const mask = segmentByContrast(data, W, H);
  expect(mask).not.toBeNull();
  const b = maskBounds(mask as Uint8Array, W, H);
  expect(b.minX).toBe(6);
  expect(b.minY).toBe(5);
  expect(b.maxX).toBe(33);
  expect(b.maxY).toBe(18);
});

test("segmentByContrast + traceObjectContour ignores interior text holes", () => {
  // Orange button with a white glyph hole inside — the outer contour is the
  // button, not the glyph.
  const W = 40;
  const H = 24;
  const button = (x: number, y: number) => x >= 4 && x <= 35 && y >= 4 && y <= 19;
  const glyph = (x: number, y: number) => x >= 18 && x <= 21 && y >= 9 && y <= 14;
  const data = rgba(W, H, (x, y) =>
    button(x, y) && !glyph(x, y) ? [232, 96, 58] : [255, 255, 255],
  );
  const mask = segmentByContrast(data, W, H) as Uint8Array;
  const contour = traceObjectContour(mask, W, H, { simplifyEpsilon: 0.5 });
  expect(contour).not.toBeNull();
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of contour as { x: number; y: number }[]) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  expect(minX).toBe(4); // the button's outer edge, not the glyph at x=18
  expect(maxX).toBe(35);
});

test("segmentByContrast returns null for a short buffer", () => {
  expect(segmentByContrast(new Uint8ClampedArray(10), 8, 8)).toBeNull();
});
