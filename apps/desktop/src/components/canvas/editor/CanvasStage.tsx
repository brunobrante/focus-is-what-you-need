import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  cloneDocument,
  createElementForTool,
  deleteElements,
  duplicateElements,
  insertElement,
  reparentElements,
  updateElementText,
} from "@/lib/editor/actions";
import { copyElements, pasteElements } from "@/lib/editor/clipboard";
import {
  angleBetweenPoints,
  clamp,
  getAbsoluteRect,
  getCommonParentId,
  getDescendantIds,
  getElementAABB,
  getParentBounds,
  getSelectionBox,
  rectCenterX,
  rectCenterY,
  roundPixel,
} from "@/lib/editor/geometry";
import { getElementIdFromTarget, isEditableTarget } from "@/lib/editor/hitTesting";
import { useEditor } from "@/lib/editor/store";
import type { CanvasDocument, Point, Rect, ResizeHandle } from "@/lib/editor/types";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  canvasPointToViewport,
  clampViewportState,
  clientPointToCanvas,
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  snapViewportOffset,
  shouldUseScaledDomProjection,
  type ViewportTransform,
  viewportChanged,
} from "@/lib/editor/viewport";
import { DetachedIsolatedChildren, ElementRenderer } from "./ElementRenderer";
import { CanvasContextMenu } from "./CanvasContextMenu";
import type { ContextMenuState } from "./CanvasContextMenu";
import { CanvasToolingLayer } from "./CanvasToolingLayer";
import type { CanvasToolingRef, RadiusCorner } from "./CanvasToolingLayer";
import type { ToolingHit } from "./canvasToolingHitTest";
import type { Interaction } from "./canvasInteractionTypes";
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
import { findChildAtPoint, findDropTarget, retargetForIsolatedParent } from "./canvasHitTesting";
import { getShellPatternStyle, getStageBoxShadow, TOOLBAR_TOOL_MAP } from "./canvasShellStyle";
import {
  DRAFT_BOUNDS,
  findElementsInMarquee,
  getCanvasSize,
  getDragBox,
  getFallbackCanvasBounds,
  getResizeBox,
  getTransformIds,
  getViewportSize,
  isPointInsideCanvas,
} from "./canvasStageUtils";
import {
  elementToPaintViewportRect,
  containmentOutlineSegments,
  snapOutlineRect,
} from "./canvasToolingRenderer";
import "./editor.css";

type CanvasAlignmentLogInput = {
  reason: string;
  interactionType?: string | null;
  document: CanvasDocument;
  selectedIds: string[];
  zoom: number;
  offsetX: number;
  offsetY: number;
};

function roundDebugValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rectForDebug(rect: Rect | null): Rect | null {
  if (!rect) return null;
  return {
    x: roundDebugValue(rect.x),
    y: roundDebugValue(rect.y),
    width: roundDebugValue(rect.width),
    height: roundDebugValue(rect.height),
  };
}

function rectEdgesForDebug(rect: Rect | null): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
  if (!rect) return null;
  return {
    left: roundDebugValue(rect.x),
    right: roundDebugValue(rect.x + rect.width),
    top: roundDebugValue(rect.y),
    bottom: roundDebugValue(rect.y + rect.height),
  };
}

function unionViewportRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function getRenderedElement(viewport: HTMLElement, id: string): HTMLElement | null {
  for (const element of viewport.querySelectorAll<HTMLElement>("[data-element-id]")) {
    if (element.dataset.elementId === id) return element;
  }
  return null;
}

function domRectRelativeToViewport(element: HTMLElement, viewport: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return {
    x: rect.left - viewportRect.left,
    y: rect.top - viewportRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function domClientRectForDebug(element: HTMLElement | null): Rect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function domBoxMetricsForDebug(element: HTMLElement | null) {
  if (!element) return null;
  return {
    clientRect: rectForDebug(domClientRectForDebug(element)),
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    cssWidth: getComputedStyle(element).width,
    cssHeight: getComputedStyle(element).height,
  };
}

function isCanvasAlignmentDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("fwyn:debug-canvas-alignment") === "1";
  } catch {
    return false;
  }
}

function unscaleRect(rect: Rect | null, scale: number): Rect | null {
  if (!rect || scale === 0) return null;
  return {
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function exactOutlineEdges(
  rect: Rect | null,
  pixelScale: { x: number; y: number },
): {
  leftOuter: number;
  leftInner: number;
  rightInner: number;
  rightOuter: number;
  topOuter: number;
  topInner: number;
  bottomInner: number;
  bottomOuter: number;
} | null {
  if (!rect) return null;
  const segments = containmentOutlineSegments(rect, pixelScale);
  if (!segments) return null;
  return {
    leftOuter: roundDebugValue(segments.left.x),
    leftInner: roundDebugValue(segments.left.x + segments.left.width),
    rightInner: roundDebugValue(segments.right.x),
    rightOuter: roundDebugValue(segments.right.x + segments.right.width),
    topOuter: roundDebugValue(segments.top.y),
    topInner: roundDebugValue(segments.top.y + segments.top.height),
    bottomInner: roundDebugValue(segments.bottom.y),
    bottomOuter: roundDebugValue(segments.bottom.y + segments.bottom.height),
  };
}

function buildViewportTransform(
  document: CanvasDocument,
  viewportSize: { width: number; height: number },
  zoom: number,
  offsetX: number,
  offsetY: number,
): ViewportTransform {
  const canvasSize = getCanvasSize(document);
  const displayScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? getCanvasDisplayScale(viewportSize, canvasSize)
      : 1;
  return createViewportTransform({
    displayZoom: zoom * displayScale,
    offsetX: snapViewportOffset(offsetX),
    offsetY: snapViewportOffset(offsetY),
    canvasRotation: document.canvas.rotation ?? 0,
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
  });
}

type TextEditingSession = {
  id: string;
  beforeDocument: CanvasDocument;
  draftValue: string;
};

type TextCaretStyle = CSSProperties & {
  "--caret-height"?: string;
};

function clearNativeTextSelection(): void {
  try {
    globalThis.getSelection?.()?.removeAllRanges();
  } catch {
    // Selection cleanup is best-effort and must never break editing state.
  }
}

function TextEditingTextarea({
  latestDocumentRef,
  viewportRef,
  viewportTransform,
}: {
  latestDocumentRef: { current: CanvasDocument };
  viewportRef: { current: HTMLDivElement | null };
  viewportTransform: ViewportTransform;
}) {
  const { state, dispatch } = useEditor();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionRef = useRef<TextEditingSession | null>(null);
  const composingRef = useRef(false);
  const [caretStyle, setCaretStyle] = useState<TextCaretStyle | null>(null);
  const editingNode = state.editingTextId
    ? state.document.elements[state.editingTextId]
    : null;
  const activeTextNode =
    editingNode?.type === "text" && editingNode.visible !== false
      ? editingNode
      : null;

  const writeRenderedText = useCallback((id: string, value: string) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const element = getRenderedElement(viewport, id);
    if (element && element.textContent !== value) element.textContent = value;
  }, [viewportRef]);

  const refreshCaret = useCallback(() => {
    const textarea = textareaRef.current;
    const session = sessionRef.current;
    const viewport = viewportRef.current;
    if (!textarea || !session || !viewport) {
      setCaretStyle(null);
      return;
    }

    const element = getRenderedElement(viewport, session.id);
    if (!element || textarea.selectionStart !== textarea.selectionEnd) {
      setCaretStyle(null);
      return;
    }

    const textNode = element.firstChild;
    const offset = Math.min(
      textarea.selectionStart ?? session.draftValue.length,
      session.draftValue.length,
    );
    const elementRect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const fontSize = Number.parseFloat(computed.fontSize) || 12;
    const lineHeight =
      Number.parseFloat(computed.lineHeight) || fontSize * 1.12;
    let left = elementRect.left;
    let top = elementRect.top;
    let height = lineHeight;

    if (textNode?.nodeType === Node.TEXT_NODE) {
      const range = globalThis.document.createRange();
      range.setStart(textNode, offset);
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      range.detach();
      if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
        left = rect.left;
        top = rect.top || elementRect.top;
        height = rect.height || lineHeight;
      }
    }

    setCaretStyle({
      position: "fixed",
      left,
      top,
      width: 1,
      height,
      background: computed.color || "#0d99ff",
      pointerEvents: "none",
      zIndex: 12,
      transform: "translateZ(0)",
      "--caret-height": `${height}px`,
    });
  }, [viewportRef]);

  const finishEditing = useCallback((mode: "commit" | "cancel") => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    setCaretStyle(null);
    clearNativeTextSelection();

    if (mode === "cancel") {
      const beforeContent = session.beforeDocument.elements[session.id]?.content ?? "";
      writeRenderedText(session.id, beforeContent);
      dispatch({ type: "setEditingText", editingTextId: null });
      return;
    }

    const value = textareaRef.current?.value ?? session.draftValue;
    const finalDocument = updateElementText(
      session.beforeDocument,
      session.id,
      value,
    );
    latestDocumentRef.current = finalDocument;
    const beforeContent = session.beforeDocument.elements[session.id]?.content ?? "";
    const afterContent = finalDocument.elements[session.id]?.content ?? "";

    if (beforeContent === afterContent) {
      dispatch({ type: "setEditingText", editingTextId: null });
      return;
    }

    dispatch({
      type: "commitDocument",
      beforeDocument: session.beforeDocument,
      document: finalDocument,
      selectedIds: state.selectedIds.length > 0 ? state.selectedIds : [session.id],
    });
  }, [dispatch, latestDocumentRef, state.selectedIds, writeRenderedText]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!activeTextNode) {
      if (sessionRef.current) finishEditing("commit");
      textarea.value = "";
      setCaretStyle(null);
      clearNativeTextSelection();
      return;
    }

    if (sessionRef.current?.id === activeTextNode.id) return;
    if (sessionRef.current) finishEditing("commit");

    const beforeDocument = latestDocumentRef.current;
    sessionRef.current = {
      id: activeTextNode.id,
      beforeDocument,
      draftValue: activeTextNode.content ?? "",
    };

    textarea.value = activeTextNode.content ?? "";
    writeRenderedText(activeTextNode.id, textarea.value);
    clearNativeTextSelection();
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    globalThis.requestAnimationFrame?.(refreshCaret);
  }, [activeTextNode?.id, activeTextNode?.content, finishEditing, latestDocumentRef, refreshCaret, writeRenderedText]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const viewport = viewportRef.current;
    if (!textarea || !viewport || !activeTextNode) return;

    const rect = elementToPaintViewportRect(
      state.document,
      activeTextNode.id,
      viewportTransform,
    );
    const viewportRect = viewport.getBoundingClientRect();
    const x = viewportRect.left + (rect?.x ?? 0);
    const y = viewportRect.top + (rect?.y ?? 0);
    textarea.style.transform = `translate(${x}px, ${y}px)`;
    const session = sessionRef.current;
    if (session?.id === activeTextNode.id) {
      writeRenderedText(activeTextNode.id, session.draftValue);
    }
    refreshCaret();
  }, [activeTextNode, refreshCaret, state.document, viewportRef, viewportTransform, writeRenderedText]);

  const updateDraft = (value: string) => {
    const session = sessionRef.current;
    if (!session) return;
    session.draftValue = value;
    writeRenderedText(session.id, value);
    globalThis.requestAnimationFrame?.(refreshCaret);
  };

  return (
    <>
      <textarea
        id="text-editing-textarea"
        ref={textareaRef}
        tabIndex={-1}
        spellCheck={false}
        onChange={(event) => updateDraft(event.currentTarget.value)}
        onBlur={() => finishEditing("commit")}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          updateDraft(event.currentTarget.value);
        }}
        onSelect={refreshCaret}
        onKeyUp={refreshCaret}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (composingRef.current) return;
          if (event.key === "Escape") {
            event.preventDefault();
            finishEditing("cancel");
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finishEditing("commit");
            return;
          }
          globalThis.requestAnimationFrame?.(refreshCaret);
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          opacity: 0,
          zIndex: -1,
          backgroundColor: "white",
          pointerEvents: "none",
          width: 1,
          height: 1,
          fontSize: 1,
          lineHeight: 1,
          transform: "translate(0px, 0px)",
        }}
      />
      {caretStyle ? <div className="text-editing-caret" style={caretStyle} /> : null}
    </>
  );
}

export function CanvasStage({
  draftMode = false,
  activeTool,
  viewportSubjectKey,
}: {
  draftMode?: boolean;
  activeTool?: string;
  viewportSubjectKey?: string;
}) {
  const { state, dispatch } = useEditor();

  useEffect(() => {
    if (!activeTool) return;
    const mapped = TOOLBAR_TOOL_MAP[activeTool];
    if (mapped && mapped !== state.tool) dispatch({ type: "setTool", tool: mapped });
  }, [activeTool, dispatch, state.tool]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const toolingRef = useRef<CanvasToolingRef | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const latestStateRef = useRef(state);
  const latestDocumentRef = useRef(state.document);
  const viewportInitializedSubjectRef = useRef<string | null>(null);
  const spacePressedRef = useRef(false);
  const commandModeRef = useRef(false);
  const dropTargetIdRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [interactionActive, setInteractionActive] = useState(false);
  const canvasAlignmentDebugEnabled = useMemo(isCanvasAlignmentDebugEnabled, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const updateDropTarget = useCallback((id: string | null) => {
    dropTargetIdRef.current = id;
    setDropTargetId(id);
  }, []);

  useEffect(() => {
    latestStateRef.current = state;
    latestDocumentRef.current = state.document;
  }, [state]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", block, { passive: false });
    return () => el.removeEventListener("wheel", block);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // The user-facing camera (zoom + offset) is owned by document state. The
    // browser window can affect only the internal display scale that fits large
    // subjects at 100%; it must not dispatch fresh zoom/offset values on every
    // resize.
    //
    // The ResizeObserver here only triggers the *initial* sync, which runs
    // once per subject (first time the viewport has a non-zero size). After
    // that, no window-driven dispatches happen.
    const syncOnce = () => {
      const viewportSize = getViewportSize(viewport);
      const canvasSize = getCanvasSize(state.document);
      const subjectKey = viewportSubjectKey ?? `${canvasSize.width}x${canvasSize.height}`;
      if (draftMode) return;
      if (viewportInitializedSubjectRef.current === subjectKey) return;
      if (viewportSize.width <= 0 || viewportSize.height <= 0) return;

      const zoom = getInitialZoomForCanvas(viewportSize, canvasSize);
      const next = clampViewportState(
        { zoom, offsetX: state.offsetX, offsetY: state.offsetY },
        viewportSize,
        canvasSize,
        state.canvasStageActive,
      );
      viewportInitializedSubjectRef.current = subjectKey;
      if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
        dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
      }
    };
    syncOnce();
    const observer = new ResizeObserver(syncOnce);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [dispatch, draftMode, state.canvasStageActive, state.document.canvas.height, state.document.canvas.width, state.offsetX, state.offsetY, state.zoom, viewportSubjectKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const currentState = latestStateRef.current;
      if (isEditableTarget(event.target) || currentState.editingTextId) {
        if (event.key === "Escape") dispatch({ type: "setEditingText", editingTextId: null });
        return;
      }

      if (event.key === "Escape") {
        const interaction = interactionRef.current;
        if (interaction?.type === "draw") {
          const viewport = viewportRef.current;
          if (viewport?.hasPointerCapture(interaction.pointerId)) viewport.releasePointerCapture(interaction.pointerId);
          interactionRef.current = null;
          setInteractionActive(false);
          dispatch({ type: "setDocumentTransient", document: interaction.beforeDocument });
          dispatch({ type: "setTool", tool: "select" });
          return;
        }
        if (currentState.tool !== "select") { dispatch({ type: "setTool", tool: "select" }); return; }
      }

      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isMod && key === "z" && event.shiftKey) { event.preventDefault(); dispatch({ type: "redo" }); return; }
      if ((isMod && key === "z") || (event.ctrlKey && key === "y")) { event.preventDefault(); dispatch({ type: "undo" }); return; }
      if (isMod && key === "0") { event.preventDefault(); dispatch({ type: "setZoom", zoom: 1 }); return; }
      if (isMod && (key === "+" || key === "=")) { event.preventDefault(); dispatch({ type: "setZoom", zoom: clamp(currentState.zoom + 0.25, MIN_ZOOM, MAX_ZOOM) }); return; }
      if (isMod && key === "-") { event.preventDefault(); dispatch({ type: "setZoom", zoom: clamp(currentState.zoom - 0.25, MIN_ZOOM, MAX_ZOOM) }); return; }
      if (isMod && key === "c") { event.preventDefault(); copyElements(currentState.document, currentState.selectedIds); return; }
      if (isMod && key === "v") {
        event.preventDefault();
        const result = pasteElements(currentState.document);
        if (result) dispatch({ type: "commitDocument", document: result.document, selectedIds: result.selectedIds });
        return;
      }
      if (isMod && key === "d") {
        event.preventDefault();
        if (currentState.selectedIds.length > 0) {
          const dup = duplicateElements(currentState.document, currentState.selectedIds);
          dispatch({ type: "commitDocument", document: dup.document, selectedIds: dup.selectedIds });
        }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && currentState.selectedIds.length > 0) {
        event.preventDefault();
        dispatch({ type: "commitDocument", document: deleteElements(currentState.document, currentState.selectedIds), selectedIds: [] });
        return;
      }

      if (event.code !== "Space") return;
      event.preventDefault();
      spacePressedRef.current = true;
      viewportRef.current?.classList.add("is-space-panning");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spacePressedRef.current = false;
      viewportRef.current?.classList.remove("is-space-panning");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      spacePressedRef.current = false;
    };
  }, [dispatch]);

  const getCanvasPoint = (event: ReactPointerEvent): Point | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportSize = getViewportSize(viewport);
    const transform = buildViewportTransform(
      state.document,
      viewportSize,
      state.zoom,
      state.offsetX,
      state.offsetY,
    );
    return clientPointToCanvas(viewport, event.clientX, event.clientY, transform);
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(
      state.document,
      state.isolatedParentId,
      getElementIdFromTarget(target),
    );

  const logCanvasAlignment = (input: CanvasAlignmentLogInput) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportSize = getViewportSize(viewport);
    const canvasSize = getCanvasSize(input.document);
    const t = buildViewportTransform(
      input.document,
      viewportSize,
      input.zoom,
      input.offsetX,
      input.offsetY,
    );
    const displayScale =
      viewportSize.width > 0 && viewportSize.height > 0
        ? getCanvasDisplayScale(viewportSize, canvasSize)
        : 1;
    const displayZoom = t.displayZoom;
    const offsetX = t.offsetX;
    const offsetY = t.offsetY;
    const scaledDomProjection = shouldUseScaledDomProjection({
      canvasSize,
      displayZoom,
      canvasRotation: input.document.canvas.rotation ?? 0,
    });
    const transformIds = getTransformIds(input.document, input.selectedIds);
    const selectionCanvasRect = getSelectionBox(input.document, transformIds);
    const toolingRects = transformIds
      .map((id) => elementToPaintViewportRect(input.document, id, t))
      .filter((rect): rect is Rect => rect !== null);
    const boxSelectionViewportRect = unionViewportRects(toolingRects);
    const toolingCanvas = viewport.querySelector<HTMLCanvasElement>("canvas");
    const toolingCanvasRect = toolingCanvas?.getBoundingClientRect();
    const canvasStageViewportRect = canvasStageRef.current
      ? domRectRelativeToViewport(canvasStageRef.current, viewport)
      : null;
    const pixelScale =
      toolingCanvas && toolingCanvasRect && toolingCanvasRect.width > 0 && toolingCanvasRect.height > 0
        ? {
            x: toolingCanvas.width / toolingCanvasRect.width,
            y: toolingCanvas.height / toolingCanvasRect.height,
          }
        : {
            x: globalThis.devicePixelRatio || 1,
            y: globalThis.devicePixelRatio || 1,
          };
    const snappedBoxSelection = boxSelectionViewportRect
      ? snapOutlineRect(boxSelectionViewportRect, pixelScale)
      : null;
    const boxOutlineEdges = exactOutlineEdges(boxSelectionViewportRect, pixelScale);

    const items = transformIds.map((id) => {
      const node = input.document.elements[id];
      const domElement = getRenderedElement(viewport, id);
      const domViewportRect = domElement
        ? domRectRelativeToViewport(domElement, viewport)
        : null;
      const domCanvasRectScreenPx =
        domViewportRect && canvasStageViewportRect
          ? {
              x: domViewportRect.x - canvasStageViewportRect.x,
              y: domViewportRect.y - canvasStageViewportRect.y,
              width: domViewportRect.width,
              height: domViewportRect.height,
            }
          : null;
      const domCanvasRectCanvasPx =
        (input.document.canvas.rotation ?? 0) === 0
          ? unscaleRect(domCanvasRectScreenPx, displayZoom)
          : null;
      const modelViewportRect = elementToPaintViewportRect(input.document, id, t);
      const toolingViewportRect = modelViewportRect;
      const computedStyle = domElement ? getComputedStyle(domElement) : null;
      const snappedToolingRect = toolingViewportRect
        ? snapOutlineRect(toolingViewportRect, pixelScale)
        : null;
      const blueOutlineEdges = exactOutlineEdges(toolingViewportRect, pixelScale);
      return {
        id,
        name: node?.name ?? null,
        type: node?.type ?? null,
        documentRect: node
          ? rectForDebug({
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
            })
          : null,
        absoluteRectCanvas: rectForDebug(getAbsoluteRect(input.document, id)),
        aabbCanvas: rectForDebug(getElementAABB(input.document, id)),
        modelViewportRect: rectForDebug(modelViewportRect),
        modelViewportEdges: rectEdgesForDebug(modelViewportRect),
        toolingViewportRect: rectForDebug(toolingViewportRect),
        toolingViewportEdges: rectEdgesForDebug(toolingViewportRect),
        snappedToolingEdges: snappedToolingRect,
        domClientRect: rectForDebug(domClientRectForDebug(domElement)),
        domViewportRect: rectForDebug(domViewportRect),
        domViewportEdges: rectEdgesForDebug(domViewportRect),
        domCanvasRectScreenPx: rectForDebug(domCanvasRectScreenPx),
        domCanvasRectCanvasPx: rectForDebug(domCanvasRectCanvasPx),
        blueOutlineEdges,
        deltaDomMinusTooling:
          domViewportRect && toolingViewportRect
            ? rectForDebug({
                x: domViewportRect.x - toolingViewportRect.x,
                y: domViewportRect.y - toolingViewportRect.y,
                width: domViewportRect.width - toolingViewportRect.width,
                height: domViewportRect.height - toolingViewportRect.height,
              })
            : null,
        deltaDomCanvasMinusModelCanvas:
          domCanvasRectCanvasPx && node
            ? rectForDebug({
                x: domCanvasRectCanvasPx.x - (getAbsoluteRect(input.document, id)?.x ?? node.x),
                y: domCanvasRectCanvasPx.y - (getAbsoluteRect(input.document, id)?.y ?? node.y),
                width: domCanvasRectCanvasPx.width - node.width,
                height: domCanvasRectCanvasPx.height - node.height,
              })
            : null,
        css: {
          boxSizing: computedStyle?.boxSizing ?? null,
          left: domElement?.style.left || null,
          top: domElement?.style.top || null,
          width: domElement?.style.width || null,
          height: domElement?.style.height || null,
          transform: computedStyle?.transform ?? null,
          borderWidth: computedStyle?.borderWidth ?? null,
        },
      };
    });
    const domSelectionViewportRect = unionViewportRects(
      items
        .map((item) => item.domViewportRect)
        .filter((rect): rect is Rect => rect !== null),
    );

    const flatItems = items.map((item) => ({
      id: item.id,
      name: item.name,
      docX: item.documentRect?.x ?? null,
      docY: item.documentRect?.y ?? null,
      docW: item.documentRect?.width ?? null,
      docH: item.documentRect?.height ?? null,
      domLeft: item.domViewportEdges?.left ?? null,
      domRight: item.domViewportEdges?.right ?? null,
      domW: item.domViewportRect?.width ?? null,
      domCanvasX: item.domCanvasRectCanvasPx?.x ?? null,
      domCanvasY: item.domCanvasRectCanvasPx?.y ?? null,
      domCanvasW: item.domCanvasRectCanvasPx?.width ?? null,
      domCanvasH: item.domCanvasRectCanvasPx?.height ?? null,
      modelLeft: item.modelViewportEdges?.left ?? null,
      modelRight: item.modelViewportEdges?.right ?? null,
      toolingLeft: item.toolingViewportEdges?.left ?? null,
      toolingRight: item.toolingViewportEdges?.right ?? null,
      toolingW: item.toolingViewportRect?.width ?? null,
      canvasDeltaX: item.deltaDomCanvasMinusModelCanvas?.x ?? null,
      canvasDeltaY: item.deltaDomCanvasMinusModelCanvas?.y ?? null,
      canvasDeltaW: item.deltaDomCanvasMinusModelCanvas?.width ?? null,
      canvasDeltaH: item.deltaDomCanvasMinusModelCanvas?.height ?? null,
      blueLeftOuter: item.blueOutlineEdges?.leftOuter ?? null,
      blueLeftInner: item.blueOutlineEdges?.leftInner ?? null,
      blueRightInner: item.blueOutlineEdges?.rightInner ?? null,
      blueRightOuter: item.blueOutlineEdges?.rightOuter ?? null,
      domLeftMinusToolingLeft:
        item.domViewportEdges && item.toolingViewportEdges
          ? roundDebugValue(item.domViewportEdges.left - item.toolingViewportEdges.left)
          : null,
      domRightMinusToolingRight:
        item.domViewportEdges && item.toolingViewportEdges
          ? roundDebugValue(item.domViewportEdges.right - item.toolingViewportEdges.right)
          : null,
      domLeftMinusBlueOuter:
        item.domViewportEdges && item.blueOutlineEdges
          ? roundDebugValue(item.domViewportEdges.left - item.blueOutlineEdges.leftOuter)
          : null,
      domRightMinusBlueOuter:
        item.domViewportEdges && item.blueOutlineEdges
          ? roundDebugValue(item.domViewportEdges.right - item.blueOutlineEdges.rightOuter)
          : null,
      domLeftMinusBlueInner:
        item.domViewportEdges && item.blueOutlineEdges
          ? roundDebugValue(item.domViewportEdges.left - item.blueOutlineEdges.leftInner)
          : null,
      domRightMinusBlueInner:
        item.domViewportEdges && item.blueOutlineEdges
          ? roundDebugValue(item.domViewportEdges.right - item.blueOutlineEdges.rightInner)
          : null,
      boxSizing: item.css.boxSizing,
      cssLeft: item.css.left,
      cssWidth: item.css.width,
    }));

    const payload = {
      version: 6,
      reason: input.reason,
      interaction: input.interactionType ?? null,
      runtime: {
        devicePixelRatio: roundDebugValue(globalThis.devicePixelRatio || 1),
        visualViewport: globalThis.visualViewport
          ? {
              width: roundDebugValue(globalThis.visualViewport.width),
              height: roundDebugValue(globalThis.visualViewport.height),
              scale: roundDebugValue(globalThis.visualViewport.scale),
            }
          : null,
        windowInner: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        },
        screen: globalThis.screen
          ? {
              width: globalThis.screen.width,
              height: globalThis.screen.height,
              availWidth: globalThis.screen.availWidth,
              availHeight: globalThis.screen.availHeight,
            }
          : null,
      },
      zoom: {
        userZoom: roundDebugValue(input.zoom),
        displayScale: roundDebugValue(displayScale),
        displayZoom: roundDebugValue(displayZoom),
      },
      offset: { x: roundDebugValue(offsetX), y: roundDebugValue(offsetY) },
      viewportMatrix: {
        a: roundDebugValue(t.matrix.a),
        b: roundDebugValue(t.matrix.b),
        c: roundDebugValue(t.matrix.c),
        d: roundDebugValue(t.matrix.d),
        e: roundDebugValue(t.matrix.e),
        f: roundDebugValue(t.matrix.f),
      },
      stageProjection: {
        mode: scaledDomProjection ? "scaled-dom" : "css-transform",
        renderScale: roundDebugValue(scaledDomProjection ? displayZoom : 1),
      },
      pixelScale: {
        x: roundDebugValue(pixelScale.x),
        y: roundDebugValue(pixelScale.y),
      },
      canvas: {
        model: input.document.canvas,
        modelTotalCssPixels: roundDebugValue(
          input.document.canvas.width * input.document.canvas.height,
        ),
        displayCssPixels: {
          width: roundDebugValue(input.document.canvas.width * displayZoom),
          height: roundDebugValue(input.document.canvas.height * displayZoom),
          total: roundDebugValue(
            input.document.canvas.width *
              displayZoom *
              input.document.canvas.height *
              displayZoom,
          ),
        },
        displayDevicePixels: {
          width: roundDebugValue(
            input.document.canvas.width *
              displayZoom *
              (globalThis.devicePixelRatio || 1),
          ),
          height: roundDebugValue(
            input.document.canvas.height *
              displayZoom *
              (globalThis.devicePixelRatio || 1),
          ),
          total: roundDebugValue(
            input.document.canvas.width *
              displayZoom *
              (globalThis.devicePixelRatio || 1) *
              input.document.canvas.height *
              displayZoom *
              (globalThis.devicePixelRatio || 1),
          ),
        },
      },
      dom: {
        viewport: domBoxMetricsForDebug(viewport),
        stageSpace: domBoxMetricsForDebug(stageRef.current),
        canvasStage: domBoxMetricsForDebug(canvasStageRef.current),
        toolingCanvas: toolingCanvas
          ? {
              clientRect: rectForDebug(domClientRectForDebug(toolingCanvas)),
              viewportRect: rectForDebug(domRectRelativeToViewport(toolingCanvas, viewport)),
              cssWidth: roundDebugValue(toolingCanvasRect?.width ?? 0),
              cssHeight: roundDebugValue(toolingCanvasRect?.height ?? 0),
              backingWidth: toolingCanvas.width,
              backingHeight: toolingCanvas.height,
              totalBackingPixels: toolingCanvas.width * toolingCanvas.height,
            }
          : null,
      },
      stage: stageRef.current
        ? {
            rect: rectForDebug(domRectRelativeToViewport(stageRef.current, viewport)),
            transform: stageRef.current.style.transform || null,
          }
        : null,
      selectedIds: input.selectedIds,
      transformIds,
      selectionCanvasRect: rectForDebug(selectionCanvasRect),
      selectionCanvasEdges: rectEdgesForDebug(selectionCanvasRect),
      boxSelectionViewportRect: rectForDebug(boxSelectionViewportRect),
      boxSelectionViewportEdges: rectEdgesForDebug(boxSelectionViewportRect),
      domSelectionViewportRect: rectForDebug(domSelectionViewportRect),
      domSelectionViewportEdges: rectEdgesForDebug(domSelectionViewportRect),
      deltaDomSelectionMinusTooling:
        domSelectionViewportRect && boxSelectionViewportRect
          ? rectForDebug({
              x: domSelectionViewportRect.x - boxSelectionViewportRect.x,
              y: domSelectionViewportRect.y - boxSelectionViewportRect.y,
              width: domSelectionViewportRect.width - boxSelectionViewportRect.width,
              height: domSelectionViewportRect.height - boxSelectionViewportRect.height,
            })
          : null,
      snappedBoxSelection,
      boxOutlineEdges,
      items,
    };
    console.log("[canvas alignment geometry v6]", payload);
    console.table(flatItems);
    console.log("[canvas alignment flat v6]", JSON.stringify(flatItems, null, 2));
    console.log("[canvas alignment payload v6]", JSON.stringify(payload, null, 2));
  };

  const scheduleCanvasAlignmentLog = (input: CanvasAlignmentLogInput) => {
    if (!canvasAlignmentDebugEnabled) return;
    const run = () => logCanvasAlignment(input);
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
      return;
    }
    globalThis.setTimeout(run, 0);
  };

  const selectedIdsKey = state.selectedIds.join("|");

  useEffect(() => {
    if (!canvasAlignmentDebugEnabled) return;
    const debugGlobal = globalThis as typeof globalThis & {
      __logCanvasAlignment?: () => void;
    };
    const logCurrentAlignment = () => {
      const currentState = latestStateRef.current;
      scheduleCanvasAlignmentLog({
        reason: "manual-window-call",
        interactionType: interactionRef.current?.type ?? null,
        document: latestDocumentRef.current,
        selectedIds: currentState.selectedIds,
        zoom: currentState.zoom,
        offsetX: currentState.offsetX,
        offsetY: currentState.offsetY,
      });
    };
    debugGlobal.__logCanvasAlignment = logCurrentAlignment;
    return () => {
      if (debugGlobal.__logCanvasAlignment === logCurrentAlignment) {
        delete debugGlobal.__logCanvasAlignment;
      }
    };
  }, [canvasAlignmentDebugEnabled]);

  useEffect(() => {
    if (!canvasAlignmentDebugEnabled) return;
    if (interactionActive) return;
    if (!state.canvasStageActive && state.selectedIds.length === 0) return;
    scheduleCanvasAlignmentLog({
      reason: "selection-or-viewport-change",
      interactionType: null,
      document: state.document,
      selectedIds: state.selectedIds,
      zoom: state.zoom,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    });
  }, [
    interactionActive,
    selectedIdsKey,
    state.canvasStageActive,
    state.document,
    state.offsetX,
    state.offsetY,
    state.zoom,
    canvasAlignmentDebugEnabled,
  ]);

  const beginResize = (handle: ResizeHandle, event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasPoint(event);
    const viewport = viewportRef.current;
    if (!point || !viewport) return;
    if (state.canvasStageActive) {
      const displayScale = getCanvasDisplayScale(
        getViewportSize(viewport),
        getCanvasSize(state.document),
      );
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

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const containerSize = getViewportSize(viewport);
    const viewportRect = viewport.getBoundingClientRect();
    const canvasSize = getCanvasSize(state.document);
    let nextViewport;
    if (event.ctrlKey || event.metaKey) {
      const nextZoom = clamp(state.zoom * Math.exp(-event.deltaY * 0.002), MIN_ZOOM, MAX_ZOOM);
      const displayScale = getCanvasDisplayScale(containerSize, canvasSize);
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
      const cursorCanvas = clientPointToCanvas(viewport, event.clientX, event.clientY, currentTransform);
      const nextBaseTransform = createViewportTransform({
        displayZoom: nextDisplayZoom,
        offsetX: 0,
        offsetY: 0,
        canvasRotation: state.document.canvas.rotation ?? 0,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });
      const nextBaseCursor = canvasPointToViewport(cursorCanvas, nextBaseTransform);
      nextViewport = {
        zoom: nextZoom,
        offsetX: cursor.x - nextBaseCursor.x,
        offsetY: cursor.y - nextBaseCursor.y,
      };
    } else {
      nextViewport = { zoom: state.zoom, offsetX: state.offsetX - event.deltaX, offsetY: state.offsetY - event.deltaY };
    }
    const clampedViewport = clampViewportState(nextViewport, containerSize, canvasSize);
    if (viewportChanged(clampedViewport, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
      dispatch({ type: "setViewport", zoom: clampedViewport.zoom, offsetX: clampedViewport.offsetX, offsetY: clampedViewport.offsetY });
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (contextMenu) setContextMenu(null);
    if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) { beginPan(event); return; }
    if (event.button !== 0) return;

    const viewport = viewportRef.current;
    if (viewport && toolingRef.current && !state.editingTextId) {
      const vpRect = viewport.getBoundingClientRect();
      const hit: ToolingHit = toolingRef.current.hitTest(
        event.clientX - vpRect.left,
        event.clientY - vpRect.top,
      );
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
      const targetId = getInteractiveElementId(event.target);
      if (targetId === state.editingTextId) return;
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
    const targetId = getInteractiveElementId(event.target);
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
    const viewportSize = getViewportSize(viewport);
    const startTransform = buildViewportTransform(
      state.document,
      viewportSize,
      state.zoom,
      state.offsetX,
      state.offsetY,
    );
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
    const interaction = interactionRef.current;
    if (!interaction) {
      const viewport = viewportRef.current;
      if (viewport && toolingRef.current && !state.editingTextId) {
        const vpRect = viewport.getBoundingClientRect();
        const hit = toolingRef.current.hitTest(
          event.clientX - vpRect.left,
          event.clientY - vpRect.top,
        );
        if (hit.cursor) {
          viewport.style.cursor = hit.cursor;
          const hoveredId = getInteractiveElementId(event.target);
          if (hoveredId !== state.hoveredId) dispatch({ type: "setHovered", hoveredId: null });
          return;
        }
        viewport.style.cursor = "";
      }
      const hoveredId = getInteractiveElementId(event.target);
      if (hoveredId !== state.hoveredId) dispatch({ type: "setHovered", hoveredId });
      return;
    }
    if (interaction.pointerId !== event.pointerId) return;
    if (interaction.type === "pan") {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rawPanViewport = {
        zoom: interaction.zoom,
        offsetX: interaction.startOffsetX + event.clientX - interaction.startScreenPoint.x,
        offsetY: interaction.startOffsetY + event.clientY - interaction.startScreenPoint.y,
      };
      const nextViewport = clampViewportState(rawPanViewport, getViewportSize(viewport), getCanvasSize(state.document));
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
      const next = cloneDocument(interaction.beforeDocument);
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
        const ids = findElementsInMarquee(state.document, rect);
        dispatch({ type: "setSelected", selectedIds: ids });
      }
      return;
    }
    if (interaction.type === "drag") {
      const screenDelta = {
        x: event.clientX - interaction.startScreenPoint.x,
        y: event.clientY - interaction.startScreenPoint.y,
      };
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
        const next = cloneDocument(interaction.beforeDocument);
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
        const finalDoc = wasCommandMode
          ? reparentElements(committed, interaction.transformIds, capturedDropTarget)
          : committed;
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
      if (interaction.type === "drag" && interaction.wasAlreadySelected && interaction.clickedId) {
        const clickedNode = latestDocumentRef.current.elements[interaction.clickedId];
        if (clickedNode?.type === "text" && !clickedNode.locked) dispatch({ type: "setEditingText", editingTextId: interaction.clickedId });
      }
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const targetId = getInteractiveElementId(event.target);
    const node = targetId ? state.document.elements[targetId] : null;
    if (node?.type === "text" && !node.locked) dispatch({ type: "setEditingText", editingTextId: node.id });
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetId = getInteractiveElementId(event.target);
    if (targetId && !state.selectedIds.includes(targetId)) dispatch({ type: "setSelected", selectedIds: [targetId] });
    setContextMenu({ x: event.clientX, y: event.clientY, targetId: targetId ?? null });
  };

  const isDrawTool = state.tool !== "select";
  const shellClassName = `canvas-shell${isDrawTool ? " is-draw-tool" : ""}`;
  const shellStyle = getShellPatternStyle(state.document);
  const canvasSize = getCanvasSize(state.document);
  const stageWidth = canvasSize.width;
  const stageHeight = canvasSize.height;
  const viewportSize = viewportRef.current
    ? getViewportSize(viewportRef.current)
    : { width: 0, height: 0 };
  const displayScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? getCanvasDisplayScale(viewportSize, canvasSize)
      : 1;
  const displayZoom = state.zoom * displayScale;
  const viewportTransform = buildViewportTransform(
    state.document,
    viewportSize,
    state.zoom,
    state.offsetX,
    state.offsetY,
  );
  const scaledDomProjection = shouldUseScaledDomProjection({
    canvasSize,
    displayZoom,
    canvasRotation: state.document.canvas.rotation ?? 0,
  });
  const renderScale = scaledDomProjection ? displayZoom : 1;
  const projectedStageWidth = stageWidth * renderScale;
  const projectedStageHeight = stageHeight * renderScale;
  const stageSpaceStyle: CSSProperties = scaledDomProjection
    ? {
        width: projectedStageWidth,
        height: projectedStageHeight,
        left: viewportTransform.offsetX,
        top: viewportTransform.offsetY,
        transform: "none",
        transformOrigin: "0 0",
        backfaceVisibility: "visible",
        imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
        "--zoom": displayZoom,
      } as CSSProperties
    : {
        width: stageWidth,
        height: stageHeight,
        transform: viewportTransform.cssTransform,
        transformOrigin: "0 0",
        backfaceVisibility: "hidden",
        imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
        "--zoom": displayZoom,
      } as CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={shellClassName}
      style={shellStyle}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <TextEditingTextarea
        latestDocumentRef={latestDocumentRef}
        viewportRef={viewportRef}
        viewportTransform={viewportTransform}
      />
      <div
        ref={stageRef}
        className={`stage-space${draftMode ? " stage-space--draft" : ""}`}
        style={stageSpaceStyle}
      >
        {draftMode ? (
          <div className="render-layer render-layer--draft">
            {state.document.rootIds.map((id) => (
              <ElementRenderer key={id} id={id} renderScale={renderScale} />
            ))}
          </div>
        ) : (
          <div
            ref={canvasStageRef}
            className="canvas-stage"
            style={{
              width: projectedStageWidth,
              height: projectedStageHeight,
              background: state.document.canvas.background || undefined,
              borderRadius:
                state.document.canvas.borderRadius === undefined
                  ? undefined
                  : state.document.canvas.borderRadius * renderScale,
              boxShadow: getStageBoxShadow(state.document.canvas, renderScale),
              opacity: state.document.canvas.opacity ?? undefined,
              "--zoom": displayZoom,
            } as CSSProperties}
          >
            <div className={`render-layer${state.canvasStageActive ? " render-layer--canvas-active" : ""}`}>
              {state.document.rootIds.map((id) => (
                <ElementRenderer key={id} id={id} renderScale={renderScale} />
              ))}
              <DetachedIsolatedChildren renderScale={renderScale} />
            </div>
          </div>
        )}
      </div>
      <CanvasToolingLayer
        ref={toolingRef}
        viewportTransform={viewportTransform}
        suppressHover={interactionActive}
        interactionType={interactionActive ? (interactionRef.current?.type ?? null) : null}
        marqueeRect={marqueeRect}
        dropTargetId={dropTargetId}
      />
      {contextMenu && <CanvasContextMenu menu={contextMenu} onClose={closeContextMenu} />}
    </div>
  );
}
