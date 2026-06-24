import { useCallback, useEffect, useRef } from "react";
import { htmlGraphJSONFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import { saveScene } from "@/application/scenes/saveScene";
import { materializeVersionScene } from "@/application/canvas/canvasMaterializer";
import type { CanvasDocument } from "@/canvas/engine/types";

type PendingVersionSave = {
  variantId: string;
  document: CanvasDocument;
  previousGraphJSON: string | null;
  canvasName: string;
  projectId: string | null;
};

/**
 * Lightweight debounced persistence for the "Versions" canvas window. It saves the edited
 * document back to the version's variant scene AND materializes its owned content into
 * version-owned components (`materializeVersionScene`) — symmetric with the Current
 * window. Detaching (unlinking) an instance or drawing a new element inside a version
 * therefore creates a real, version-owned component, so the content survives in the
 * subcomponents list and when the version is promoted to main. Linked instances are left
 * untouched (the materializer skips them). The pending edit is flushed when the selected
 * version changes and on unmount, so a fast tab switch or navigation never drops it.
 */
export function useVersionScenePersistence(input: {
  variantId: string | null;
  ready: boolean;
  baseGraphJSON: string | null;
  canvasName: string;
  projectId: string | null;
}): { onChange: (document: CanvasDocument) => void; flush: () => void } {
  const { variantId, ready, baseGraphJSON, canvasName, projectId } = input;
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingVersionSave | null>(null);
  const ownerRef = useRef<string | null>(variantId);
  const skipInitialRef = useRef(true);

  // Synchronously (during render, before the editor's seed emit) skip the next emit
  // for a newly selected version. The pending save of the previous version is left for
  // the effect cleanup below to flush — not dropped here.
  if (ownerRef.current !== variantId) {
    ownerRef.current = variantId;
    skipInitialRef.current = true;
  }

  // The pending save is self-contained (it carries its own variant id and base graph),
  // so flushing is correct even after the selected version has moved on.
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    const graphJSON = htmlGraphJSONFromCanvasDocument(
      pending.document,
      pending.previousGraphJSON,
      pending.canvasName,
    );
    if (graphJSON === pending.previousGraphJSON) return;
    saveScene({ ownerType: "variant", ownerId: pending.variantId, graphJSON });
    // Materialize owned content (detached/new) into version-owned components, symmetric
    // with the Current window. Fire-and-forget; linked instances are skipped internally.
    void materializeVersionScene({
      versionVariantId: pending.variantId,
      document: pending.document,
      projectId: pending.projectId,
    });
  }, []);

  // Flush the pending edit when the selected version changes or the canvas unmounts,
  // so a fast switch/navigation within the debounce window never drops it.
  useEffect(() => () => flush(), [variantId, flush]);

  const onDocumentChange = useCallback(
    (document: CanvasDocument) => {
      if (!variantId || !ready) return;
      if (skipInitialRef.current) {
        skipInitialRef.current = false;
        return;
      }
      pendingRef.current = { variantId, document, previousGraphJSON: baseGraphJSON, canvasName, projectId };
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, 300);
    },
    [variantId, ready, baseGraphJSON, canvasName, projectId, flush],
  );

  return { onChange: onDocumentChange, flush };
}
