import type React from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createElementForTool, reparentElements, shallowCloneDocument } from "@/canvas/engine/actions";
import { getDescendantIds, roundPixel } from "@/canvas/engine/geometry";
import type { CanvasDocument, EditorState, Point, Rect } from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import { clampViewportState } from "@/canvas/engine/viewport";
import type { Size } from "@/canvas/engine/viewport";
import {
  commitDragMove,
  computeDragMoveCommandFromScreenDelta,
  computeDragMoveFromScreenDelta,
  radiusDocument,
  resizeCanvasDocument,
  resizeDocument,
  rotateCanvasDocument,
  rotateDocument,
} from "./canvasDocumentMutations";
import { findDropTarget } from "./canvasHitTesting";
import { getCanvasSize } from "./canvasCoordinates";
import { findElementsInMarquee } from "./canvasToolingUtils";
import type { CanvasAlignmentLogInput } from "./canvasAlignmentLog";
import type {
  CanvasResizeInteraction,
  CanvasRotateInteraction,
  DragInteraction,
  DrawInteraction,
  MarqueeInteraction,
  PanInteraction,
  RadiusInteraction,
  ResizeInteraction,
  RotateInteraction,
} from "./canvasInteractionTypes";

type Dispatch = React.Dispatch<EditorAction>;

// === MOVE HANDLERS ===

export function handlePanMove(
  interaction: PanInteraction,
  event: ReactPointerEvent,
  document: CanvasDocument,
  getCurrentViewportSize: () => Size,
  dispatch: Dispatch,
): void {
  const raw = {
    zoom: interaction.zoom,
    offsetX: interaction.startOffsetX + event.clientX - interaction.startScreenPoint.x,
    offsetY: interaction.startOffsetY + event.clientY - interaction.startScreenPoint.y,
  };
  const next = clampViewportState(raw, getCurrentViewportSize(), getCanvasSize(document));
  interaction.moved =
    interaction.moved ||
    Math.hypot(event.clientX - interaction.startScreenPoint.x, event.clientY - interaction.startScreenPoint.y) > 0.5;
  dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
}

export function handleDrawMove(
  interaction: DrawInteraction,
  event: ReactPointerEvent,
  point: Point,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
  interaction.moved = interaction.moved || distance > 2;
  const x = Math.min(interaction.startPoint.x, point.x);
  const y = Math.min(interaction.startPoint.y, point.y);
  const w = Math.abs(point.x - interaction.startPoint.x);
  const h = event.shiftKey ? w : Math.abs(point.y - interaction.startPoint.y);
  const next = shallowCloneDocument(interaction.beforeDocument);
  const node = createElementForTool(interaction.tool, 0, 0, interaction.beforeDocument.canvas);
  node.id = interaction.elementId;
  node.x = roundPixel(x);
  node.y = roundPixel(y);
  node.width = roundPixel(Math.max(w, 1));
  node.height = roundPixel(Math.max(h, 1));
  next.elements[interaction.elementId] = node;
  if (!next.rootIds.includes(interaction.elementId)) next.rootIds.push(interaction.elementId);
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [interaction.elementId] });
}

export function handleMarqueeMove(
  interaction: MarqueeInteraction,
  point: Point,
  document: CanvasDocument,
  setMarqueeRect: (rect: Rect | null) => void,
  dispatch: Dispatch,
): void {
  const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
  interaction.moved = interaction.moved || distance > 2;
  interaction.currentPoint = point;
  if (!interaction.moved) return;
  const rect: Rect = {
    x: Math.min(interaction.startPoint.x, point.x),
    y: Math.min(interaction.startPoint.y, point.y),
    width: Math.abs(point.x - interaction.startPoint.x),
    height: Math.abs(point.y - interaction.startPoint.y),
  };
  setMarqueeRect(rect);
  dispatch({ type: "setSelected", selectedIds: findElementsInMarquee(document, rect) });
}

export function handleDragMove(
  interaction: DragInteraction,
  event: ReactPointerEvent,
  point: Point,
  document: CanvasDocument,
  commandModeRef: React.MutableRefObject<boolean>,
  updateDropTarget: (id: string | null) => void,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const screenDelta = {
    x: event.clientX - interaction.startScreenPoint.x,
    y: event.clientY - interaction.startScreenPoint.y,
  };
  interaction.moved = interaction.moved || Math.hypot(screenDelta.x, screenDelta.y) > 0.5;

  let move;
  if (event.metaKey) {
    commandModeRef.current = true;
    const canvasBounds: Rect = { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
    move = computeDragMoveCommandFromScreenDelta(interaction, screenDelta, canvasBounds);
    const committed = commitDragMove(interaction, move.delta);
    const excludeIds = new Set<string>(interaction.transformIds);
    for (const id of interaction.transformIds) {
      for (const desc of getDescendantIds(interaction.beforeDocument, id)) excludeIds.add(desc);
    }
    updateDropTarget(findDropTarget(committed, point, excludeIds));
  } else {
    if (commandModeRef.current) { commandModeRef.current = false; updateDropTarget(null); }
    move = computeDragMoveFromScreenDelta(interaction, screenDelta);
  }

  const nextDocument = commitDragMove(interaction, move.delta);
  interaction.currentDelta = move.delta;
  interaction.lastGuides = move.guides;
  interaction.lastDocument = nextDocument;
  latestDocumentRef.current = nextDocument;
  dispatch({
    type: "setDocumentTransient",
    document: nextDocument,
    guides: move.guides,
    changedIds: interaction.transformIds,
  });
}

export function handleCanvasResizeMove(
  interaction: CanvasResizeInteraction,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const result = resizeCanvasDocument(interaction, event);
  interaction.lastDocument = result.document;
  latestDocumentRef.current = result.document;
  // Canvas resize only mutates canvas dimensions, not any element — empty
  // changedIds keeps the scene render set empty so no element re-renders.
  dispatch({ type: "setDocumentTransient", document: result.document, changedIds: [] });
  dispatch({ type: "setViewport", zoom: result.viewport.zoom, offsetX: result.viewport.offsetX, offsetY: result.viewport.offsetY });
}

export function handleCanvasRotateMove(
  interaction: CanvasRotateInteraction,
  point: Point,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const next = rotateCanvasDocument(interaction, point, event);
  interaction.lastDocument = next;
  latestDocumentRef.current = next;
  // Canvas rotation only mutates canvas.rotation (applied at the stage transform),
  // not any element — empty changedIds avoids re-rendering the whole scene.
  dispatch({ type: "setDocumentTransient", document: next, changedIds: [] });
}

export function handleTransformMove(
  interaction: ResizeInteraction | RotateInteraction | RadiusInteraction,
  point: Point,
  event: ReactPointerEvent,
  dispatch: Dispatch,
  latestDocumentRef: React.MutableRefObject<CanvasDocument>,
): void {
  const result =
    interaction.type === "resize"
      ? resizeDocument(interaction, point, event)
      : interaction.type === "radius"
        ? radiusDocument(interaction, point)
        : rotateDocument(interaction, point, event);
  interaction.lastDocument = result.document;
  if ("lastGuides" in interaction) interaction.lastGuides = result.guides;
  latestDocumentRef.current = result.document;
  const changedIds =
    interaction.type === "radius" ? [interaction.elementId] : interaction.transformIds;
  dispatch({
    type: "setDocumentTransient",
    document: result.document,
    guides: result.guides,
    changedIds,
  });
}

// === FINISH HELPERS ===

export function finishDrawInteraction(interaction: DrawInteraction, dispatch: Dispatch): void {
  if (interaction.moved) {
    dispatch({
      type: "commitDocument",
      beforeDocument: interaction.beforeDocument,
      document: interaction.lastDocument,
      selectedIds: [interaction.elementId],
    });
  } else {
    const next = shallowCloneDocument(interaction.beforeDocument);
    const node = createElementForTool(
      interaction.tool,
      interaction.startPoint.x,
      interaction.startPoint.y,
      interaction.beforeDocument.canvas,
    );
    node.id = interaction.elementId;
    next.elements[node.id] = node;
    if (!next.rootIds.includes(node.id)) next.rootIds.push(node.id);
    dispatch({
      type: "commitDocument",
      beforeDocument: interaction.beforeDocument,
      document: next,
      selectedIds: [node.id],
    });
  }
  dispatch({ type: "setTool", tool: "select" });
}

export function finishMovedInteraction(
  interaction: DragInteraction | ResizeInteraction | RotateInteraction | RadiusInteraction,
  wasCommandMode: boolean,
  capturedDropTarget: string | null,
  dispatch: Dispatch,
  scheduleCanvasAlignmentLog: (input: CanvasAlignmentLogInput) => void,
  state: EditorState,
): void {
  let finalDoc: CanvasDocument;
  if (interaction.type === "drag") {
    const committed = commitDragMove(interaction, interaction.currentDelta);
    finalDoc = wasCommandMode
      ? reparentElements(committed, interaction.transformIds, capturedDropTarget)
      : committed;
  } else {
    finalDoc = interaction.lastDocument;
  }
  dispatch({
    type: "commitDocument",
    beforeDocument: interaction.beforeDocument,
    document: finalDoc,
    selectedIds: interaction.selectedIds,
  });
  scheduleCanvasAlignmentLog({
    reason: "interaction-finish",
    interactionType: interaction.type,
    document: finalDoc,
    selectedIds: interaction.selectedIds,
    zoom: state.zoom,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
  });
}
