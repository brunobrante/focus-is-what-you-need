import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { copyElements, pasteElements } from "@/lib/editor/clipboard";
import { deleteElements, duplicateElements } from "@/lib/editor/actions";
import { isEditableTarget } from "@/lib/editor/hitTesting";
import { clamp } from "@/lib/editor/geometry";
import type { EditorState } from "@/lib/editor/types";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/editor/viewport";
import type { Interaction } from "../canvasInteractionTypes";

type Params = {
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  interactionRef: MutableRefObject<Interaction | null>;
  latestStateRef: MutableRefObject<EditorState>;
  setInteractionActive: (active: boolean) => void;
};

export function useKeyboardShortcuts({
  dispatch,
  viewportRef,
  interactionRef,
  latestStateRef,
  setInteractionActive,
}: Params): { spacePressedRef: MutableRefObject<boolean> } {
  const spacePressedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const currentState = latestStateRef.current;
      if (isEditableTarget(event.target) || currentState.editingTextId) return;

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
  }, [dispatch, interactionRef, latestStateRef, setInteractionActive, viewportRef]);

  return { spacePressedRef };
}
