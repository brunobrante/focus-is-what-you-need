import { useEffect, useLayoutEffect } from "react";
import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import type { EditorState } from "@/lib/editor/types";
import { clamp } from "@/lib/editor/geometry";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasPointToViewport,
  clampViewportState,
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  snapViewportOffset,
  viewportChanged,
  viewportPointToCanvas,
  type Size,
} from "@/lib/editor/viewport";
import { getCanvasSize } from "../canvasStageUtils";
import type { ViewportClientRect } from "../canvasStageTypes";

type Params = {
  state: EditorState;
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
  draftMode: boolean;
  viewportSubjectKey?: string;
  viewportSize: Size;
  viewportInitializedSubjectRef: MutableRefObject<string | null>;
};

export function useViewportControls({
  state,
  dispatch,
  viewportRef,
  getCurrentViewportSize,
  getCurrentViewportRect,
  draftMode,
  viewportSubjectKey,
  viewportSize,
  viewportInitializedSubjectRef,
}: Params) {
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", block, { passive: false });
    return () => el.removeEventListener("wheel", block);
  }, [viewportRef]);

  useLayoutEffect(() => {
    const canvasSize = getCanvasSize(state.document);
    const subjectKey = viewportSubjectKey
      ? `${viewportSubjectKey}:${canvasSize.width}x${canvasSize.height}`
      : `${canvasSize.width}x${canvasSize.height}`;
    if (draftMode) return;
    if (viewportInitializedSubjectRef.current === subjectKey) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const zoom = getInitialZoomForCanvas(viewportSize, canvasSize);
    const next = clampViewportState(
      { zoom, offsetX: state.offsetX, offsetY: state.offsetY },
      viewportSize,
      canvasSize,
      state.canvasStageActive,
    );
    viewportInitializedSubjectRef.current = subjectKey;
    if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
    }
  }, [
    dispatch,
    draftMode,
    state.canvasStageActive,
    state.document,
    state.document.canvas.height,
    state.document.canvas.width,
    state.offsetX,
    state.offsetY,
    state.zoom,
    viewportInitializedSubjectRef,
    viewportSize,
    viewportSubjectKey,
  ]);

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const containerSize = getCurrentViewportSize();
    const viewportRect = getCurrentViewportRect();
    const canvasSize = getCanvasSize(state.document);
    let nextViewport;

    if (event.ctrlKey || event.metaKey) {
      const nextZoom = clamp(state.zoom * Math.exp(-event.deltaY * 0.002), MIN_ZOOM, MAX_ZOOM);
      const displayScale = getCanvasDisplayScale(containerSize, canvasSize);
      const currentDisplayZoom = state.zoom * displayScale;
      const nextDisplayZoom = nextZoom * displayScale;
      const cursor = { x: event.clientX - viewportRect.left, y: event.clientY - viewportRect.top };
      const currentTransform = createViewportTransform({
        displayZoom: currentDisplayZoom,
        offsetX: snapViewportOffset(state.offsetX),
        offsetY: snapViewportOffset(state.offsetY),
        canvasRotation: state.document.canvas.rotation ?? 0,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });
      const cursorCanvas = viewportPointToCanvas(cursor, currentTransform);
      const clampedCursorCanvas = {
        x: clamp(cursorCanvas.x, 0, canvasSize.width),
        y: clamp(cursorCanvas.y, 0, canvasSize.height),
      };
      const nextBaseTransform = createViewportTransform({
        displayZoom: nextDisplayZoom,
        offsetX: 0,
        offsetY: 0,
        canvasRotation: state.document.canvas.rotation ?? 0,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });
      const nextBaseCursor = canvasPointToViewport(clampedCursorCanvas, nextBaseTransform);
      nextViewport = { zoom: nextZoom, offsetX: cursor.x - nextBaseCursor.x, offsetY: cursor.y - nextBaseCursor.y };
    } else {
      nextViewport = { zoom: state.zoom, offsetX: state.offsetX - event.deltaX, offsetY: state.offsetY - event.deltaY };
    }

    const clampedViewport = clampViewportState(nextViewport, containerSize, canvasSize);
    if (viewportChanged(clampedViewport, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: clampedViewport.zoom, offsetX: clampedViewport.offsetX, offsetY: clampedViewport.offsetY });
    }
  };

  return { onWheel };
}
