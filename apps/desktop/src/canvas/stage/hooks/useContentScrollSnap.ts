import { useCallback, useEffect, useRef } from "react";
import { getContentAxis, getContentPages } from "@/canvas/engine/geometry";
import type { CanvasDocument } from "@/canvas/engine/types";

// Screen pages: page count is quantized but the scroll is continuous, so a scrub
// or wheel can rest the window half-way between two pages. This eases the content
// scroll to the nearest page boundary once the gesture settles, while leaving the
// scroll free during the gesture itself.
//
// The metric/scroll getters and the setter are held in refs so the returned
// callbacks stay stable and always read the latest state — a settle timer that
// fires 140ms after the last wheel must snap from the CURRENT scroll, not a value
// captured at schedule time.
const SNAP_DURATION_MS = 220; // ease-out glide to the page boundary
const SNAP_SETTLE_MS = 140; // quiet period after the last wheel before snapping

export function useContentScrollSnap(
  getDocument: () => CanvasDocument,
  getScroll: () => number,
  setScroll: (scroll: number) => void,
) {
  const docRef = useRef(getDocument);
  docRef.current = getDocument;
  const scrollRef = useRef(getScroll);
  scrollRef.current = getScroll;
  const setScrollRef = useRef(setScroll);
  setScrollRef.current = setScroll;
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef<number | null>(null);

  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const snapNow = useCallback(() => {
    cancelAnimation();
    const doc = docRef.current();
    const pages = getContentPages(doc);
    if (pages <= 1) return;
    const axisSize = getContentAxis(doc) === "horizontal" ? doc.canvas.width : doc.canvas.height;
    if (axisSize <= 0) return;
    const maxScroll = (pages - 1) * axisSize;
    const from = scrollRef.current();
    const target = Math.max(0, Math.min(maxScroll, Math.round(from / axisSize) * axisSize));
    if (Math.abs(target - from) < 0.5) {
      if (target !== from) setScrollRef.current(target);
      return;
    }
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / SNAP_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setScrollRef.current(from + (target - from) * eased);
      rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [cancelAnimation]);

  // Debounced: called on each wheel tick; snaps once the wheel goes quiet.
  const scheduleSnap = useCallback(() => {
    if (settleRef.current !== null) clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null;
      snapNow();
    }, SNAP_SETTLE_MS);
  }, [snapNow]);

  // Abort a pending/running snap — call at the start of a fresh gesture so free
  // scrolling is never fought by an in-flight glide.
  const cancelSnap = useCallback(() => {
    cancelAnimation();
    if (settleRef.current !== null) {
      clearTimeout(settleRef.current);
      settleRef.current = null;
    }
  }, [cancelAnimation]);

  useEffect(() => cancelSnap, [cancelSnap]);

  return { snapNow, scheduleSnap, cancelSnap };
}
