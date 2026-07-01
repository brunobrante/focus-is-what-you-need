// Square-snap for "Adjust crop". A UI element authored square comes back from a
// pixel-level crop at e.g. 547×546: the anti-aliased edge (a black→grey→white
// band ~1px wide) costs a pixel on one axis. One adaptive rule — not a table of
// fixed ratios: if the two sides are within a whisker of each other (measured
// relative to the box, so it holds at any size), they were meant to be equal, so
// make them equal. The longer side wins (what the user would nudge to by hand),
// centred. Pure: numbers in, numbers out. Returns null when the box is clearly
// not square (leave it exactly as measured).

export type SquareSnap = { w: number; h: number };

/**
 * Snaps a near-square box to an exact square, or returns `null`. The gap between
 * the sides must be within `max(absPx, rel · longSide)` — an absolute floor so a
 * small box off by a pixel still snaps, plus a relative term so a large box is
 * only snapped when the mismatch is genuinely sub-percent (a real 4:3 or 3:2 crop
 * is well outside and left untouched).
 */
export function snapAspect(
  w: number,
  h: number,
  opts: { absPx?: number; rel?: number } = {},
): SquareSnap | null {
  if (!(w > 0) || !(h > 0)) return null;
  const absPx = opts.absPx ?? 2;
  const rel = opts.rel ?? 0.01;

  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const gap = long - short;
  if (gap === 0) return null; // already square — nothing to do
  if (gap > Math.max(absPx, rel * long)) return null; // not square enough

  return { w: long, h: long };
}
