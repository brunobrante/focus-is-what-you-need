// Clean-proportion snapping for "Adjust crop". UI elements are authored to exact
// proportions (a square badge, a 16:9 card), but pixel-level cropping lands them
// a hair off — a square comes back 547×546 because anti-aliasing softens the edge
// into a black→grey→white band ~1px wide, so the detected bounds differ by a
// pixel on one axis. When the crop is within a whisker of a simple ratio we snap
// it exactly onto that ratio, keeping the LONGER side and growing/shrinking the
// shorter one (so a near-square grows to a true square — what the user would
// nudge by hand). Pure: numbers in, numbers out, no rounding to integers.

export type AspectSnapResult = { w: number; h: number; ratio: readonly [number, number] };

// Common UI proportions, as ordered (a, b). Magnitude only — orientation is
// recovered from which input side is longer, so each entry covers both landscape
// and portrait.
const RATIOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [4, 3],
  [3, 2],
  [16, 10],
  [16, 9],
  [2, 1],
  [21, 9],
  [3, 1],
];

/**
 * Snaps (`w`, `h`) onto the nearest simple proportion when the shorter side is
 * within tolerance of that ratio's target, else returns `null` (leave the crop
 * as measured). Tolerance is `max(absPx, rel · longSide)` on the shorter side, so
 * both a 1px-off large square and a 1px-off small one snap, while a genuinely
 * off-ratio crop does not. The longer side is preserved; the shorter is set to
 * `long / ratio`.
 */
export function snapAspect(
  w: number,
  h: number,
  opts: { absPx?: number; rel?: number } = {},
): AspectSnapResult | null {
  if (!(w > 0) || !(h > 0)) return null;
  const absPx = opts.absPx ?? 2;
  const rel = opts.rel ?? 0.008;

  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const tol = Math.max(absPx, rel * long);

  let best: { target: number; ratio: readonly [number, number]; delta: number } | null = null;
  for (const ratio of RATIOS) {
    const r = Math.max(ratio[0], ratio[1]) / Math.min(ratio[0], ratio[1]); // ≥ 1
    const target = long / r; // the shorter side this ratio wants
    const delta = Math.abs(target - short);
    if (delta <= tol && (!best || delta < best.delta)) best = { target, ratio, delta };
  }
  if (!best) return null;
  if (best.delta === 0) return null; // already exactly on ratio — nothing to do

  // Put the snapped sides back on the original orientation.
  const portrait = h > w;
  return {
    w: portrait ? best.target : long,
    h: portrait ? long : best.target,
    ratio: best.ratio,
  };
}
