import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { clampPanToCenter } from "@/domain/zoom";
import { matchesKeyCommand } from "@/domain/settings/resolve";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { useElementScrollbars } from "@/components/ui/CanvasScrollbars";
import { ZOOM_DEFAULT_IDX, ZOOM_STEPS } from "./ZoomControls";

// Accumulated wheel delta (in px) required to advance one discrete zoom stop, so
// a trackpad's many small Cmd+scroll events don't rocket through all 16 stops.
const WHEEL_STEP_THRESHOLD = 60;
// Per-side gutter before a fitting axis unlocks panning, matching the canvas
// stage padding so the over-scroll feel is consistent across surfaces.
const VIEWER_PAN_PADDING = 24;
// Pointer travel (px) before a press becomes a pan instead of a selection click.
const PAN_DRAG_THRESHOLD = 4;

type Pan = { x: number; y: number };

/**
 * Shared discrete-step zoom for the snapshot viewers (Fast Edit, Preview, the
 * reference inspector). Owns the index into `ZOOM_STEPS` and exposes the props
 * `ZoomControls` needs, plus a `Cmd`/`Ctrl`+wheel handler bound to `targetRef`
 * (native + non-passive, so the browser's own zoom is suppressed) and, when
 * `keyboard` is set, `Cmd`+`=` / `Cmd`+`-` / `Cmd`+`0` shortcuts.
 *
 * The viewers all clamp to the shared `ZOOM_STEPS` range (`USER_MIN_ZOOM`..
 * `USER_MAX_ZOOM`, i.e. 1x..256x), so they can never drift from the canvas/Builder
 * range.
 *
 * When a `contentRef` is supplied the hook also owns the pan: drag-to-pan, plain
 * wheel-pan, and an edge-to-center over-scroll clamp shared with the canvas and
 * the Builder (see `clampPanToCenter`). Once the scaled content overflows the
 * stage it can be dragged until any edge reaches the viewport center and locks
 * there; when it fits, it snaps centered. Spread the returned `panHandlers` onto
 * the stage element and apply `transform` to the scaled content.
 */
export function useStepZoom(
  targetRef: RefObject<HTMLElement | null>,
  options?: { keyboard?: boolean; enabled?: boolean; contentRef?: RefObject<HTMLElement | null> },
) {
  const keyboard = options?.keyboard ?? false;
  const enabled = options?.enabled ?? true;
  const contentRef = options?.contentRef;
  // Resolve the zoom keyboard shortcuts through user settings rather than raw
  // modifier reads, per the canvas input guardrail (UI-15).
  const { settings } = useGlobalSettings();
  const [index, setIndex] = useState(ZOOM_DEFAULT_IDX);
  const zoom = ZOOM_STEPS[index] ?? 1;

  const zoomIn = useCallback(() => setIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Jump toward an arbitrary target zoom (e.g. the toolbar's continuous % control),
  // snapping to the nearest discrete stop. A tiny delta — the toolbar's ± buttons,
  // which nudge by a fraction that may round back to the same stop — still advances
  // exactly one stop in its direction, so the control never feels stuck.
  const setZoom = useCallback((next: number | ((zoom: number) => number)) => {
    setIndex((i) => {
      const current = ZOOM_STEPS[i] ?? 1;
      const target = typeof next === "function" ? next(current) : next;
      let best = 0;
      let bestDist = Infinity;
      for (let k = 0; k < ZOOM_STEPS.length; k += 1) {
        const dist = Math.abs((ZOOM_STEPS[k] ?? 1) - target);
        if (dist < bestDist) {
          bestDist = dist;
          best = k;
        }
      }
      if (best === i) {
        if (target > current) best = Math.min(i + 1, ZOOM_STEPS.length - 1);
        else if (target < current) best = Math.max(i - 1, 0);
      }
      return best;
    });
  }, []);

  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [canPan, setCanPan] = useState(false);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Set right after a drag so the synthetic click that follows pointerup does not
  // also select a node under the cursor.
  const justPannedRef = useRef(false);

  // Live measurement of viewport (targetRef) and content (contentRef). Transforms
  // do not change layout, so `clientWidth/Height` stay at the 1x size and we apply
  // `zoom` ourselves — same model as the Builder's clampToolPan.
  const measure = useCallback(() => {
    const vp = targetRef.current;
    const ct = contentRef?.current;
    if (!vp || !ct) return null;
    return { vw: vp.clientWidth, vh: vp.clientHeight, cw: ct.clientWidth, ch: ct.clientHeight };
  }, [targetRef, contentRef]);

  const clampPan = useCallback(
    (next: Pan, zoomNow: number): Pan => {
      const m = measure();
      if (!m) return { x: 0, y: 0 };
      return clampPanToCenter(next, { width: m.cw, height: m.ch }, { width: m.vw, height: m.vh }, zoomNow, VIEWER_PAN_PADDING);
    },
    [measure],
  );

  const overflowsNow = useCallback(
    (zoomNow: number): boolean => {
      const m = measure();
      if (!m) return false;
      const padW = Math.max(1, m.vw - VIEWER_PAN_PADDING * 2);
      const padH = Math.max(1, m.vh - VIEWER_PAN_PADDING * 2);
      return m.cw * zoomNow > padW + 0.5 || m.ch * zoomNow > padH + 0.5;
    },
    [measure],
  );

  const reset = useCallback(() => {
    setIndex(ZOOM_DEFAULT_IDX);
    setPan({ x: 0, y: 0 });
  }, []);

  // Re-clamp the pan whenever the zoom changes (zooming out shrinks the reachable
  // range back toward centered) and refresh whether panning is currently possible.
  useEffect(() => {
    if (!contentRef) return;
    setPan((p) => clampPan(p, zoom));
    setCanPan(overflowsNow(zoom));
  }, [contentRef, zoom, clampPan, overflowsNow]);

  // Cmd/Ctrl + wheel zooms toward the stops; plain wheel pans when the content
  // overflows. Bound natively so preventDefault actually suppresses the browser's
  // pinch/zoom and rubber-band scroll on the same gesture.
  const wheelAccum = useRef(0);
  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el) return;
    const onWheel = (event: WheelEvent) => {
      // Cmd/Ctrl+wheel = zoom. This is a fixed, universal pinch-zoom gesture with
      // no configurable modifier command to route through, so the raw mod read
      // here is intentional (unlike the keyboard shortcuts below — UI-15).
      if (event.ctrlKey || event.metaKey) {
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
        return;
      }
      // Plain wheel → pan, but only while the content actually overflows; let the
      // event fall through (native scroll of ancestors) otherwise.
      if (!contentRef || !overflowsNow(zoomRef.current)) return;
      event.preventDefault();
      setPan(clampPan({ x: panRef.current.x - event.deltaX, y: panRef.current.y - event.deltaY }, zoomRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [targetRef, enabled, contentRef, zoomIn, zoomOut, clampPan, overflowsNow]);

  useEffect(() => {
    if (!enabled || !keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomIn")) {
        event.preventDefault();
        zoomIn();
      } else if (matchesKeyCommand(event, settings, "canvas.viewport.zoomOut")) {
        event.preventDefault();
        zoomOut();
      } else if (matchesKeyCommand(event, settings, "canvas.viewport.zoomReset")) {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, keyboard, settings, zoomIn, zoomOut, reset]);

  // Drag-to-pan. Tracking starts on pointerdown but only becomes a pan once the
  // pointer passes the threshold, so a plain click still selects the node under
  // the cursor; once it is a pan we swallow the trailing click in capture phase.
  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // Clear before the guards: a pan whose trailing click never fired (e.g. the
      // pointer left the element, or the content stopped overflowing) would leave
      // the flag set and swallow the next legitimate click otherwise.
      justPannedRef.current = false;
      if (!enabled || !contentRef || event.button !== 0) return;
      if (!overflowsNow(zoomRef.current)) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const startPan = panRef.current;
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < PAN_DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          setIsPanning(true);
        }
        setPan(clampPan({ x: startPan.x + dx, y: startPan.y + dy }, zoomRef.current));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) {
          justPannedRef.current = true;
          setIsPanning(false);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [enabled, contentRef, clampPan, overflowsNow],
  );

  const onClickCapture = useCallback((event: ReactPointerEvent) => {
    if (!justPannedRef.current) return;
    event.stopPropagation();
    justPannedRef.current = false;
  }, []);

  const transform = contentRef ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined;

  // Discrete scroll indicators — only present when a contentRef is supplied (the
  // panning viewers) and the content overflows the stage. Spread onto
  // `<CanvasScrollbars>` inside the stage.
  const scroll = useElementScrollbars(targetRef, contentRef, `${zoom}:${pan.x}:${pan.y}`);

  return {
    index,
    zoom,
    zoomIn,
    zoomOut,
    setZoom,
    reset,
    // Pan surface (active only when a contentRef is supplied).
    pan,
    isPanning,
    canPan,
    transform,
    scroll,
    panHandlers: { onPointerDown, onClickCapture },
  };
}
