import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { ZOOM_DEFAULT_IDX, ZOOM_STEPS } from "./ZoomControls";

// Accumulated wheel delta (in px) required to advance one discrete zoom stop, so
// a trackpad's many small Cmd+scroll events don't rocket through all 16 stops.
const WHEEL_STEP_THRESHOLD = 60;

/**
 * Shared discrete-step zoom for the snapshot viewers (Fast Edit, Preview, the
 * reference inspector). Owns the index into `ZOOM_STEPS` and exposes the props
 * `ZoomControls` needs, plus a `Cmd`/`Ctrl`+wheel handler bound to `targetRef`
 * (native + non-passive, so the browser's own zoom is suppressed) and, when
 * `keyboard` is set, `Cmd`+`=` / `Cmd`+`-` / `Cmd`+`0` shortcuts.
 *
 * The viewers all clamp to 1x..25x via the shared `ZOOM_STEPS`, so they can never
 * drift from the canvas/Builder range.
 */
export function useStepZoom(
  targetRef: RefObject<HTMLElement | null>,
  options?: { keyboard?: boolean; enabled?: boolean },
) {
  const keyboard = options?.keyboard ?? false;
  const enabled = options?.enabled ?? true;
  const [index, setIndex] = useState(ZOOM_DEFAULT_IDX);

  const zoomIn = useCallback(() => setIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const reset = useCallback(() => setIndex(ZOOM_DEFAULT_IDX), []);

  // Cmd/Ctrl + wheel zooms toward the stops. Bound natively so preventDefault
  // actually suppresses the browser's pinch/zoom on the same gesture.
  const wheelAccum = useRef(0);
  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      wheelAccum.current += event.deltaY;
      while (wheelAccum.current <= -WHEEL_STEP_THRESHOLD) {
        zoomIn();
        wheelAccum.current += WHEEL_STEP_THRESHOLD;
      }
      while (wheelAccum.current >= WHEEL_STEP_THRESHOLD) {
        zoomOut();
        wheelAccum.current -= WHEEL_STEP_THRESHOLD;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [targetRef, enabled, zoomIn, zoomOut]);

  useEffect(() => {
    if (!enabled || !keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, keyboard, zoomIn, zoomOut, reset]);

  return {
    index,
    zoom: ZOOM_STEPS[index] ?? 1,
    zoomIn,
    zoomOut,
    reset,
  };
}
