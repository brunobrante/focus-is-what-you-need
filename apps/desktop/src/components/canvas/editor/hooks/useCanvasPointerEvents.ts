import React, { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  angleBetweenPoints,
  clamp,
  getAbsoluteRect,
  getCommonParentId,
  getDescendantIds,
  getParentBounds,
  getSelectionBox,
  rectCenterX,
  rectCenterY,
  roundPixel,
} from "@/lib/editor/geometry";
import { getElementIdFromTarget } from "@/lib/editor/hitTesting";
import type { EditorState, Point, Rect, ResizeHandle } from "@/lib/editor/types";
import type { EditorAction } from "@/lib/editor/store";
import type { CanvasDocument } from "@/lib/editor/types";
import { clampViewportState, getCanvasDisplayScale, viewportPointToCanvas } from "@/lib/editor/viewport";
import type { Size } from "@/lib/editor/viewport";
import { createElementForTool, insertElement, reparentElements, shallowCloneDocument } from "@/lib/editor/actions";
import type { CanvasToolingRef, RadiusCorner } from "../CanvasToolingLayer";
import { elementToPaintViewportRect } from "../canvasToolingRenderer";
import {
  commitDragMove,
  computeDragMoveCommandFromScreenDelta,
  computeDragMoveFromScreenDelta,
  radiusDocument,
  resizeCanvasDocument,
  resizeDocument,
  rotateCanvasDocument,
  rotateDocument,
} from "../canvasDocumentMutations";
import { findChildAtPoint, findDropTarget, retargetForIsolatedParent } from "../canvasHitTesting";
import {
  DRAFT_BOUNDS,
  findElementsInMarquee,
  getCanvasSize,
  getDragBox,
  getFallbackCanvasBounds,
  getResizeBox,
  getTransformIds,
  isPointInsideCanvas,
} from "../canvasStageUtils";
import type { CanvasAlignmentLogInput } from "../canvasAlignmentLog";
import {
  buildViewportTransform,
  clearNativeTextSelection,
  isClientPointInsideTextContent,
  isClientPointInsideTextNode,
  selectionRangeFromAnchor,
  textIndexFromClientPoint,
} from "../canvasStageHelpers";
import type { Interaction } from "../canvasInteractionTypes";
import type { TextEditState, TextDragState, ViewportClientRect } from "../canvasStageTypes";
import type { ContextMenuState } from "../CanvasContextMenu";
import type { HoverStore } from "@/lib/editor/hoverStore";

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
  const textDragRef = useRef<TextDragState | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const closeContextMenu = () => setContextMenu(null);

  const updateDropTarget = (id: string | null) => {
    dropTargetIdRef.current = id;
    setDropTargetId(id);
  };

  const getCanvasPoint = (event: ReactPointerEvent): Point | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const transform = buildViewportTransform(state.document, getCurrentViewportSize(), state.zoom, state.offsetX, state.offsetY);
    const viewportRect = getCurrentViewportRect();
    return viewportPointToCanvas(
      { x: event.clientX - viewportRect.left, y: event.clientY - viewportRect.top },
      transform,
    );
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(state.document, state.isolatedParentId, getElementIdFromTarget(target));

  const buildLatestTransform = () =>
    buildViewportTransform(
      latestDocumentRef.current,
      getCurrentViewportSize(),
      latestStateRef.current.zoom,
      latestStateRef.current.offsetX,
      latestStateRef.current.offsetY,
    );

  const textIndexAtClientPoint = (nodeId: string, clientX: number, clientY: number): number | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    return textIndexFromClientPoint({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect: getCurrentViewportRect(),
      viewportTransform: buildLatestTransform(),
    });
  };

  const isTextNodeAtClientPoint = (nodeId: string, clientX: number, clientY: number): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    return isClientPointInsideTextNode({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect: getCurrentViewportRect(),
      viewportTransform: buildLatestTransform(),
    });
  };

  const isTextContentAtClientPoint = (nodeId: string, clientX: number, clientY: number): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    return isClientPointInsideTextContent({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect: getCurrentViewportRect(),
      viewportTransform: buildLatestTransform(),
    });
  };

  const getSelectedTextBoxAtClientPoint = (clientX: number, clientY: number): string | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportRect = getCurrentViewportRect();
    const viewportPoint = { x: clientX - viewportRect.left, y: clientY - viewportRect.top };
    const viewportTransform = buildViewportTransform(state.document, getCurrentViewportSize(), state.zoom, state.offsetX, state.offsetY);
    for (const id of [...state.selectedIds].reverse()) {
      const node = state.document.elements[id];
      if (!node || node.type !== "text" || node.locked || node.visible === false) continue;
      const elementRect = elementToPaintViewportRect(state.document, id, viewportTransform);
      if (
        elementRect &&
        viewportPoint.x >= elementRect.x &&
        viewportPoint.x <= elementRect.x + elementRect.width &&
        viewportPoint.y >= elementRect.y &&
        viewportPoint.y <= elementRect.y + elementRect.height
      ) {
        return id;
      }
    }
    return null;
  };

  const setTextSelectionFromPoint = (nodeId: string, clientX: number, clientY: number, anchorIndex?: number): number | null => {
    const index = textIndexAtClientPoint(nodeId, clientX, clientY);
    if (index === null) return null;
    const anchor = anchorIndex ?? index;
    const nextSelection = selectionRangeFromAnchor(anchor, index);
    syncTextSelection(nextSelection.selectionStart, nextSelection.selectionEnd, nextSelection.anchorIndex);
    return index;
  };

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
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
    const startRects: Record<string, Rect> = {};
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
  };

  const beginRotate = (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
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
  };

  const beginRadiusDrag = (corner: RadiusCorner, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
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
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
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
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (contextMenu) setContextMenu(null);
    if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) { beginPan(event); return; }
    if (event.button !== 0) return;
    clearNativeTextSelection();

    const viewport = viewportRef.current;
    const initialTargetId = getInteractiveElementId(event.target);
    const initialTargetNode = initialTargetId ? state.document.elements[initialTargetId] : null;
    const selectedTextBoxTargetId = initialTargetId
      ? null
      : getSelectedTextBoxAtClientPoint(event.clientX, event.clientY);
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
      if (hit.type === "resize") {
        beginResize(hit.handle, event);
        if (hit.cursor) {
          viewport.style.setProperty("--resize-cursor", hit.cursor);
          viewport.classList.add("is-resizing");
        }
        return;
      }
      if (hit.type === "rotate") { beginRotate(event); return; }
      if (hit.type === "radius") { beginRadiusDrag(hit.corner, event); return; }
    }

    if (state.canvasStageActive) return;
    if (state.editingTextId) {
      if (isTextNodeAtClientPoint(state.editingTextId, event.clientX, event.clientY)) {
        const index = setTextSelectionFromPoint(state.editingTextId, event.clientX, event.clientY);
        if (index !== null) {
          textDragRef.current = { pointerId: event.pointerId, nodeId: state.editingTextId, anchorIndex: index };
          event.preventDefault();
          viewport?.setPointerCapture(event.pointerId);
        }
        return;
      }
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
    const textDrag = textDragRef.current;
    if (textDrag) {
      if (textDrag.pointerId !== event.pointerId) return;
      setTextSelectionFromPoint(textDrag.nodeId, event.clientX, event.clientY, textDrag.anchorIndex);
      event.preventDefault();
      return;
    }

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
    if (interaction.type === "pan") {
      const rawPanViewport = {
        zoom: interaction.zoom,
        offsetX: interaction.startOffsetX + event.clientX - interaction.startScreenPoint.x,
        offsetY: interaction.startOffsetY + event.clientY - interaction.startScreenPoint.y,
      };
      const nextViewport = clampViewportState(rawPanViewport, getCurrentViewportSize(), getCanvasSize(state.document));
      interaction.moved = interaction.moved || Math.hypot(event.clientX - interaction.startScreenPoint.x, event.clientY - interaction.startScreenPoint.y) > 0.5;
      dispatch({ type: "setViewport", zoom: nextViewport.zoom, offsetX: nextViewport.offsetX, offsetY: nextViewport.offsetY });
      return;
    }

    const point = getCanvasPoint(event);
    if (!point) return;

    if (interaction.type === "draw") {
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
      dispatch({ type: "setDocumentTransient", document: next });
      return;
    }

    if (interaction.type === "marquee") {
      const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
      interaction.moved = interaction.moved || distance > 2;
      interaction.currentPoint = point;
      if (interaction.moved) {
        const rect: Rect = {
          x: Math.min(interaction.startPoint.x, point.x),
          y: Math.min(interaction.startPoint.y, point.y),
          width: Math.abs(point.x - interaction.startPoint.x),
          height: Math.abs(point.y - interaction.startPoint.y),
        };
        setMarqueeRect(rect);
        dispatch({ type: "setSelected", selectedIds: findElementsInMarquee(state.document, rect) });
      }
      return;
    }

    if (interaction.type === "drag") {
      const screenDelta = { x: event.clientX - interaction.startScreenPoint.x, y: event.clientY - interaction.startScreenPoint.y };
      interaction.moved = interaction.moved || Math.hypot(screenDelta.x, screenDelta.y) > 0.5;
      let move;
      if (event.metaKey) {
        commandModeRef.current = true;
        const canvasBounds: Rect = { x: 0, y: 0, width: state.document.canvas.width, height: state.document.canvas.height };
        move = computeDragMoveCommandFromScreenDelta(interaction, screenDelta, canvasBounds);
        const nextDocument = commitDragMove(interaction, move.delta);
        const excludeIds = new Set<string>(interaction.transformIds);
        for (const id of interaction.transformIds) {
          for (const desc of getDescendantIds(interaction.beforeDocument, id)) excludeIds.add(desc);
        }
        updateDropTarget(findDropTarget(nextDocument, point, excludeIds));
      } else {
        if (commandModeRef.current) { commandModeRef.current = false; updateDropTarget(null); }
        move = computeDragMoveFromScreenDelta(interaction, screenDelta);
      }
      const nextDocument = commitDragMove(interaction, move.delta);
      interaction.currentDelta = move.delta;
      interaction.lastGuides = move.guides;
      interaction.lastDocument = nextDocument;
      latestDocumentRef.current = nextDocument;
      dispatch({ type: "setDocumentTransient", document: nextDocument, guides: move.guides });
      return;
    }

    const distance = Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y);
    interaction.moved = interaction.moved || distance > 0.5;

    if (interaction.type === "canvas-resize") {
      const result = resizeCanvasDocument(interaction, event);
      interaction.lastDocument = result.document;
      latestDocumentRef.current = result.document;
      dispatch({ type: "setDocumentTransient", document: result.document });
      dispatch({ type: "setViewport", zoom: result.viewport.zoom, offsetX: result.viewport.offsetX, offsetY: result.viewport.offsetY });
      return;
    }
    if (interaction.type === "canvas-rotate") {
      const next = rotateCanvasDocument(interaction, point, event);
      interaction.lastDocument = next;
      latestDocumentRef.current = next;
      dispatch({ type: "setDocumentTransient", document: next });
      return;
    }

    const result =
      interaction.type === "resize" ? resizeDocument(interaction, point, event)
        : interaction.type === "radius" ? radiusDocument(interaction, point)
        : rotateDocument(interaction, point, event);
    interaction.lastDocument = result.document;
    interaction.lastGuides = result.guides;
    latestDocumentRef.current = result.document;
    dispatch({ type: "setDocumentTransient", document: result.document, guides: result.guides });
  };

  const finishInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const textDrag = textDragRef.current;
    if (textDrag?.pointerId === event.pointerId) {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      textDragRef.current = null;
      event.preventDefault();
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    viewport?.classList.remove("is-rotating");
    viewport?.classList.remove("is-panning");
    viewport?.classList.remove("is-radius-dragging");
    viewport?.classList.remove("is-resizing");
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
    if (interaction.type === "draw") {
      if (interaction.moved) {
        dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: interaction.lastDocument, selectedIds: [interaction.elementId] });
      } else {
        const node = createElementForTool(interaction.tool, interaction.startPoint.x, interaction.startPoint.y, interaction.beforeDocument.canvas);
        node.id = interaction.elementId;
        const next = shallowCloneDocument(interaction.beforeDocument);
        next.elements[node.id] = node;
        if (!next.rootIds.includes(node.id)) next.rootIds.push(node.id);
        dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: next, selectedIds: [node.id] });
      }
      dispatch({ type: "setTool", tool: "select" });
      return;
    }

    const wasCommandMode = commandModeRef.current;
    const capturedDropTarget = dropTargetIdRef.current;
    commandModeRef.current = false;
    updateDropTarget(null);

    if (interaction.moved) {
      if (interaction.type === "drag") {
        const committed = commitDragMove(interaction, interaction.currentDelta);
        const finalDoc = wasCommandMode ? reparentElements(committed, interaction.transformIds, capturedDropTarget) : committed;
        dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: finalDoc, selectedIds: interaction.selectedIds });
        scheduleCanvasAlignmentLog({
          reason: "interaction-finish",
          interactionType: interaction.type,
          document: finalDoc,
          selectedIds: interaction.selectedIds,
          zoom: state.zoom,
          offsetX: state.offsetX,
          offsetY: state.offsetY,
        });
      } else {
        dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: interaction.lastDocument, selectedIds: interaction.selectedIds });
        scheduleCanvasAlignmentLog({
          reason: "interaction-finish",
          interactionType: interaction.type,
          document: interaction.lastDocument,
          selectedIds: interaction.selectedIds,
          zoom: state.zoom,
          offsetX: state.offsetX,
          offsetY: state.offsetY,
        });
      }
    } else {
      dispatch({ type: "setGuides", guides: [] });
    }
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const targetId = getInteractiveElementId(event.target);
    const targetNode = targetId ? state.document.elements[targetId] : null;
    const selectedTextBoxTargetId = targetId ? null : getSelectedTextBoxAtClientPoint(event.clientX, event.clientY);
    const node =
      targetNode?.type === "text"
        ? targetNode
        : selectedTextBoxTargetId
          ? state.document.elements[selectedTextBoxTargetId]
          : null;
    if (node?.type === "text" && !node.locked) {
      event.preventDefault();
      clearNativeTextSelection();
      const clickedTextContent = isTextContentAtClientPoint(node.id, event.clientX, event.clientY);
      if (state.editingTextId === node.id) {
        const value = textEdit?.nodeId === node.id ? textEdit.value : node.content ?? "";
        syncTextSelection(0, value.length, 0);
        return;
      }
      enterTextEditing(node.id, { x: event.clientX, y: event.clientY }, !clickedTextContent || (targetId === null && selectedTextBoxTargetId === node.id));
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
    onDoubleClick,
    handleContextMenu,
  };
}
