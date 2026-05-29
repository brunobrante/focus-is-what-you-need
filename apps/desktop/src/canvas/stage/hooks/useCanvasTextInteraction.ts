import type React from "react";
import { useRef } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { EditorState, Point } from "@/canvas/engine/types";
import type { EditorAction } from "@/canvas/engine/store";
import type { CanvasDocument } from "@/canvas/engine/types";
import { buildViewportTransform } from "../canvasCoordinates";
import { selectionRangeFromAnchor, clearNativeTextSelection, isClientPointInsideTextContent, isClientPointInsideTextNode, textIndexFromClientPoint } from "../canvasStageHelpers";
import { elementToPaintViewportRect } from "../canvasToolingRenderer";
import { retargetForIsolatedParent } from "../canvasHitTesting";
import { getElementIdFromTarget } from "@/canvas/engine/hitTesting";
import type { TextDragState, TextEditState, ViewportClientRect } from "../canvasStageTypes";
import type { Size } from "@/canvas/engine/viewport";

type Dispatch = React.Dispatch<EditorAction>;

interface Params {
  viewportRef: React.MutableRefObject<HTMLDivElement | null>;
  state: EditorState;
  textEdit: TextEditState | null;
  enterTextEditing: (nodeId: string, clientPoint?: Point, selectAll?: boolean) => void;
  syncTextSelection: (start: number, end: number, anchor?: number) => void;
  latestDocumentRef: React.MutableRefObject<CanvasDocument>;
  latestStateRef: React.MutableRefObject<EditorState>;
  getCurrentViewportSize: () => Size;
  getCurrentViewportRect: () => ViewportClientRect;
  dispatch: Dispatch;
}

export function useCanvasTextInteraction({
  viewportRef,
  state,
  textEdit,
  enterTextEditing,
  syncTextSelection,
  latestDocumentRef,
  latestStateRef,
  getCurrentViewportSize,
  getCurrentViewportRect,
  dispatch,
}: Params) {
  const textDragRef = useRef<TextDragState | null>(null);

  const buildLatestTransform = () =>
    buildViewportTransform(
      latestDocumentRef.current,
      getCurrentViewportSize(),
      latestStateRef.current.zoom,
      latestStateRef.current.offsetX,
      latestStateRef.current.offsetY,
    );

  const textIndexAtPoint = (nodeId: string, clientX: number, clientY: number): number | null => {
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

  const isTextNodeAtPoint = (nodeId: string, clientX: number, clientY: number): boolean => {
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

  const isTextContentAtPoint = (nodeId: string, clientX: number, clientY: number): boolean => {
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

  const setTextSelectionFromPoint = (
    nodeId: string,
    clientX: number,
    clientY: number,
    anchorIndex?: number,
  ): number | null => {
    const index = textIndexAtPoint(nodeId, clientX, clientY);
    if (index === null) return null;
    const anchor = anchorIndex ?? index;
    const next = selectionRangeFromAnchor(anchor, index);
    syncTextSelection(next.selectionStart, next.selectionEnd, next.anchorIndex);
    return index;
  };

  // Returns the ID of a selected text element hit at (clientX, clientY), only when no element
  // was hit via normal hit-testing (i.e. when initialTargetId is null).
  const getSelectedTextBoxAtClientPoint = (
    clientX: number,
    clientY: number,
    hasInitialTarget: boolean,
  ): string | null => {
    if (hasInitialTarget) return null;
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const viewportRect = getCurrentViewportRect();
    const vp = { x: clientX - viewportRect.left, y: clientY - viewportRect.top };
    const transform = buildViewportTransform(
      state.document,
      getCurrentViewportSize(),
      state.zoom,
      state.offsetX,
      state.offsetY,
    );
    for (const id of [...state.selectedIds].reverse()) {
      const node = state.document.elements[id];
      if (!node || node.type !== "text" || node.locked || node.visible === false) continue;
      const rect = elementToPaintViewportRect(state.document, id, transform);
      if (rect && vp.x >= rect.x && vp.x <= rect.x + rect.width && vp.y >= rect.y && vp.y <= rect.y + rect.height) {
        return id;
      }
    }
    return null;
  };

  // Called from onPointerDown when state.editingTextId is set.
  // Returns true if the click landed on the text node (event fully handled → caller should return).
  // Returns false if click was outside (caller should dispatch stop-editing and fall through).
  const tryStartTextDrag = (
    event: ReactPointerEvent,
    editingTextId: string,
    viewport: HTMLDivElement | null,
  ): boolean => {
    if (!isTextNodeAtPoint(editingTextId, event.clientX, event.clientY)) return false;
    const index = setTextSelectionFromPoint(editingTextId, event.clientX, event.clientY);
    if (index !== null) {
      textDragRef.current = { pointerId: event.pointerId, nodeId: editingTextId, anchorIndex: index };
      event.preventDefault();
      viewport?.setPointerCapture(event.pointerId);
    }
    return true;
  };

  // Called from onPointerMove. Returns true if text drag consumed the event.
  const handleTextDragMove = (event: ReactPointerEvent): boolean => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    setTextSelectionFromPoint(drag.nodeId, event.clientX, event.clientY, drag.anchorIndex);
    event.preventDefault();
    return true;
  };

  // Called from finishInteraction. Returns true if text drag was released.
  const releaseTextDrag = (event: ReactPointerEvent, viewport: HTMLDivElement | null): boolean => {
    const drag = textDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    textDragRef.current = null;
    event.preventDefault();
    return true;
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const targetId = retargetForIsolatedParent(
      state.document,
      state.isolatedParentId,
      getElementIdFromTarget(event.target),
    );
    const targetNode = targetId ? state.document.elements[targetId] : null;
    const selectedTextBoxId = targetId ? null : getSelectedTextBoxAtClientPoint(event.clientX, event.clientY, false);
    const node =
      targetNode?.type === "text"
        ? targetNode
        : selectedTextBoxId
          ? state.document.elements[selectedTextBoxId]
          : null;

    if (!node || node.type !== "text" || node.locked) return;
    event.preventDefault();
    clearNativeTextSelection();

    const clickedTextContent = isTextContentAtPoint(node.id, event.clientX, event.clientY);
    if (state.editingTextId === node.id) {
      const value = textEdit?.nodeId === node.id ? textEdit.value : node.content ?? "";
      syncTextSelection(0, value.length, 0);
      return;
    }
    enterTextEditing(
      node.id,
      { x: event.clientX, y: event.clientY },
      !clickedTextContent || (targetId === null && selectedTextBoxId === node.id),
    );
  };

  return {
    getSelectedTextBoxAtClientPoint,
    tryStartTextDrag,
    handleTextDragMove,
    releaseTextDrag,
    onDoubleClick,
  };
}
