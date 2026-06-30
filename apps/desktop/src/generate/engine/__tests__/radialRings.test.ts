import { expect, test } from "bun:test";
import { nextRingInset } from "../radialRings";

// Builds a width×height grayscale buffer from a function of (x, y).
function gray(size: number, value: (x: number, y: number) => number): Uint8Array {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data[y * size + x] = value(x, y);
    }
  }
  return data;
}

// Concentric rings centred on the image, painted by radius bands.
function rings(size: number, bands: Array<{ to: number; v: number }>): Uint8Array {
  const c = (size - 1) / 2;
  return gray(size, (x, y) => {
    const r = Math.hypot(x - c, y - c);
    for (const b of bands) if (r <= b.to) return b.v;
    return bands[bands.length - 1].v;
  });
}

test("peels to the outermost ring inside the current edge", () => {
  const size = 200;
  const half = size / 2; // 100, == inscribed radius
  // dark core (r<=40) → bright ring (40..70) → dark ring (70..95) → edge band.
  const buf = rings(size, [
    { to: 40, v: 20 },
    { to: 70, v: 235 },
    { to: 95, v: 20 },
    { to: half, v: 235 },
  ]);
  const inset = nextRingInset(buf, size, size);
  expect(inset).not.toBeNull();
  // The next bound inward from the edge is the 95px ring → inset ≈ 100 − 95.
  expect(Math.abs((inset as number) - 5)).toBeLessThanOrEqual(3);
});

test("a second pass peels the following ring", () => {
  const size = 200;
  const half = size / 2;
  const buf = rings(size, [
    { to: 40, v: 20 },
    { to: 70, v: 235 },
    { to: 95, v: 20 },
    { to: half, v: 235 },
  ]);
  // After insetting to the 95px ring, the new crop spans radius 95; its next
  // bound inward is the 70px ring.
  const inset1 = nextRingInset(buf, size, size) as number;
  const w2 = Math.round(size - 2 * inset1);
  const off = Math.round(inset1);
  const sub = new Uint8Array(w2 * w2);
  for (let y = 0; y < w2; y += 1) {
    for (let x = 0; x < w2; x += 1) sub[y * w2 + x] = buf[(y + off) * size + (x + off)];
  }
  const inset2 = nextRingInset(sub, w2, w2);
  expect(inset2).not.toBeNull();
  // New inscribed radius ≈ 95; next bound at 70 → inset ≈ 25.
  expect(Math.abs((inset2 as number) - 25)).toBeLessThanOrEqual(5);
});

test("returns null on a flat (ringless) crop", () => {
  const buf = gray(120, () => 128);
  expect(nextRingInset(buf, 120, 120)).toBeNull();
});

test("returns null on angularly noisy interiors (no clean ring)", () => {
  // Checkerboard: high contrast everywhere but no consistent ring across angles.
  const buf = gray(120, (x, y) => ((x >> 2) + (y >> 2)) % 2 === 0 ? 235 : 20);
  expect(nextRingInset(buf, 120, 120)).toBeNull();
});

test("rejects degenerate sizes", () => {
  expect(nextRingInset(new Uint8Array(0), 0, 0)).toBeNull();
  expect(nextRingInset(new Uint8Array(64), 8, 8)).toBeNull();
});
