import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { copyElements, pasteElements } from "@/canvas/engine/clipboard";
import { deleteElements, duplicateElements } from "@/canvas/engine/actions";
import { isEditableTarget } from "@/canvas/engine/hitTesting";
import { clamp } from "@/canvas/engine/geometry";
import type { EditorState } from "@/canvas/engine/types";
import { MAX_ZOOM, MIN_ZOOM } from "@/canvas/engine/viewport";
import type { CanvasToolId } from "@/canvas/tools";
import { TOOL_BY_CANVAS_COMMAND } from "@/domain/settings/commands";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { matchesKeyCommand } from "@/domain/settings/resolve";
import type { CanvasKeyCommandId, GlobalSettings } from "@/domain/settings/types";
import { TOOLBAR_TOOL_MAP } from "../canvasShellStyle";
import type { Interaction } from "../canvasInteractionTypes";

type Params = {
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  interactionRef: MutableRefObject<Interaction | null>;
  latestStateRef: MutableRefObject<EditorState>;
  setInteractionActive: (active: boolean) => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  onBackToParentShortcut?: () => boolean | void;
  onToggleScreenOverlayShortcut?: () => boolean | void;
};

export function useKeyboardShortcuts({
  dispatch,
  viewportRef,
  interactionRef,
  latestStateRef,
  setInteractionActive,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
  onBackToParentShortcut,
  onToggleScreenOverlayShortcut,
}: Params): { spacePressedRef: MutableRefObject<boolean> } {
  const spacePressedRef = useRef(false);

  useEffect(() => {
    const toolCommands = Object.entries(TOOL_BY_CANVAS_COMMAND) as Array<
      [CanvasKeyCommandId, CanvasToolId]
    >;

    const onKeyDown = (event: KeyboardEvent) => {
      const currentState = latestStateRef.current;
      if (isEditableTarget(event.target) || currentState.editingTextId) return;

      if (matchesKeyCommand(event, settings, "canvas.selection.cancel")) {
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

      if (matchesKeyCommand(event, settings, "canvas.history.redo")) { event.preventDefault(); dispatch({ type: "redo" }); return; }
      if (matchesKeyCommand(event, settings, "canvas.history.undo")) { event.preventDefault(); dispatch({ type: "undo" }); return; }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomReset")) { event.preventDefault(); dispatch({ type: "setZoom", zoom: 1 }); return; }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomIn")) {
        event.preventDefault();
        dispatch({
          type: "setZoom",
          zoom: clamp(currentState.zoom + settings.canvas.viewport.zoomStep, MIN_ZOOM, MAX_ZOOM),
        });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomOut")) {
        event.preventDefault();
        dispatch({
          type: "setZoom",
          zoom: clamp(currentState.zoom - settings.canvas.viewport.zoomStep, MIN_ZOOM, MAX_ZOOM),
        });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.clipboard.copy")) { event.preventDefault(); copyElements(currentState.document, currentState.selectedIds); return; }
      if (matchesKeyCommand(event, settings, "canvas.clipboard.paste")) {
        event.preventDefault();
        const result = pasteElements(currentState.document);
        if (result) dispatch({ type: "commitDocument", document: result.document, selectedIds: result.selectedIds });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.duplicate")) {
        event.preventDefault();
        if (currentState.selectedIds.length > 0) {
          const dup = duplicateElements(currentState.document, currentState.selectedIds);
          dispatch({ type: "commitDocument", document: dup.document, selectedIds: dup.selectedIds });
        }
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.delete") && currentState.selectedIds.length > 0) {
        event.preventDefault();
        dispatch({ type: "commitDocument", document: deleteElements(currentState.document, currentState.selectedIds), selectedIds: [] });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.component.openSelection")) {
        const handled =
          currentState.selectedIds.length === 1 &&
          onOpenSelectedComponentShortcut?.() === true;
        if (handled) {
          event.preventDefault();
          return;
        }
      }
      if (matchesKeyCommand(event, settings, "canvas.component.backToParent")) {
        const handled = onBackToParentShortcut?.() === true;
        if (handled) {
          event.preventDefault();
          return;
        }
      }
      if (matchesKeyCommand(event, settings, "canvas.overlay.toggleScreen")) {
        const handled = onToggleScreenOverlayShortcut?.() === true;
        if (handled) {
          event.preventDefault();
          return;
        }
      }

      for (const [commandId, tool] of toolCommands) {
        if (matchesKeyCommand(event, settings, commandId)) {
          event.preventDefault();
          const handled = onCanvasToolShortcut?.(tool) === true;
          const mappedTool = TOOLBAR_TOOL_MAP[tool];
          if (!handled && mappedTool) dispatch({ type: "setTool", tool: mappedTool });
          return;
        }
      }

      if (!matchesKeyCommand(event, settings, "canvas.viewport.pan")) return;
      event.preventDefault();
      spacePressedRef.current = true;
      viewportRef.current?.classList.add("is-space-panning");
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!matchesKeyCommand(event, settings, "canvas.viewport.pan")) return;
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
  }, [
    dispatch,
    interactionRef,
    latestStateRef,
    onBackToParentShortcut,
    onCanvasToolShortcut,
    onOpenSelectedComponentShortcut,
    onToggleScreenOverlayShortcut,
    setInteractionActive,
    settings,
    viewportRef,
  ]);

  return { spacePressedRef };
}
