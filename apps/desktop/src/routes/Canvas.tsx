import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Toolbar } from "@/components/canvas/Toolbar";
import { Inspector } from "@/components/canvas/Inspector";
import { Tree, TreeToggle, type ProjectTreeNode } from "@/components/canvas/Tree";
import { FloatingToggle } from "@/components/canvas/GalleryPanel";
// import { GalleryPanel, GalleryToggle } from "@/components/canvas/GalleryPanel";
// import { Chat } from "@/components/canvas/Chat";
import { SearchPalette, SearchToggle } from "@/components/canvas/SearchPalette";
import { CanvasRender, type ZoomSetter } from "@/components/canvas/CanvasRender";
import {
  getCanvasMockBundleForScreen,
  type MockComponentSeed,
} from "@/components/mocks/data/canvasMocks";
import { EditorBridgeProvider, useEditorBridge } from "@/lib/editor/bridge";
import { createBlankDocument, moveElementBefore, setElementLocked, setElementVisible, wrapElements } from "@/lib/editor/actions";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/lib/editor/htmlSceneAdapter";
import type { CanvasDocument } from "@/lib/editor/types";
import {
  useComponent,
  useComponentsByProject,
  useProject,
  useProjectByName,
  useScene,
  useScreen,
  useScreenByTitle,
  useScreens,
  useVariant,
} from "@/lib/storage/hooks";
import {
  createComponent,
  findComponentByName,
  findComponentBySourceNode,
  updateComponent,
} from "@/lib/storage/repos/components.repo";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type { ComponentRow, SceneOwnerType, ScreenRow } from "@/lib/storage/schema";
import type { CanvasToolId } from "@/lib/canvas/tools";
import type { ProjectType } from "@/lib/data/types";

export type SplitMode = "none" | "vertical" | "horizontal";

export function CanvasPage() {
  return (
    <EditorBridgeProvider>
      <CanvasPageContent />
    </EditorBridgeProvider>
  );
}

function CanvasPageContent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const projectIdParam = params.get("project") || params.get("projectId") || "";
  const legacyProjectName = params.get("name") || "";
  const queryProjectType = normalizeProjectType(params.get("type"));
  const screenParam = params.get("screen") || "";
  const variantParam = params.get("variant") || "";
  const componentParam = params.get("component") || "";
  const legacyElementName = params.get("element") || "";

  const { data: projectById, loading: projectByIdLoading } = useProject(projectIdParam || null);
  const { data: legacyProject, loading: legacyProjectLoading } = useProjectByName(
    projectById ? null : legacyProjectName || null,
  );
  const project = projectById ?? legacyProject;
  const projectLoading = projectByIdLoading || (!projectById && Boolean(legacyProjectName) && legacyProjectLoading);
  const { data: screenById, loading: screenByIdLoading } = useScreen(screenParam || null);
  const { data: screenByTitle, loading: screenByTitleLoading } = useScreenByTitle(
    project?.id ?? null,
    screenById ? null : screenParam || null,
  );
  const { data: projectScreens, loading: projectScreensLoading } = useScreens(project?.id ?? null);
  const { data: projectComponents, loading: projectComponentsLoading } = useComponentsByProject(project?.id ?? null);
  const resolvedScreen = screenById ?? screenByTitle;
  const screen =
    resolvedScreen && project?.id && resolvedScreen.projectId !== project.id
      ? null
      : resolvedScreen;
  const screenLoading = screenByIdLoading || (!screenById && Boolean(screenParam) && screenByTitleLoading);
  const legacyComponent = useMemo(() => {
    if (!screen?.id || !componentParam) return null;
    const path = legacyElementName
      ? [componentParam, legacyElementName]
      : [componentParam];
    return findComponentByPath(projectComponents, screen.id, path);
  }, [componentParam, legacyElementName, projectComponents, screen?.id]);
  const { data: componentById, loading: componentByIdLoading } = useComponent(
    !variantParam && componentParam ? componentParam : null,
  );
  const activeVariantId = variantParam || componentById?.activeVariantId || legacyComponent?.activeVariantId || "";
  const { data: variant, loading: variantLoading } = useVariant(activeVariantId || null);
  const { data: loadedComponent, loading: loadedComponentLoading } = useComponent(variant?.componentId ?? null);
  const component = loadedComponent ?? componentById ?? legacyComponent;
  const componentLoading =
    loadedComponentLoading ||
    componentByIdLoading ||
    Boolean(componentParam && projectComponentsLoading);
  const projectType = project?.type ?? queryProjectType;
  const projectId = project?.id ?? projectIdParam;
  const projectName = project?.name ?? (legacyProjectName || "Projeto sem título");
  const canUseFactoryMocks = project?.source === "mock";
  const currentMockTargetKey = useMemo(
    () =>
      mockTargetKey({
        canUseFactoryMocks,
        component,
        projectType,
        screen,
        projectComponents,
        projectScreens,
      }),
    [canUseFactoryMocks, component, projectComponents, projectScreens, projectType, screen],
  );
  const sceneOwner = useMemo<{
    ownerType: SceneOwnerType;
    ownerId: string;
  } | null>(() => {
    if (variant?.id) return { ownerType: "variant", ownerId: variant.id };
    if (legacyComponent?.activeVariantId) return { ownerType: "variant", ownerId: legacyComponent.activeVariantId };
    if (screen?.id) return { ownerType: "screen", ownerId: screen.id };
    return null;
  }, [legacyComponent?.activeVariantId, screen?.id, variant?.id]);
  const { data: scene, loading: sceneLoading } = useScene(sceneOwner?.ownerType, sceneOwner?.ownerId);
  const [mockScene, setMockScene] = useState<{
    key: string;
    graphJSON: string | null;
    loading: boolean;
  }>({ key: "none", graphJSON: null, loading: false });

  // const [galleryOpen, setGalleryOpen] = useState(true);
  // const [chatOpen, setChatOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<CanvasToolId>("cursor");
  const [activeTab, setActiveTab] = useState<"current" | "drafts">("current");
  const [treeTab, setTreeTab] = useState<"layers" | "drafts">("layers");
  const [split, setSplit] = useState<SplitMode>("none");
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const editor = useEditorBridge();

  const handleToolChange = useCallback((tool: CanvasToolId) => {
    if (tool === "wrapper" && editor && editor.state.selectedIds.length > 0) {
      const { document: next, wrapperId } = wrapElements(editor.state.document, editor.state.selectedIds);
      editor.dispatch({
        type: "commitDocument",
        document: next,
        selectedIds: wrapperId ? [wrapperId] : [],
      });
      return;
    }
    setActiveTool(tool);
  }, [editor]);

  const editorTool = editor?.state.tool;
  useEffect(() => {
    if (editorTool === "select") {
      setActiveTool((prev) => (prev === "cursor" || prev === "hand") ? prev : "cursor");
    }
  }, [editorTool]);

  const editorState = editor?.state ?? null;
  const selectedNodeId =
    editorState && !editorState.canvasStageActive ? editorState.selectedIds[0] ?? null : null;
  const activeZoom = editorState?.zoom;
  const setActiveZoom: ZoomSetter = (next) => {
    if (!editor) return;
    const zoom = typeof next === "function" ? next(editor.state.zoom) : next;
    editor.dispatch({ type: "setZoom", zoom });
  };

  const screenTitle = screen?.title ?? "";
  const componentName = component?.name ?? "";
  const currentCanvasName = componentName || screenTitle || projectName || "Canvas";
  const currentSceneGraphJSON = scene?.graphJSON ?? null;
  const currentOwnerKey = sceneOwner
    ? `${sceneOwner.ownerType}:${sceneOwner.ownerId}`
    : "detached";
  const currentStorageKey = sceneOwner
    ? `desktop-canvas-editor:${sceneOwner.ownerType}:${sceneOwner.ownerId}:v1`
    : "desktop-canvas-editor:detached:v1";
  const effectiveSceneGraphJSON =
    !canUseFactoryMocks && isFactoryMockGraphJSON(currentSceneGraphJSON)
      ? null
      : currentSceneGraphJSON;
  const resolvedSceneGraphJSON = useMemo(() => {
    if (
      mockScene.graphJSON &&
      shouldUseMockGraph({
        persistedGraphJSON: effectiveSceneGraphJSON,
        mockGraphJSON: mockScene.graphJSON,
        projectType,
        targetKind: component ? "variant" : "screen",
      })
    ) {
      return mockScene.graphJSON;
    }
    return effectiveSceneGraphJSON;
  }, [component, effectiveSceneGraphJSON, mockScene.graphJSON, projectType]);
  const currentDocument = useMemo<CanvasDocument>(() => {
    const fromScene = canvasDocumentFromHtmlGraphJSON(resolvedSceneGraphJSON, {
      promoteSubjectRoot: true,
    });
    return fromScene ?? createBlankDocumentForProjectType(projectType);
  }, [component, projectType, resolvedSceneGraphJSON]);
  const entityLoading =
    projectLoading ||
    Boolean(screenParam && screenLoading) ||
    Boolean(componentParam && projectComponentsLoading) ||
    Boolean(activeVariantId && variantLoading) ||
    Boolean(variant?.componentId && componentLoading) ||
    Boolean(component && (projectComponentsLoading || projectScreensLoading));
  const currentReady =
    (!sceneOwner || !sceneLoading) &&
    !entityLoading &&
    !mockScene.loading &&
    mockScene.key === currentMockTargetKey;
  const projectTree = useMemo(
    () => buildProjectTree(projectScreens, projectComponents),
    [projectComponents, projectScreens],
  );
  const parentProjectNode = useMemo<ProjectTreeNode | null>(() => {
    if (!component) return null;
    // Top-level component: parent is its screen
    if (!component.parentVariantId && component.screenId) {
      return projectTree.find((node) => node.id === component.screenId) ?? null;
    }
    // Nested component: parent is the component whose activeVariantId matches parentVariantId
    if (component.parentVariantId) {
      const parentComponent = projectComponents.find(
        (c) => c.activeVariantId === component.parentVariantId,
      );
      if (!parentComponent) return null;
      return findTreeNodeById(projectTree, parentComponent.id);
    }
    return null;
  }, [component, projectComponents, projectTree]);
  const saveTimerRef = useRef<number | null>(null);
  const latestGraphJSONRef = useRef<string | null>(currentSceneGraphJSON);
  const latestOwnerKeyRef = useRef<string>(currentOwnerKey);
  const pendingSaveRef = useRef<{
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
  } | null>(null);
  const skipInitialSaveRef = useRef(true);
  const materializedStructureKeyRef = useRef<string | null>(null);
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
    return upsertScene({
      ownerType: pending.ownerType,
      ownerId: pending.ownerId,
      graphJSON,
    }).then(() =>
      materializeComponentsFromCanvasDocument({
        currentComponent: pending.currentComponent,
        document: pending.document,
        projectComponents: pending.projectComponents,
        projectId: pending.projectId,
        screen: pending.screen,
      }),
    );
  }, []);
  const canvasNodeToComponent = useCallback((nodeId: string): ComponentRow | null => {
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
      const currentPath = componentPathFromRoot(component, projectComponents);
      if (!currentPath?.screenId) return null;
      return findComponentByPath(
        projectComponents,
        currentPath.screenId,
        [...currentPath.names, ...nodePath],
      );
    }

    if (!screen?.id) return null;
    return findComponentByPath(projectComponents, screen.id, nodePath);
  }, [canUseFactoryMocks, component, currentDocument, projectComponents, screen]);
  const canOpenCanvasNode = useCallback((nodeId: string): boolean => {
    return Boolean(currentDocument.elements[nodeId]?.children.length);
  }, [currentDocument]);
  const openCanvasForComponent = useCallback((target: ComponentRow | null | undefined) => {
    if (!target) return;
    void flushPendingSave().finally(() => {
      navigate(
        `/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&variant=${target.activeVariantId}`,
      );
    });
  }, [flushPendingSave, navigate, projectId, projectType]);
  const openCanvasForNode = useCallback((nodeId: string) => {
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
        projectId: project?.id ?? null,
        screen,
      });
      openCanvasForComponent(materialized);
    })();
  }, [
    canvasNodeToComponent,
    component,
    currentDocument,
    openCanvasForComponent,
    project?.id,
    projectComponents,
    screen,
  ]);
  const openProjectNodeCanvas = useCallback((node: ProjectTreeNode) => {
    if (node.kind === "screen") {
      void flushPendingSave().finally(() => {
        navigate(
          `/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&screen=${node.id}`,
        );
      });
      return;
    }
    openCanvasForComponent(projectComponents.find((componentRow) => componentRow.id === node.id));
  }, [flushPendingSave, navigate, openCanvasForComponent, projectComponents, projectId, projectType]);

  useEffect(() => {
    latestGraphJSONRef.current = resolvedSceneGraphJSON;
  }, [resolvedSceneGraphJSON]);

  useEffect(() => {
    const key = currentMockTargetKey;
    let cancelled = false;

    if (!screen && !component) {
      setMockScene({ key: "none", graphJSON: null, loading: false });
      return () => {
        cancelled = true;
      };
    }

    if (component && (projectComponentsLoading || projectScreensLoading)) {
      setMockScene({ key, graphJSON: null, loading: true });
      return () => {
        cancelled = true;
      };
    }

    setMockScene((previous) => ({
      key,
      graphJSON: previous.key === key ? previous.graphJSON : null,
      loading: true,
    }));

    void resolveMockGraphJSON({
        component,
        canUseFactoryMocks,
        projectType,
        screen,
        projectComponents,
        projectScreens,
    }).then((graphJSON) => {
      if (cancelled) return;
      setMockScene({ key, graphJSON, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [
    component,
    canUseFactoryMocks,
    currentMockTargetKey,
    projectComponents,
    projectComponentsLoading,
    projectScreens,
    projectScreensLoading,
    projectType,
    screen,
  ]);

  useEffect(() => {
    if (!sceneOwner || !currentReady || !resolvedSceneGraphJSON) return;
    if (resolvedSceneGraphJSON === effectiveSceneGraphJSON) return;
    void upsertScene({
      ownerType: sceneOwner.ownerType,
      ownerId: sceneOwner.ownerId,
      graphJSON: resolvedSceneGraphJSON,
    });
  }, [currentReady, effectiveSceneGraphJSON, resolvedSceneGraphJSON, sceneOwner]);

  useEffect(() => {
    if (!sceneOwner || !currentReady || !project?.id || canUseFactoryMocks) return;
    const structureKey = `${currentOwnerKey}:${componentStructureKey(currentDocument)}`;
    if (materializedStructureKeyRef.current === structureKey) return;
    materializedStructureKeyRef.current = structureKey;

    void materializeComponentsFromCanvasDocument({
      currentComponent: component,
      document: currentDocument,
      projectComponents,
      projectId: project.id,
      screen,
    });
  }, [
    canUseFactoryMocks,
    component,
    currentDocument,
    currentOwnerKey,
    currentReady,
    project?.id,
    projectComponents,
    sceneOwner,
    screen,
  ]);

  useEffect(() => {
    return () => {
      void flushPendingSave();
    };
  }, [flushPendingSave]);

  const handleCurrentDocumentChange = useCallback((document: CanvasDocument) => {
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
      projectId: project?.id ?? null,
      screen,
    };
    saveTimerRef.current = window.setTimeout(() => {
      void flushPendingSave();
    }, 300);
  }, [
    component,
    currentCanvasName,
    currentOwnerKey,
    currentReady,
    flushPendingSave,
    project?.id,
    projectComponents,
    sceneOwner,
    screen,
  ]);

  const backHref =
    component
      ? `/project/${encodeURIComponent(projectId)}/c/${component.id}`
      : screen
        ? `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`
        : projectId
          ? `/project/${encodeURIComponent(projectId)}`
          : "/";

  const changeCanvasTab = (tab: "current" | "drafts") => {
    setActiveTab(tab);
    setTreeTab(tab === "drafts" ? "drafts" : "layers");
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg)]">
      {/* Canvas render window */}
      <CanvasRender
        treeOpen={treeOpen}
        inspectorOpen={inspectorOpen}
        split={split}
        activeTab={activeTab}
        expanded={canvasExpanded}
        activeTool={activeTool}
        currentDocument={currentDocument}
        currentStorageKey={currentStorageKey}
        currentReady={currentReady}
        onCurrentDocumentChange={handleCurrentDocumentChange}
        onActiveCanvasChange={(canvas) => changeCanvasTab(canvas === "right" ? "drafts" : "current")}
        onToggleExpand={() => setCanvasExpanded((v) => !v)}
      />

      {/* Top-center canvas tabs */}
      <div className="fixed left-1/2 top-3 z-[5] -translate-x-1/2">
        <CanvasTabs activeTab={activeTab} onTabChange={changeCanvasTab} split={split} onSplitChange={setSplit} />
      </div>

      {/* Top-left breadcrumb */}
      <div
        className="fixed left-3 top-3 z-[5] inline-flex items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] tracking-[0.2px] text-[var(--text-muted)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <Link
          to={backHref}
          aria-label="Voltar"
          onClick={() => {
            void flushPendingSave();
          }}
          className="grid place-items-center text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="h-3.5 w-px bg-[var(--border)]" />
        <span className="font-medium text-[var(--text)]">{projectName}</span>
        {screenTitle && (
          <>
            <span className="h-3.5 w-px bg-[var(--border)]" />
            <span className="font-normal">{screenTitle}</span>
          </>
        )}
        {componentName && (
          <>
            <span className="h-3.5 w-px bg-[var(--border)]" />
            <span className="font-normal">{componentName}</span>
          </>
        )}
        {projectType && (
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {projectType}
          </span>
        )}
        <span className="h-3.5 w-px bg-[var(--border)]" />
        <SearchToggle onClick={() => setSearchOpen(true)} />
      </div>

      {/* Layers panel */}
      <Tree
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        componentName={componentName || undefined}
        screenName={screenTitle || undefined}
        document={editorState?.document ?? null}
        selectedNodeId={selectedNodeId}
        canvasActive={editorState?.canvasStageActive ?? false}
        onSelectNode={(nodeId) => {
          editor?.dispatch({ type: "setSelected", selectedIds: [nodeId] });
        }}
        onReorderNode={(activeNodeId, overNodeId) => {
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: moveElementBefore(editor.state.document, activeNodeId, overNodeId),
          });
        }}
        onToggleVisible={(nodeId, visible) => {
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: setElementVisible(editor.state.document, nodeId, visible),
            selectedIds: visible ? editor.state.selectedIds : editor.state.selectedIds.filter((id) => id !== nodeId),
          });
        }}
        onToggleLocked={(nodeId, locked) => {
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: setElementLocked(editor.state.document, nodeId, locked),
          });
        }}
        onToggleCanvasActive={(active) => {
          editor?.dispatch({ type: "setCanvasStageActive", active });
        }}
        canOpenNodeCanvas={canOpenCanvasNode}
        onOpenNodeCanvas={openCanvasForNode}
        onOpenProjectNode={openProjectNodeCanvas}
        activeTab={treeTab}
        onTabChange={(tab) => {
          setTreeTab(tab);
          setActiveTab(tab === "drafts" ? "drafts" : "current");
        }}
        projectType={projectType}
        projectTree={projectTree}
        parentNode={parentProjectNode}
      />
      <TreeToggle open={treeOpen} onClick={() => setTreeOpen(true)} />

      {/* Right-side floating panels */}
      <div className="pointer-events-none fixed bottom-3 right-3 top-3 z-[6] flex items-stretch gap-3">
        {/* <GalleryPanel open={galleryOpen} onClose={() => setGalleryOpen(false)} /> */}
        {/* <Chat open={chatOpen} onClose={() => setChatOpen(false)} /> */}
        <Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} editor={editor} />
      </div>

      {/* Bottom-right toggles */}
      <div className="fixed bottom-6 right-3 z-[11] flex items-center gap-2">
        {/* <GalleryToggle open={galleryOpen} onClick={() => setGalleryOpen(true)} /> */}
        {!inspectorOpen && (
          <FloatingToggle onClick={() => setInspectorOpen(true)} aria="Inspector">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h12" />
            </svg>
            Inspector
          </FloatingToggle>
        )}
      </div>

      {/* Toolbar */}
      <div className="fixed bottom-6 left-1/2 z-[10] -translate-x-1/2 flex items-end gap-2">
        <Toolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          canvasExpanded={canvasExpanded}
          zoom={activeZoom}
          onZoomChange={setActiveZoom}
          onCollapseCanvas={() => setCanvasExpanded(false)}
        />
      </div>

      {/* Search palette */}
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function CanvasTabs({
  activeTab,
  onTabChange,
  split,
  onSplitChange,
}: {
  activeTab: "current" | "drafts";
  onTabChange: (t: "current" | "drafts") => void;
  split: SplitMode;
  onSplitChange: (mode: SplitMode) => void;
}) {
  const [layoutExpanded, setLayoutExpanded] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-0.5 rounded-lg border border-[#282828] bg-[#181818] p-1"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
    >
      {(["current", "drafts"] as const).map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-100"
            style={{
              background: isActive ? "#2A2A2A" : "transparent",
              color: isActive ? "#F2F2F2" : "#5A5A5A",
              letterSpacing: "0.1px",
            }}
          >
            {tab === "current" ? "Current" : "Drafts"}
          </button>
        );
      })}

      <span className="mx-1 h-3.5 w-px bg-[#2C2C2C]" />

      {/* Layout switcher — expands on hover */}
      <div
        className="flex items-center"
        onMouseEnter={() => setLayoutExpanded(true)}
        onMouseLeave={() => setLayoutExpanded(false)}
      >
        {/* Active mode indicator */}
        <button
          type="button"
          aria-label="Layout"
          className="grid h-6 w-6 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
          style={{ color: split !== "none" ? "rgba(13,153,255,0.7)" : "#555" }}
        >
          <LayoutIcon mode={split} />
        </button>

        {/* Options — slide in on hover */}
        <div
          className="flex items-center overflow-hidden"
          style={{
            maxWidth: layoutExpanded ? 110 : 0,
            transition: "max-width 180ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <span className="mx-1 h-3.5 w-px shrink-0 bg-[#2C2C2C]" />
          {(["none", "vertical", "horizontal"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSplitChange(mode)}
              aria-label={LAYOUT_LABELS[mode]}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
              style={{ color: split === mode ? "rgba(13,153,255,0.7)" : "#555" }}
            >
              <LayoutIcon mode={mode} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutIcon({ mode }: { mode: SplitMode }) {
  if (mode === "vertical") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="18" rx="1.5" />
        <rect x="13" y="3" width="8" height="18" rx="1.5" />
      </svg>
    );
  }
  if (mode === "horizontal") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="8" rx="1.5" />
        <rect x="3" y="13" width="18" height="8" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H3v6" />
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M15 21h6v-6" />
    </svg>
  );
}

function shouldUseMockGraph(input: {
  persistedGraphJSON: string | null;
  mockGraphJSON: string;
  projectType: ProjectType;
  targetKind: SceneOwnerType;
}): boolean {
  const mockDocument = canvasDocumentFromHtmlGraphJSON(input.mockGraphJSON);
  if (!mockDocument) return false;

  const persistedDocument = canvasDocumentFromHtmlGraphJSON(input.persistedGraphJSON);
  if (!persistedDocument) return true;
  if (persistedDocument.rootIds.length === 0) return true;

  if (input.targetKind !== "variant") return false;

  const deviceSize = canvasSizeForProjectType(input.projectType);
  const persistedIsDeviceSized = sameCanvasSize(persistedDocument.canvas, deviceSize);
  const mockIsDeviceSized = sameCanvasSize(mockDocument.canvas, deviceSize);
  if (persistedIsDeviceSized && !mockIsDeviceSized) return true;

  const persistedRoot = persistedDocument.rootIds[0]
    ? persistedDocument.elements[persistedDocument.rootIds[0]]
    : null;
  const mockRoot = mockDocument.rootIds[0]
    ? mockDocument.elements[mockDocument.rootIds[0]]
    : null;
  return Boolean(
    persistedRoot &&
      mockRoot &&
      persistedIsDeviceSized &&
      normalizeName(persistedRoot.name) !== normalizeName(mockRoot.name),
  );
}

async function resolveMockGraphJSON(input: {
  canUseFactoryMocks: boolean;
  component: ComponentRow | null;
  projectType: ProjectType;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
}): Promise<string | null> {
  if (!input.canUseFactoryMocks) return null;
  if (!input.component) {
    if (!input.screen) return null;
    const bundle = await getCanvasMockBundleForScreen(input.screen, input.projectType);
    return bundle?.screen.graphJSON ?? null;
  }

  const path = componentPathFromRoot(input.component, input.projectComponents);
  if (!path || !path.screenId) return null;
  const originScreen = input.projectScreens.find((screen) => screen.id === path.screenId);
  if (!originScreen) return null;

  const bundle = await getCanvasMockBundleForScreen(originScreen, input.projectType);
  if (!bundle) return null;

  const mockComponent = findMockComponentByPath(bundle.components, path.names);
  return mockComponent?.canvas.graphJSON ?? null;
}

function componentPathFromRoot(
  component: ComponentRow,
  components: ComponentRow[],
): { screenId: string | null; names: string[] } | null {
  const byParentVariantId = new Map<string, ComponentRow>();
  for (const row of components) {
    byParentVariantId.set(row.activeVariantId, row);
  }

  const names: string[] = [];
  let current: ComponentRow | undefined = component;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    names.unshift(current.name);
    if (current.screenId) return { screenId: current.screenId, names };
    if (!current.parentVariantId) return { screenId: null, names };
    current = byParentVariantId.get(current.parentVariantId);
  }

  return null;
}

function componentNamePathFromDocument(
  document: CanvasDocument,
  nodeId: string,
): string[] {
  const path: string[] = [];
  let current = document.elements[nodeId];
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? document.elements[current.parentId] : undefined;
  }

  return path;
}

function findComponentByPath(
  components: ComponentRow[],
  screenId: string,
  names: string[],
): ComponentRow | null {
  let siblings = components
    .filter((component) => component.screenId === screenId && component.parentVariantId === null)
    .sort((a, b) => a.order - b.order);
  let current: ComponentRow | null = null;

  for (const name of names) {
    current =
      siblings.find((component) => normalizeName(component.name) === normalizeName(name)) ??
      null;
    if (!current) return null;
    siblings = components
      .filter((component) => component.parentVariantId === current!.activeVariantId)
      .sort((a, b) => a.order - b.order);
  }

  return current;
}

function findComponentByCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  screen: ScreenRow | null;
}): ComponentRow | null {
  const node = input.document.elements[input.nodeId];
  if (!node?.children.length) return null;

  const parentNode = node.parentId ? input.document.elements[node.parentId] : null;
  const parentComponent = parentNode?.children.length
    ? findComponentByCanvasNode({
        ...input,
        nodeId: parentNode.id,
      })
    : input.currentComponent;
  const parent =
    parentComponent
      ? { kind: "variant" as const, variantId: parentComponent.activeVariantId }
      : input.screen?.id
        ? { kind: "screen" as const, screenId: input.screen.id }
        : null;
  if (!parent) return null;

  return findComponentBySourceNodeInList(input.projectComponents, parent, node.id);
}

function findComponentBySourceNodeInList(
  components: ComponentRow[],
  parent:
    | { kind: "screen"; screenId: string }
    | { kind: "variant"; variantId: string },
  sourceNodeId: string | null | undefined,
): ComponentRow | null {
  if (!sourceNodeId) return null;
  return (
    components.find((component) => {
      if (component.sourceNodeId !== sourceNodeId) return false;
      if (parent.kind === "screen") {
        return component.screenId === parent.screenId && component.parentVariantId === null;
      }
      return component.parentVariantId === parent.variantId;
    }) ?? null
  );
}

async function materializeComponentFromCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
}): Promise<ComponentRow | null> {
  if (!input.projectId) return null;
  const targetNode = input.document.elements[input.nodeId];
  if (!targetNode || targetNode.children.length === 0) return null;

  const components = [...input.projectComponents];
  const createdByNodeId = new Map<string, ComponentRow>();

  const ensureNodeComponent = async (nodeId: string): Promise<ComponentRow | null> => {
    const node = input.document.elements[nodeId];
    if (!node || node.children.length === 0) return null;

    const existingByNode = createdByNodeId.get(nodeId);
    if (existingByNode) return existingByNode;

    const fullPath = fullComponentPathForCanvasNode({
      currentComponent: input.currentComponent,
      document: input.document,
      nodeId,
      projectComponents: components,
      screen: input.screen,
    });
    if (!fullPath?.screenId) return null;

    const parentNodeId = node.parentId;
    const parentComponent =
      parentNodeId
        ? await ensureNodeComponent(parentNodeId)
        : input.currentComponent;
	    const parent =
	      parentComponent
	        ? { kind: "variant" as const, variantId: parentComponent.activeVariantId }
	        : { kind: "screen" as const, screenId: fullPath.screenId };
	    const graphJSON = htmlGraphJSONFromCanvasDocument(
	      canvasDocumentForNode(input.document, nodeId),
	      null,
	      node.name,
	    );

	    const existingBySourceNode = findComponentBySourceNodeInList(components, parent, node.id);
	    if (existingBySourceNode) {
	      await upsertComponentSceneIfChanged(existingBySourceNode, graphJSON);
	      createdByNodeId.set(nodeId, existingBySourceNode);
	      return existingBySourceNode;
	    }

    const existingByPath = findComponentByPath(components, fullPath.screenId, fullPath.names);
    if (existingByPath && !existingByPath.sourceNodeId) {
	      const updated = await updateComponent(existingByPath.id, { sourceNodeId: node.id });
	      const existing = updated ?? { ...existingByPath, sourceNodeId: node.id };
	      components.splice(components.findIndex((row) => row.id === existingByPath.id), 1, existing);
	      await upsertComponentSceneIfChanged(existing, graphJSON);
	      createdByNodeId.set(nodeId, existing);
	      return existing;
	    }

	    const created = await createOrFindComponent({
	      graphJSON,
	      name: node.name,
	      parent,
      projectId: input.projectId,
      sourceNodeId: node.id,
    });
    if (!created) return null;
    components.push(created);
    createdByNodeId.set(nodeId, created);
    return created;
  };

  return ensureNodeComponent(input.nodeId);
}

async function materializeComponentsFromCanvasDocument(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  projectComponents: ComponentRow[];
  projectId: string | null;
  screen: ScreenRow | null;
}): Promise<void> {
  const componentNodeIds = componentNodeIdsFromDocument(input.document);
  for (const nodeId of componentNodeIds) {
    await materializeComponentFromCanvasNode({
      ...input,
      nodeId,
    });
  }
}

async function createOrFindComponent(input: {
  graphJSON: string;
  name: string;
  parent:
    | { kind: "screen"; screenId: string }
    | { kind: "variant"; variantId: string };
  projectId: string;
  sourceNodeId: string;
}): Promise<ComponentRow | null> {
  const existingBySourceNode = await findComponentBySourceNode(input.parent, input.sourceNodeId);
  if (existingBySourceNode) {
    await upsertComponentSceneIfChanged(existingBySourceNode, input.graphJSON);
    return existingBySourceNode;
  }

  const existing = await findComponentByName(input.parent, input.name);
  if (existing && !existing.sourceNodeId) {
    if (!existing.sourceNodeId) {
      await updateComponent(existing.id, { sourceNodeId: input.sourceNodeId });
    }
    await upsertComponentSceneIfChanged(existing, input.graphJSON);
    return { ...existing, sourceNodeId: input.sourceNodeId };
  }

  try {
    const result = await createComponent({
      projectId: input.projectId,
      parent: input.parent,
      name: input.name,
      kind: "Custom",
      sourceNodeId: input.sourceNodeId,
    });
    await upsertScene({
      ownerType: "variant",
      ownerId: result.component.activeVariantId,
      graphJSON: input.graphJSON,
    }, { propagate: false });
    return result.component;
  } catch {
    const duplicateByName = await findComponentByName(input.parent, input.name);
    const duplicate =
      await findComponentBySourceNode(input.parent, input.sourceNodeId) ??
      (!duplicateByName?.sourceNodeId ? duplicateByName : null);
    if (!duplicate) return null;
    if (!duplicate.sourceNodeId) {
      await updateComponent(duplicate.id, { sourceNodeId: input.sourceNodeId });
    }
    await upsertComponentSceneIfChanged(duplicate, input.graphJSON);
    return { ...duplicate, sourceNodeId: input.sourceNodeId };
  }
}

async function upsertComponentSceneIfChanged(
  component: ComponentRow,
  graphJSON: string,
): Promise<void> {
  const existingScene = await getSceneByOwner("variant", component.activeVariantId);
  if (existingScene?.graphJSON === graphJSON) return;
  await upsertScene({
    ownerType: "variant",
    ownerId: component.activeVariantId,
    graphJSON,
  }, { propagate: false });
}

function fullComponentPathForCanvasNode(input: {
  currentComponent: ComponentRow | null;
  document: CanvasDocument;
  nodeId: string;
  projectComponents: ComponentRow[];
  screen: ScreenRow | null;
}): { screenId: string | null; names: string[] } | null {
  const nodePath = componentNamePathFromDocument(input.document, input.nodeId);
  if (nodePath.length === 0) return null;

  if (!input.currentComponent) {
    return { screenId: input.screen?.id ?? null, names: nodePath };
  }

  const currentPath = componentPathFromRoot(input.currentComponent, input.projectComponents);
  if (!currentPath) return null;
  return {
    screenId: currentPath.screenId,
    names: [...currentPath.names, ...nodePath],
  };
}

function componentNodeIdsFromDocument(document: CanvasDocument): string[] {
  const ids: string[] = [];
  const walk = (nodeId: string) => {
    const node = document.elements[nodeId];
    if (!node) return;
    if (node.children.length > 0) ids.push(nodeId);
    for (const childId of node.children) walk(childId);
  };
  for (const rootId of document.rootIds) walk(rootId);
  return ids;
}

function componentStructureKey(document: CanvasDocument): string {
  const parts: string[] = [];
  const walk = (nodeId: string) => {
    const node = document.elements[nodeId];
    if (!node) return;
    if (node.children.length > 0) {
      parts.push([
        node.id,
        node.name,
        Math.round(node.x),
        Math.round(node.y),
        Math.round(node.width),
        Math.round(node.height),
        node.children.join(","),
      ].join(":"));
    }
    for (const childId of node.children) walk(childId);
  };
  for (const rootId of document.rootIds) walk(rootId);
  return parts.join("|");
}

function canvasDocumentForNode(
  document: CanvasDocument,
  nodeId: string,
): CanvasDocument {
  const source = document.elements[nodeId];
  const elements: CanvasDocument["elements"] = {};

  const copyElement = (id: string, parentId: string | null) => {
    const node = document.elements[id];
    if (!node) return;
    elements[id] = {
      ...node,
      parentId,
      children: [...node.children],
      styles: { ...node.styles },
    };
    for (const childId of node.children) {
      copyElement(childId, id);
    }
  };

  for (const childId of source.children) {
    copyElement(childId, null);
  }

  return {
    canvas: {
      width: source.width,
      height: source.height,
      background: source.styles.background ?? "",
      rotation: source.rotation,
      borderRadius: source.styles.borderRadius,
      borderWidth: source.styles.borderWidth,
      borderColor: source.styles.borderColor,
      opacity: source.styles.opacity,
      padding: source.styles.padding,
    },
    shellBackground: document.shellBackground,
    shellPattern: document.shellPattern,
    rootIds: [...source.children],
    elements,
  };
}

function findMockComponentByPath(
  nodes: MockComponentSeed[],
  names: string[],
): MockComponentSeed | null {
  let candidates = nodes;
  let current: MockComponentSeed | null = null;
  for (const name of names) {
    current =
      candidates.find((node) => normalizeName(node.name) === normalizeName(name)) ?? null;
    if (!current) return null;
    candidates = current.children;
  }
  return current;
}

function mockTargetKey(input: {
  canUseFactoryMocks: boolean;
  component: ComponentRow | null;
  projectType: ProjectType;
  screen: ScreenRow | null;
  projectComponents: ComponentRow[];
  projectScreens: ScreenRow[];
}): string {
  if (!input.canUseFactoryMocks) {
    if (input.component) return ["local-component", input.projectType, input.component.id].join(":");
    if (input.screen) return ["local-screen", input.projectType, input.screen.id].join(":");
    return "none";
  }
  if (input.component) {
    const path = componentPathFromRoot(input.component, input.projectComponents);
    return [
      "component",
      input.projectType,
      input.component.id,
      path?.screenId ?? "orphan",
      path?.names.join("/") ?? input.component.name,
      input.projectScreens.length,
      input.projectComponents.length,
    ].join(":");
  }
  if (input.screen) {
    return ["screen", input.projectType, input.screen.id, input.screen.title].join(":");
  }
  return "none";
}

function canvasSizeForProjectType(projectType: ProjectType): { width: number; height: number } {
  if (projectType === "desktop") return { width: 1440, height: 900 };
  if (projectType === "tablet") return { width: 820, height: 1180 };
  return { width: 390, height: 844 };
}

function sameCanvasSize(
  a: { width: number; height: number },
  b: { width: number; height: number },
): boolean {
  return Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height);
}

function isFactoryMockGraphJSON(graphJSON: string | null): boolean {
  if (!graphJSON) return false;
  const document = canvasDocumentFromHtmlGraphJSON(graphJSON);
  if (!document) return false;
  const rootNames = document.rootIds
    .map((id) => document.elements[id]?.name ?? "")
    .map(normalizeName);
  const mockRootNames = new Set([
    "header",
    "hero banner",
    "category strip",
    "featured list",
    "mobile app cart",
    "search bar",
    "filter chips",
    "product results",
    "product gallery",
    "product summary",
    "options list",
    "shipping form",
    "payment methods",
    "red alignment box",
  ]);
  return rootNames.some((name) => mockRootNames.has(name));
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const LAYOUT_LABELS: Record<SplitMode, string> = {
  none: "Single canvas",
  vertical: "Split vertical",
  horizontal: "Split horizontal",
};

function normalizeProjectType(value: string | null): ProjectType {
  if (value === "desktop" || value === "tablet" || value === "mobile") return value;
  return "mobile";
}

function createBlankDocumentForProjectType(projectType: ProjectType): CanvasDocument {
  const size = canvasSizeForProjectType(projectType);
  const document = createBlankDocument(size.width, size.height);
  return {
    ...document,
    canvas: {
      ...document.canvas,
      background: "#F7F7F2",
      borderRadius: projectType === "desktop" ? 0 : 32,
    },
  };
}

function findTreeNodeById(nodes: ProjectTreeNode[], id: string): ProjectTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findTreeNodeById(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

function buildProjectTree(
  screens: ScreenRow[],
  components: ComponentRow[],
): ProjectTreeNode[] {
  const childrenByScreenId = new Map<string, ComponentRow[]>();
  const childrenByParentVariantId = new Map<string, ComponentRow[]>();

  for (const component of components) {
    if (component.parentVariantId) {
      const siblings = childrenByParentVariantId.get(component.parentVariantId) ?? [];
      siblings.push(component);
      childrenByParentVariantId.set(component.parentVariantId, siblings);
    } else if (component.screenId) {
      const siblings = childrenByScreenId.get(component.screenId) ?? [];
      siblings.push(component);
      childrenByScreenId.set(component.screenId, siblings);
    }
  }

  const buildComponentNode = (component: ComponentRow): ProjectTreeNode => {
    const children = (childrenByParentVariantId.get(component.activeVariantId) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(buildComponentNode);
    return {
      id: component.id,
      name: component.name,
      kind: "component",
      children,
    };
  };

  return [...screens]
    .sort((a, b) => a.order - b.order)
    .map((screen) => ({
      id: screen.id,
      name: screen.title,
      kind: "screen" as const,
      children: (childrenByScreenId.get(screen.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(buildComponentNode),
    }));
}
