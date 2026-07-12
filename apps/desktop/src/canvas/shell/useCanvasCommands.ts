import { useMemo } from "react";

import {
  alignElements,
  bringElementsToFront,
  deleteElements,
  distributeElements,
  duplicateElements,
  reorderElements,
  sendElementsToBack,
  setElementLocked,
  setElementVisible,
  unwrapElement,
  type AlignEdge,
  type DistributeAxis,
} from "@/canvas/engine/actions";
import { getVisibleWindowRect } from "@/canvas/engine/geometry";
import type { EditorBridgeValue } from "@/canvas/engine/bridge";

/**
 * Application hook that owns the engine-mutation + commit command logic shared
 * by the layers tree's and the canvas stage's context menus. Each callback
 * applies the engine action and dispatches `commitDocument`.
 *
 * `onCommit` is invoked after every command (whether or not it produced a
 * mutation) so callers can close the menu exactly as the old inline code did.
 *
 * Accepts anything carrying the editor triplet — the shell passes the active
 * bridge value, the stage menu passes its own `useEditor()` context.
 */
export function useCanvasCommands(
  editor: Pick<EditorBridgeValue, "state" | "dispatch" | "clipboard">,
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
      // Z-order works on the whole selection, preserving its relative order;
      // ids reorder within their own sibling list (G12).
      bringToFront: () => {
        if (selectedIds.length > 0) commit(bringElementsToFront(state.document, selectedIds));
      },
      bringForward: () => {
        if (selectedIds.length > 0) commit(reorderElements(state.document, selectedIds, "forward"));
      },
      sendBackward: () => {
        if (selectedIds.length > 0) commit(reorderElements(state.document, selectedIds, "backward"));
      },
      sendToBack: () => {
        if (selectedIds.length > 0) commit(sendElementsToBack(state.document, selectedIds));
      },
      // Align a single element within its parent frame, or a multi-selection within
      // its shared bounds (G1). Distribute needs 3+ elements.
      align: (edge: AlignEdge) => {
        if (selectedIds.length >= 1)
          commit(
            alignElements(
              state.document,
              selectedIds,
              edge,
              getVisibleWindowRect(state.document, state.contentScroll),
            ),
          );
      },
      distribute: (axis: DistributeAxis) => {
        if (selectedIds.length >= 3) commit(distributeElements(state.document, selectedIds, axis));
      },
      // Ungroup a single container: reparent its children to the grandparent and
      // remove it, selecting the freed children (G7).
      unwrap: () => {
        if (!singleId) return;
        const result = unwrapElement(state.document, singleId);
        commit(result.document, result.selectedIds);
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
