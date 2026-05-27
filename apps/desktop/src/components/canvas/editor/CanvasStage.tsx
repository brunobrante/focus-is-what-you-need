import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import {
  createElementForTool,
  deleteElements,
  duplicateElements,
  insertElement,
  reparentElements,
  shallowCloneDocument,
  updateElementText,
} from "@/lib/editor/actions";
import { copyElements, pasteElements } from "@/lib/editor/clipboard";
import { elementNodesEqual } from "@/lib/editor/history";
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
  createViewportTransform,
  getCanvasDisplayScale,
  getInitialZoomForCanvas,
  snapViewportOffset,
  shouldUseScaledDomProjection,
  viewportPointToCanvas,
  type Size,
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
import { elementToPaintViewportRect } from "./canvasToolingRenderer";
import type { CanvasAlignmentLogInput } from "./canvasAlignmentLog";
import {
  getCaretRect,
  getIndexFromPoint,
  getSelectionRects,
  getTextLayout,
} from "./textEditingLayout";
import "./editor.css";

function isCanvasAlignmentDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("fwyn:debug-canvas-alignment") === "1";
  } catch {
    return false;
  }
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

type TextEditState = {
  nodeId: string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  anchorIndex: number;
};

type TextEditSession = {
  nodeId: string;
  beforeDocument: CanvasDocument;
};

type TextDragState = {
  pointerId: number;
  nodeId: string;
  anchorIndex: number;
};

type ViewportClientRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const ZERO_VIEWPORT_SIZE: Size = { width: 0, height: 0 };
const ZERO_VIEWPORT_RECT: ViewportClientRect = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
};

function sizesEqual(a: Size, b: Size): boolean {
  return Math.abs(a.width - b.width) <= 0.01 && Math.abs(a.height - b.height) <= 0.01;
}

function arrayValuesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function addElementAncestors(
  document: CanvasDocument | null,
  id: string,
  affectedIds: Set<string>,
): void {
  let parentId = document?.elements[id]?.parentId ?? null;
  while (parentId) {
    affectedIds.add(parentId);
    parentId = document?.elements[parentId]?.parentId ?? null;
  }
}

function getAffectedElementRenderIds(
  previousDocument: CanvasDocument | null,
  nextDocument: CanvasDocument,
): ReadonlySet<string> {
  if (!previousDocument) {
    return new Set(Object.keys(nextDocument.elements));
  }

  const changedIds = new Set<string>();
  for (const id of Object.keys(previousDocument.elements)) {
    if (!elementNodesEqual(previousDocument.elements[id], nextDocument.elements[id])) {
      changedIds.add(id);
    }
  }
  for (const id of Object.keys(nextDocument.elements)) {
    if (!previousDocument.elements[id]) {
      changedIds.add(id);
    }
  }

  if (!arrayValuesEqual(previousDocument.rootIds, nextDocument.rootIds)) {
    for (const id of previousDocument.rootIds) changedIds.add(id);
    for (const id of nextDocument.rootIds) changedIds.add(id);
  }

  const affectedIds = new Set<string>(changedIds);
  for (const id of changedIds) {
    addElementAncestors(previousDocument, id, affectedIds);
    addElementAncestors(nextDocument, id, affectedIds);
  }
  return affectedIds;
}

type RenderedSceneProps = {
  draftMode: boolean;
  document: CanvasDocument;
  canvasStageActive: boolean;
  isolatedParentId: string | null;
  editingTextId: string | null;
  affectedElementIds: ReadonlySet<string>;
  renderScale: number;
};

function RenderedSceneImpl({
  draftMode,
  document,
  canvasStageActive,
  isolatedParentId,
  editingTextId,
  affectedElementIds,
  renderScale,
}: RenderedSceneProps) {
  if (draftMode) {
    return (
      <div className="render-layer render-layer--draft">
        {document.rootIds.map((id) => (
          <ElementRenderer
            key={id}
            id={id}
            document={document}
            isolatedParentId={isolatedParentId}
            editingTextId={editingTextId}
            affectedElementIds={affectedElementIds}
            renderScale={renderScale}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`render-layer${canvasStageActive ? " render-layer--canvas-active" : ""}`}>
      {document.rootIds.map((id) => (
        <ElementRenderer
          key={id}
          id={id}
          document={document}
          isolatedParentId={isolatedParentId}
          editingTextId={editingTextId}
          affectedElementIds={affectedElementIds}
          renderScale={renderScale}
        />
      ))}
      <DetachedIsolatedChildren
        document={document}
        isolatedParentId={isolatedParentId}
        editingTextId={editingTextId}
        affectedElementIds={affectedElementIds}
        renderScale={renderScale}
      />
    </div>
  );
}

const RenderedScene = memo(RenderedSceneImpl, (previous, next) => {
  if (
    previous.draftMode !== next.draftMode ||
    previous.canvasStageActive !== next.canvasStageActive ||
    previous.isolatedParentId !== next.isolatedParentId ||
    previous.editingTextId !== next.editingTextId ||
    previous.renderScale !== next.renderScale
  ) {
    return false;
  }

  if (previous.document === next.document) return true;
  return (
    next.affectedElementIds.size === 0 &&
    arrayValuesEqual(previous.document.rootIds, next.document.rootIds)
  );
});

function selectionRangeFromAnchor(
  anchorIndex: number,
  focusIndex: number,
): Pick<TextEditState, "selectionStart" | "selectionEnd" | "anchorIndex"> {
  return {
    selectionStart: Math.min(anchorIndex, focusIndex),
    selectionEnd: Math.max(anchorIndex, focusIndex),
    anchorIndex,
  };
}

function clampTextIndex(value: number, text: string): number {
  return clamp(Math.round(value), 0, text.length);
}

function replaceTextRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { value: string; caretIndex: number } {
  const start = clampTextIndex(Math.min(selectionStart, selectionEnd), value);
  const end = clampTextIndex(Math.max(selectionStart, selectionEnd), value);
  const nextValue = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return {
    value: nextValue,
    caretIndex: start + insert.length,
  };
}

function clearNativeTextSelection(): void {
  try {
    globalThis.getSelection?.()?.removeAllRanges();
  } catch {
    // Best effort only. Browser selection cleanup must not break editing.
  }
}

function localPointForTextNode(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): Point | null {
  const node = input.document.elements[input.nodeId];
  if (!node) return null;
  const rect = elementToPaintViewportRect(
    input.document,
    input.nodeId,
    input.viewportTransform,
  );
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const viewportRect = input.viewportRect ?? input.viewport.getBoundingClientRect();
  const x = input.clientX - viewportRect.left - rect.x;
  const y = input.clientY - viewportRect.top - rect.y;
  return {
    x: x / (rect.width / Math.max(node.width, 1)),
    y: y / (rect.height / Math.max(node.height, 1)),
  };
}

function textIndexFromClientPoint(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): number | null {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return null;
  const local = localPointForTextNode(input);
  if (!local) return null;
  return getIndexFromPoint(node, local.x, local.y);
}

function isClientPointInsideTextNode(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): boolean {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return false;
  const local = localPointForTextNode(input);
  if (!local) return false;
  const layout = getTextLayout(node);
  const lastLine = layout.lines[layout.lines.length - 1];
  const textBottom = lastLine
    ? lastLine.y + layout.lineHeight
    : layout.contentY + layout.lineHeight;
  return (
    local.x >= 0 &&
    local.y >= 0 &&
    local.x <= node.width &&
    local.y <= Math.max(node.height, textBottom)
  );
}

function isClientPointInsideTextContent(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): boolean {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return false;
  const local = localPointForTextNode(input);
  if (!local) return false;
  const layout = getTextLayout(node);

  return layout.lines.some((line) => (
    local.y >= line.y &&
    local.y <= line.y + layout.lineHeight &&
    local.x >= line.x &&
    local.x <= line.x + line.width
  ));
}

function viewportRectForLocalTextRect(input: {
  document: CanvasDocument;
  nodeId: string;
  localRect: Rect;
  viewportTransform: ViewportTransform;
}): Rect | null {
  const node = input.document.elements[input.nodeId];
  if (!node) return null;
  const elementRect = elementToPaintViewportRect(
    input.document,
    input.nodeId,
    input.viewportTransform,
  );
  if (!elementRect) return null;
  const scaleX = elementRect.width / Math.max(node.width, 1);
  const scaleY = elementRect.height / Math.max(node.height, 1);
  return {
    x: elementRect.x + input.localRect.x * scaleX,
    y: elementRect.y + input.localRect.y * scaleY,
    width: input.localRect.width * scaleX,
    height: input.localRect.height * scaleY,
  };
}

function TextEditingOverlay({
  textEdit,
  document,
  viewportTransform,
}: {
  textEdit: TextEditState | null;
  document: CanvasDocument;
  viewportTransform: ViewportTransform;
}) {
  if (!textEdit) return null;
  const node = document.elements[textEdit.nodeId];
  if (!node || node.type !== "text" || node.visible === false) return null;
  const elementRect = elementToPaintViewportRect(
    document,
    textEdit.nodeId,
    viewportTransform,
  );
  if (!elementRect) return null;
  const scaleX = elementRect.width / Math.max(node.width, 1);
  const scaleY = elementRect.height / Math.max(node.height, 1);
  const layout = getTextLayout(node);
  const lastLine = layout.lines[layout.lines.length - 1];
  const textBottom = lastLine
    ? lastLine.y + layout.lineHeight
    : layout.contentY + layout.lineHeight;
  const toOverlayRect = (rect: Rect): Rect => ({
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
  });

  const selectionRects = getSelectionRects(
    node,
    textEdit.selectionStart,
    textEdit.selectionEnd,
  ).map(toOverlayRect);
  const isCollapsed = textEdit.selectionStart === textEdit.selectionEnd;
  const caretRect = isCollapsed
    ? toOverlayRect(getCaretRect(node, textEdit.selectionEnd))
    : null;

  return (
    <div
      className="text-editing-overlay"
      style={{
        left: elementRect.x,
        top: elementRect.y,
        width: elementRect.width,
        height: Math.max(elementRect.height, textBottom * scaleY),
      }}
    >
      <div className="text-editing-selection-clip">
        {selectionRects.map((rect, index) => (
          <div
            key={`selection-${textEdit.nodeId}-${index}`}
            className="text-editing-selection"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
          />
        ))}
      </div>
      {caretRect ? (
        <div
          className="text-editing-caret"
          style={{
            left: caretRect.x,
            top: caretRect.y,
            height: caretRect.height,
          }}
        />
      ) : null}
    </div>
  );
}

function HiddenTextEditingTextarea({
  textEdit,
  document,
  viewportRef,
  viewportTransform,
  onSelectionChange,
  onInputValue,
  onCommit,
  onCancel,
}: {
  textEdit: TextEditState | null;
  document: CanvasDocument;
  viewportRef: { current: HTMLDivElement | null };
  viewportTransform: ViewportTransform;
  onSelectionChange: (selectionStart: number, selectionEnd: number, anchorIndex?: number) => void;
  onInputValue: (value: string, selectionStart: number, selectionEnd: number) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestTextEditRef = useRef<TextEditState | null>(textEdit);
  const composingRef = useRef(false);

  const updateHiddenTextareaPosition = useCallback(() => {
    const textarea = textareaRef.current;
    const viewport = viewportRef.current;
    if (!textarea || !viewport || !textEdit) return;
    const node = document.elements[textEdit.nodeId];
    if (!node || node.type !== "text") return;
    const caretLocalRect = getCaretRect(node, textEdit.selectionEnd);
    const caretViewportRect = viewportRectForLocalTextRect({
      document,
      nodeId: textEdit.nodeId,
      localRect: caretLocalRect,
      viewportTransform,
    });
    if (!caretViewportRect) return;
    const viewportRect = viewport.getBoundingClientRect();
    textarea.style.transform = `translate(${viewportRect.left + caretViewportRect.x}px, ${viewportRect.top + caretViewportRect.y}px)`;
  }, [document, textEdit, viewportRef, viewportTransform]);

  const applyTextareaSelection = useCallback((
    textarea: HTMLTextAreaElement,
    selectionStart: number,
    selectionEnd: number,
    anchorIndex?: number,
  ) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const start = clampTextIndex(selectionStart, current.value);
    const end = clampTextIndex(selectionEnd, current.value);
    const nextStart = Math.min(start, end);
    const nextEnd = Math.max(start, end);
    const nextAnchor = anchorIndex ?? nextEnd;
    latestTextEditRef.current = {
      ...current,
      selectionStart: nextStart,
      selectionEnd: nextEnd,
      anchorIndex: nextAnchor,
    };
    textarea.setSelectionRange(nextStart, nextEnd);
    onSelectionChange(nextStart, nextEnd, nextAnchor);
  }, [onSelectionChange]);

  const applyTextareaValue = useCallback((
    textarea: HTMLTextAreaElement,
    value: string,
    selectionStart: number,
    selectionEnd: number,
  ) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const start = clampTextIndex(selectionStart, value);
    const end = clampTextIndex(selectionEnd, value);
    const nextStart = Math.min(start, end);
    const nextEnd = Math.max(start, end);
    latestTextEditRef.current = {
      ...current,
      value,
      selectionStart: nextStart,
      selectionEnd: nextEnd,
      anchorIndex: nextEnd,
    };
    textarea.value = value;
    textarea.setSelectionRange(nextStart, nextEnd);
    onInputValue(value, nextStart, nextEnd);
  }, [onInputValue]);

  const replaceCurrentTextSelection = useCallback((
    textarea: HTMLTextAreaElement,
    insert: string,
  ) => {
    const current = latestTextEditRef.current;
    if (!current) return;
    const next = replaceTextRange(
      current.value,
      current.selectionStart,
      current.selectionEnd,
      insert,
    );
    applyTextareaValue(textarea, next.value, next.caretIndex, next.caretIndex);
  }, [applyTextareaValue]);

  useLayoutEffect(() => {
    latestTextEditRef.current = textEdit;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!textEdit) {
      textarea.value = "";
      return;
    }
    if (textarea.value !== textEdit.value) textarea.value = textEdit.value;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textEdit.selectionStart, textEdit.selectionEnd);
    updateHiddenTextareaPosition();
  }, [textEdit, updateHiddenTextareaPosition]);

  useLayoutEffect(() => {
    updateHiddenTextareaPosition();
  }, [updateHiddenTextareaPosition]);

  const syncNativeTextareaValue = (textarea: HTMLTextAreaElement) => {
    applyTextareaValue(textarea, textarea.value, textarea.selectionStart, textarea.selectionEnd);
  };

  const syncTextareaSelection = (textarea: HTMLTextAreaElement) => {
    if (!latestTextEditRef.current) return;
    applyTextareaSelection(textarea, textarea.selectionStart, textarea.selectionEnd);
  };

  return (
    <textarea
      id="text-editing-textarea"
      ref={textareaRef}
      tabIndex={-1}
      spellCheck={false}
      onBeforeInput={(event) => {
        clearNativeTextSelection();
        const current = latestTextEditRef.current;
        if (!current || composingRef.current) return;
        const nativeEvent = event.nativeEvent as InputEvent;
        const inputType = nativeEvent.inputType;
        const textarea = event.currentTarget;
        if (inputType === "insertText" || inputType === "insertReplacementText") {
          const data = nativeEvent.data;
          if (data == null) return;
          event.preventDefault();
          replaceCurrentTextSelection(textarea, data);
          return;
        }
        if (inputType === "deleteContentBackward") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) {
            replaceCurrentTextSelection(textarea, "");
            return;
          }
          if (current.selectionStart <= 0) return;
          const next = replaceTextRange(
            current.value,
            current.selectionStart - 1,
            current.selectionStart,
            "",
          );
          applyTextareaValue(textarea, next.value, next.caretIndex, next.caretIndex);
          return;
        }
        if (inputType === "deleteContentForward") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) {
            replaceCurrentTextSelection(textarea, "");
            return;
          }
          if (current.selectionEnd >= current.value.length) return;
          const next = replaceTextRange(
            current.value,
            current.selectionEnd,
            current.selectionEnd + 1,
            "",
          );
          applyTextareaValue(textarea, next.value, current.selectionEnd, current.selectionEnd);
        }
      }}
      onInput={(event) => {
        const textarea = event.currentTarget;
        if (composingRef.current) return;
        if (latestTextEditRef.current?.value === textarea.value) return;
        syncNativeTextareaValue(textarea);
      }}
      onSelect={(event) => {
        if (composingRef.current) syncTextareaSelection(event.currentTarget);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const textarea = event.currentTarget;
        syncNativeTextareaValue(textarea);
      }}
      onCopy={(event) => {
        const current = latestTextEditRef.current;
        if (!current || current.selectionStart === current.selectionEnd) return;
        event.clipboardData.setData(
          "text/plain",
          current.value.slice(current.selectionStart, current.selectionEnd),
        );
        event.preventDefault();
      }}
      onCut={(event) => {
        const current = latestTextEditRef.current;
        if (!current || current.selectionStart === current.selectionEnd) return;
        event.clipboardData.setData(
          "text/plain",
          current.value.slice(current.selectionStart, current.selectionEnd),
        );
        replaceCurrentTextSelection(event.currentTarget, "");
        event.preventDefault();
      }}
      onPaste={(event) => {
        if (!latestTextEditRef.current) return;
        const pastedText = event.clipboardData.getData("text/plain");
        replaceCurrentTextSelection(event.currentTarget, pastedText);
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        const current = latestTextEditRef.current;
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onCommit();
          return;
        }
        if (!current || composingRef.current) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          applyTextareaSelection(event.currentTarget, 0, current.value.length, 0);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) {
            replaceCurrentTextSelection(event.currentTarget, "");
            return;
          }
          if (current.selectionStart <= 0) return;
          const next = replaceTextRange(
            current.value,
            current.selectionStart - 1,
            current.selectionStart,
            "",
          );
          applyTextareaValue(event.currentTarget, next.value, next.caretIndex, next.caretIndex);
          return;
        }
        if (event.key === "Delete") {
          event.preventDefault();
          if (current.selectionStart !== current.selectionEnd) {
            replaceCurrentTextSelection(event.currentTarget, "");
            return;
          }
          if (current.selectionEnd >= current.value.length) return;
          const next = replaceTextRange(
            current.value,
            current.selectionEnd,
            current.selectionEnd + 1,
            "",
          );
          applyTextareaValue(event.currentTarget, next.value, current.selectionEnd, current.selectionEnd);
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          if (event.shiftKey) {
            const anchor = current.anchorIndex;
            const focus =
              current.selectionStart === current.selectionEnd
                ? current.selectionEnd
                : anchor === current.selectionStart
                  ? current.selectionEnd
                  : current.selectionStart;
            const nextFocus = clampTextIndex(focus + direction, current.value);
            const nextRange = selectionRangeFromAnchor(anchor, nextFocus);
            applyTextareaSelection(
              event.currentTarget,
              nextRange.selectionStart,
              nextRange.selectionEnd,
              nextRange.anchorIndex,
            );
            return;
          }
          const nextCaret =
            current.selectionStart !== current.selectionEnd
              ? event.key === "ArrowLeft"
                ? current.selectionStart
                : current.selectionEnd
              : clampTextIndex(current.selectionEnd + direction, current.value);
          applyTextareaSelection(event.currentTarget, nextCaret, nextCaret, nextCaret);
        }
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
  const textDragRef = useRef<TextDragState | null>(null);
  const textEditSessionRef = useRef<TextEditSession | null>(null);
  const pendingTextEditParamsRef = useRef(new Map<string, { clientPoint: Point | null; selectAll: boolean }>());
  const latestStateRef = useRef(state);
  const latestDocumentRef = useRef(state.document);
  const previousRenderDocumentRef = useRef<CanvasDocument | null>(null);
  const viewportInitializedSubjectRef = useRef<string | null>(null);
  const viewportMetricsFrameRef = useRef<number | null>(null);
  const viewportSizeRef = useRef<Size>(ZERO_VIEWPORT_SIZE);
  const viewportRectRef = useRef<ViewportClientRect>(ZERO_VIEWPORT_RECT);
  const spacePressedRef = useRef(false);
  const commandModeRef = useRef(false);
  const dropTargetIdRef = useRef<string | null>(null);
  const [viewportSize, setViewportSize] = useState<Size>(ZERO_VIEWPORT_SIZE);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [marqueeRect, setMarqueeRect] = useState<Rect | null>(null);
  const [interactionActive, setInteractionActive] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const latestTextEditRef = useRef<TextEditState | null>(null);
  latestTextEditRef.current = textEdit;
  const canvasAlignmentDebugEnabled = useMemo(isCanvasAlignmentDebugEnabled, []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const affectedElementIds = useMemo(
    () => getAffectedElementRenderIds(previousRenderDocumentRef.current, state.document),
    [state.document],
  );

  const syncViewportMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const nextRect: ViewportClientRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    const nextSize: Size = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };

    viewportRectRef.current = nextRect;
    viewportSizeRef.current = nextSize;
    setViewportSize((previous) => (sizesEqual(previous, nextSize) ? previous : nextSize));
  }, []);

  const scheduleViewportMetricsSync = useCallback(() => {
    if (viewportMetricsFrameRef.current !== null) return;
    viewportMetricsFrameRef.current = globalThis.requestAnimationFrame(() => {
      viewportMetricsFrameRef.current = null;
      syncViewportMetrics();
    });
  }, [syncViewportMetrics]);

  const getCurrentViewportSize = useCallback((): Size => {
    const cached = viewportSizeRef.current;
    if (cached.width > 0 || cached.height > 0) return cached;
    const viewport = viewportRef.current;
    if (!viewport) return ZERO_VIEWPORT_SIZE;
    const next = getViewportSize(viewport);
    viewportSizeRef.current = next;
    return next;
  }, []);

  const getCurrentViewportRect = useCallback((): ViewportClientRect => {
    const cached = viewportRectRef.current;
    if (cached.width > 0 || cached.height > 0) return cached;
    const viewport = viewportRef.current;
    if (!viewport) return ZERO_VIEWPORT_RECT;
    const rect = viewport.getBoundingClientRect();
    const next = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    viewportRectRef.current = next;
    return next;
  }, []);

  const updateDropTarget = useCallback((id: string | null) => {
    dropTargetIdRef.current = id;
    setDropTargetId(id);
  }, []);

  useEffect(() => {
    latestStateRef.current = state;
    latestDocumentRef.current = state.document;
  }, [state]);

  useLayoutEffect(() => {
    previousRenderDocumentRef.current = state.document;
  }, [state.document]);

  useLayoutEffect(() => {
    syncViewportMetrics();

    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(scheduleViewportMetricsSync);
    observer.observe(viewport);
    globalThis.addEventListener("resize", scheduleViewportMetricsSync);
    globalThis.visualViewport?.addEventListener("resize", scheduleViewportMetricsSync);
    globalThis.visualViewport?.addEventListener("scroll", scheduleViewportMetricsSync);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("resize", scheduleViewportMetricsSync);
      globalThis.visualViewport?.removeEventListener("resize", scheduleViewportMetricsSync);
      globalThis.visualViewport?.removeEventListener("scroll", scheduleViewportMetricsSync);
      if (viewportMetricsFrameRef.current !== null) {
        globalThis.cancelAnimationFrame(viewportMetricsFrameRef.current);
        viewportMetricsFrameRef.current = null;
      }
    };
  }, [scheduleViewportMetricsSync, syncViewportMetrics]);

  const syncTextSelection = useCallback((
    selectionStart: number,
    selectionEnd: number,
    anchorIndex?: number,
  ) => {
    setTextEdit((current) => {
      if (!current) return current;
      const start = clampTextIndex(selectionStart, current.value);
      const end = clampTextIndex(selectionEnd, current.value);
      return {
        ...current,
        selectionStart: Math.min(start, end),
        selectionEnd: Math.max(start, end),
        anchorIndex: anchorIndex ?? end,
      };
    });
  }, []);

  const updateTextNodeFromTextareaInput = useCallback((
    value: string,
    selectionStart: number,
    selectionEnd: number,
  ) => {
    setTextEdit((current) => {
      if (!current) return current;
      const start = clampTextIndex(selectionStart, value);
      const end = clampTextIndex(selectionEnd, value);
      const nextDocument = updateElementText(
        latestDocumentRef.current,
        current.nodeId,
        value,
      );
      latestDocumentRef.current = nextDocument;
      dispatch({ type: "setDocumentTransient", document: nextDocument });
      return {
        ...current,
        value,
        selectionStart: Math.min(start, end),
        selectionEnd: Math.max(start, end),
        anchorIndex: end,
      };
    });
  }, [dispatch]);

  const commitTextEditing = useCallback(() => {
    const session = textEditSessionRef.current;
    if (!session) return;
    textEditSessionRef.current = null;
    clearNativeTextSelection();

    const current = latestTextEditRef.current;
    const value =
      current?.nodeId === session.nodeId
        ? current.value
        : latestDocumentRef.current.elements[session.nodeId]?.content ?? "";
    const finalDocument = updateElementText(
      latestDocumentRef.current,
      session.nodeId,
      value,
    );
    latestDocumentRef.current = finalDocument;
    setTextEdit(null);

    const beforeValue = session.beforeDocument.elements[session.nodeId]?.content ?? "";
    if (beforeValue === value) {
      dispatch({ type: "setEditingText", editingTextId: null });
      return;
    }

    dispatch({
      type: "commitDocument",
      beforeDocument: session.beforeDocument,
      document: finalDocument,
      selectedIds: state.selectedIds.includes(session.nodeId)
        ? state.selectedIds
        : [session.nodeId],
    });
  }, [dispatch, state.selectedIds]);

  const cancelTextEditing = useCallback(() => {
    const session = textEditSessionRef.current;
    if (!session) return;
    textEditSessionRef.current = null;
    latestDocumentRef.current = session.beforeDocument;
    setTextEdit(null);
    clearNativeTextSelection();
    dispatch({ type: "cancelTextEditing", document: session.beforeDocument });
  }, [dispatch]);

  const enterTextEditing = useCallback((nodeId: string, clientPoint?: Point, selectAll = false) => {
    pendingTextEditParamsRef.current.set(nodeId, { clientPoint: clientPoint ?? null, selectAll });
    dispatch({ type: "setEditingText", editingTextId: nodeId });
  }, [dispatch]);

  useLayoutEffect(() => {
    const activeId = state.editingTextId;
    const activeNode = activeId ? state.document.elements[activeId] : null;
    if (!activeId || !activeNode || activeNode.type !== "text") {
      if (textEditSessionRef.current) commitTextEditing();
      setTextEdit(null);
      return;
    }

    if (textEditSessionRef.current?.nodeId === activeId) return;
    if (textEditSessionRef.current) commitTextEditing();

    const beforeDocument = latestDocumentRef.current;
    const node = beforeDocument.elements[activeId] ?? activeNode;
    const value = node.content ?? "";
    const viewport = viewportRef.current;
    const pendingParams = pendingTextEditParamsRef.current.get(activeId);
    pendingTextEditParamsRef.current.delete(activeId);
    const requestedPoint = pendingParams?.clientPoint ?? null;
    const selectAllOnEnter = pendingParams?.selectAll ?? false;
    const activeViewportSize = getCurrentViewportSize();
    const activeViewportRect = getCurrentViewportRect();
    const activeViewportTransform = viewport
      ? buildViewportTransform(
          beforeDocument,
          activeViewportSize,
          latestStateRef.current.zoom,
          latestStateRef.current.offsetX,
          latestStateRef.current.offsetY,
        )
      : null;
    const caretIndex =
      viewport && requestedPoint && activeViewportTransform
        ? textIndexFromClientPoint({
            document: beforeDocument,
            nodeId: activeId,
            clientX: requestedPoint.x,
            clientY: requestedPoint.y,
            viewport,
            viewportRect: activeViewportRect,
            viewportTransform: activeViewportTransform,
          }) ?? value.length
        : value.length;

    textEditSessionRef.current = {
      nodeId: activeId,
      beforeDocument,
    };
    setTextEdit({
      nodeId: activeId,
      value,
      selectionStart: selectAllOnEnter ? 0 : caretIndex,
      selectionEnd: selectAllOnEnter ? value.length : caretIndex,
      anchorIndex: selectAllOnEnter ? 0 : caretIndex,
    });
    clearNativeTextSelection();
  }, [
    commitTextEditing,
    getCurrentViewportRect,
    getCurrentViewportSize,
    state.document,
    state.editingTextId,
  ]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const block = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", block, { passive: false });
    return () => el.removeEventListener("wheel", block);
  }, []);

  useLayoutEffect(() => {
    // The user-facing camera (zoom + offset) is owned by document state. The
    // browser window can affect only the internal display scale that fits large
    // subjects at 100%; it must not dispatch fresh zoom/offset values on every
    // resize.
    //
    // Viewport measurement is cached by the ResizeObserver above; this effect
    // only consumes the cached size for the once-per-subject initial sync.
    const canvasSize = getCanvasSize(state.document);
    const subjectKey = viewportSubjectKey
      ? `${viewportSubjectKey}:${canvasSize.width}x${canvasSize.height}`
      : `${canvasSize.width}x${canvasSize.height}`;
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
  }, [
    dispatch,
    draftMode,
    state.canvasStageActive,
    state.document.canvas.height,
    state.document.canvas.width,
    state.offsetX,
    state.offsetY,
    state.zoom,
    viewportSize,
    viewportSubjectKey,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const currentState = latestStateRef.current;
      if (isEditableTarget(event.target) || currentState.editingTextId) {
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
    const viewportSize = getCurrentViewportSize();
    const transform = buildViewportTransform(
      state.document,
      viewportSize,
      state.zoom,
      state.offsetX,
      state.offsetY,
    );
    const viewportRect = getCurrentViewportRect();
    return viewportPointToCanvas(
      { x: event.clientX - viewportRect.left, y: event.clientY - viewportRect.top },
      transform,
    );
  };

  const getInteractiveElementId = (target: EventTarget | null): string | null =>
    retargetForIsolatedParent(
      state.document,
      state.isolatedParentId,
      getElementIdFromTarget(target),
    );

  const textIndexAtClientPoint = (
    nodeId: string,
    clientX: number,
    clientY: number,
  ): number | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportSize = getCurrentViewportSize();
    const viewportRect = getCurrentViewportRect();
    return textIndexFromClientPoint({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect,
      viewportTransform: buildViewportTransform(
        latestDocumentRef.current,
        viewportSize,
        latestStateRef.current.zoom,
        latestStateRef.current.offsetX,
        latestStateRef.current.offsetY,
      ),
    });
  };

  const isTextNodeAtClientPoint = (
    nodeId: string,
    clientX: number,
    clientY: number,
  ): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const viewportSize = getCurrentViewportSize();
    const viewportRect = getCurrentViewportRect();
    return isClientPointInsideTextNode({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect,
      viewportTransform: buildViewportTransform(
        latestDocumentRef.current,
        viewportSize,
        latestStateRef.current.zoom,
        latestStateRef.current.offsetX,
        latestStateRef.current.offsetY,
      ),
    });
  };

  const isTextContentAtClientPoint = (
    nodeId: string,
    clientX: number,
    clientY: number,
  ): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) return false;
    const viewportSize = getCurrentViewportSize();
    const viewportRect = getCurrentViewportRect();
    return isClientPointInsideTextContent({
      document: latestDocumentRef.current,
      nodeId,
      clientX,
      clientY,
      viewport,
      viewportRect,
      viewportTransform: buildViewportTransform(
        latestDocumentRef.current,
        viewportSize,
        latestStateRef.current.zoom,
        latestStateRef.current.offsetX,
        latestStateRef.current.offsetY,
      ),
    });
  };

  const getSelectedTextBoxAtClientPoint = (
    clientX: number,
    clientY: number,
  ): string | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportRect = getCurrentViewportRect();
    const viewportPoint = {
      x: clientX - viewportRect.left,
      y: clientY - viewportRect.top,
    };
    const viewportTransform = buildViewportTransform(
      state.document,
      getCurrentViewportSize(),
      state.zoom,
      state.offsetX,
      state.offsetY,
    );

    for (const id of [...state.selectedIds].reverse()) {
      const node = state.document.elements[id];
      if (!node || node.type !== "text" || node.locked || node.visible === false) continue;
      const rect = elementToPaintViewportRect(state.document, id, viewportTransform);
      if (
        rect &&
        viewportPoint.x >= rect.x &&
        viewportPoint.x <= rect.x + rect.width &&
        viewportPoint.y >= rect.y &&
        viewportPoint.y <= rect.y + rect.height
      ) {
        return id;
      }
    }

    return null;
  };

  const setTextSelectionFromPoint = (
    nodeId: string,
    clientX: number,
    clientY: number,
    anchorIndex?: number,
  ): number | null => {
    const index = textIndexAtClientPoint(nodeId, clientX, clientY);
    if (index === null) return null;
    const anchor = anchorIndex ?? index;
    const nextSelection = selectionRangeFromAnchor(anchor, index);
    syncTextSelection(
      nextSelection.selectionStart,
      nextSelection.selectionEnd,
      nextSelection.anchorIndex,
    );
    return index;
  };

  const scheduleCanvasAlignmentLog = (input: CanvasAlignmentLogInput) => {
    if (!canvasAlignmentDebugEnabled) return;
    void import("./canvasAlignmentLog").then(({ logCanvasAlignment }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const run = () =>
        logCanvasAlignment(input, {
          viewport,
          stageElement: stageRef.current,
          canvasStageElement: canvasStageRef.current,
          viewportSize: getCurrentViewportSize(),
        });
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
        return;
      }
      globalThis.setTimeout(run, 0);
    });
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
        getCurrentViewportSize(),
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
    const containerSize = getCurrentViewportSize();
    const viewportRect = getCurrentViewportRect();
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
      const cursorCanvas = viewportPointToCanvas(cursor, currentTransform);
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
    if (
      event.detail > 1 &&
      textDoubleClickTarget?.type === "text" &&
      !textDoubleClickTarget.locked
    ) {
      event.preventDefault();
      return;
    }

    if (viewport && toolingRef.current && !state.editingTextId) {
      const vpRect = getCurrentViewportRect();
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
      if (isTextNodeAtClientPoint(
        state.editingTextId,
        event.clientX,
        event.clientY,
      )) {
        const index = setTextSelectionFromPoint(
          state.editingTextId,
          event.clientX,
          event.clientY,
        );
        if (index !== null) {
          textDragRef.current = {
            pointerId: event.pointerId,
            nodeId: state.editingTextId,
            anchorIndex: index,
          };
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
    const viewportSize = getCurrentViewportSize();
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
    const textDrag = textDragRef.current;
    if (textDrag) {
      if (textDrag.pointerId !== event.pointerId) return;
      setTextSelectionFromPoint(
        textDrag.nodeId,
        event.clientX,
        event.clientY,
        textDrag.anchorIndex,
      );
      event.preventDefault();
      return;
    }

    const interaction = interactionRef.current;
    if (!interaction) {
      const viewport = viewportRef.current;
      if (viewport && toolingRef.current && !state.editingTextId) {
        const vpRect = getCurrentViewportRect();
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
      const nextViewport = clampViewportState(
        rawPanViewport,
        getCurrentViewportSize(),
        getCanvasSize(state.document),
      );
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
    const textDrag = textDragRef.current;
    if (textDrag?.pointerId === event.pointerId) {
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }
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
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const targetId = getInteractiveElementId(event.target);
    const targetNode = targetId ? state.document.elements[targetId] : null;
    const selectedTextBoxTargetId = targetId
      ? null
      : getSelectedTextBoxAtClientPoint(event.clientX, event.clientY);
    const node =
      targetNode?.type === "text"
        ? targetNode
        : selectedTextBoxTargetId
          ? state.document.elements[selectedTextBoxTargetId]
          : null;
    if (node?.type === "text" && !node.locked) {
      event.preventDefault();
      clearNativeTextSelection();
      const clickedTextContent = isTextContentAtClientPoint(
        node.id,
        event.clientX,
        event.clientY,
      );
      if (state.editingTextId === node.id) {
        const value = textEdit?.nodeId === node.id ? textEdit.value : node.content ?? "";
        syncTextSelection(0, value.length, 0);
        return;
      }
      enterTextEditing(
        node.id,
        { x: event.clientX, y: event.clientY },
        !clickedTextContent || (targetId === null && selectedTextBoxTargetId === node.id),
      );
    }
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetId = getInteractiveElementId(event.target);
    if (targetId && !state.selectedIds.includes(targetId)) dispatch({ type: "setSelected", selectedIds: [targetId] });
    setContextMenu({ x: event.clientX, y: event.clientY, targetId: targetId ?? null });
  };

  const isDrawTool = state.tool !== "select";
  const shellClassName = `canvas-shell${isDrawTool ? " is-draw-tool" : ""}`;
  const shellStyle = useMemo(
    () => getShellPatternStyle(state.document),
    [state.document.shellBackground, state.document.shellPattern],
  );
  const canvasSize = useMemo(
    () => getCanvasSize(state.document),
    [state.document.canvas.height, state.document.canvas.width],
  );
  const stageWidth = canvasSize.width;
  const stageHeight = canvasSize.height;
  const displayScale = useMemo(
    () =>
      viewportSize.width > 0 && viewportSize.height > 0
        ? getCanvasDisplayScale(viewportSize, canvasSize)
        : 1,
    [canvasSize, viewportSize],
  );
  const displayZoom = state.zoom * displayScale;
  const viewportTransform = useMemo(
    () =>
      buildViewportTransform(
        state.document,
        viewportSize,
        state.zoom,
        state.offsetX,
        state.offsetY,
      ),
    [
      state.document.canvas.height,
      state.document.canvas.rotation,
      state.document.canvas.width,
      state.offsetX,
      state.offsetY,
      state.zoom,
      viewportSize,
    ],
  );
  const scaledDomProjection = useMemo(
    () =>
      shouldUseScaledDomProjection({
        canvasSize,
        displayZoom,
        canvasRotation: state.document.canvas.rotation ?? 0,
      }),
    [canvasSize, displayZoom, state.document.canvas.rotation],
  );
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
      <div
        ref={stageRef}
        className={`stage-space${draftMode ? " stage-space--draft" : ""}`}
        style={stageSpaceStyle}
      >
        {draftMode ? (
          <RenderedScene
            draftMode
            document={state.document}
            canvasStageActive={state.canvasStageActive}
            isolatedParentId={state.isolatedParentId}
            editingTextId={state.editingTextId}
            affectedElementIds={affectedElementIds}
            renderScale={renderScale}
          />
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
            <RenderedScene
              draftMode={false}
              document={state.document}
              canvasStageActive={state.canvasStageActive}
              isolatedParentId={state.isolatedParentId}
              editingTextId={state.editingTextId}
              affectedElementIds={affectedElementIds}
              renderScale={renderScale}
            />
          </div>
        )}
      </div>
      <CanvasToolingLayer
        ref={toolingRef}
        document={state.document}
        selectedIds={state.selectedIds}
        hoveredId={state.hoveredId}
        editingTextId={state.editingTextId}
        canvasStageActive={state.canvasStageActive}
        guides={state.guides}
        viewportTransform={viewportTransform}
        suppressHover={interactionActive}
        interactionType={interactionActive ? (interactionRef.current?.type ?? null) : null}
        marqueeRect={marqueeRect}
        dropTargetId={dropTargetId}
      />
      <HiddenTextEditingTextarea
        textEdit={textEdit}
        document={state.document}
        viewportRef={viewportRef}
        viewportTransform={viewportTransform}
        onSelectionChange={syncTextSelection}
        onInputValue={updateTextNodeFromTextareaInput}
        onCommit={commitTextEditing}
        onCancel={cancelTextEditing}
      />
      <TextEditingOverlay
        textEdit={textEdit}
        document={state.document}
        viewportTransform={viewportTransform}
      />
      {contextMenu && <CanvasContextMenu menu={contextMenu} onClose={closeContextMenu} />}
    </div>
  );
}
