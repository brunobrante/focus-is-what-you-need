import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

// A single discrete scroll thumb (no track). `visible` is false when the content
// fits its viewport on that axis — i.e. there is nothing to scroll, so nothing is
// drawn. `start`/`length` are in viewport pixels along the axis.
export type ScrollAxis = { visible: boolean; start: number; length: number };

const HIDDEN_AXIS: ScrollAxis = { visible: false, start: 0, length: 0 };
export const HIDDEN_SCROLL: { x: ScrollAxis; y: ScrollAxis } = { x: HIDDEN_AXIS, y: HIDDEN_AXIS };

// Shortest a thumb is allowed to get, so a deeply zoomed-in surface still shows a
// grabbable-looking indicator instead of a 1px sliver.
const MIN_THUMB = 28;
// How long after a viewport change we keep re-measuring, so the thumb tracks any
// CSS transition on the content's transform instead of snapping to the old box.
const SETTLE_MS = 220;

// Map the visible viewport window onto the scaled content extent on one axis.
// `contentStart` is the content's near edge in viewport px (negative when the
// content is pushed past the near edge, e.g. over-scroll); `contentLength` is its
// on-screen size. Returns a hidden axis when the content does not overflow.
export function computeScrollAxis(
  viewportLength: number,
  contentStart: number,
  contentLength: number,
): ScrollAxis {
  if (viewportLength <= 0 || contentLength <= viewportLength + 0.5) return HIDDEN_AXIS;
  const length = Math.max(MIN_THUMB, (viewportLength / contentLength) * viewportLength);
  const rawStart = (-contentStart / contentLength) * viewportLength;
  const start = Math.min(viewportLength - length, Math.max(0, rawStart));
  return { visible: true, start, length };
}

// Scroll axis for a freeform (draft) canvas, derived from the real content's
// bounding box. Unlike `computeScrollAxis` the track is the content box and the
// thumb is the viewport window within it, so the thumb LENGTH depends only on the
// zoom (stable) while only its position follows the pan — no jitter. It stays
// visible whenever the content is not fully in view on this axis (including small
// content panned off-screen), pinning to the edge to point the way back, and
// hides only once the content is entirely inside the viewport.
export function computeDraftScrollAxis(
  viewportLength: number,
  contentStart: number,
  contentLength: number,
): ScrollAxis {
  if (viewportLength <= 0 || contentLength <= 0) return HIDDEN_AXIS;
  const contentEnd = contentStart + contentLength;
  if (contentStart >= -0.5 && contentEnd <= viewportLength + 0.5) return HIDDEN_AXIS;
  const length = Math.min(
    viewportLength,
    Math.max(MIN_THUMB, (viewportLength / contentLength) * viewportLength),
  );
  const rawStart = (-contentStart / contentLength) * viewportLength;
  const start = Math.min(viewportLength - length, Math.max(0, rawStart));
  return { visible: true, start, length };
}

// Measure a transformed content element against its viewport using live bounding
// rects — the rects already reflect the element's transform, so no per-surface
// pan/zoom/origin math is needed. Recomputes whenever `signal` changes (pan/zoom)
// and on resize, briefly re-measuring afterwards so the thumb follows any CSS
// transition on the content.
export function useElementScrollbars(
  viewportRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null> | null | undefined,
  signal: unknown,
): { x: ScrollAxis; y: ScrollAxis } {
  const [axes, setAxes] = useState(HIDDEN_SCROLL);

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const ct = contentRef?.current;
    if (!vp || !ct) {
      setAxes((prev) => (prev === HIDDEN_SCROLL ? prev : HIDDEN_SCROLL));
      return;
    }
    const v = vp.getBoundingClientRect();
    const c = ct.getBoundingClientRect();
    const next = {
      x: computeScrollAxis(v.width, c.left - v.left, c.width),
      y: computeScrollAxis(v.height, c.top - v.top, c.height),
    };
    setAxes((prev) =>
      prev.x.visible === next.x.visible &&
      prev.x.start === next.x.start &&
      prev.x.length === next.x.length &&
      prev.y.visible === next.y.visible &&
      prev.y.start === next.y.start &&
      prev.y.length === next.y.length
        ? prev
        : next,
    );
  }, [viewportRef, contentRef]);

  useLayoutEffect(() => {
    measure();
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      measure();
      if (now - start < SETTLE_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [measure, signal]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(vp);
    const ct = contentRef?.current;
    if (ct) ro.observe(ct);
    return () => ro.disconnect();
  }, [measure, viewportRef, contentRef]);

  return axes;
}

// Discrete scroll indicators for a zoomable surface: a thin rounded thumb on each
// overflowing axis, no track. Render inside a `position: relative` viewport; the
// overlay is non-interactive and only paints the axes that overflow.
export function CanvasScrollbars({
  x,
  y,
  inset = 3,
  thickness = 6,
  transition,
}: {
  x: ScrollAxis;
  y: ScrollAxis;
  inset?: number;
  thickness?: number;
  transition?: string;
}) {
  if (!x.visible && !y.visible) return null;
  const base: CSSProperties = {
    position: "absolute",
    background: "rgba(255,255,255,0.32)",
    borderRadius: 999,
    // A faint dark ring keeps the thumb legible when the overflowing content
    // behind it is light.
    boxShadow: "0 0 0 1px rgba(0,0,0,0.18)",
    transition,
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {x.visible ? (
        <div style={{ ...base, bottom: inset, left: x.start, width: x.length, height: thickness }} />
      ) : null}
      {y.visible ? (
        <div style={{ ...base, right: inset, top: y.start, width: thickness, height: y.length }} />
      ) : null}
    </div>
  );
}
