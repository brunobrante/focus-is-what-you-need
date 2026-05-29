import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Size } from "@/canvas/engine/viewport";
import { getViewportSize } from "../canvasCoordinates";
import { sizesEqual } from "../canvasStageHelpers";
import type { ViewportClientRect } from "../canvasStageTypes";
import { ZERO_VIEWPORT_RECT, ZERO_VIEWPORT_SIZE } from "../canvasStageTypes";

type ViewportMetrics = {
  viewportSize: Size;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
};

export function useViewportMetrics(
  viewportRef: { current: HTMLDivElement | null },
): ViewportMetrics {
  const viewportSizeRef = useRef<Size>(ZERO_VIEWPORT_SIZE);
  const viewportRectRef = useRef<ViewportClientRect>(ZERO_VIEWPORT_RECT);
  const viewportMetricsFrameRef = useRef<number | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(ZERO_VIEWPORT_SIZE);

  const syncViewportMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const nextRect: ViewportClientRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    const nextSize: Size = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };

    viewportRectRef.current = nextRect;
    viewportSizeRef.current = nextSize;
    setViewportSize((previous) => (sizesEqual(previous, nextSize) ? previous : nextSize));
  }, [viewportRef]);

  const scheduleViewportMetricsSync = useCallback(() => {
    if (viewportMetricsFrameRef.current !== null) return;
    viewportMetricsFrameRef.current = globalThis.requestAnimationFrame(() => {
      viewportMetricsFrameRef.current = null;
      syncViewportMetrics();
    });
  }, [syncViewportMetrics]);

  useLayoutEffect(() => {
    syncViewportMetrics();

    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(scheduleViewportMetricsSync);
    observer.observe(viewport);
    globalThis.addEventListener("resize", scheduleViewportMetricsSync);
    globalThis.visualViewport?.addEventListener("resize", scheduleViewportMetricsSync);
    globalThis.visualViewport?.addEventListener("scroll", scheduleViewportMetricsSync);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", scheduleViewportMetricsSync);
      globalThis.visualViewport?.removeEventListener("resize", scheduleViewportMetricsSync);
      globalThis.visualViewport?.removeEventListener("scroll", scheduleViewportMetricsSync);
      if (viewportMetricsFrameRef.current !== null) {
        globalThis.cancelAnimationFrame(viewportMetricsFrameRef.current);
        viewportMetricsFrameRef.current = null;
      }
    };
  }, [scheduleViewportMetricsSync, syncViewportMetrics, viewportRef]);

  const getCurrentViewportSize = useCallback((): Size => {
    const cached = viewportSizeRef.current;
    if (cached.width > 0 || cached.height > 0) return cached;
    const viewport = viewportRef.current;
    if (!viewport) return ZERO_VIEWPORT_SIZE;
    const next = getViewportSize(viewport);
    viewportSizeRef.current = next;
    return next;
  }, [viewportRef]);

  const getCurrentViewportRect = useCallback((): ViewportClientRect => {
    const cached = viewportRectRef.current;
    if (cached.width > 0 || cached.height > 0) return cached;
    const viewport = viewportRef.current;
    if (!viewport) return ZERO_VIEWPORT_RECT;
    const rect = viewport.getBoundingClientRect();
    const next = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    viewportRectRef.current = next;
    return next;
  }, [viewportRef]);

  return { viewportSize, getCurrentViewportSize, getCurrentViewportRect };
}
