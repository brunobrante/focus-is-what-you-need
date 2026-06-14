import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentState, SavedComponent, SidebarTab, ToolReference } from "../types";
import { COMPONENT_STORAGE_PREFIX } from "../types";
import {
  buildComponentTree,
  componentAncestorIds,
  flattenComponentTree,
} from "../engine/componentTree";
import {
  createRootComponent,
  ensureRootComponent,
  sourceRootComponentId,
} from "../engine/componentModel";
import {
  hasDraftComponents,
  readSavedComponents,
  writeDraftComponents,
  writeSavedComponents,
} from "../engine/storage";

export type BuilderComponentsInput = {
  item: ToolReference;
  referenceId: string | null;
  componentKey: string;
  rootComponentId: string;
  selectedComponentId: string | null;
};

export type BuilderComponentsState = {
  componentState: ComponentState;
  setComponentState: React.Dispatch<React.SetStateAction<ComponentState>>;
  components: SavedComponent[];
  selectedComponent: SavedComponent | null;
  rootComponent: SavedComponent;

  activeRootId: string;
  setActiveRootId: React.Dispatch<React.SetStateAction<string>>;
  expandedComponentIds: Set<string>;
  setExpandedComponentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  sidebarTab: SidebarTab;
  setSidebarTab: React.Dispatch<React.SetStateAction<SidebarTab>>;

  roots: SavedComponent[];
  activeScopeId: string;
  activeRoot: SavedComponent;
  componentTree: ReturnType<typeof buildComponentTree>;
  scopedComponents: SavedComponent[];
  stackedComponents: SavedComponent[];
  cutCountByRoot: Map<string, number>;

  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
  flushPendingPersist: () => void;
  cancelPendingPersist: () => void;
  schedulePersist: (items: SavedComponent[], isDraft: boolean) => void;

  expandComponentPath: (id: string) => void;
  toggleComponentExpanded: (id: string) => void;
  expandAllComponents: () => void;
  collapseAllComponents: () => void;
};

export function useBuilderComponents({
  item,
  referenceId,
  componentKey,
  rootComponentId,
  selectedComponentId,
}: BuilderComponentsInput): BuilderComponentsState {
  const [componentState, setComponentState] = useState<ComponentState>(() => ({
    key: componentKey,
    items: ensureRootComponent(
      referenceId && item.id === referenceId && !hasDraftComponents(componentKey)
        ? []
        : readSavedComponents(componentKey),
      item,
    ),
  }));
  const [activeRootId, setActiveRootId] = useState(rootComponentId);
  const [expandedComponentIds, setExpandedComponentIds] = useState<Set<string>>(
    () => new Set([rootComponentId]),
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("components");

  // --- Persistence ---------------------------------------------------------

  const persistTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<{ items: SavedComponent[]; isDraft: boolean } | null>(null);

  const flushPendingPersist = useCallback(() => {
    if (persistTimerRef.current != null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    if (pending.isDraft) {
      writeDraftComponents(componentKey, pending.items);
    } else {
      writeSavedComponents(componentKey, pending.items);
    }
  }, [componentKey]);

  const cancelPendingPersist = useCallback(() => {
    if (persistTimerRef.current != null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  }, []);

  const schedulePersist = useCallback(
    (items: SavedComponent[], isDraft: boolean) => {
      pendingPersistRef.current = { items, isDraft };
      if (persistTimerRef.current != null) return;
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        flushPendingPersist();
      }, 250);
    },
    [flushPendingPersist],
  );

  // Flush any queued write before unmount so edits are never dropped.
  useEffect(() => flushPendingPersist, [flushPendingPersist]);

  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setComponentState((current) => {
        const base =
          current.key === componentKey
            ? current.items
            : ensureRootComponent(readSavedComponents(componentKey), item);
        const next = ensureRootComponent(updater(base), item);
        schedulePersist(next, Boolean(referenceId && item.id === referenceId));
        return { key: componentKey, items: next };
      });
    },
    [componentKey, item, referenceId, schedulePersist],
  );

  // --- Derivations ---------------------------------------------------------

  const components =
    componentState.key === componentKey
      ? componentState.items
      : ensureRootComponent(readSavedComponents(componentKey), item);

  const selectedComponent = components.find((c) => c.id === selectedComponentId) ?? null;
  const rootComponent = components.find((c) => c.id === rootComponentId) ?? createRootComponent(item);

  const roots = useMemo(() => {
    const list = components.filter((c) => c.parentId == null);
    return list.sort((a, b) => {
      if (a.isDefaultRoot && !b.isDefaultRoot) return -1;
      if (!a.isDefaultRoot && b.isDefaultRoot) return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [components]);

  const activeScopeId = components.some((c) => c.id === activeRootId)
    ? activeRootId
    : rootComponentId;

  const activeRoot = components.find((c) => c.id === activeScopeId) ?? rootComponent;

  const componentTree = useMemo(
    () => buildComponentTree(components, activeScopeId),
    [components, activeScopeId],
  );

  const scopedComponents = useMemo(() => flattenComponentTree(componentTree), [componentTree]);

  const stackedComponents = useMemo(
    () => scopedComponents.filter((c) => c.id !== activeScopeId),
    [activeScopeId, scopedComponents],
  );

  const cutCountByRoot = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of components) {
      if (c.parentId == null) continue;
      const rid = c.rootId ?? rootComponentId;
      counts.set(rid, (counts.get(rid) ?? 0) + 1);
    }
    return counts;
  }, [components, rootComponentId]);

  // --- Expand helpers ------------------------------------------------------

  const expandComponentPath = useCallback(
    (id: string) => {
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(id);
        for (const ancestorId of componentAncestorIds(components, id)) {
          next.add(ancestorId);
        }
        return next;
      });
    },
    [components],
  );

  const toggleComponentExpanded = useCallback((id: string) => {
    setExpandedComponentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAllComponents = useCallback(() => {
    setExpandedComponentIds(new Set(components.map((c) => c.id)));
  }, [components]);

  const collapseAllComponents = useCallback(() => {
    setExpandedComponentIds(new Set());
  }, []);

  return {
    componentState,
    setComponentState,
    components,
    selectedComponent,
    rootComponent,
    activeRootId,
    setActiveRootId,
    expandedComponentIds,
    setExpandedComponentIds,
    sidebarTab,
    setSidebarTab,
    roots,
    activeScopeId,
    activeRoot,
    componentTree,
    scopedComponents,
    stackedComponents,
    cutCountByRoot,
    updateComponents,
    flushPendingPersist,
    cancelPendingPersist,
    schedulePersist,
    expandComponentPath,
    toggleComponentExpanded,
    expandAllComponents,
    collapseAllComponents,
  };
}
