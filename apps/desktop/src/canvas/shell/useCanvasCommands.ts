import { useMemo } from "react";

import {
  alignElements,
  bringToFront,
  deleteElements,
  distributeElements,
  duplicateElements,
  reorderElement,
  sendToBack,
  setElementLocked,
  setElementVisible,
  type AlignEdge,
  type DistributeAxis,
} from "@/canvas/engine/actions";
import type { EditorBridgeValue } from "@/canvas/engine/bridge";

/**
 * Application hook that owns the engine-mutation + commit command logic the
 * layers tree's context menu used to inline. Each callback applies the same
 * engine action and dispatches the same `commitDocument` as before — behavior
 * is identical, only the call site moves out of the Tree component.
 *
 * `onCommit` is invoked after every command (whether or not it produced a
 * mutation) so callers can close the menu exactly as the old inline code did.
 */
export function useCanvasCommands(
  editor: EditorBridgeValue,
  onCommit: () => void,
) {
  const { state, dispatch, clipboard } = editor;

  return useMemo(() => {
    const selectedIds = state.selectedIds;
    const singleId = selectedIds.length === 1 ? selectedIds[0] : null;

    const commit = (document: typeof state.document, ids?: string[]) => {
      dispatch({ type: "commitDocument", document, selectedIds: ids ?? state.selectedIds });
      onCommit();
    };

    return {
      copy: () => {
        clipboard.copy(state.document, selectedIds);
        onCommit();
      },
      paste: () => {
        const result = clipboard.paste(state.document);
        if (result) commit(result.document, result.selectedIds);
        else onCommit();
      },
      duplicate: () => {
        const result = duplicateElements(state.document, selectedIds);
        commit(result.document, result.selectedIds);
      },
      bringToFront: () => {
        if (singleId) commit(bringToFront(state.document, singleId));
      },
      bringForward: () => {
        if (singleId) commit(reorderElement(state.document, singleId, "forward"));
      },
      sendBackward: () => {
        if (singleId) commit(reorderElement(state.document, singleId, "backward"));
      },
      sendToBack: () => {
        if (singleId) commit(sendToBack(state.document, singleId));
      },
      // Align a single element within its parent frame, or a multi-selection within
      // its shared bounds (G1). Distribute needs 3+ elements.
      align: (edge: AlignEdge) => {
        if (selectedIds.length >= 1) commit(alignElements(state.document, selectedIds, edge));
      },
      distribute: (axis: DistributeAxis) => {
        if (selectedIds.length >= 3) commit(distributeElements(state.document, selectedIds, axis));
      },
      setLocked: (locked: boolean) => {
        if (singleId) commit(setElementLocked(state.document, singleId, locked));
      },
      setVisible: (visible: boolean) => {
        if (singleId) commit(setElementVisible(state.document, singleId, visible));
      },
      remove: () => {
        commit(deleteElements(state.document, selectedIds), []);
      },
    };
  }, [state.document, state.selectedIds, dispatch, clipboard, onCommit]);
}
