// Concentric-ring detection for "Adjust crop" on round subjects — badges, coins,
// circular logos. SAM returns one filled blob, so its bounding box barely moves
// on a ringed circle and "Adjust crop" looks like it does nothing. Instead we
// read the crop radially from its centre and find the NEXT strong, angularly-
// consistent contrast edge just inside the current crop edge — the next ring
// inward — and report how far to inset the crop to land on it. Clicking again
// peels the following ring. Pure (grayscale in, number out), no canvas/DOM.

export type Gray = Uint8Array | Uint8ClampedArray | number[];

/** Bilinear sample of `gray` at (x, y), clamped to the image edges. */
function sampleBilinear(gray: Gray, w: number, h: number, x: number, y: number): number {
  if (x < 0) x = 0;
  else if (x > w - 1) x = w - 1;
  if (y < 0) y = 0;
  else if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const dx = x - x0;
  const dy = y - y0;
  const a = gray[y0 * w + x0];
  const b = gray[y0 * w + x1];
  const c = gray[y1 * w + x0];
  const d = gray[y1 * w + x1];
  const top = a + (b - a) * dx;
  const bottom = c + (d - c) * dx;
  return top + (bottom - top) * dy;
}

/**
 * Finds the next concentric ring boundary inside a (roughly centred, round)
 * grayscale crop and returns how many pixels to inset the crop on every side to
 * land on it — or `null` when there is no clean concentric ring (text, a flat
 * object, an off-centre subject). A "ring" is a sharp jump in the mean intensity
 * around the circle that is consistent across angles (low angular spread), which
 * separates true concentric rings from noisy interiors like lettering.
 *
 * The crop centre is taken as the image centre, and only the inscribed circle is
 * read, so sampling never reaches the corners (and never the page behind the
 * subject). Among the qualifying rings we pick the OUTERMOST one — the boundary
 * closest inward to the current crop edge — so each call peels exactly one ring.
 */
export function nextRingInset(
  gray: Gray,
  width: number,
  height: number,
  opts: { minContrast?: number; angles?: number } = {},
): number | null {
  if (width <= 16 || height <= 16 || gray.length < width * height) return null;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.min(width, height) / 2;
  const R = Math.floor(maxR);
  if (R < 12) return null;

  const angles = opts.angles ?? 120;
  const minContrast = opts.minContrast ?? 16;

  // Radial profile: mean and standard deviation of intensity over a full circle
  // of sample angles, per integer radius.
  const mean = new Float32Array(R + 1);
  const std = new Float32Array(R + 1);
  for (let r = 0; r <= R; r += 1) {
    let sum = 0;
    let sumSq = 0;
    for (let k = 0; k < angles; k += 1) {
      const t = (k / angles) * Math.PI * 2;
      const v = sampleBilinear(gray, width, height, cx + r * Math.cos(t), cy + r * Math.sin(t));
      sum += v;
      sumSq += v * v;
    }
    const m = sum / angles;
    mean[r] = m;
    std[r] = Math.sqrt(Math.max(0, sumSq / angles - m * m));
  }

  // Radial contrast across a small window straddling each radius.
  const win = Math.max(2, Math.round(R * 0.02));
  const contrast = new Float32Array(R + 1);
  for (let r = 0; r <= R; r += 1) {
    const inner = mean[Math.max(0, r - win)];
    const outer = mean[Math.min(R, r + win)];
    contrast[r] = Math.abs(outer - inner);
  }

  // Scan inward from just inside the edge: the first qualifying ring boundary is
  // the one closest to the current crop edge — the "next bound".
  const lo = Math.round(R * 0.4);
  const hi = Math.round(R * 0.97);
  for (let r = hi; r >= lo; r -= 1) {
    const c = contrast[r];
    if (c < minContrast) continue;
    // The radial jump must clearly beat the angular spread around it, or it is
    // texture/lettering rather than a clean ring.
    const noise = (std[r] * 2 + std[Math.max(0, r - win)] + std[Math.min(R, r + win)]) / 4;
    if (noise > c * 0.75) continue;
    // Non-maximum suppression: keep only the local contrast peak.
    let isPeak = true;
    for (let j = Math.max(0, r - win); j <= Math.min(R, r + win); j += 1) {
      if (contrast[j] > c) {
        isPeak = false;
        break;
      }
    }
    if (!isPeak) continue;
    // Sub-pixel edge: the true ring boundary sits in the middle of the
    // anti-aliased band, not on the integer peak. Find where the mean profile
    // crosses the midpoint between the inner and outer plateaus and interpolate.
    const inner = mean[Math.max(0, r - win)];
    const outer = mean[Math.min(R, r + win)];
    const mid = (inner + outer) / 2;
    let rEdge = r;
    for (let j = Math.max(0, r - win); j < Math.min(R, r + win); j += 1) {
      const a = mean[j];
      const b = mean[j + 1];
      if (a !== b && (a - mid) * (b - mid) <= 0) {
        rEdge = j + (mid - a) / (b - a);
        break;
      }
    }
    const inset = maxR - rEdge;
    return inset >= 1 ? inset : null;
  }
  return null;
}
