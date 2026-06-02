import { useEffect, useLayoutEffect } from "react";
import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import type { EditorState } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import { clamp } from "@/canvas/engine/geometry";
import {
  canvasPointToViewport,
  clampViewportState,
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  getViewportZoomLimits,
  snapViewportOffset,
  viewportChanged,
  viewportPointToCanvas,
  type Size,
} from "@/canvas/engine/viewport";
import { getCanvasSize } from "../canvasCoordinates";
import type { ViewportClientRect } from "../canvasStageTypes";

type Params = {
  state: EditorState;
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
  viewportSubjectKey?: string;
  viewportSize: Size;
  viewportInitializedSubjectRef: MutableRefObject<string | null>;
  settings?: GlobalSettings;
};

export function useViewportControls({
  state,
  dispatch,
  viewportRef,
  getCurrentViewportSize,
  getCurrentViewportRect,
  viewportSubjectKey,
  viewportSize,
  viewportInitializedSubjectRef,
  settings = DEFAULT_GLOBAL_SETTINGS,
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
      ? `${viewportSubjectKey}:${state.viewportMode}:${canvasSize.width}x${canvasSize.height}`
      : `${state.viewportMode}:${canvasSize.width}x${canvasSize.height}`;
    if (viewportInitializedSubjectRef.current === subjectKey) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const zoom = getInitialZoomForCanvas(viewportSize, canvasSize, state.viewportMode);
    const next = clampViewportState(
      { zoom, offsetX: state.offsetX, offsetY: state.offsetY },
      viewportSize,
      canvasSize,
      state.canvasStageActive,
      state.viewportMode,
    );
    viewportInitializedSubjectRef.current = subjectKey;
    if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
    }
    // `state.document` is intentionally omitted: this effect only reads the canvas
    // size (already tracked via canvas.width/height) and the viewport fields below.
    // Keeping the full document ref here re-ran the effect every ~60Hz transient
    // frame just to early-return on the subjectKey guard.
  }, [
    dispatch,
    state.canvasStageActive,
    state.document.canvas.height,
    state.document.canvas.width,
    state.offsetX,
    state.offsetY,
    state.viewportMode,
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
      const zoomLimits = getViewportZoomLimits(state.viewportMode);
      const nextZoom = clamp(
        state.zoom * Math.exp(-event.deltaY * settings.canvas.viewport.wheelZoomSensitivity),
        zoomLimits.min,
        zoomLimits.max,
      );
      const displayScale = getCanvasDisplayScale(containerSize, canvasSize, state.viewportMode);
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
      const clampedCursorCanvas = state.viewportMode === "draft"
        ? cursorCanvas
        : {
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

    const clampedViewport = clampViewportState(nextViewport, containerSize, canvasSize, false, state.viewportMode);
    if (viewportChanged(clampedViewport, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: clampedViewport.zoom, offsetX: clampedViewport.offsetX, offsetY: clampedViewport.offsetY });
    }
  };

  return { onWheel };
}
