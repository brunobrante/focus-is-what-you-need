import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { updateElementText, updateElementTextShallow } from "@/canvas/engine/actions";
import type { CanvasDocument, EditorState, Point } from "@/canvas/engine/types";
import type { Size } from "@/canvas/engine/viewport";
import { buildViewportTransform } from "../canvasCoordinates";
import { clearNativeTextSelection, textIndexFromClientPoint } from "../canvasStageHelpers";
import type { TextEditState, TextEditSession, ViewportClientRect } from "../canvasStageTypes";

export type TextEditingSessionResult = {
  textEdit: TextEditState | null;
  syncTextSelection: (selectionStart: number, selectionEnd: number, anchorIndex?: number) => void;
  updateTextNodeFromTextareaInput: (value: string, selectionStart: number, selectionEnd: number) => void;
  commitTextEditing: () => void;
  cancelTextEditing: () => void;
  enterTextEditing: (nodeId: string, clientPoint?: Point, selectAll?: boolean) => void;
};

type Params = {
  editingTextId: string | null;
  document: CanvasDocument;
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
  latestDocumentRef: MutableRefObject<CanvasDocument>;
  latestStateRef: MutableRefObject<EditorState>;
};

export function useTextEditingSession({
  editingTextId,
  document,
  dispatch,
  viewportRef,
  getCurrentViewportSize,
  getCurrentViewportRect,
  latestDocumentRef,
  latestStateRef,
}: Params): TextEditingSessionResult {
  const textEditSessionRef = useRef<TextEditSession | null>(null);
  const pendingTextEditParamsRef = useRef(new Map<string, { clientPoint: Point | null; selectAll: boolean }>());
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const latestTextEditRef = useRef<TextEditState | null>(null);
  latestTextEditRef.current = textEdit;

  const syncTextSelection = useCallback((
    selectionStart: number,
    selectionEnd: number,
    anchorIndex?: number,
  ) => {
    setTextEdit((current) => {
      if (!current) return current;
      const start = Math.max(0, Math.min(selectionStart, current.value.length));
      const end = Math.max(0, Math.min(selectionEnd, current.value.length));
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
    const current = latestTextEditRef.current;
    if (!current) return;
    const start = Math.max(0, Math.min(selectionStart, value.length));
    const end = Math.max(0, Math.min(selectionEnd, value.length));
    // Side effects run OUTSIDE the setState updater: StrictMode double-invokes
    // updaters, which here mutated latestDocumentRef and fired the transient
    // dispatch twice per keystroke (M14; same fix already applied to zoom and
    // pen-move). The updater below is now pure.
    const nextDocument = updateElementTextShallow(latestDocumentRef.current, current.nodeId, value);
    latestDocumentRef.current = nextDocument;
    // Scope the transient to the edited node (P3): without changedIds the store
    // falls back to a full O(N) deep diff + draft write + saveScene per keystroke.
    dispatch({ type: "setDocumentTransient", document: nextDocument, changedIds: [current.nodeId] });
    setTextEdit((prev) => (prev ? {
      ...prev,
      value,
      selectionStart: Math.min(start, end),
      selectionEnd: Math.max(start, end),
      anchorIndex: end,
    } : prev));
  }, [dispatch, latestDocumentRef]);

  const commitTextEditing = useCallback(() => {
    const session = textEditSessionRef.current;
    if (!session) return;
    textEditSessionRef.current = null;
    clearNativeTextSelection();

    const current = latestTextEditRef.current;
    const value = current?.nodeId === session.nodeId
      ? current.value
      : latestDocumentRef.current.elements[session.nodeId]?.content ?? "";
    const finalDocument = updateElementText(latestDocumentRef.current, session.nodeId, value);
    latestDocumentRef.current = finalDocument;
    setTextEdit(null);

    const beforeValue = session.beforeDocument.elements[session.nodeId]?.content ?? "";
    if (beforeValue === value) {
      dispatch({ type: "setEditingText", editingTextId: null });
      return;
    }
    const currentSelectedIds = latestStateRef.current.selectedIds;
    dispatch({
      type: "commitDocument",
      beforeDocument: session.beforeDocument,
      document: finalDocument,
      selectedIds: currentSelectedIds.includes(session.nodeId) ? currentSelectedIds : [session.nodeId],
    });
  }, [dispatch, latestDocumentRef, latestStateRef]);

  const cancelTextEditing = useCallback(() => {
    const session = textEditSessionRef.current;
    if (!session) return;
    textEditSessionRef.current = null;
    latestDocumentRef.current = session.beforeDocument;
    setTextEdit(null);
    clearNativeTextSelection();
    dispatch({ type: "cancelTextEditing", document: session.beforeDocument });
  }, [dispatch, latestDocumentRef]);

  const enterTextEditing = useCallback((nodeId: string, clientPoint?: Point, selectAll = false) => {
    pendingTextEditParamsRef.current.set(nodeId, { clientPoint: clientPoint ?? null, selectAll });
    dispatch({ type: "setEditingText", editingTextId: nodeId });
  }, [dispatch]);

  useLayoutEffect(() => {
    const activeId = editingTextId;
    const activeNode = activeId ? document.elements[activeId] : null;
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
          latestStateRef.current.viewportMode,
        )
      : null;
    const caretIndex = viewport && requestedPoint && activeViewportTransform
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

    textEditSessionRef.current = { nodeId: activeId, beforeDocument };
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
    document,
    editingTextId,
    getCurrentViewportRect,
    getCurrentViewportSize,
    latestDocumentRef,
    latestStateRef,
    viewportRef,
  ]);

  return {
    textEdit,
    syncTextSelection,
    updateTextNodeFromTextareaInput,
    commitTextEditing,
    cancelTextEditing,
    enterTextEditing,
  };
}
