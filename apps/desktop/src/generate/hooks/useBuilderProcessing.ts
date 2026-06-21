import { useEffect, useState } from "react";
import { useLamaInpainting } from "@/lib/models/useLamaInpainting";
import {
  bytesToPngDataUrl,
  urlToBytes,
  runBirefnet,
  runRealEsrgan,
  runLama,
  type ProcessingActionKind,
} from "@/lib/models/modelCommands";
import type { CutVariantTool } from "../engine/types";

/**
 * Inputs the Builder processing orchestration needs from the editor: the open
 * cut, the source image to chain edits onto, and the mutators that store a new
 * variant or commit a drawn selection.
 */
interface UseBuilderProcessingParams {
  /** The currently open cut/component, or null when none is selected. */
  selectedComponent: { id: string } | null;
  /** The id of the open cut (matches `selectedComponent` for components). */
  activeCutId: string | null;
  /** The image URL the processors read from (the shown variant). */
  sourceUrl: string;
  /** Stores a processor result as a new variant of the given cut. */
  addCutVariant: (cutId: string, input: { tool: CutVariantTool; dataUrl: string }) => void;
  /** Whether the current drawn selection can be saved as a cut. */
  canSaveSelection: boolean;
  /** Commits the drawn selection as a cut, optionally post-processed. */
  saveSelection: (action?: ProcessingActionKind) => Promise<void> | void;
}

/**
 * Orchestrates the Builder's ML / image-processing actions (background remove,
 * upscale, LaMa inpainting, and processed draw commits). Owns the run-state and
 * the LaMa masking session, and exposes only what the view needs to render.
 */
export function useBuilderProcessing({
  selectedComponent,
  activeCutId,
  sourceUrl,
  addCutVariant,
  canSaveSelection,
  saveSelection,
}: UseBuilderProcessingParams) {
  const [running, setRunning] = useState<{ id: string; kind: ProcessingActionKind } | null>(null);
  // LaMa "remove element" mask-drawing state. The brush paints onto an overlay
  // canvas on the stage; Apply runs LaMa and stores the result as a new variant.
  const lama = useLamaInpainting();
  const masking = lama.status === "masking";

  const runningKind = running && running.id === activeCutId ? running.kind : null;

  // Switching to a different cut (or closing it) abandons any in-progress mask,
  // so a mask drawn for one cut can never be applied to another.
  useEffect(() => {
    lama.cancel();
    // Only re-run when the open cut changes; `lama.cancel` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCutId]);

  async function runProcessing(kind: ProcessingActionKind) {
    if (!selectedComponent || running) return;
    const id = selectedComponent.id;
    // Chain onto the currently shown variant so edits stack (e.g. upscale then
    // background-remove); the result becomes a new variant and the new main.
    const source = sourceUrl;
    setRunning({ id, kind });
    try {
      const input = await urlToBytes(source);
      const output = kind === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
      addCutVariant(id, { tool: kind, dataUrl: bytesToPngDataUrl(output) });
    } catch (error) {
      console.error(`Processing (${kind}) failed`, error);
    } finally {
      setRunning(null);
    }
  }

  // LaMa "remove element": reads the painted mask, runs inpainting on the open
  // cut, and stores the result (session-local) just like the other processors.
  async function applyLamaMask() {
    if (!selectedComponent || running) return;
    const id = selectedComponent.id;
    const maskBytes = await lama.readMask();
    // Nothing painted — keep the user in masking mode to draw a selection.
    if (!maskBytes) return;
    const source = sourceUrl;
    setRunning({ id, kind: "lama" });
    lama.cancel();
    try {
      const input = await urlToBytes(source);
      const output = await runLama(input, maskBytes);
      addCutVariant(id, { tool: "lama", dataUrl: bytesToPngDataUrl(output) });
    } catch (error) {
      console.error("LaMa inpainting failed", error);
    } finally {
      setRunning(null);
    }
  }

  // Draw toolbar: commit the drawn region as a cut, optionally post-processed.
  const [drawAction, setDrawAction] = useState<"crop" | ProcessingActionKind | null>(null);
  async function commitDraw(action: "crop" | ProcessingActionKind) {
    if (!canSaveSelection || drawAction) return;
    setDrawAction(action);
    try {
      await saveSelection(action === "crop" ? undefined : action);
    } finally {
      setDrawAction(null);
    }
  }

  return {
    running,
    runningKind,
    lama,
    masking,
    drawAction,
    runProcessing,
    applyLamaMask,
    commitDraw,
  };
}
