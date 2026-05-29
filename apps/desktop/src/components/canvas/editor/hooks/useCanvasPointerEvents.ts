import React, { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCommonParentId, getParentBounds, roundPixel } from "@/lib/editor/geometry";
import { getElementIdFromTarget } from "@/lib/editor/hitTesting";
import type { EditorState, Point, Rect } from "@/lib/editor/types";
import type { EditorAction } from "@/lib/editor/store";
import type { CanvasDocument } from "@/lib/editor/types";
import { buildViewportTransform } from "@/lib/editor/viewport";
import { viewportPointToCanvas } from "@/lib/editor/viewport";
import type { Size } from "@/lib/editor/viewport";
import { createElementForTool, insertElement } from "@/lib/editor/actions";
import type { CanvasToolingRef } from "../CanvasToolingLayer";
import { findChildAtPoint, retargetForIsolatedParent } from "../canvasHitTesting";
import { clearNativeTextSelection } from "../canvasStageHelpers";
import {
  DRAFT_BOUNDS,
  getFallbackCanvasBounds,
  getDragBox,
  getTransformIds,
  isPointInsideCanvas,
} from "../canvasStageUtils";
import type { Interaction } from "../canvasInteractionTypes";
import type { TextEditState, ViewportClientRect } from "../canvasStageTypes";
import type { ContextMenuState } from "../CanvasContextMenu";
import type { HoverStore } from "@/lib/editor/hoverStore";
import type { CanvasAlignmentLogInput } from "../canvasAlignmentLog";
import {
  type InteractionBeginCtx,
  startPanInteraction,
  startRadiusInteraction,
  startResizeInteraction,
  startRotateInteraction,
} from "../canvasInteractionBegin";
import {
  finishDrawInteraction,
  finishMovedInteraction,
  handleCanvasResizeMove,
  handleCanvasRotateMove,
  handleDragMove,
  handleDrawMove,
  handleMarqueeMove,
  handlePanMove,
  handleTransformMove,
} from "../canvasInteractionHandlers";
import { useCanvasTextInteraction } from "./useCanvasTextInteraction";

type Dispatch = React.Dispatch<EditorAction>;

type Params = {
  state: EditorState;
  dispatch: Dispatch;
  draftMode: boolean;
  viewportRef: React.MutableRefObject<HTMLDivElement | null>;
  toolingRef: React.MutableRefObject<CanvasToolingRef | null>;
  interactionRef: React.MutableRefObject<Interaction | null>;
  spacePressedRef: React.MutableRefObject<boolean>;
  commandModeRef: React.MutableRefObject<boolean>;
  setInteractionActive: (active: boolean) => void;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
  latestDocumentRef: React.MutableRefObject<CanvasDocument>;
  latestStateRef: React.MutableRefObject<EditorState>;
  hoverStore: HoverStore;
  textEdit: TextEditState | null;
  enterTextEditing: (nodeId: string, clientPoint?: Point, selectAll?: boolean) => void;
  syncTextSelection: (start: number, end: number, anchor?: number) => void;
  scheduleCanvasAlignmentLog: (input: CanvasAlignmentLogInput) => void;
};

export type CanvasPointerEventsResult = {
  marqueeRect: Rect | null;
  contextMenu: ContextMenuState;
  dropTargetId: string | null;
  closeContextMenu: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  finishInteraction: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export function useCanvasPointerEvents({
  state,
  dispatch,
  draftMode,
  viewportRef,
  toolingRef,
  interactionRef,
  spacePressedRef,
  commandModeRef,
  setInteractionActive,
  getCurrentViewportSize,
  getCurrentViewportRect,
  latestDocumentRef,
  latestStateRef,
  hoverStore,
  textEdit,
  enterTextEditing,
  syncTextSelection,
  scheduleCanvasAlignmentLog,
}: Params): CanvasPointerEventsResult {
  const dropTargetIdRef = useRef<string | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const closeContextMenu = () => setContextMenu(null);
  const updateDropTarget = (id: string | null) => { dropTargetIdRef.current = id; setDropTargetId(id); };

  const textInteraction = useCanvasTextInteraction({
    viewportRef, state, textEdit, enterTextEditing, syncTextSelection,
    latestDocumentRef, latestStateRef, getCurrentViewportSize, getCurrentViewportRect, dispatch,
  });

  const getCanvasPoint = (event: ReactPointerEvent): Point | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const transform = buildViewportTransform(state.document, getCurrentViewportSize(), state.zoom, state.offsetX, state.offsetY);
    const vpRect = getCurrentViewportRect();
    return viewportPointToCanvas({ x: event.clientX - vpRect.left, y: event.clientY - vpRect.top }, transform);
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(state.document, state.isolatedParentId, getElementIdFromTarget(target));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (contextMenu) setContextMenu(null);

    const viewport = viewportRef.current;
    if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) {
      if (viewport) startPanInteraction(event, { state, draftMode, viewport, interactionRef, setInteractionActive, getCurrentViewportSize });
      return;
    }
    if (event.button !== 0) return;
    clearNativeTextSelection();

    const initialTargetId = getInteractiveElementId(event.target);
    const initialTargetNode = initialTargetId ? state.document.elements[initialTargetId] : null;
    const selectedTextBoxTargetId = textInteraction.getSelectedTextBoxAtClientPoint(event.clientX, event.clientY, initialTargetId !== null);
    const textDoubleClickTarget =
      initialTargetNode?.type === "text"
        ? initialTargetNode
        : selectedTextBoxTargetId
          ? state.document.elements[selectedTextBoxTargetId]
          : null;

    if (event.detail > 1 && textDoubleClickTarget?.type === "text" && !textDoubleClickTarget.locked) {
      event.preventDefault();
      return;
    }

    if (viewport && toolingRef.current && !state.editingTextId) {
      const vpRect = getCurrentViewportRect();
      const hit = toolingRef.current.hitTest(event.clientX - vpRect.left, event.clientY - vpRect.top);
      const ctx: InteractionBeginCtx = { state, draftMode, viewport, interactionRef, setInteractionActive, getCurrentViewportSize };
      if (hit.type === "resize") {
        const point = getCanvasPoint(event);
        if (point) {
          startResizeInteraction(hit.handle, point, event, ctx);
          if (hit.cursor) { viewport.style.setProperty("--resize-cursor", hit.cursor); viewport.classList.add("is-resizing"); }
        }
        return;
      }
      if (hit.type === "rotate") { const p = getCanvasPoint(event); if (p) startRotateInteraction(p, event, ctx); return; }
      if (hit.type === "radius") { const p = getCanvasPoint(event); if (p) startRadiusInteraction(hit.corner, p, event, ctx); return; }
    }

    if (state.canvasStageActive) return;
    if (state.editingTextId) {
      if (textInteraction.tryStartTextDrag(event, state.editingTextId, viewport)) return;
      dispatch({ type: "setEditingText", editingTextId: null });
    }

    const point = getCanvasPoint(event);
    if (!point || !viewport) return;

    if (!draftMode && !isPointInsideCanvas(point, state.document)) {
      if (state.tool === "select") {
        dispatch({ type: "setSelected", selectedIds: [] });
        interactionRef.current = { type: "marquee", pointerId: event.pointerId, startPoint: point, currentPoint: point, moved: false };
        setInteractionActive(true);
        event.preventDefault();
        viewport.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (state.tool !== "select") {
      event.preventDefault();
      const node = createElementForTool(state.tool, point.x, point.y, state.document.canvas);
      node.x = roundPixel(point.x);
      node.y = roundPixel(point.y);
      node.width = 0;
      node.height = 0;
      const next = insertElement(state.document, node);
      interactionRef.current = { type: "draw", pointerId: event.pointerId, startPoint: point, tool: state.tool, elementId: node.id, beforeDocument: state.document, lastDocument: next, moved: false };
      setInteractionActive(true);
      dispatch({ type: "setDocumentTransient", document: next });
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    const targetId = initialTargetId;
    if (!targetId) {
      dispatch({ type: "setSelected", selectedIds: [] });
      interactionRef.current = { type: "marquee", pointerId: event.pointerId, startPoint: point, currentPoint: point, moved: false };
      setInteractionActive(true);
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    let effectiveTargetId = targetId;
    if (!state.isolatedParentId && !event.shiftKey && state.selectedIds.length === 1 && state.selectedIds[0] === targetId && state.document.elements[targetId]?.children.length) {
      const child = findChildAtPoint(state.document, targetId, point);
      if (child) effectiveTargetId = child;
    }

    const currentlySelected = state.selectedIds.includes(effectiveTargetId);
    const selectedIds = event.shiftKey
      ? currentlySelected ? state.selectedIds.filter((id) => id !== effectiveTargetId) : [...state.selectedIds, effectiveTargetId]
      : currentlySelected ? state.selectedIds : [effectiveTargetId];
    dispatch({ type: "setSelected", selectedIds });
    if (!selectedIds.includes(effectiveTargetId)) return;

    const transformIds = getTransformIds(state.document, selectedIds);
    const startBox = getDragBox(state.document, transformIds);
    if (transformIds.length === 0 || !startBox) return;

    const startTransform = buildViewportTransform(state.document, getCurrentViewportSize(), state.zoom, state.offsetX, state.offsetY);
    const commonParentId = getCommonParentId(state.document, transformIds);
    const parentBounds = draftMode
      ? DRAFT_BOUNDS
      : commonParentId === undefined
        ? getFallbackCanvasBounds(state.document)
        : getParentBounds(state.document, transformIds[0]);

    interactionRef.current = {
      type: "drag",
      pointerId: event.pointerId,
      startPoint: point,
      beforeDocument: state.document,
      selectedIds,
      transformIds,
      startBox,
      commonParentId,
      parentBounds,
      moved: false,
      lastDocument: state.document,
      lastGuides: [],
      clickedId: effectiveTargetId,
      wasAlreadySelected: currentlySelected,
      currentDelta: { x: 0, y: 0 },
      startScreenPoint: { x: event.clientX, y: event.clientY },
      startWorldToScreenMatrix: startTransform.matrix,
    };
    setInteractionActive(true);
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (textInteraction.handleTextDragMove(event)) return;

    const interaction = interactionRef.current;
    if (!interaction) {
      const viewport = viewportRef.current;
      if (viewport && toolingRef.current && !state.editingTextId) {
        const vpRect = getCurrentViewportRect();
        const hit = toolingRef.current.hitTest(event.clientX - vpRect.left, event.clientY - vpRect.top);
        if (hit.cursor) { viewport.style.cursor = hit.cursor; hoverStore.set(null); return; }
        viewport.style.cursor = "";
      }
      hoverStore.set(getInteractiveElementId(event.target));
      return;
    }

    if (interaction.pointerId !== event.pointerId) return;
    if (interaction.type === "pan") { handlePanMove(interaction, event, state.document, getCurrentViewportSize, dispatch); return; }

    const point = getCanvasPoint(event);
    if (!point) return;

    if (interaction.type === "draw") { handleDrawMove(interaction, event, point, dispatch, latestDocumentRef); return; }
    if (interaction.type === "marquee") { handleMarqueeMove(interaction, point, state.document, setMarqueeRect, dispatch); return; }
    if (interaction.type === "drag") { handleDragMove(interaction, event, point, state.document, commandModeRef, updateDropTarget, dispatch, latestDocumentRef); return; }

    // canvas-resize, canvas-rotate, resize, rotate, radius: shared distance threshold
    interaction.moved = interaction.moved || Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y) > 0.5;

    if (interaction.type === "canvas-resize") { handleCanvasResizeMove(interaction, event, dispatch, latestDocumentRef); return; }
    if (interaction.type === "canvas-rotate") { handleCanvasRotateMove(interaction, point, event, dispatch, latestDocumentRef); return; }
    handleTransformMove(interaction, point, event, dispatch, latestDocumentRef);
  };

  const finishInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (textInteraction.releaseTextDrag(event, viewportRef.current)) return;

    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    viewport?.classList.remove("is-rotating", "is-panning", "is-radius-dragging", "is-resizing");
    viewport?.style.removeProperty("--resize-cursor");
    viewport?.style.removeProperty("cursor");
    interactionRef.current = null;
    setInteractionActive(false);

    if (interaction.type === "pan") return;
    if (interaction.type === "canvas-resize" || interaction.type === "canvas-rotate") {
      if (interaction.moved) dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: interaction.lastDocument });
      return;
    }
    if (interaction.type === "marquee") { setMarqueeRect(null); return; }
    if (interaction.type === "draw") { finishDrawInteraction(interaction, dispatch); return; }

    const wasCommandMode = commandModeRef.current;
    const capturedDropTarget = dropTargetIdRef.current;
    commandModeRef.current = false;
    updateDropTarget(null);

    if (interaction.moved) {
      finishMovedInteraction(interaction, wasCommandMode, capturedDropTarget, dispatch, scheduleCanvasAlignmentLog, state);
    } else {
      dispatch({ type: "setGuides", guides: [] });
    }
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetId = getInteractiveElementId(event.target);
    if (targetId && !state.selectedIds.includes(targetId)) dispatch({ type: "setSelected", selectedIds: [targetId] });
    setContextMenu({ x: event.clientX, y: event.clientY, targetId: targetId ?? null });
  };

  return {
    marqueeRect,
    contextMenu,
    dropTargetId,
    closeContextMenu,
    onPointerDown,
    onPointerMove,
    finishInteraction,
    onDoubleClick: textInteraction.onDoubleClick,
    handleContextMenu,
  };
}
