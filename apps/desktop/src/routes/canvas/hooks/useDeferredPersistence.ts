import { useCallback, useEffect, useRef } from "react";
import { htmlGraphJSONFromCanvasDocument } from "@/lib/editor/htmlSceneAdapter";
import { saveScene } from "@/application/scenes/saveScene";
import { materializeComponentsFromCanvasDocument } from "../canvasMaterializer";
import { componentStructureKey } from "../canvasUtils";
import type { CanvasDocument } from "@/lib/editor/types";
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
}: Params) {
  const saveTimerRef = useRef<number | null>(null);
  const latestGraphJSONRef = useRef<string | null>(resolvedSceneGraphJSON);
  const latestOwnerKeyRef = useRef<string>(currentOwnerKey);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const skipInitialSaveRef = useRef(true);
  const materializedStructureKeyRef = useRef<string | null>(null);

  // Reset refs synchronously when the canvas owner changes (runs during render)
  if (latestOwnerKeyRef.current !== currentOwnerKey) {
    latestOwnerKeyRef.current = currentOwnerKey;
    latestGraphJSONRef.current = resolvedSceneGraphJSON;
    pendingSaveRef.current = null;
    skipInitialSaveRef.current = true;
  }

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

    return saveScene({ ownerType: pending.ownerType, ownerId: pending.ownerId, graphJSON }).then(() =>
      materializeComponentsFromCanvasDocument({
        currentComponent: pending.currentComponent,
        document: pending.document,
        projectComponents: pending.projectComponents,
        projectId: pending.projectId,
        screen: pending.screen,
      }),
    );
  }, []);

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
    void saveScene({
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

  // Flush on unmount
  useEffect(() => {
    return () => { void flushPendingSave(); };
  }, [flushPendingSave]);

  return { flushPendingSave, handleCurrentDocumentChange };
}
