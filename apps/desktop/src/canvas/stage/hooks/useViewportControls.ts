import { useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject, WheelEvent as ReactWheelEvent } from "react";
import type { EditorState, Point } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import { clamp } from "@/canvas/engine/geometry";
import {
  canvasPointToViewport,
  centerViewportOnPoint,
  clampViewportState,
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  getInitialZoomForSubjectSize,
  getViewportZoomLimits,
  snapViewportOffset,
  viewportChanged,
  viewportPointToCanvas,
  type Size,
} from "@/canvas/engine/viewport";
import { getSelectionAABB } from "@/canvas/engine/geometry/bounds";
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
  // Canvas-space point the camera should keep centered when the viewport is
  // resized or this target changes (e.g. the device overlay center in "origin"
  // mode). When null, the subject's own center is used.
  viewportFocusPoint?: Point | null;
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
  viewportFocusPoint = null,
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
    let next = clampViewportState(
      { zoom, offsetX: state.offsetX, offsetY: state.offsetY },
      viewportSize,
      canvasSize,
      state.canvasStageActive,
      state.viewportMode,
    );

    // On open, if a draft already has content, frame it (zoom + center) instead
    // of showing the generic working-area view. The draft canvas is huge and
    // freeform, so landing on the existing element is far more useful than the
    // empty top-left corner. This runs once per subject, so it never yanks the
    // camera while the user is editing.
    if (state.viewportMode === "draft" && state.document.rootIds.length > 0) {
      const contentBounds = getSelectionAABB(state.document, state.document.rootIds);
      if (contentBounds && contentBounds.width > 0 && contentBounds.height > 0) {
        const contentZoom = getInitialZoomForSubjectSize(
          { width: contentBounds.width, height: contentBounds.height },
          "draft",
        );
        next = centerViewportOnPoint(
          contentZoom,
          viewportSize,
          canvasSize,
          {
            x: contentBounds.x + contentBounds.width / 2,
            y: contentBounds.y + contentBounds.height / 2,
          },
          "draft",
        );
      }
    }

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

  // Re-center the camera (keeping the user's current zoom) whenever the viewport
  // is resized — by the browser window or the Tauri shell — or whenever the
  // focus target changes (e.g. the device overlay center in "origin" mode). The
  // init effect above is gated by a subject key that ignores viewport size and
  // focus, so it would otherwise early-return and leave content drifted.
  const focusX = viewportFocusPoint?.x ?? null;
  const focusY = viewportFocusPoint?.y ?? null;
  const recenterRef = useRef<
    { subjectKey: string; width: number; height: number; focusX: number | null; focusY: number | null } | null
  >(null);
  useLayoutEffect(() => {
    const canvasSize = getCanvasSize(state.document);
    const subjectKey = viewportSubjectKey
      ? `${viewportSubjectKey}:${state.viewportMode}:${canvasSize.width}x${canvasSize.height}`
      : `${state.viewportMode}:${canvasSize.width}x${canvasSize.height}`;
    if (viewportInitializedSubjectRef.current !== subjectKey) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

    const prev = recenterRef.current;
    recenterRef.current = {
      subjectKey,
      width: viewportSize.width,
      height: viewportSize.height,
      focusX,
      focusY,
    };
    // First time we see this subject (right after init centered it) — record the
    // baseline and do nothing, so we only react to genuine resizes/focus changes.
    if (!prev || prev.subjectKey !== subjectKey) return;
    const sizeChanged = prev.width !== viewportSize.width || prev.height !== viewportSize.height;
    const focusChanged = prev.focusX !== focusX || prev.focusY !== focusY;
    if (!sizeChanged && !focusChanged) return;

    let next;
    if (state.viewportMode === "draft") {
      // The draft canvas is freeform and has no meaningful subject center, so on
      // resize we keep the point currently under the viewport center fixed
      // instead of snapping to the middle of the 100k canvas. The draft display
      // scale is constant, so this reduces to shifting by half the size delta.
      next = {
        zoom: state.zoom,
        offsetX: state.offsetX + (viewportSize.width - prev.width) / 2,
        offsetY: state.offsetY + (viewportSize.height - prev.height) / 2,
      };
    } else {
      const focus =
        focusX !== null && focusY !== null
          ? { x: focusX, y: focusY }
          : { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      next = centerViewportOnPoint(state.zoom, viewportSize, canvasSize, focus, state.viewportMode);
    }

    if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
    }
  }, [
    dispatch,
    focusX,
    focusY,
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
