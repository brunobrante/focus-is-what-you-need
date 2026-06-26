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

/** Maximum user-facing zoom: `256x` (25600%), matching Figma's ceiling. */
export const USER_MAX_ZOOM = 256;

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

type Size = { width: number; height: number };
type Pan = { x: number; y: number };

function clampPanAxis(pan: number, contentLength: number, viewportLength: number, zoom: number, padding: number): number {
  const scaled = contentLength * zoom;
  const available = Math.max(1, viewportLength - padding * 2);
  // Fits the viewport → always centered (no slack), matching the canvas at its
  // minimum zoom: zooming back out re-centers.
  if (scaled <= available) return 0;
  // Overflowing → free to travel until either edge reaches the viewport center:
  // half the scaled content of over-scroll per direction, never pushed entirely
  // past center into one half.
  //
  // The bound is `±scaled/2` with no viewport term, which can look like it diverges
  // from the canvas camera's `clampAxisOffset`, whose overflow range is built around
  // `containerLength/2` (canvas/engine/viewport.ts) (DOM-10). It does not: this is a
  // center-origin projection where `pan` is already measured from the viewport center,
  // so the viewport center sits at `pan = 0` implicitly. The canvas uses a top-left
  // origin and must add `containerLength/2` to reach the same center. `±scaled/2` here
  // is the exact center-origin equivalent — adding a viewport term would BREAK parity,
  // not restore it.
  const max = scaled / 2;
  return Math.min(max, Math.max(-max, pan));
}

/**
 * Edge-to-center pan clamp for a center-origin projection — the model the Builder
 * stage and the snapshot viewers use, where the content is centered in the
 * viewport and `pan` offsets it from that center (`screen = viewportCenter + pan
 * + world * zoom`). This is the center-origin counterpart of the canvas camera's
 * `clampAxisOffset` (canvas/engine/viewport.ts), so all four surfaces share the
 * same "scroll any edge to the middle, locking at the middle" feel.
 *
 * Per axis:
 *   - when the scaled content fits the viewport it snaps centered (`pan` 0);
 *   - when it overflows, `pan` is free to travel `±scaled/2` so either edge can
 *     be brought to the viewport center, and never past it into one half.
 *
 * `padding` (per side) shrinks the fit test so a barely-overflowing axis keeps a
 * small gutter before it unlocks panning.
 */
export function clampPanToCenter(
  pan: Pan,
  contentSize: Size,
  viewportSize: Size,
  zoom: number,
  padding = 0,
): Pan {
  return {
    x: clampPanAxis(pan.x, contentSize.width, viewportSize.width, zoom, padding),
    y: clampPanAxis(pan.y, contentSize.height, viewportSize.height, zoom, padding),
  };
}
