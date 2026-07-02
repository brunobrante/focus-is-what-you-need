import React, { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCommonParentId, getInstanceRootId, getParentBounds, isInsideInstance, roundPixel } from "@/canvas/engine/geometry";
import { getElementIdFromTarget, isEditableTarget } from "@/canvas/engine/hitTesting";
import { insertSvgDocument, insertSvgPathsAsRoot } from "@/canvas/engine/actions";
import { parseSvg } from "@/canvas/engine/vector/svgImport";
import type { ElementFontTokens, EditorState, Point, Rect } from "@/canvas/engine/types";
import { isInsertTool, isSelectionTool } from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import type { CanvasDocument } from "@/canvas/engine/types";
import { buildViewportTransform } from "../canvasCoordinates";
import { DRAFT_ELEMENT_SIZE_SCALE, viewportPointToCanvas } from "@/canvas/engine/viewport";
import type { Size } from "@/canvas/engine/viewport";
import { createElementForTool, insertElement } from "@/canvas/engine/actions";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";
import type { GlobalSettings } from "@/domain/settings/types";
import type { CanvasToolingRef } from "../CanvasToolingLayer";
import { findChildAtPoint, retargetForIsolatedParent } from "../canvasHitTesting";
import type { ToolingHit } from "../canvasHitTesting";
import { PEN_CURSOR, PEN_REMOVE_CURSOR } from "../penCursors";
import {
  anchorEditMove,
  anchorEditPointerDown,
  finishAnchorEdit,
  finishPen,
  finishPencil,
  pathDoubleClick,
  pencilMove,
  pencilPointerDown,
  penPointerDown,
  penPointerMove,
  type VectorPointerCtx,
} from "../canvasVectorInteraction";
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

// True when a native drag carries OS files. During `dragover` the browser hides
// the actual file list for privacy, so we must sniff `types` (not `files`) to
// decide whether to accept the drop.
const dragHasFiles = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types).includes("Files");

// First dropped file that is an image (mirrors the References import filter).
const firstImageFile = (dataTransfer: DataTransfer | null): File | null => {
  const files = dataTransfer?.files;
  if (!files) return null;
  for (let i = 0; i < files.length; i++) {
    if (files[i].type.startsWith("image/")) return files[i];
  }
  return null;
};

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImageNaturalSize = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to decode dropped image"));
    img.src = dataUrl;
  });

type Dispatch = React.Dispatch<EditorAction>;

type Params = {
  state: EditorState;
  dispatch: Dispatch;
  draftMode: boolean;
  // Memoized in CanvasStage from the same state inputs — passed in so getCanvasPoint
  // doesn't rebuild the identical transform on every pointer event (STAGE-3).
  viewportTransform: ReturnType<typeof buildViewportTransform>;
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
  // The subject is an icon master: pasted SVG decomposes into root-level paths
  // (the artboard IS the svg) instead of a sealed svg container.
  isIconSubject?: boolean;
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
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  /** Aborts an in-flight drag/resize/rotate/radius gesture (Escape). Returns true if one was active. */
  cancelActiveInteraction: () => boolean;
};

export function useCanvasPointerEvents({
  state,
  dispatch,
  draftMode,
  viewportTransform,
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
  isIconSubject = false,
}: Params): CanvasPointerEventsResult {
  const dropTargetRef = useRef<CanvasDropTarget | null>(null);
  // Last free-space hover position (client coords), so we can re-evaluate the
  // cursor when a modifier changes without the pointer moving. B19.
  const lastHoverClientRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);

  const closeContextMenu = () => setContextMenu(null);
  const updateDropTarget = (target: CanvasDropTarget | null) => { dropTargetRef.current = target; setDropTarget(target); };

  const textInteraction = useCanvasTextInteraction({
    viewportRef, state, textEdit, enterTextEditing, syncTextSelection,
    latestDocumentRef, latestStateRef, getCurrentViewportSize, getCurrentViewportRect, dispatch,
  });

  const getCanvasPoint = (event: { clientX: number; clientY: number }): Point | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const vpRect = getCurrentViewportRect();
    return viewportPointToCanvas({ x: event.clientX - vpRect.left, y: event.clientY - vpRect.top }, viewportTransform);
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(state.document, state.isolatedParentId, getElementIdFromTarget(target));

  const vectorCtx = (viewport: HTMLDivElement): VectorPointerCtx => ({
    state,
    dispatch,
    settings,
    interactionRef,
    setInteractionActive,
    latestDocumentRef,
    viewport,
  });

  // System-clipboard SVG paste → decompose into a sealed svg node (Versioning §8).
  // On an icon canvas the artboard IS the svg, so the paths land directly at the
  // root instead (no sealed container — they show and edit like drawn paths).
  // Internal element paste (Cmd+V of copied elements) is handled separately in the
  // keyboard hook; this only fires when the clipboard holds raw SVG markup.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const text = data.getData("image/svg+xml") || data.getData("text/plain");
      if (!text || !text.trim().startsWith("<svg")) return;
      const parsed = parseSvg(text);
      if (!parsed) return;
      event.preventDefault();
      const doc = latestStateRef.current.document;
      if (isIconSubject) {
        const { document: nextDocument, pathIds } = insertSvgPathsAsRoot(doc, parsed);
        dispatch({ type: "commitDocument", document: nextDocument, selectedIds: pathIds });
        return;
      }
      const cx = doc.canvas.width / 2 - parsed.viewBox.width / 2;
      const cy = doc.canvas.height / 2 - parsed.viewBox.height / 2;
      const { document: nextDocument, svgId } = insertSvgDocument(doc, parsed, roundPixel(cx), roundPixel(cy));
      dispatch({ type: "commitDocument", document: nextDocument, selectedIds: [svgId] });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [dispatch, latestStateRef, isIconSubject]);

  // The free-space cursor is normally rewritten only on pointer move, so switching
  // tools without moving the mouse would leave a stale cursor (e.g. the pen cursor
  // lingering after switching to select). Sync it to the new tool on every change. B11.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || interactionRef.current) return;
    viewport.style.cursor = state.tool === "pen" ? PEN_CURSOR : state.tool === "pencil" ? "crosshair" : "";
  }, [state.tool, viewportRef, interactionRef]);

  // In path edit mode, holding/releasing Alt over an anchor toggles the remove
  // cursor. The hover cursor is otherwise only recomputed on pointer move, so
  // re-evaluate it at the last hover position when Alt changes. B19.
  useEffect(() => {
    if (!state.pathEditId) return;
    const onAltChange = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      const viewport = viewportRef.current;
      const last = lastHoverClientRef.current;
      if (!viewport || interactionRef.current || state.editingTextId || !toolingRef.current || !last) return;
      const vpRect = getCurrentViewportRect();
      const hit = toolingRef.current.hitTest(last.x - vpRect.left, last.y - vpRect.top);
      if (!hit.cursor) return;
      viewport.style.cursor =
        hit.type === "radius"
          ? RADIUS_CURSOR
          : hit.type === "path-anchor" && isModifierCommandActive(e, settings, "canvas.vector.removeAnchor")
            ? PEN_REMOVE_CURSOR
            : hit.cursor;
    };
    window.addEventListener("keydown", onAltChange);
    window.addEventListener("keyup", onAltChange);
    return () => {
      window.removeEventListener("keydown", onAltChange);
      window.removeEventListener("keyup", onAltChange);
    };
  }, [state.pathEditId, state.editingTextId, viewportRef, toolingRef, interactionRef, getCurrentViewportRect]);

  // Drop a photo/image file onto the frame → a new Image element holding that
  // file (planned/canvas-image-drop.md). Async because we decode the file into a
  // data URL and read its natural size before placing the node.
  const insertDroppedImageFile = async (file: File, point: Point) => {
    let dataUrl: string;
    let natural: { width: number; height: number };
    try {
      dataUrl = await readFileAsDataUrl(file);
      natural = await loadImageNaturalSize(dataUrl);
    } catch {
      return;
    }
    const document = latestStateRef.current.document;
    const node = createElementForTool("image", point.x, point.y, document.canvas, settings);
    node.src = dataUrl;

    if (settings.canvas.shell.resizeImageToFrame) {
      // Fit proportionally inside the frame; only shrink, never upscale. The box
      // keeps the image's aspect ratio, so the whole photo is shown un-cropped.
      const scale = Math.min(
        1,
        document.canvas.width / natural.width,
        document.canvas.height / natural.height,
      );
      node.width = Math.max(1, Math.round(natural.width * scale));
      node.height = Math.max(1, Math.round(natural.height * scale));
      node.styles = { ...node.styles, objectFit: "fill" };
    } else {
      // Keep the file's natural pixel size. Elements are frame-bounded (the
      // bounded-canvas / frame-bounds law), so `objectFit: none` renders the
      // image at 1:1 and the frame box clips any overflow.
      node.width = natural.width;
      node.height = natural.height;
      node.styles = { ...node.styles, objectFit: "none" };
    }
    node.x = roundPixel(point.x - node.width / 2);
    node.y = roundPixel(point.y - node.height / 2);

    const next = insertElement(document, node);
    dispatch({ type: "commitDocument", document: next, selectedIds: [node.id] });
  };

  const onDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const file = firstImageFile(event.dataTransfer);
    if (!file) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    if (!point) return;
    void insertDroppedImageFile(file, point);
  };

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

    let toolingHit: ToolingHit | null = null;
    if (viewport && toolingRef.current && !state.editingTextId) {
      const vpRect = getCurrentViewportRect();
      const hit = toolingRef.current.hitTest(event.clientX - vpRect.left, event.clientY - vpRect.top);
      toolingHit = hit;
      // Path edit mode (select tool): anchor/handle/segment interactions take priority.
      if (state.pathEditId && state.tool !== "pen") {
        if (
          hit.type === "path-anchor" ||
          hit.type === "path-handle" ||
          hit.type === "path-segment" ||
          hit.type === "path-empty"
        ) {
          const pePoint = getCanvasPoint(event) ?? { x: 0, y: 0 };
          if (anchorEditPointerDown(vectorCtx(viewport), event, pePoint, hit)) return;
        }
      }
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

    if (state.tool === "pen") {
      if (penPointerDown(vectorCtx(viewport), event, point, toolingHit ?? { type: "none", cursor: null })) return;
      return;
    }

    if (state.tool === "pencil") {
      if (pencilPointerDown(vectorCtx(viewport), event, point)) return;
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
    if (!state.isolatedParentId && !isModifierCommandActive(event, settings, "canvas.selection.addToClick") && state.selectedIds.length === 1 && state.selectedIds[0] === targetId && state.document.elements[targetId]?.children.length && !state.document.elements[targetId]?.instanceOf) {
      const child = findChildAtPoint(state.document, targetId, point);
      if (child) effectiveTargetId = child;
    }

    const currentlySelected = state.selectedIds.includes(effectiveTargetId);
    const selectedIds = isModifierCommandActive(event, settings, "canvas.selection.addToClick")
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
      lastHoverClientRef.current = { x: event.clientX, y: event.clientY };
      // Reset unconditionally: if text editing begins mid-hover the tooling branch
      // below is skipped, which would otherwise leave a stuck RADIUS_CURSOR.
      if (viewport) viewport.style.cursor = "";
      if (viewport && toolingRef.current && !state.editingTextId) {
        const vpRect = getCurrentViewportRect();
        const hit = toolingRef.current.hitTest(event.clientX - vpRect.left, event.clientY - vpRect.top);
        if (hit.cursor) {
          // Alt over an anchor in edit mode shows the remove-anchor cursor.
          const cursor =
            hit.type === "radius"
              ? RADIUS_CURSOR
              : hit.type === "path-anchor" && isModifierCommandActive(event, settings, "canvas.vector.removeAnchor")
                ? PEN_REMOVE_CURSOR
                : hit.cursor;
          viewport.style.cursor = cursor;
          if (hit.type !== "radius") hoverStore.set(null);
          return;
        }
      }
      // Free-space cursor for the vector tools.
      if (viewport && (state.tool === "pen" || state.tool === "pencil")) {
        viewport.style.cursor = state.tool === "pen" ? PEN_CURSOR : "crosshair";
        hoverStore.set(null);
        return;
      }
      hoverStore.set(getInteractiveElementId(event.target));
      return;
    }

    if (interaction.pointerId !== event.pointerId) return;
    if (interaction.type === "pan") { handlePanMove(interaction, event, state.document, getCurrentViewportSize, dispatch, navigableBounds); return; }

    const point = getCanvasPoint(event);
    if (!point) return;

    if (interaction.type === "draw") { handleDrawMove(interaction, event, point, dispatch, latestDocumentRef, settings); return; }
    if (interaction.type === "pen") { penPointerMove(interaction, point, dispatch, latestDocumentRef); return; }
    if (interaction.type === "pencil") { pencilMove(interaction, point, dispatch, latestDocumentRef); return; }
    if (interaction.type === "anchor-edit") { anchorEditMove(interaction, point, dispatch, latestDocumentRef); return; }
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
    if (interaction.type === "pen") { finishPen(interaction, dispatch); return; }
    if (interaction.type === "pencil") { finishPencil(interaction, dispatch); return; }
    if (interaction.type === "anchor-edit") { finishAnchorEdit(interaction, dispatch); return; }

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

  // STAGE-4: Escape aborts an in-flight pointer gesture (drag/resize/rotate/
  // radius, plus the canvas-frame variants). Reverts to the gesture's
  // beforeDocument and clears every gesture ref/class so no stale reparent
  // drop-target highlight or command-mode flag survives. Pen/anchor/draw have
  // their own dedicated cancel paths in useKeyboardShortcuts and are left alone.
  const cancelActiveInteraction = (): boolean => {
    const interaction = interactionRef.current;
    if (
      !interaction ||
      interaction.type === "pan" ||
      interaction.type === "marquee" ||
      interaction.type === "draw" ||
      interaction.type === "pen" ||
      interaction.type === "pencil" ||
      interaction.type === "anchor-edit"
    ) {
      return false;
    }

    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(interaction.pointerId)) viewport.releasePointerCapture(interaction.pointerId);
    viewport?.classList.remove("is-rotating", "is-panning", "is-radius-dragging", "is-resizing");
    viewport?.style.removeProperty("--resize-cursor");
    viewport?.style.removeProperty("cursor");

    interactionRef.current = null;
    setInteractionActive(false);
    commandModeRef.current = false;
    updateDropTarget(null);

    dispatch({ type: "setDocumentTransient", document: interaction.beforeDocument });
    dispatch({ type: "setGuides", guides: [] });
    return true;
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport && toolingRef.current && !state.editingTextId) {
      const vpRect = getCurrentViewportRect();
      const hit = toolingRef.current.hitTest(event.clientX - vpRect.left, event.clientY - vpRect.top);
      if (pathDoubleClick(vectorCtx(viewport), event, hit)) return;
    }
    textInteraction.onDoubleClick(event);
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
    onDoubleClick,
    handleContextMenu,
    onDragOver,
    onDrop,
    cancelActiveInteraction,
  };
}
