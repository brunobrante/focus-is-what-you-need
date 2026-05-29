import type React from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  angleBetweenPoints,
  getAbsoluteRect,
  getCommonParentId,
  getParentBounds,
  getSelectionBox,
  rectCenterX,
  rectCenterY,
} from "@/canvas/engine/geometry";
import type { EditorState, Point, ResizeHandle } from "@/canvas/engine/types";
import { getCanvasDisplayScale } from "@/canvas/engine/viewport";
import type { Size } from "@/canvas/engine/viewport";
import type { Interaction } from "./canvasInteractionTypes";
import type { RadiusCorner } from "./canvasHitTesting";
import { getCanvasSize } from "./canvasCoordinates";
import {
  DRAFT_BOUNDS,
  getFallbackCanvasBounds,
  getResizeBox,
  getTransformIds,
} from "./canvasToolingUtils";

export type InteractionBeginCtx = {
  state: EditorState;
  draftMode: boolean;
  viewport: HTMLDivElement;
  interactionRef: React.MutableRefObject<Interaction | null>;
  setInteractionActive: (active: boolean) => void;
  getCurrentViewportSize: () => Size;
};

export function startPanInteraction(
  event: ReactPointerEvent,
  { state, viewport, interactionRef, setInteractionActive }: InteractionBeginCtx,
): void {
  event.preventDefault();
  interactionRef.current = {
    type: "pan",
    pointerId: event.pointerId,
    startScreenPoint: { x: event.clientX, y: event.clientY },
    startOffsetX: state.offsetX,
    startOffsetY: state.offsetY,
    zoom: state.zoom,
    moved: false,
  };
  setInteractionActive(true);
  viewport.classList.add("is-panning");
  viewport.setPointerCapture(event.pointerId);
}

export function startResizeInteraction(
  handle: ResizeHandle,
  point: Point,
  event: ReactPointerEvent,
  { state, draftMode, viewport, interactionRef, setInteractionActive, getCurrentViewportSize }: InteractionBeginCtx,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (state.canvasStageActive) {
    const displayScale = getCanvasDisplayScale(getCurrentViewportSize(), getCanvasSize(state.document));
    interactionRef.current = {
      type: "canvas-resize",
      pointerId: event.pointerId,
      handle,
      startPoint: point,
      startScreenPoint: { x: event.clientX, y: event.clientY },
      startWidth: state.document.canvas.width,
      startHeight: state.document.canvas.height,
      startOffsetX: state.offsetX,
      startOffsetY: state.offsetY,
      zoom: state.zoom,
      displayZoom: state.zoom * displayScale,
      beforeDocument: state.document,
      moved: false,
      lastDocument: state.document,
    };
    setInteractionActive(true);
    viewport.setPointerCapture(event.pointerId);
    return;
  }
  const transformIds = getTransformIds(state.document, state.selectedIds);
  const commonParentId = getCommonParentId(state.document, transformIds);
  const startBox = getResizeBox(state.document, transformIds);
  if (!startBox || transformIds.length === 0 || commonParentId === undefined) return;
  const startRects: Record<string, import("@/canvas/engine/types").Rect> = {};
  for (const id of transformIds) {
    const rect = getAbsoluteRect(state.document, id);
    if (rect) startRects[id] = rect;
  }
  interactionRef.current = {
    type: "resize",
    handle,
    pointerId: event.pointerId,
    startPoint: point,
    beforeDocument: state.document,
    selectedIds: state.selectedIds,
    transformIds,
    startBox,
    startRects,
    commonParentId,
    parentBounds: draftMode
      ? DRAFT_BOUNDS
      : transformIds[0]
        ? getParentBounds(state.document, transformIds[0])
        : getFallbackCanvasBounds(state.document),
    moved: false,
    lastDocument: state.document,
    lastGuides: [],
  };
  setInteractionActive(true);
  viewport.setPointerCapture(event.pointerId);
}

export function startRotateInteraction(
  point: Point,
  event: ReactPointerEvent,
  { state, draftMode, viewport, interactionRef, setInteractionActive }: InteractionBeginCtx,
): void {
  event.preventDefault();
  event.stopPropagation();
  if (state.canvasStageActive) {
    const center = { x: state.document.canvas.width / 2, y: state.document.canvas.height / 2 };
    interactionRef.current = {
      type: "canvas-rotate",
      pointerId: event.pointerId,
      startPoint: point,
      center,
      startAngle: angleBetweenPoints(center, point),
      startRotation: state.document.canvas.rotation ?? 0,
      beforeDocument: state.document,
      moved: false,
      lastDocument: state.document,
    };
    setInteractionActive(true);
    viewport.classList.add("is-rotating");
    viewport.setPointerCapture(event.pointerId);
    return;
  }
  const transformIds = getTransformIds(state.document, state.selectedIds);
  const startBox = getSelectionBox(state.document, transformIds);
  if (!startBox || transformIds.length !== 1) return;
  const startRotations: Record<string, number> = {};
  for (const id of transformIds) startRotations[id] = state.document.elements[id]?.rotation ?? 0;
  const center = { x: rectCenterX(startBox), y: rectCenterY(startBox) };
  interactionRef.current = {
    type: "rotate",
    pointerId: event.pointerId,
    startPoint: point,
    beforeDocument: state.document,
    selectedIds: state.selectedIds,
    transformIds,
    startBox,
    commonParentId: getCommonParentId(state.document, transformIds),
    parentBounds: draftMode
      ? DRAFT_BOUNDS
      : transformIds[0]
        ? getParentBounds(state.document, transformIds[0])
        : getFallbackCanvasBounds(state.document),
    center,
    startAngle: angleBetweenPoints(center, point),
    startRotations,
    moved: false,
    lastDocument: state.document,
    lastGuides: [],
  };
  setInteractionActive(true);
  viewport.classList.add("is-rotating");
  viewport.setPointerCapture(event.pointerId);
}

export function startRadiusInteraction(
  corner: RadiusCorner,
  point: Point,
  event: ReactPointerEvent,
  { state, viewport, interactionRef, setInteractionActive }: InteractionBeginCtx,
): void {
  event.preventDefault();
  event.stopPropagation();
  const transformIds = getTransformIds(state.document, state.selectedIds);
  if (transformIds.length !== 1) return;
  const elementId = transformIds[0];
  const element = state.document.elements[elementId];
  if (!element || (element.type !== "rect" && element.type !== "image")) return;
  interactionRef.current = {
    type: "radius",
    pointerId: event.pointerId,
    startPoint: point,
    elementId,
    corner,
    beforeDocument: state.document,
    selectedIds: state.selectedIds,
    moved: false,
    lastDocument: state.document,
    lastGuides: [],
  };
  setInteractionActive(true);
  viewport.classList.add("is-radius-dragging");
  viewport.setPointerCapture(event.pointerId);
}
