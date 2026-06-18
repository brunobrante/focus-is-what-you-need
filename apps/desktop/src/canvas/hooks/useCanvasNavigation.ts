import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  componentNamePathFromDocument,
  componentPathFromRoot,
  findComponentByCanvasNode,
  findComponentByPath,
} from "../canvasUtils";
import { materializeComponentFromCanvasNode } from "../canvasMaterializer";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import type { ProjectTreeNode } from "@/canvas/shell/Tree";

interface Params {
  component: ComponentRow | null;
  canUseFactoryMocks: boolean;
  currentDocument: CanvasDocument;
  projectComponents: ComponentRow[];
  screen: ScreenRow | null;
  variants: VariantRow[];
  projectId: string;
  projectType: string;
  flushPendingSave: () => Promise<void>;
}

export function useCanvasNavigation({
  component,
  canUseFactoryMocks,
  currentDocument,
  projectComponents,
  screen,
  variants,
  projectId,
  projectType,
  flushPendingSave,
}: Params) {
  const navigate = useNavigate();

  const openCanvasForComponent = useCallback(
    (target: ComponentRow | null | undefined) => {
      if (!target) return;
      void flushPendingSave().finally(() => {
        navigate(
          `/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&variant=${target.activeVariantId}`,
        );
      });
    },
    [flushPendingSave, navigate, projectId, projectType],
  );

  const canvasNodeToComponent = useCallback(
    (nodeId: string): ComponentRow | null => {
      const bySourceNode = findComponentByCanvasNode({
        currentComponent: component,
        document: currentDocument,
        nodeId,
        projectComponents,
        screen,
      });
      if (bySourceNode) return bySourceNode;
      if (!canUseFactoryMocks) return null;

      const nodePath = componentNamePathFromDocument(currentDocument, nodeId);
      if (nodePath.length === 0) return null;

      if (component) {
        const currentPath = componentPathFromRoot(component, projectComponents, variants);
        if (!currentPath?.screenId) return null;
        return findComponentByPath(projectComponents, currentPath.screenId, [
          ...currentPath.names,
          ...nodePath,
        ]);
      }

      if (!screen?.id) return null;
      return findComponentByPath(projectComponents, screen.id, nodePath);
    },
    [canUseFactoryMocks, component, currentDocument, projectComponents, screen, variants],
  );

  const canOpenCanvasNode = useCallback(
    (nodeId: string): boolean => Boolean(currentDocument.elements[nodeId]?.children.length),
    [currentDocument],
  );

  const openCanvasForNode = useCallback(
    (nodeId: string) => {
      void (async () => {
        const existing = canvasNodeToComponent(nodeId);
        if (existing) {
          openCanvasForComponent(existing);
          return;
        }
        const materialized = await materializeComponentFromCanvasNode({
          currentComponent: component,
          document: currentDocument,
          nodeId,
          projectComponents,
          projectId: projectId || null,
          screen,
          variants,
        });
        openCanvasForComponent(materialized);
      })();
    },
    [
      canvasNodeToComponent,
      component,
      currentDocument,
      openCanvasForComponent,
      projectComponents,
      projectId,
      screen,
      variants,
    ],
  );

  const openProjectNodeCanvas = useCallback(
    (node: ProjectTreeNode) => {
      if (node.kind === "screen") {
        void flushPendingSave().finally(() => {
          navigate(
            `/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&screen=${node.id}`,
          );
        });
        return;
      }
      openCanvasForComponent(projectComponents.find((c) => c.id === node.id));
    },
    [flushPendingSave, navigate, openCanvasForComponent, projectComponents, projectId, projectType],
  );

  return {
    canvasNodeToComponent,
    canOpenCanvasNode,
    openCanvasForComponent,
    openCanvasForNode,
    openProjectNodeCanvas,
  };
}
