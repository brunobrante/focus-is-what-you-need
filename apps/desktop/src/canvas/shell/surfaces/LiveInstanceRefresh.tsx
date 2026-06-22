import { useEffect, useRef } from "react";

import { useEditor } from "@/canvas/engine/store";
import { buildMasterResolver, reresolveInstances } from "@/canvas/engine/htmlSceneAdapter";
import type { CanvasDocument } from "@/canvas/engine/types";
import { getScenesSnapshot } from "@/application/scenes/useScenesSnapshot";
import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene";
import type { SceneRow } from "@/lib/storage/schema";
import { subscribe, TABLES } from "@/lib/storage/store";

/**
 * Keeps linked-instance content live inside an OPEN editor.
 *
 * Linked instances are inlined from their master at seed time only; an already-open
 * canvas (e.g. the Versions window beside the one being edited) would otherwise keep
 * showing stale master content until it remounts. This watches the scenes table and,
 * when a master that this document actually references changes, re-inlines just those
 * masters via the gentle `refreshInstances` action — preserving edits, selection,
 * zoom and undo (the inlined subtrees are locked/read-only).
 *
 * A "master signature" (the graphs of every variant transitively referenced by the
 * doc's instances) gates the work, so the editor's own scene autosaves — which never
 * change a referenced master — do not cause churn.
 */
export function LiveInstanceRefresh({ fallbackName = "Canvas" }: { fallbackName?: string }) {
  const { state, dispatch } = useEditor();
  const stateRef = useRef(state);
  stateRef.current = state;
  const signatureRef = useRef<string | null>(null);

  useEffect(() => {
    // Seed the baseline so an unrelated first scene change is a no-op.
    signatureRef.current = masterSignature(stateRef.current.document, getScenesSnapshot());
    return subscribe(TABLES.scenes, () => {
      const editor = stateRef.current;
      if (editor.editingTextId) return; // never interrupt text editing
      const scenes = getScenesSnapshot();
      const signature = masterSignature(editor.document, scenes);
      if (signature === signatureRef.current) return; // no referenced master changed
      signatureRef.current = signature;
      if (!signature) return; // document has no linked instances
      const next = reresolveInstances(
        editor.document,
        buildMasterResolver(scenes),
        fallbackName,
      );
      dispatch({ type: "refreshInstances", document: next });
    });
  }, [dispatch, fallbackName]);

  return null;
}

/**
 * Sorted graphJSON of every variant scene transitively referenced by the document's
 * linked instances (following nested instances inside masters). Empty when the
 * document has no instances.
 */
function masterSignature(document: CanvasDocument, scenes: SceneRow[]): string {
  const graphByVariant = new Map<string, string>();
  for (const scene of scenes) {
    if (scene.ownerType === "variant") graphByVariant.set(scene.ownerId, scene.graphJSON);
  }

  const seen = new Set<string>();
  const queue: string[] = [];
  for (const element of Object.values(document.elements)) {
    if (element.instanceOf) queue.push(element.instanceOf.variantId);
  }

  while (queue.length > 0) {
    const variantId = queue.pop()!;
    if (seen.has(variantId)) continue;
    seen.add(variantId);
    const graph = graphByVariant.get(variantId);
    if (!graph) continue;
    const html = htmlCanvasDocumentFromJSON(graph);
    if (!html) continue;
    for (const node of html.nodes) {
      if (node.instanceOf) queue.push(node.instanceOf.variantId);
    }
  }

  if (seen.size === 0) return "";
  return [...seen]
    .sort()
    .map((id) => `${id}:${graphByVariant.get(id) ?? ""}`)
    .join("|");
}
