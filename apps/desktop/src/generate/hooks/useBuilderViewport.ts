import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
  type WheelEvent,
} from "react";

import { zoomToCursorOffset } from "@/domain/zoom";
import { clamp, clampToolPan } from "../engine/geometry";
import { MIN_TOOL_ZOOM, MAX_TOOL_ZOOM } from "../types";

export type ToolPan = { x: number; y: number };

// The cursor position relative to the stage centre — the anchor space for the
// stage's `transform-origin: center` translate+scale, where `screen = pan +
// world * zoom`. Returns the centre (no offset) when the viewport is unavailable.
function cursorOffsetFromCenter(
  event: WheelEvent<HTMLDivElement>,
  viewport: HTMLDivElement | null,
): ToolPan {
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  return {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  };
}

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

  const changeToolZoom = useCallback((direction: 1 | -1, anchor?: ToolPan) => {
    setToolZoom((current) => {
      if (direction < 0 && current <= MIN_TOOL_ZOOM) return MIN_TOOL_ZOOM;
      const multiplier = direction > 0 ? 1.14 : 1 / 1.14;
      const next = Number(clamp(current * multiplier, MIN_TOOL_ZOOM, MAX_TOOL_ZOOM).toFixed(2));
      setToolPan((pan) => {
        // Anchor the zoom under the cursor (wheel) so the point stays put; with no
        // anchor (the +/- buttons) the pan is kept, i.e. zoom about the centre.
        const anchored = anchor ? zoomToCursorOffset(anchor, pan, current, next) : pan;
        return clampToolPan(anchored, next, stageViewportRef.current, imgRef.current);
      });
      return next;
    });
  }, [imgRef, stageViewportRef]);

  const handleStageWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (imageError) return;
      event.preventDefault();

      // A pinch (ctrl/meta/alt + wheel) always zooms about the cursor.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const anchor = cursorOffsetFromCenter(event, stageViewportRef.current);
        if (event.deltaY < 0) {
          changeToolZoom(1, anchor);
        } else if (toolZoom > MIN_TOOL_ZOOM) {
          changeToolZoom(-1, anchor);
        }
        return;
      }

      // At 100% (minimum zoom) the subject is fully framed, so a plain wheel
      // gesture does nothing — there is no scroll to consume. Panning only kicks
      // in once zoomed past 100%.
      if (toolZoom <= MIN_TOOL_ZOOM) return;

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
