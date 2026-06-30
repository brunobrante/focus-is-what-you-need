import { useCallback, useState } from "react";

import type {
  SavedComponent,
  PendingConfirmation,
  ViewMode,
  EditorTool,
  NewScreenSource,
  ToolReference,
} from "../types";
import { newRootComponentId } from "../engine/componentModel";
import { componentSubtreeIds } from "../engine/componentTree";

/**
 * Builder navigation + confirmation orchestration.
 *
 * Owns the `pendingConfirmation` state and every "open / select / create /
 * promote / reset / delete" callback. It does not own any of the canvas state
 * it mutates — the root forwards the relevant setters and derived values in,
 * so the returned callbacks are identical in behavior to their previous inline
 * definitions.
 */
export function useBuilderNavigation({
  item,
  rootComponentId,
  canCrop,
  viewMode,
  components,
  roots,
  activeScopeId,
  cutCountByRoot,
  stackedComponentsLength,
  selectedComponentId,
  selectedComponent,
  setCurrentTool,
  setViewMode,
  setSelectedComponentId,
  setActiveRootId,
  setEditingComponentId,
  setExpandedComponentIds,
  cancelSelection,
  cancelPendingPersist,
  resetToolViewport,
  expandComponentPath,
  selectStackComponent,
  updateComponents,
}: {
  item: ToolReference;
  rootComponentId: string;
  canCrop: boolean;
  viewMode: ViewMode;
  components: SavedComponent[];
  roots: SavedComponent[];
  activeScopeId: string;
  cutCountByRoot: Map<string, number>;
  stackedComponentsLength: number;
  selectedComponentId: string | null;
  selectedComponent: SavedComponent | null;
  setCurrentTool: React.Dispatch<React.SetStateAction<EditorTool>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setSelectedComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveRootId: React.Dispatch<React.SetStateAction<string>>;
  setEditingComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedComponentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  cancelSelection: () => void;
  cancelPendingPersist: () => void;
  resetToolViewport: () => void;
  expandComponentPath: (id: string) => void;
  selectStackComponent: (id: string) => void;
  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
}) {
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const setTool = useCallback(
    (tool: EditorTool) => {
      if ((tool === "crop" || tool === "draw" || tool === "pen") && !canCrop) {
        setCurrentTool("move");
        cancelSelection();
        return;
      }
      setCurrentTool(tool);
      if (tool === "move") cancelSelection();
    },
    [canCrop, cancelSelection, setCurrentTool],
  );

  const openOriginal = useCallback(() => {
    cancelSelection();
    setSelectedComponentId(null);
    setViewMode("original");
    setCurrentTool("move");
    resetToolViewport();
  }, [cancelSelection, resetToolViewport, setCurrentTool, setSelectedComponentId, setViewMode]);

  const openStackMode = useCallback(() => {
    if (stackedComponentsLength === 0) return;
    cancelSelection();
    setCurrentTool("move");
    resetToolViewport();
    setViewMode("stack");
  }, [cancelSelection, resetToolViewport, setCurrentTool, setViewMode, stackedComponentsLength]);

  const openGalleryMode = useCallback(() => {
    cancelSelection();
    setViewMode("gallery");
  }, [cancelSelection, setViewMode]);

  const focusGalleryCut = useCallback(
    (id: string | null) => {
      setSelectedComponentId(id);
    },
    [setSelectedComponentId],
  );

  const openComponent = useCallback(
    (id: string) => {
      const component = components.find((c) => c.id === id);
      const rid = component
        ? component.parentId == null
          ? component.id
          : component.rootId ?? rootComponentId
        : rootComponentId;
      cancelSelection();
      expandComponentPath(id);
      setActiveRootId(rid);
      setSelectedComponentId(id);
      setViewMode("component");
      resetToolViewport();
    },
    [
      cancelSelection,
      components,
      expandComponentPath,
      resetToolViewport,
      rootComponentId,
      setActiveRootId,
      setSelectedComponentId,
      setViewMode,
    ],
  );

  const openBuilderMode = useCallback(() => {
    // Carry the currently focused subject (e.g. the cut shown in the gallery)
    // straight into the Builder so it renders the same item, scoped to its root.
    if (selectedComponentId && selectedComponent) {
      openComponent(selectedComponentId);
      return;
    }
    cancelSelection();
    setCurrentTool("move");
    resetToolViewport();
    setViewMode("original");
  }, [
    cancelSelection,
    openComponent,
    resetToolViewport,
    selectedComponent,
    selectedComponentId,
    setCurrentTool,
    setViewMode,
  ]);

  const selectRoot = useCallback(
    (id: string) => {
      const keepStack = viewMode === "stack" && (cutCountByRoot.get(id) ?? 0) > 0;
      openComponent(id);
      if (keepStack) setViewMode("stack");
    },
    [cutCountByRoot, openComponent, viewMode, setViewMode],
  );

  const setPrimaryRoot = useCallback(
    (id: string) => {
      updateComponents((current) =>
        current.map((c) =>
          c.parentId == null ? { ...c, isPrimaryRoot: c.id === id } : c,
        ),
      );
    },
    [updateComponents],
  );

  const beginRootCreation = useCallback(
    (source?: NewScreenSource) => {
      const src: NewScreenSource = source ?? {
        url: item.url,
        w: item.w,
        h: item.h,
        type: item.type,
        name: item.name,
      };
      const id = newRootComponentId();
      const newRoot: SavedComponent = {
        id,
        name: "New screen",
        box: { x: 0, y: 0, w: src.w || 0, h: src.h || 0 },
        dataUrl: src.url,
        type: src.type || "IMG",
        createdAt: new Date().toISOString(),
        parentId: null,
        kind: "root",
        rootId: id,
        isDefaultRoot: false,
      };
      cancelSelection();
      updateComponents((current) => [...current, newRoot]);
      setActiveRootId(id);
      setSelectedComponentId(id);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      setViewMode("component");
      setCurrentTool("crop");
      resetToolViewport();
    },
    [
      cancelSelection,
      item,
      resetToolViewport,
      setActiveRootId,
      setCurrentTool,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      updateComponents,
    ],
  );

  const promoteToRoot = useCallback(
    (id: string) => {
      const section = components.find((c) => c.id === id);
      if (!section || section.parentId == null) return;
      const targetRootId = section.rootId ?? activeScopeId ?? rootComponentId;
      const subtree = componentSubtreeIds(components, id);
      updateComponents((current) =>
        current
          .filter((c) => {
            const inTargetRoot = (c.rootId ?? null) === targetRootId && c.id !== targetRootId;
            return !inTargetRoot || subtree.has(c.id);
          })
          .map((c): SavedComponent | null => {
            if (c.id === targetRootId) {
              return {
                ...c,
                name: section.name,
                box: section.box,
                dataUrl: section.dataUrl,
                type: section.type || "PNG",
                parentId: null,
                kind: "root",
                rootId: targetRootId,
                isDefaultRoot: false,
              };
            }
            if (c.id === id) return null;
            if (subtree.has(c.id)) {
              return {
                ...c,
                parentId: c.parentId === id ? targetRootId : c.parentId,
                rootId: targetRootId,
              };
            }
            return c;
          })
          .filter((c): c is SavedComponent => c != null),
      );
      cancelSelection();
      setEditingComponentId(null);
      setActiveRootId(targetRootId);
      setSelectedComponentId(targetRootId);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(targetRootId);
        return next;
      });
      setViewMode("component");
      resetToolViewport();
    },
    [
      activeScopeId,
      cancelSelection,
      components,
      resetToolViewport,
      rootComponentId,
      setActiveRootId,
      setEditingComponentId,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      updateComponents,
    ],
  );

  const startEditComponent = useCallback(
    (id: string) => {
      const component = components.find((c) => c.id === id);
      if (!component || component.parentId == null) return;
      const parentId = component.parentId;
      cancelSelection();
      expandComponentPath(parentId);
      setActiveRootId(component.rootId ?? rootComponentId);
      setSelectedComponentId(parentId);
      setViewMode("component");
      resetToolViewport();
      setEditingComponentId(id);
      setCurrentTool("crop");
    },
    [
      cancelSelection,
      components,
      expandComponentPath,
      resetToolViewport,
      rootComponentId,
      setActiveRootId,
      setCurrentTool,
      setEditingComponentId,
      setSelectedComponentId,
      setViewMode,
    ],
  );

  const resetActiveStack = useCallback(() => {
    cancelPendingPersist();
    const stackId = activeScopeId;
    const isDefault = stackId === rootComponentId;
    updateComponents((current) =>
      current
        .filter((c) => {
          const belongsToStack = (c.rootId ?? null) === stackId && c.id !== stackId;
          return !belongsToStack;
        })
        .map((c): SavedComponent =>
          c.id === stackId
            ? {
                ...c,
                name: isDefault ? "root" : c.name,
                box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
                dataUrl: item.url,
                type: item.type || "IMG",
                parentId: null,
                kind: "root",
                rootId: stackId,
                isDefaultRoot: isDefault,
              }
            : c,
        ),
    );
    setActiveRootId(stackId);
    setExpandedComponentIds(new Set([stackId]));
    setSelectedComponentId(isDefault ? null : stackId);
    setCurrentTool("move");
    setViewMode(isDefault ? "original" : "component");
    cancelSelection();
    resetToolViewport();
  }, [
    activeScopeId,
    cancelPendingPersist,
    cancelSelection,
    item,
    resetToolViewport,
    rootComponentId,
    setActiveRootId,
    setCurrentTool,
    setExpandedComponentIds,
    setSelectedComponentId,
    setViewMode,
    updateComponents,
  ]);

  const openTreeComponent = useCallback(
    (id: string) => {
      if (viewMode === "stack") {
        selectStackComponent(id);
        return;
      }
      openComponent(id);
    },
    [openComponent, selectStackComponent, viewMode],
  );

  const removeRoot = useCallback(
    (id: string) => {
      const removedIds = componentSubtreeIds(components, id);
      const wasActive = removedIds.has(activeScopeId);
      const nextRoot = wasActive ? roots.find((r) => !removedIds.has(r.id)) : undefined;
      updateComponents((current) => current.filter((c) => !removedIds.has(c.id)));
      if (!wasActive) return;
      if (nextRoot) {
        openComponent(nextRoot.id);
      } else {
        setActiveRootId(rootComponentId);
        openOriginal();
      }
    },
    [
      activeScopeId,
      components,
      openComponent,
      openOriginal,
      roots,
      rootComponentId,
      setActiveRootId,
      updateComponents,
    ],
  );

  const requestRootDeletion = useCallback(
    (id: string) => {
      const root = components.find((c) => c.id === id);
      if (!root) return;
      setPendingConfirmation({
        type: "delete-root",
        rootId: id,
        name: root.isDefaultRoot ? "Full image" : root.name,
        cutCount: cutCountByRoot.get(id) ?? 0,
      });
    },
    [components, cutCountByRoot],
  );

  const requestResetConfirmation = useCallback(() => {
    setPendingConfirmation({ type: "reset" });
  }, []);

  const confirmPendingAction = useCallback(() => {
    if (!pendingConfirmation) return;
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (action.type === "delete-root") {
      removeRoot(action.rootId);
      return;
    }
    resetActiveStack();
  }, [pendingConfirmation, removeRoot, resetActiveStack]);

  return {
    pendingConfirmation,
    setPendingConfirmation,
    setTool,
    openOriginal,
    openStackMode,
    openGalleryMode,
    focusGalleryCut,
    openComponent,
    openBuilderMode,
    selectRoot,
    setPrimaryRoot,
    beginRootCreation,
    promoteToRoot,
    startEditComponent,
    resetActiveStack,
    openTreeComponent,
    requestRootDeletion,
    requestResetConfirmation,
    confirmPendingAction,
  };
}
