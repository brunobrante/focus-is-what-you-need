import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Toolbar } from "@/canvas/shell/Toolbar";
import { Inspector } from "@/canvas/shell/Inspector";
import { Tree, TreeToggle, type ProjectTreeNode } from "@/canvas/shell/Tree";
import { FloatingToggle } from "@/canvas/shell/GalleryPanel";
import { SearchPalette, SearchToggle } from "@/canvas/shell/SearchPalette";
import { CanvasRender, type ZoomSetter } from "@/canvas/shell/CanvasRender";
import { EditorBridgeProvider, useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import { moveElementBefore, setElementLocked, setElementVisible, wrapElements } from "@/canvas/engine/actions";
import { canvasDocumentFromHtmlGraphJSON, getNodeAbsoluteBoundsInGraph } from "@/canvas/engine/htmlSceneAdapter";
import type { CanvasToolId } from "@/canvas/tools";
import { CanvasTabs } from "./CanvasTabs";
import { useScene } from "@/lib/storage/hooks";
import { useCanvasEntities } from "./hooks/useCanvasEntities";
import { useMockScene } from "./hooks/useMockScene";
import { useDeferredPersistence } from "./hooks/useDeferredPersistence";
import { useCanvasNavigation } from "./hooks/useCanvasNavigation";
import {
  buildProjectTree,
  createBlankDocumentForProjectType,
  findTreeNodeById,
  isFactoryMockGraphJSON,
  mockTargetKey,
  normalizeProjectType,
  shouldUseMockGraph,
} from "./canvasUtils";

export type { SplitMode } from "./canvasUtils";

export function CanvasPage() {
  return (
    <EditorBridgeProvider>
      <CanvasPageContent />
    </EditorBridgeProvider>
  );
}

function CanvasPageContent() {
  const [params] = useSearchParams();
  const projectIdParam = params.get("project") || params.get("projectId") || "";
  const legacyProjectName = params.get("name") || "";
  const queryProjectType = normalizeProjectType(params.get("type"));
  const screenParam = params.get("screen") || "";
  const variantParam = params.get("variant") || "";
  const componentParam = params.get("component") || "";
  const legacyElementName = params.get("element") || "";

  const {
    project,
    screen,
    component,
    variant,
    scene,
    sceneOwner,
    projectScreens,
    projectComponents,
    projectScreensLoading,
    projectComponentsLoading,
    sceneLoading,
    entityLoading,
    projectType,
    projectId,
    projectName,
    canUseFactoryMocks,
  } = useCanvasEntities({
    projectIdParam,
    legacyProjectName,
    queryProjectType,
    screenParam,
    variantParam,
    componentParam,
    legacyElementName,
  });

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<CanvasToolId>("cursor");
  const [activeTab, setActiveTab] = useState<"current" | "drafts">("current");
  const [treeTab, setTreeTab] = useState<"layers" | "drafts">("layers");
  const [split, setSplit] = useState<"none" | "vertical" | "horizontal">("none");
  const [canvasExpanded, setCanvasExpanded] = useState(false);

  const editorTool = useEditorBridge((v) => v?.state.tool);
  const activeZoom = useEditorBridge((v) => v?.state.zoom);
  const selectedNodeId = useEditorBridge((v) => {
    if (!v) return null;
    if (v.state.canvasStageActive) return null;
    return v.state.selectedIds[0] ?? null;
  });
  const editorCanvasActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const getEditor = useEditorBridgeReader();

  const parentSceneOwner = useMemo(() => {
    if (!component) return null;
    if (component.parentVariantId) return { ownerType: "variant" as const, ownerId: component.parentVariantId };
    if (component.screenId) return { ownerType: "screen" as const, ownerId: component.screenId };
    return null;
  }, [component?.parentVariantId, component?.screenId]);

  const { data: parentScene } = useScene(parentSceneOwner?.ownerType ?? null, parentSceneOwner?.ownerId ?? null);

  const componentOriginPosition = useMemo(() => {
    if (!component?.sourceNodeId) return null;
    const bounds = getNodeAbsoluteBoundsInGraph(parentScene?.graphJSON, component.sourceNodeId);
    if (!bounds) return null;
    return { x: bounds.x, y: bounds.y };
  }, [component?.sourceNodeId, parentScene?.graphJSON]);

  const currentOwnerKey = sceneOwner
    ? `${sceneOwner.ownerType}:${sceneOwner.ownerId}`
    : "detached";
  const currentStorageKey = sceneOwner
    ? `desktop-canvas-editor:${sceneOwner.ownerType}:${sceneOwner.ownerId}:v1`
    : "desktop-canvas-editor:detached:v1";
  const currentSceneGraphJSON = scene?.graphJSON ?? null;
  const effectiveSceneGraphJSON =
    !canUseFactoryMocks && isFactoryMockGraphJSON(currentSceneGraphJSON)
      ? null
      : currentSceneGraphJSON;

  const currentMockTargetKey = useMemo(
    () => mockTargetKey({ canUseFactoryMocks, component, projectType, screen, projectComponents, projectScreens }),
    [canUseFactoryMocks, component, projectComponents, projectScreens, projectType, screen],
  );

  const mockScene = useMockScene({
    component,
    canUseFactoryMocks,
    projectType,
    screen,
    projectComponents,
    projectScreens,
    projectComponentsLoading,
    projectScreensLoading,
    currentMockTargetKey,
  });

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

  const currentDocument = useMemo(
    () =>
      canvasDocumentFromHtmlGraphJSON(resolvedSceneGraphJSON, { promoteSubjectRoot: true }) ??
      createBlankDocumentForProjectType(projectType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [component, projectType, resolvedSceneGraphJSON],
  );

  const currentReady =
    (!sceneOwner || !sceneLoading) &&
    !entityLoading &&
    !mockScene.loading &&
    mockScene.key === currentMockTargetKey;

  const screenTitle = screen?.title ?? "";
  const componentName = component?.name ?? "";
  const currentCanvasName = componentName || screenTitle || projectName || "Canvas";

  const { flushPendingSave, handleCurrentDocumentChange } = useDeferredPersistence({
    sceneOwner,
    currentReady,
    currentOwnerKey,
    resolvedSceneGraphJSON,
    effectiveSceneGraphJSON,
    currentCanvasName,
    component,
    projectComponents,
    projectDbId: project?.id ?? null,
    screen,
    canUseFactoryMocks,
    currentDocument,
  });

  const projectTree = useMemo(
    () => buildProjectTree(projectScreens, projectComponents),
    [projectComponents, projectScreens],
  );

  const parentProjectNode = useMemo<ProjectTreeNode | null>(() => {
    if (!component) return null;
    if (!component.parentVariantId && component.screenId) {
      return projectTree.find((n) => n.id === component.screenId) ?? null;
    }
    if (component.parentVariantId) {
      const parentComponent = projectComponents.find(
        (c) => c.activeVariantId === component.parentVariantId,
      );
      if (!parentComponent) return null;
      return findTreeNodeById(projectTree, parentComponent.id);
    }
    return null;
  }, [component, projectComponents, projectTree]);

  const { canOpenCanvasNode, openCanvasForNode, openProjectNodeCanvas } = useCanvasNavigation({
    component,
    canUseFactoryMocks,
    currentDocument,
    projectComponents,
    screen,
    projectId,
    projectType,
    flushPendingSave,
  });

  const handleToolChange = useCallback(
    (tool: CanvasToolId) => {
      const editor = getEditor();
      if (tool === "wrapper" && editor && editor.state.selectedIds.length > 0) {
        const { document: next, wrapperId } = wrapElements(editor.state.document, editor.state.selectedIds);
        editor.dispatch({ type: "commitDocument", document: next, selectedIds: wrapperId ? [wrapperId] : [] });
        return;
      }
      setActiveTool(tool);
    },
    [getEditor],
  );

  useEffect(() => {
    if (editorTool === "select") {
      setActiveTool((prev) => (prev === "cursor" || prev === "hand") ? prev : "cursor");
    }
  }, [editorTool]);

  const setActiveZoom: ZoomSetter = (next) => {
    const editor = getEditor();
    if (!editor) return;
    const zoom = typeof next === "function" ? next(editor.state.zoom) : next;
    editor.dispatch({ type: "setZoom", zoom });
  };

  const backHref = component
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
        projectType={projectType}
        parentTarget={parentProjectNode}
        isComponent={!!component}
        componentOriginPosition={componentOriginPosition}
        onCurrentDocumentChange={handleCurrentDocumentChange}
        onActiveCanvasChange={(canvas) => changeCanvasTab(canvas === "right" ? "drafts" : "current")}
        onToggleExpand={() => setCanvasExpanded((v) => !v)}
        onBackToParent={() => { if (parentProjectNode) openProjectNodeCanvas(parentProjectNode); }}
      />

      <div className="fixed left-1/2 top-3 z-[5] -translate-x-1/2">
        <CanvasTabs activeTab={activeTab} onTabChange={changeCanvasTab} split={split} onSplitChange={setSplit} />
      </div>

      <div
        className="fixed left-3 top-3 z-[5] inline-flex items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] tracking-[0.2px] text-[var(--text-muted)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <Link
          to={backHref}
          aria-label="Voltar"
          onClick={() => { void flushPendingSave(); }}
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

      <Tree
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        componentName={componentName || undefined}
        screenName={screenTitle || undefined}
        selectedNodeId={selectedNodeId}
        canvasActive={editorCanvasActive}
        onSelectNode={(nodeId) => { getEditor()?.dispatch({ type: "setSelected", selectedIds: [nodeId] }); }}
        onReorderNode={(activeNodeId, overNodeId) => {
          const editor = getEditor();
          if (!editor) return;
          editor.dispatch({ type: "commitDocument", document: moveElementBefore(editor.state.document, activeNodeId, overNodeId) });
        }}
        onToggleVisible={(nodeId, visible) => {
          const editor = getEditor();
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: setElementVisible(editor.state.document, nodeId, visible),
            selectedIds: visible ? editor.state.selectedIds : editor.state.selectedIds.filter((id) => id !== nodeId),
          });
        }}
        onToggleLocked={(nodeId, locked) => {
          const editor = getEditor();
          if (!editor) return;
          editor.dispatch({ type: "commitDocument", document: setElementLocked(editor.state.document, nodeId, locked) });
        }}
        onToggleCanvasActive={(active) => { getEditor()?.dispatch({ type: "setCanvasStageActive", active }); }}
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

      <div className="pointer-events-none fixed bottom-3 right-3 top-3 z-[6] flex items-stretch gap-3">
        <Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />
      </div>

      <div className="fixed bottom-6 right-3 z-[11] flex items-center gap-2">
        {!inspectorOpen && (
          <FloatingToggle onClick={() => setInspectorOpen(true)} aria="Inspector">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h12" />
            </svg>
            Inspector
          </FloatingToggle>
        )}
      </div>

      <div className="fixed bottom-6 left-1/2 z-[10] -translate-x-1/2 flex items-end gap-2">
        <Toolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          canvasExpanded={canvasExpanded}
          zoom={activeZoom}
          onZoomChange={setActiveZoom}
          projectType={projectType}
          parentTarget={parentProjectNode}
          onBackToParent={() => { if (parentProjectNode) openProjectNodeCanvas(parentProjectNode); }}
          onCollapseCanvas={() => setCanvasExpanded(false)}
        />
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
