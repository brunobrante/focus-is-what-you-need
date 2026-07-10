import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { Clipboard } from "@/canvas/engine/clipboard";
import { deleteElements, duplicateElements, nudgeElements, unwrapElement } from "@/canvas/engine/actions";
import { isEditableTarget } from "@/canvas/engine/hitTesting";
import { clamp } from "@/canvas/engine/geometry";
import type { CanvasDocument, EditorState } from "@/canvas/engine/types";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import type { CanvasToolId } from "@/canvas/tools";
import { TOOL_BY_CANVAS_COMMAND } from "@/domain/settings/commands";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { matchesKeyCommand } from "@/domain/settings/resolve";
import type { CanvasKeyCommandId, GlobalSettings } from "@/domain/settings/types";
import { TOOLBAR_TOOL_MAP } from "../canvasShellStyle";
import type { Interaction } from "../canvasInteractionTypes";

// Gestures that build a transient document and commit on pointerup. While one is
// in flight, a document-committing shortcut (undo/redo/paste/duplicate/delete)
// would land on a transient frame and be clobbered by the next pointermove or by
// the gesture's own commit — corrupting history (H1). Pan/marquee don't mutate
// the document, so they don't need gating.
const DOCUMENT_MUTATING_GESTURES = new Set<Interaction["type"]>([
  "drag",
  "resize",
  "rotate",
  "radius",
  "draw",
  "pen",
  "pencil",
  "anchor-edit",
  "canvas-resize",
  "canvas-rotate",
]);

// Arrow-key nudge (G2): unit direction per command; the distance comes from
// settings (small = plain, large = Shift). A burst of nudges coalesces into one
// undo entry, committed once the burst settles.
const NUDGE_COMMANDS: Array<{ id: CanvasKeyCommandId; ux: number; uy: number }> = [
  { id: "canvas.nudge.up", ux: 0, uy: -1 },
  { id: "canvas.nudge.down", ux: 0, uy: 1 },
  { id: "canvas.nudge.left", ux: -1, uy: 0 },
  { id: "canvas.nudge.right", ux: 1, uy: 0 },
];
const NUDGE_COMMIT_DELAY = 400;

function isDocumentMutatingGesture(interaction: Interaction | null): boolean {
  return interaction !== null && DOCUMENT_MUTATING_GESTURES.has(interaction.type);
}

type Params = {
  dispatch: (action: Record<string, unknown> & { type: string }) => void;
  // The shell-shared clipboard (one instance across panes, G6) or this editor's
  // own isolated buffer when mounted standalone.
  clipboard: Clipboard;
  // Only the ACTIVE pane may handle window-level shortcuts. Every mounted stage
  // attaches to `window`, so without this gate a split view would undo/zoom/paste
  // in every pane at once — with the shared clipboard that means a double paste.
  enabled?: boolean;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
  interactionRef: MutableRefObject<Interaction | null>;
  latestStateRef: MutableRefObject<EditorState>;
  setInteractionActive: (active: boolean) => void;
  // Aborts an in-flight drag/resize/rotate/radius gesture (Escape). Held in a ref
  // because the pointer-events hook that provides it runs after this one (STAGE-4).
  cancelActiveInteractionRef?: MutableRefObject<(() => boolean) | null>;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  onBackToParentShortcut?: () => boolean | void;
  // When true, the toggle-screen-overlay shortcut flips the parent-frames overlay.
  ancestorOverlayAvailable?: boolean;
};

export function useKeyboardShortcuts({
  dispatch,
  clipboard,
  enabled = true,
  viewportRef,
  interactionRef,
  latestStateRef,
  setInteractionActive,
  cancelActiveInteractionRef,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
  onBackToParentShortcut,
  ancestorOverlayAvailable,
}: Params): { spacePressedRef: MutableRefObject<boolean> } {
  const spacePressedRef = useRef(false);
  // Read through a ref so an activity flip doesn't tear down/re-subscribe the
  // listeners (which would flush a pending nudge burst mid-typing elsewhere).
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Deactivating while Space is held would strand space-pan on (same failure
  // mode as M5's missed keyup on blur) — clear it when the pane goes inactive.
  useEffect(() => {
    if (enabled) return;
    spacePressedRef.current = false;
    viewportRef.current?.classList.remove("is-space-panning");
  }, [enabled, viewportRef]);
  // Coalesced-nudge burst state (G2): the document before the burst (for one undo
  // entry) and the idle timer that commits it.
  const nudgeBeforeRef = useRef<CanvasDocument | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const commitNudge = () => {
      if (nudgeTimerRef.current) {
        clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
      }
      const before = nudgeBeforeRef.current;
      nudgeBeforeRef.current = null;
      if (!before) return;
      const latest = latestStateRef.current;
      dispatch({
        type: "commitDocument",
        beforeDocument: before,
        document: latest.document,
        selectedIds: latest.selectedIds,
      });
    };

    const toolCommands = Object.entries(TOOL_BY_CANVAS_COMMAND) as Array<
      [CanvasKeyCommandId, CanvasToolId]
    >;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const currentState = latestStateRef.current;
      if (isEditableTarget(event.target) || currentState.editingTextId) return;

      // Commit the pen path / toggle into path edit mode (Enter by default).
      if (matchesKeyCommand(event, settings, "canvas.path.commit")) {
        if (currentState.pathEditId && currentState.tool === "pen") {
          event.preventDefault();
          dispatch({ type: "setTool", tool: "select" });
          dispatch({ type: "setSelected", selectedIds: [currentState.pathEditId] });
          return;
        }
        if (currentState.pathEditId) {
          event.preventDefault();
          dispatch({ type: "exitPathEdit" });
          return;
        }
        if (currentState.selectedIds.length === 1) {
          const node = currentState.document.elements[currentState.selectedIds[0]];
          if (node?.type === "path") {
            event.preventDefault();
            dispatch({ type: "enterPathEdit", pathEditId: node.id });
            return;
          }
        }
      }

      if (matchesKeyCommand(event, settings, "canvas.selection.cancel")) {
        const interaction = interactionRef.current;
        // Cancel an in-flight pen anchor-drag → revert to before the anchor placement.
        if (interaction?.type === "pen" || interaction?.type === "anchor-edit") {
          const viewport = viewportRef.current;
          if (viewport?.hasPointerCapture(interaction.pointerId)) viewport.releasePointerCapture(interaction.pointerId);
          interactionRef.current = null;
          setInteractionActive(false);
          dispatch({ type: "setDocumentTransient", document: interaction.beforeDocument });
          dispatch({ type: "exitPathEdit" });
          if (currentState.tool === "pen") dispatch({ type: "setTool", tool: "select" });
          return;
        }
        // Esc while editing a path (no active drag) → leave edit mode first.
        if (currentState.pathEditId) {
          dispatch({ type: "exitPathEdit" });
          if (currentState.tool === "pen") dispatch({ type: "setTool", tool: "select" });
          return;
        }
        if (interaction?.type === "draw") {
          const viewport = viewportRef.current;
          if (viewport?.hasPointerCapture(interaction.pointerId)) viewport.releasePointerCapture(interaction.pointerId);
          interactionRef.current = null;
          setInteractionActive(false);
          dispatch({ type: "setDocumentTransient", document: interaction.beforeDocument });
          dispatch({ type: "setTool", tool: "select" });
          return;
        }
        // Abort an in-flight pencil stroke (M4): release capture and revert so
        // pencilMove stops appending; keep the Pencil tool active for another stroke.
        if (interaction?.type === "pencil") {
          const viewport = viewportRef.current;
          if (viewport?.hasPointerCapture(interaction.pointerId)) viewport.releasePointerCapture(interaction.pointerId);
          interactionRef.current = null;
          setInteractionActive(false);
          dispatch({ type: "setDocumentTransient", document: interaction.beforeDocument });
          return;
        }
        // Abort an in-flight drag/resize/rotate/radius gesture (STAGE-4).
        if (cancelActiveInteractionRef?.current?.()) return;
        if (currentState.tool !== "select") { dispatch({ type: "setTool", tool: "select" }); return; }
      }

      // Block document-committing shortcuts while a mutating gesture is in flight (H1):
      // they would commit onto a transient frame that the next pointermove/commit clobbers.
      const mutatingGesture = isDocumentMutatingGesture(interactionRef.current);

      if (matchesKeyCommand(event, settings, "canvas.history.redo")) { event.preventDefault(); if (!mutatingGesture) dispatch({ type: "redo" }); return; }
      if (matchesKeyCommand(event, settings, "canvas.history.undo")) { event.preventDefault(); if (!mutatingGesture) dispatch({ type: "undo" }); return; }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomReset")) { event.preventDefault(); dispatch({ type: "setZoom", zoom: 1 }); return; }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomIn")) {
        event.preventDefault();
        const limits = getViewportZoomLimits(currentState.viewportMode);
        dispatch({
          type: "setZoom",
          zoom: clamp(currentState.zoom + settings.canvas.viewport.zoomStep, limits.min, limits.max),
        });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomOut")) {
        event.preventDefault();
        const limits = getViewportZoomLimits(currentState.viewportMode);
        dispatch({
          type: "setZoom",
          zoom: clamp(currentState.zoom - settings.canvas.viewport.zoomStep, limits.min, limits.max),
        });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.clipboard.copy")) { event.preventDefault(); clipboard.copy(currentState.document, currentState.selectedIds); return; }
      if (matchesKeyCommand(event, settings, "canvas.clipboard.paste")) {
        event.preventDefault();
        if (mutatingGesture) return;
        const result = clipboard.paste(currentState.document);
        if (result) dispatch({ type: "commitDocument", document: result.document, selectedIds: result.selectedIds });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.clipboard.cut")) {
        event.preventDefault();
        if (mutatingGesture || currentState.selectedIds.length === 0) return;
        clipboard.copy(currentState.document, currentState.selectedIds);
        dispatch({
          type: "commitDocument",
          document: deleteElements(currentState.document, currentState.selectedIds),
          selectedIds: [],
        });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.selectAll")) {
        event.preventDefault();
        // Select the current level's siblings (isolation-aware), skipping locked
        // and hidden nodes — the same exclusions the marquee applies (M6).
        const parentId = currentState.isolatedParentId;
        const pool = parentId
          ? currentState.document.elements[parentId]?.children ?? []
          : currentState.document.rootIds;
        const ids = pool.filter((id) => {
          const node = currentState.document.elements[id];
          return node && !node.locked && node.visible !== false;
        });
        if (ids.length > 0) dispatch({ type: "setSelected", selectedIds: ids });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.viewport.zoomToSelection")) {
        event.preventDefault();
        if (currentState.selectedIds.length > 0) {
          dispatch({ type: "requestSelectionFocus", active: true });
        }
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.duplicate")) {
        event.preventDefault();
        if (!mutatingGesture && currentState.selectedIds.length > 0) {
          const dup = duplicateElements(currentState.document, currentState.selectedIds);
          dispatch({ type: "commitDocument", document: dup.document, selectedIds: dup.selectedIds });
        }
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.delete") && currentState.selectedIds.length > 0) {
        event.preventDefault();
        if (mutatingGesture) return;
        dispatch({ type: "commitDocument", document: deleteElements(currentState.document, currentState.selectedIds), selectedIds: [] });
        return;
      }
      if (matchesKeyCommand(event, settings, "canvas.selection.ungroup")) {
        event.preventDefault();
        if (mutatingGesture) return;
        if (currentState.selectedIds.length === 1) {
          const target = currentState.document.elements[currentState.selectedIds[0]];
          if (target && target.children.length > 0) {
            const result = unwrapElement(currentState.document, currentState.selectedIds[0]);
            dispatch({ type: "commitDocument", document: result.document, selectedIds: result.selectedIds });
          }
        }
        return;
      }
      for (const { id, ux, uy } of NUDGE_COMMANDS) {
        if (!matchesKeyCommand(event, settings, id)) continue;
        event.preventDefault();
        if (mutatingGesture || currentState.selectedIds.length === 0) return;
        const amount = event.shiftKey ? settings.canvas.nudge.large : settings.canvas.nudge.small;
        const moved = nudgeElements(currentState.document, currentState.selectedIds, ux * amount, uy * amount);
        if (moved === currentState.document) return; // nothing movable / no change
        // Capture the pre-burst document once so the whole burst is a single undo
        // entry; push transient frames and commit after the burst settles (G2/H3).
        if (!nudgeBeforeRef.current) nudgeBeforeRef.current = currentState.document;
        dispatch({ type: "setDocumentTransient", document: moved, changedIds: currentState.selectedIds });
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(commitNudge, NUDGE_COMMIT_DELAY);
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
        if (ancestorOverlayAvailable) {
          event.preventDefault();
          dispatch({ type: "setAncestorOverlayEnabled", enabled: !currentState.ancestorOverlay.enabled });
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
      if (!enabledRef.current) return;
      if (!matchesKeyCommand(event, settings, "canvas.viewport.pan")) return;
      spacePressedRef.current = false;
      viewportRef.current?.classList.remove("is-space-panning");
    };

    // A keyup can be missed if the window loses focus while Space is held (e.g.
    // Cmd+Tab), leaving space-pan stuck on so the next click pans instead of
    // selecting (M5). Reset on blur, mirroring CanvasToolingLayer's modifier reset.
    const onBlur = () => {
      spacePressedRef.current = false;
      viewportRef.current?.classList.remove("is-space-panning");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      spacePressedRef.current = false;
      // Flush any pending nudge burst so it isn't lost across a re-subscribe.
      commitNudge();
    };
  }, [
    dispatch,
    clipboard,
    interactionRef,
    latestStateRef,
    cancelActiveInteractionRef,
    onBackToParentShortcut,
    onCanvasToolShortcut,
    onOpenSelectedComponentShortcut,
    ancestorOverlayAvailable,
    setInteractionActive,
    settings,
    viewportRef,
  ]);

  return { spacePressedRef };
}
