import { useMemo } from "react";
import { buildMasterResolver, canvasDocumentFromHtmlGraphJSON } from "@/canvas/engine/htmlSceneAdapter";
import { getScenesSnapshot } from "@/application/scenes/useScenesSnapshot";
import { useScene } from "@/lib/storage/hooks";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
import { useVersionScenePersistence } from "./useVersionScenePersistence";

export type SubjectOwner = { ownerType: "variant"; ownerId: string };

/**
 * Loads, builds, and persists the editable scene for a canvas window bound to a
 * single subject (a variant). This is the generalized form of the Versions-window
 * wiring: scene → document → per-subject storage key → debounced persistence. It is
 * the unit reused by both the Versions window and every extra "Current" instance,
 * so each gets an independent editor/viewport without duplicating the plumbing.
 */
export function useSubjectCanvasWindow(input: {
  subjectOwner: SubjectOwner | null;
  // Distinguishes this window's editor/viewport from others on the same subject
  // (e.g. "versions", "current-2"). Combined with the owner id into the storage key.
  storageKeyPrefix: string;
  projectType: ProjectType;
  canvasName: string;
}): {
  document?: CanvasDocument;
  storageKey: string;
  ready: boolean;
  graphJSON: string | null;
  onDocumentChange: (document: CanvasDocument) => void;
} {
  const { subjectOwner, storageKeyPrefix, canvasName } = input;

  const { data: scene, loading: sceneLoading } = useScene(
    subjectOwner?.ownerType ?? null,
    subjectOwner?.ownerId ?? null,
  );
  const graphJSON = scene?.graphJSON ?? null;
  const ready = !subjectOwner || !sceneLoading;
  const ownerId = subjectOwner?.ownerId ?? null;
  const storageKey = ownerId
    ? `desktop-canvas-editor:${storageKeyPrefix}:${ownerId}:v1`
    : `desktop-canvas-editor:${storageKeyPrefix}:none:v1`;

  const resolveMaster = useMemo(
    () => buildMasterResolver(getScenesSnapshot()),
    [graphJSON],
  );

  const document = useMemo(() => {
    if (!ownerId) return undefined;
    // Never seed a blank document: when the scene has not loaded yet (graph null), the
    // editor must stay unmounted rather than seed an empty scene the persistence layer
    // would write back, wiping the subject. It mounts once the real graph is present.
    return (
      canvasDocumentFromHtmlGraphJSON(graphJSON, {
        promoteSubjectRoot: true,
        resolveMaster,
      }) ?? undefined
    );
  }, [ownerId, graphJSON, resolveMaster]);

  const { onChange: onDocumentChange } = useVersionScenePersistence({
    variantId: ownerId,
    ready,
    baseGraphJSON: graphJSON,
    canvasName,
  });

  return { document, storageKey, ready, graphJSON, onDocumentChange };
}
