import React, { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCommonParentId, getInstanceRootId, getParentBounds, isInsideInstance, roundPixel } from "@/canvas/engine/geometry";
import { getElementIdFromTarget } from "@/canvas/engine/hitTesting";
import type { ElementFontTokens, EditorState, Point, Rect } from "@/canvas/engine/types";
import { isInsertTool, isSelectionTool } from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import type { CanvasDocument } from "@/canvas/engine/types";
import { buildViewportTransform } from "../canvasCoordinates";
import { DRAFT_ELEMENT_SIZE_SCALE, viewportPointToCanvas } from "@/canvas/engine/viewport";
import type { Size } from "@/canvas/engine/viewport";
import { createElementForTool, insertElement } from "@/canvas/engine/actions";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import type { CanvasToolingRef } from "../CanvasToolingLayer";
import { findChildAtPoint, retargetForIsolatedParent } from "../canvasHitTesting";
import { clearNativeTextSelection } from "../canvasStageHelpers";
import { isPointInsideCanvas } from "../canvasCoordinates";
import {
  getFallbackCanvasBounds,
  getDragBox,
  getInteractionParentBounds,
  getTransformIds,
} from "../canvasToolingUtils";
import type { Interaction } from "../canvasInteractionTypes";
import type { CanvasDropTarget, TextEditState, ViewportClientRect } from "../canvasStageTypes";
import type { ContextMenuState } from "../CanvasContextMenu";
import type { HoverStore } from "@/canvas/engine/hoverStore";
import type { NoticeStore } from "@/canvas/engine/noticeStore";
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

// Custom cursor shown over (and while dragging) the corner-radius handle. The
// hotspot sits on the arrow tip; falls back to `pointer` if the browser can't load
// the SVG cursor. The asset lives in `public/`, so it is served from the root.
const RADIUS_CURSOR = "url(/cursor-bend.svg) 4 3, pointer";

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
  noticeStore: NoticeStore;
  textEdit: TextEditState | null;
  enterTextEditing: (nodeId: string, clientPoint?: Point, selectAll?: boolean) => void;
  syncTextSelection: (start: number, end: number, anchor?: number) => void;
  scheduleCanvasAlignmentLog: (input: CanvasAlignmentLogInput) => void;
  settings?: GlobalSettings;
  // Design-system typography inputs for element creation (font-size snapping).
  fontTokens?: ElementFontTokens;
  // The region the camera may pan across: the component + device overlay when the
  // screen simulator is on, or null when off. Threaded to the pan handler so
  // space/middle-drag panning can reach the whole device, not just the component.
  navigableBounds?: Rect | null;
};

export type CanvasPointerEventsResult = {
  marqueeRect: Rect | null;
  contextMenu: ContextMenuState;
  dropTarget: CanvasDropTarget | null;
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
  noticeStore,
  textEdit,
  enterTextEditing,
  syncTextSelection,
  scheduleCanvasAlignmentLog,
  settings = DEFAULT_GLOBAL_SETTINGS,
  fontTokens,
  navigableBounds,
}: Params): CanvasPointerEventsResult {
  const dropTargetRef = useRef<CanvasDropTarget | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);

  const closeContextMenu = () => setContextMenu(null);
  const updateDropTarget = (target: CanvasDropTarget | null) => { dropTargetRef.current = target; setDropTarget(target); };

  const textInteraction = useCanvasTextInteraction({
    viewportRef, state, textEdit, enterTextEditing, syncTextSelection,
    latestDocumentRef, latestStateRef, getCurrentViewportSize, getCurrentViewportRect, dispatch,
  });

  const getCanvasPoint = (event: ReactPointerEvent): Point | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const transform = buildViewportTransform(
      state.document,
      getCurrentViewportSize(),
      state.zoom,
      state.offsetX,
      state.offsetY,
      state.viewportMode,
    );
    const vpRect = getCurrentViewportRect();
    return viewportPointToCanvas({ x: event.clientX - vpRect.left, y: event.clientY - vpRect.top }, transform);
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(state.document, state.isolatedParentId, getElementIdFromTarget(target));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (contextMenu) setContextMenu(null);

    const viewport = viewportRef.current;
    // Pan when: middle mouse, space held (temporary pan), or the Hand tool is the
    // active tool and the user presses the left button.
    if (
      event.button === 1 ||
      (event.button === 0 && (spacePressedRef.current || state.tool === "hand"))
    ) {
      if (viewport) {
        startPanInteraction(event, { state, draftMode, viewport, interactionRef, setInteractionActive, getCurrentViewportSize });
        // Flag the transient pan so the toolbar shows the Hand affordance for the
        // duration of the gesture (reverts on release; see finishInteraction).
        dispatch({ type: "setPanning", panning: true });
      }
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
      if (isSelectionTool(state.tool)) {
        dispatch({ type: "setSelected", selectedIds: [] });
        interactionRef.current = { type: "marquee", pointerId: event.pointerId, startPoint: point, currentPoint: point, moved: false };
        setInteractionActive(true);
        event.preventDefault();
        viewport.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (isInsertTool(state.tool)) {
      event.preventDefault();
      const elementSizeScale = draftMode ? DRAFT_ELEMENT_SIZE_SCALE : undefined;
      const creationOptions: {
        sizeScale?: number;
        allowedFontSizes?: number[];
        defaultFontFamily?: string;
      } = {};
      if (elementSizeScale !== undefined) creationOptions.sizeScale = elementSizeScale;
      if (fontTokens?.allowedFontSizes?.length) creationOptions.allowedFontSizes = fontTokens.allowedFontSizes;
      if (fontTokens?.defaultFontFamily) creationOptions.defaultFontFamily = fontTokens.defaultFontFamily;
      const node = createElementForTool(
        state.tool,
        point.x,
        point.y,
        state.document.canvas,
        settings,
        creationOptions,
      );
      node.x = roundPixel(point.x);
      node.y = roundPixel(point.y);
      node.width = 0;
      node.height = 0;
      const next = insertElement(state.document, node);
      interactionRef.current = { type: "draw", pointerId: event.pointerId, startPoint: point, tool: state.tool, elementId: node.id, elementSizeScale, fontTokens, beforeDocument: state.document, lastDocument: next, moved: false };
      setInteractionActive(true);
      dispatch({ type: "setDocumentTransient", document: next, changedIds: [node.id] });
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    // If the click landed inside a linked instance, treat the instance root as the
    // target — instances are read-only units and must move as a whole.
    const targetId = initialTargetId && isInsideInstance(state.document, initialTargetId)
      ? (getInstanceRootId(state.document, initialTargetId) ?? initialTargetId)
      : initialTargetId;
    if (!targetId) {
      dispatch({ type: "setSelected", selectedIds: [] });
      interactionRef.current = { type: "marquee", pointerId: event.pointerId, startPoint: point, currentPoint: point, moved: false };
      setInteractionActive(true);
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    let effectiveTargetId = targetId;
    if (!state.isolatedParentId && !event.shiftKey && state.selectedIds.length === 1 && state.selectedIds[0] === targetId && state.document.elements[targetId]?.children.length && !state.document.elements[targetId]?.instanceOf) {
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

    const startTransform = buildViewportTransform(
      state.document,
      getCurrentViewportSize(),
      state.zoom,
      state.offsetX,
      state.offsetY,
      state.viewportMode,
    );
    const commonParentId = getCommonParentId(state.document, transformIds);
    const parentBounds = draftMode
      ? getInteractionParentBounds(state.document, state.viewportMode, commonParentId, transformIds[0])
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
        if (hit.cursor) {
          viewport.style.cursor = hit.type === "radius" ? RADIUS_CURSOR : hit.cursor;
          if (hit.type !== "radius") hoverStore.set(null);
          return;
        }
        viewport.style.cursor = "";
      }
      hoverStore.set(getInteractiveElementId(event.target));
      return;
    }

    if (interaction.pointerId !== event.pointerId) return;
    if (interaction.type === "pan") { handlePanMove(interaction, event, state.document, getCurrentViewportSize, dispatch, navigableBounds); return; }

    const point = getCanvasPoint(event);
    if (!point) return;

    if (interaction.type === "draw") { handleDrawMove(interaction, event, point, dispatch, latestDocumentRef, settings); return; }
    if (interaction.type === "marquee") { handleMarqueeMove(interaction, point, state.document, setMarqueeRect, dispatch); return; }
    if (interaction.type === "drag") { handleDragMove(interaction, event, point, state.document, commandModeRef, updateDropTarget, dispatch, latestDocumentRef, settings); return; }

    // canvas-resize, canvas-rotate, resize, rotate, radius: shared distance threshold
    interaction.moved = interaction.moved || Math.hypot(point.x - interaction.startPoint.x, point.y - interaction.startPoint.y) > 0.5;

    if (interaction.type === "canvas-resize") { handleCanvasResizeMove(interaction, event, dispatch, latestDocumentRef, settings); return; }
    if (interaction.type === "canvas-rotate") { handleCanvasRotateMove(interaction, point, event, dispatch, latestDocumentRef, settings); return; }
    handleTransformMove(interaction, point, event, dispatch, latestDocumentRef, settings);
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

    if (interaction.type === "pan") {
      // End the transient pan affordance: the toolbar reverts to the persistent
      // tool (e.g. Select) unless Hand is the actual active tool.
      dispatch({ type: "setPanning", panning: false });
      return;
    }
    if (interaction.type === "canvas-resize" || interaction.type === "canvas-rotate") {
      if (interaction.moved) dispatch({ type: "commitDocument", beforeDocument: interaction.beforeDocument, document: interaction.lastDocument });
      return;
    }
    if (interaction.type === "marquee") { setMarqueeRect(null); return; }
    if (interaction.type === "draw") { finishDrawInteraction(interaction, dispatch, settings, noticeStore); return; }

    const wasCommandMode = commandModeRef.current;
    const capturedDropTarget = dropTargetRef.current;
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
    if (event.button !== 2) return;
    const targetId = getInteractiveElementId(event.target);
    if (targetId && !state.selectedIds.includes(targetId)) dispatch({ type: "setSelected", selectedIds: [targetId] });
    setContextMenu({ x: event.clientX, y: event.clientY, targetId: targetId ?? null });
  };

  return {
    marqueeRect,
    contextMenu,
    dropTarget,
    closeContextMenu,
    onPointerDown,
    onPointerMove,
    finishInteraction,
    onDoubleClick: textInteraction.onDoubleClick,
    handleContextMenu,
  };
}
