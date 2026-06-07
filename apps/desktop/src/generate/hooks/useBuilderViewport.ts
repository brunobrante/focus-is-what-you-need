import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
  type WheelEvent,
} from "react";

import { clamp, clampToolPan } from "../engine/geometry";
import { MIN_TOOL_ZOOM, MAX_TOOL_ZOOM } from "../types";

export type ToolPan = { x: number; y: number };

/**
 * Owns the Builder stage viewport: user zoom (`toolZoom`) and pan offset
 * (`toolPan`), plus the wheel/zoom handlers and the effects that keep panning
 * clamped to the visible image bounds. The stage and image refs stay owned by
 * the host component (they are also used by pointer handlers and painting) and
 * are passed in here.
 */
export function useBuilderViewport({
  stageViewportRef,
  imgRef,
  imageError,
}: {
  stageViewportRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  imageError: boolean;
}) {
  const [toolZoom, setToolZoom] = useState(MIN_TOOL_ZOOM);
  const [toolPan, setToolPan] = useState<ToolPan>({ x: 0, y: 0 });

  const resetToolViewport = useCallback(() => {
    setToolZoom(MIN_TOOL_ZOOM);
    setToolPan({ x: 0, y: 0 });
  }, []);

  const changeToolZoom = useCallback((direction: 1 | -1) => {
    setToolZoom((current) => {
      if (direction < 0 && current <= MIN_TOOL_ZOOM) return MIN_TOOL_ZOOM;
      const multiplier = direction > 0 ? 1.14 : 1 / 1.14;
      const next = clamp(current * multiplier, MIN_TOOL_ZOOM, MAX_TOOL_ZOOM);
      const rounded = Number(next.toFixed(2));
      setToolPan((pan) => clampToolPan(pan, rounded, stageViewportRef.current, imgRef.current));
      return rounded;
    });
  }, [imgRef, stageViewportRef]);

  const handleStageWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (imageError) return;
      event.preventDefault();

      if (event.ctrlKey || event.metaKey || event.altKey || toolZoom <= MIN_TOOL_ZOOM) {
        if (event.deltaY < 0) {
          changeToolZoom(1);
        } else if (toolZoom > MIN_TOOL_ZOOM) {
          changeToolZoom(-1);
        }
        return;
      }

      setToolPan((pan) =>
        clampToolPan(
          {
            x: pan.x - event.deltaX,
            y: pan.y - event.deltaY,
          },
          toolZoom,
          stageViewportRef.current,
          imgRef.current,
        ),
      );
    },
    [changeToolZoom, imageError, imgRef, stageViewportRef, toolZoom],
  );

  const handleZoomIn = useCallback(() => {
    changeToolZoom(1);
  }, [changeToolZoom]);

  const handleZoomOut = useCallback(() => {
    if (toolZoom > MIN_TOOL_ZOOM) {
      changeToolZoom(-1);
    }
  }, [changeToolZoom, toolZoom]);

  useEffect(() => {
    const onResize = () => {
      setToolPan((pan) => clampToolPan(pan, toolZoom, stageViewportRef.current, imgRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [imgRef, stageViewportRef, toolZoom]);

  useEffect(() => {
    if (toolZoom <= MIN_TOOL_ZOOM) setToolPan({ x: 0, y: 0 });
  }, [toolZoom]);

  return {
    toolZoom,
    toolPan,
    setToolPan,
    resetToolViewport,
    changeToolZoom,
    handleStageWheel,
    handleZoomIn,
    handleZoomOut,
    zoomPercent: Math.round(toolZoom * 100),
  };
}
