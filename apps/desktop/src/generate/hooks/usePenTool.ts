import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

import { getContentPoint } from "../engine/geometry";
import {
  hitTestPen,
  mirrorHandle,
  moveAnchor,
  nearFirstAnchor,
  pointInPath,
  type PenPath,
  type Point,
} from "../engine/pen";
import { MIN_TOOL_ZOOM } from "../types";

// Minimum anchors before the path can be closed (a fillable region needs 3).
const MIN_CLOSE_ANCHORS = 3;
// Hit/close tolerance in on-screen pixels (converted to content space by zoom).
const HIT_TOLERANCE_PX = 11;

// What the active pointer drag is manipulating.
type PenDrag =
  | { kind: "newHandle"; index: number } // pulling the handle of a just-placed anchor
  | { kind: "anchor"; index: number; grab: Point } // moving a closed-path anchor
  | { kind: "in" | "out"; index: number } // moving one of an anchor's handles
  | { kind: "all"; grab: Point }; // moving the whole closed path

/**
 * Owns the Bézier pen cut tool: the in-progress/closed path and its pointer +
 * keyboard interaction. While building, a click drops a corner anchor and a
 * click-drag pulls out mirrored curve handles; clicking the first anchor (or
 * Enter) closes the path; Backspace removes the last anchor; Escape clears it.
 * Once closed, dragging an anchor or a handle reshapes the silhouette.
 *
 * `useBuilderInteraction` delegates the stage pointer events here when the pen
 * tool is active; the host threads `penPath`/`penCursor` to the overlay painter.
 */
export function usePenTool({
  imgRef,
  toolZoom,
  active,
}: {
  imgRef: RefObject<HTMLImageElement | null>;
  toolZoom: number;
  active: boolean;
}) {
  const [penPath, setPenPath] = useState<PenPath | null>(null);
  // Last hovered point, for the rubber-band segment from the last anchor.
  const [penCursor, setPenCursor] = useState<Point | null>(null);
  const dragRef = useRef<PenDrag | null>(null);
  // Mirror of penPath so the keyboard listener can read it synchronously (to
  // preventDefault reliably) without re-subscribing on every path change.
  const penPathRef = useRef<PenPath | null>(null);
  penPathRef.current = penPath;

  const resetPen = useCallback(() => {
    dragRef.current = null;
    setPenPath(null);
    setPenCursor(null);
  }, []);

  // Leaving the pen tool drops any in-progress path (kept simple until the cut
  // is wired to save).
  useEffect(() => {
    if (!active) resetPen();
  }, [active, resetPen]);

  const tolerance = HIT_TOLERANCE_PX / Math.max(toolZoom, MIN_TOOL_ZOOM);

  const onPenPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, point: Point) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const path = penPath;

      if (!path || !path.closed) {
        // Building: close on the first anchor, else append a new anchor.
        if (path && path.anchors.length >= MIN_CLOSE_ANCHORS && nearFirstAnchor(path, point, tolerance)) {
          dragRef.current = null;
          setPenPath({ ...path, closed: true });
          return;
        }
        const anchors = path ? [...path.anchors, { x: point.x, y: point.y }] : [{ x: point.x, y: point.y }];
        dragRef.current = { kind: "newHandle", index: anchors.length - 1 };
        setPenPath({ anchors, closed: false });
        return;
      }

      // Editing a closed path: grab an anchor or a handle; otherwise grab the
      // interior to move the whole path (like dragging inside the rectangle).
      const hit = hitTestPen(path, point, tolerance);
      if (hit) {
        dragRef.current =
          hit.type === "anchor"
            ? { kind: "anchor", index: hit.index, grab: point }
            : { kind: hit.type, index: hit.index };
        return;
      }
      if (pointInPath(path, point)) {
        dragRef.current = { kind: "all", grab: point };
      }
    },
    [penPath, tolerance],
  );

  const onPenPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const point = getContentPoint(event, imgRef.current, toolZoom);
      if (!point) return;
      setPenCursor(point);
      const drag = dragRef.current;
      if (!drag) {
        // Hover cursor: over a handle/anchor → grab, inside a closed path → move,
        // otherwise the drawing crosshair.
        const path = penPathRef.current;
        let cursor = "crosshair";
        if (path?.closed) {
          if (hitTestPen(path, point, tolerance)) cursor = "grab";
          else cursor = pointInPath(path, point) ? "move" : "default";
        }
        event.currentTarget.style.cursor = cursor;
        return;
      }

      // Translation drags (whole path or one anchor) read and advance `grab` on
      // the ref OUTSIDE the state updater, so the updater stays pure — React
      // StrictMode double-invokes it, and mutating `grab` inside would zero out
      // the second pass and freeze the move.
      if (drag.kind === "all" || drag.kind === "anchor") {
        const dx = point.x - drag.grab.x;
        const dy = point.y - drag.grab.y;
        drag.grab = point;
        if (drag.kind === "all") {
          setPenPath((path) =>
            path ? { ...path, anchors: path.anchors.map((an) => moveAnchor(an, dx, dy)) } : path,
          );
        } else {
          const index = drag.index;
          setPenPath((path) => {
            if (!path) return path;
            const a = path.anchors[index];
            if (!a) return path;
            const anchors = path.anchors.slice();
            anchors[index] = moveAnchor(a, dx, dy);
            return { ...path, anchors };
          });
        }
        return;
      }

      // Handle drags set the handle absolutely from the cursor (already pure).
      const kind = drag.kind; // "newHandle" | "in" | "out"
      const index = drag.index;
      setPenPath((path) => {
        if (!path) return path;
        const a = path.anchors[index];
        if (!a) return path;
        const anchors = path.anchors.slice();
        if (kind === "in") {
          anchors[index] = { x: a.x, y: a.y, in: { ...point }, out: mirrorHandle(a, point) };
        } else {
          // "newHandle" or "out": pull the outgoing handle, mirror the incoming one.
          anchors[index] = { x: a.x, y: a.y, out: { ...point }, in: mirrorHandle(a, point) };
        }
        return { ...path, anchors };
      });
    },
    [imgRef, toolZoom, tolerance],
  );

  const onPenPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }, []);

  // Keyboard while the pen tool is active: undo last anchor, close, or cancel.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const path = penPathRef.current;
      if (event.key === "Escape") {
        resetPen();
      } else if ((event.key === "Backspace" || event.key === "Delete") && path && !path.closed) {
        event.preventDefault();
        const anchors = path.anchors.slice(0, -1);
        setPenPath(anchors.length ? { ...path, anchors } : null);
      } else if (
        event.key === "Enter" &&
        path &&
        !path.closed &&
        path.anchors.length >= MIN_CLOSE_ANCHORS
      ) {
        event.preventDefault();
        setPenPath({ ...path, closed: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, resetPen]);

  return {
    penPath,
    penCursor,
    penClosed: penPath?.closed ?? false,
    onPenPointerDown,
    onPenPointerMove,
    onPenPointerUp,
    resetPen,
  };
}
