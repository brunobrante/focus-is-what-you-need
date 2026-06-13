// Single source of truth for the user-facing zoom range, shared by every surface
// that exposes zoom — the canvas editor, the Builder, and the snapshot viewers.
// Each surface keeps its own engine and state (they are intentionally separate);
// they only agree on the human-facing range and the pure zoom math here, so a
// change to the range propagates everywhere at once.
//
// This is a domain module: pure constants and pure functions, no I/O and no
// framework imports.

/** Minimum user-facing zoom: `1x` (100%). Surfaces never zoom out below this. */
export const USER_MIN_ZOOM = 1;

/** Maximum user-facing zoom: `25x` (2500%). */
export const USER_MAX_ZOOM = 25;

/**
 * Zoom-to-cursor for any "screen = offset + world * zoom" projection: returns the
 * offset (pan) that keeps the point currently under `cursor` fixed when the zoom
 * changes from `prevZoom` to `nextZoom`.
 *
 * `cursor` and `offset` must live in the same space and share the transform's
 * origin — e.g. both relative to the stage centre for a `transform-origin: center`
 * scale+translate stage, or both in viewport pixels for a top-left origin.
 *
 * Derivation: with `screen = offset + world * zoom`, the world point under the
 * cursor is `world = (cursor - offset) / prevZoom`; requiring `cursor = offset' +
 * world * nextZoom` gives `offset' = cursor * (1 - r) + offset * r`, where
 * `r = nextZoom / prevZoom`.
 */
export function zoomToCursorOffset(
  cursor: { x: number; y: number },
  offset: { x: number; y: number },
  prevZoom: number,
  nextZoom: number,
): { x: number; y: number } {
  const ratio = nextZoom / Math.max(prevZoom, 1e-6);
  return {
    x: cursor.x * (1 - ratio) + offset.x * ratio,
    y: cursor.y * (1 - ratio) + offset.y * ratio,
  };
}
