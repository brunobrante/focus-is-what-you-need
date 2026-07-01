import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { htmlGraphJSONFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import { saveScene } from "@/application/scenes/saveScene";
import { registerPendingFlusher } from "@/application/persistence/flushOnQuit";
import { materializeComponentsFromCanvasDocument } from "@/application/canvas/canvasMaterializer";
import { componentStructureKey } from "../canvasUtils";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, SceneOwnerType, ScreenRow } from "@/lib/storage/schema";

interface Params {
  sceneOwner: { ownerType: SceneOwnerType; ownerId: string } | null;
  currentReady: boolean;
  currentOwnerKey: string;
  resolvedSceneGraphJSON: string | null;
  effectiveSceneGraphJSON: string | null;
  currentCanvasName: string;
  component: ComponentRow | null;
  projectComponents: ComponentRow[];
  projectDbId: string | null;
  screen: ScreenRow | null;
  canUseFactoryMocks: boolean;
  currentDocument: CanvasDocument;
  // Fired after each debounced scene persist with the just-saved document. Used
  // by the icon editor to refresh a token's cached SVG snapshot. Kept in a ref so
  // the stable `flushPendingSave` identity is preserved.
  onScenePersisted?: (document: CanvasDocument) => void;
}

type PendingSave = {
  ownerKey: string;
  previousGraphJSON: string | null;
  document: CanvasDocument;
  ownerType: SceneOwnerType;
  ownerId: string;
  canvasName: string;
  currentComponent: ComponentRow | null;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
};

export function useDeferredPersistence({
  sceneOwner,
  currentReady,
  currentOwnerKey,
  resolvedSceneGraphJSON,
  effectiveSceneGraphJSON,
  currentCanvasName,
  component,
  projectComponents,
  projectDbId,
  screen,
  canUseFactoryMocks,
  currentDocument,
  onScenePersisted,
}: Params) {
  const saveTimerRef = useRef<number | null>(null);
  const onScenePersistedRef = useRef(onScenePersisted);
  onScenePersistedRef.current = onScenePersisted;
  const latestGraphJSONRef = useRef<string | null>(resolvedSceneGraphJSON);
  const latestOwnerKeyRef = useRef<string>(currentOwnerKey);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const skipInitialSaveRef = useRef(true);
  const materializedStructureKeyRef = useRef<string | null>(null);

  const flushPendingSave = useCallback((): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const pending = pendingSaveRef.current;
    if (!pending) return Promise.resolve();
    pendingSaveRef.current = null;

    const graphJSON = htmlGraphJSONFromCanvasDocument(
      pending.document,
      pending.previousGraphJSON,
      pending.canvasName,
    );
    if (graphJSON === pending.previousGraphJSON) return Promise.resolve();

    if (latestOwnerKeyRef.current === pending.ownerKey) {
      latestGraphJSONRef.current = graphJSON;
    }

    saveScene({ ownerType: pending.ownerType, ownerId: pending.ownerId, graphJSON });
    onScenePersistedRef.current?.(pending.document);
    return materializeComponentsFromCanvasDocument({
      currentComponent: pending.currentComponent,
      document: pending.document,
      projectComponents: pending.projectComponents,
      projectId: pending.projectId,
      screen: pending.screen,
    });
  }, []);

  // Reset refs synchronously when the canvas owner changes (runs during render).
  // We deliberately do NOT null pendingSaveRef here: the previous owner's pending
  // edit is flushed by the layout effect below so a fast navigation inside the
  // debounce window doesn't drop it. flushPendingSave reads the pending entry's
  // own owner, so flushing after this reset still persists to the correct owner.
  if (latestOwnerKeyRef.current !== currentOwnerKey) {
    latestOwnerKeyRef.current = currentOwnerKey;
    latestGraphJSONRef.current = resolvedSceneGraphJSON;
    skipInitialSaveRef.current = true;
  }

  const handleCurrentDocumentChange = useCallback(
    (document: CanvasDocument) => {
      if (!sceneOwner || !currentReady) return;

      if (skipInitialSaveRef.current) {
        skipInitialSaveRef.current = false;
        return;
      }

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      const { ownerType, ownerId } = sceneOwner;
      pendingSaveRef.current = {
        ownerKey: currentOwnerKey,
        previousGraphJSON: latestGraphJSONRef.current,
        document,
        ownerType,
        ownerId,
        canvasName: currentCanvasName,
        currentComponent: component,
        projectComponents,
        projectId: projectDbId,
        screen,
      };
      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 300);
    },
    [
      component,
      currentCanvasName,
      currentOwnerKey,
      currentReady,
      flushPendingSave,
      projectComponents,
      projectDbId,
      sceneOwner,
      screen,
    ],
  );

  // Keep latest graphJSON in sync
  useEffect(() => {
    latestGraphJSONRef.current = resolvedSceneGraphJSON;
  }, [resolvedSceneGraphJSON]);

  // Persist mock scene to DB when it differs from stored scene
  useEffect(() => {
    if (!sceneOwner || !currentReady || !resolvedSceneGraphJSON) return;
    if (resolvedSceneGraphJSON === effectiveSceneGraphJSON) return;
    saveScene({
      ownerType: sceneOwner.ownerType,
      ownerId: sceneOwner.ownerId,
      graphJSON: resolvedSceneGraphJSON,
    });
  }, [currentReady, effectiveSceneGraphJSON, resolvedSceneGraphJSON, sceneOwner]);

  // Materialize components from document structure after each stable save
  useEffect(() => {
    if (!sceneOwner || !currentReady || !projectDbId || canUseFactoryMocks) return;
    const structureKey = `${currentOwnerKey}:${componentStructureKey(currentDocument)}`;
    if (materializedStructureKeyRef.current === structureKey) return;
    materializedStructureKeyRef.current = structureKey;

    void materializeComponentsFromCanvasDocument({
      currentComponent: component,
      document: currentDocument,
      projectComponents,
      projectId: projectDbId,
      screen,
    });
  }, [
    canUseFactoryMocks,
    component,
    currentDocument,
    currentOwnerKey,
    currentReady,
    projectDbId,
    projectComponents,
    sceneOwner,
    screen,
  ]);

  // Flush the previous owner's pending save when the owner changes. Runs in the
  // layout phase (after commit, before paint / any new interaction) so it never
  // fires a save synchronously during render, and the new owner can't have
  // queued its own pending save yet. pendingSaveRef still holds the old owner's
  // edit because the render-time reset above no longer nulls it.
  useLayoutEffect(() => {
    void flushPendingSave();
  }, [currentOwnerKey, flushPendingSave]);

  // Flush on unmount
  useEffect(() => {
    return () => { void flushPendingSave(); };
  }, [flushPendingSave]);

  // Drain the 300ms debounce into the save queue when the app is quitting (H2),
  // otherwise the last canvas edit sits in this timer past every quit path.
  useEffect(() => registerPendingFlusher(flushPendingSave), [flushPendingSave]);

  return { flushPendingSave, handleCurrentDocumentChange };
}
