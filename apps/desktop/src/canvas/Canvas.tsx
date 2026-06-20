import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Toolbar } from "@/canvas/shell/Toolbar";
import { CanvasToolbarNotice } from "@/canvas/shell/CanvasToolbarNotice";
import { Inspector } from "@/canvas/shell/Inspector";
import { Tree, TreeToggle, type ProjectTreeNode } from "@/canvas/shell/Tree";
import { FloatingToggle } from "@/canvas/shell/GalleryPanel";
import { SearchToggle } from "@/canvas/shell/SearchPalette";
import { CanvasRender, type ZoomSetter } from "@/canvas/shell/CanvasRender";
import type { CanvasReferencesContext } from "@/canvas/shell/CanvasReferencesWindow";
import type { ShellControlVisibility } from "@/canvas/shell/inspector/ShellTab";
import { EditorBridgeProvider, useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import { DEFAULT_SHELL_BACKGROUND, detachInstance, moveElementToParent, setElementLocked, setElementVisible, updateShellBackground, wrapElements } from "@/canvas/engine/actions";
import { buildMasterResolver, canvasDocumentFromHtmlGraphJSON, getInheritedShellBackgroundFromGraph } from "@/canvas/engine/htmlSceneAdapter";
import { peekTable, TABLES } from "@/lib/storage/store";
import type { SceneRow } from "@/lib/storage/schema";
import type { CanvasToolId } from "@/canvas/tools";
import { createToolbarConfig } from "@/canvas/toolbarConfig";
import { EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP } from "@/canvas/stage/canvasShellStyle";
import { useResolvedCanvasSettings } from "@/application/settings/useResolvedCanvasSettings";
import { useProjectFontTokens } from "@/application/settings/useProjectFontTokens";
import { ElementFontTokensProvider } from "@/canvas/stage/elementFontTokensContext";
import { useSearch, useSearchSource } from "@/application/search/SearchProvider";
import { CANVAS_COMMAND_GROUPS } from "@/domain/settings/commands";
import type { SearchItem } from "@/domain/search/searchTypes";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import { CanvasTabs } from "./CanvasTabs";
import { useAllVariants, useScene } from "@/lib/storage/hooks";
import { mainVariantIdForScreen } from "@/lib/storage/repos/scenes.repo";
import { VersionModeModal, type VersionModeModalHandle } from "@/components/modals/VersionModeModal";
import { useCanvasEntities } from "./hooks/useCanvasEntities";
import { useMockScene } from "./hooks/useMockScene";
import { useDeferredPersistence } from "./hooks/useDeferredPersistence";
import { useCanvasNavigation } from "./hooks/useCanvasNavigation";
import { useCanvasWindows } from "./hooks/useCanvasWindows";
import { useVersionsWindow } from "./hooks/useVersionsWindow";
import {
  buildProjectTree,
  canvasSizeForProjectType,
  computeComponentAncestorFrames,
  createBlankDocumentForProjectType,
  findTreeNodeById,
  isCurrentKey,
  isFactoryMockGraphJSON,
  mockTargetKey,
  normalizeProjectType,
  shouldUseMockGraph,
  type AncestorFrame,
  type CanvasWindowKey,
} from "./canvasUtils";
import { PreviewLauncher } from "./shell/PreviewLauncher";
import { IconChevronLeft, IconPanelRight } from "@/components/icons";

export type { SplitMode } from "./canvasUtils";

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export function CanvasPage() {
  return (
    <EditorBridgeProvider>
      <CanvasPageContent />
    </EditorBridgeProvider>
  );
}

function CanvasPageContent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const projectIdParam = params.get("project") || params.get("projectId") || "";
  const legacyProjectName = params.get("name") || "";
  const queryProjectType = normalizeProjectType(params.get("type"));
  const screenParam = params.get("screen") || "";
  const variantParam = params.get("variant") || "";
  const componentParam = params.get("component") || "";
  // Return context for "Go to component": "variant:<id>" or "screen:<id>" of the
  // canvas the user came from, so Back returns there instead of the master's parent.
  const fromParam = params.get("from") || "";
  const legacyElementName = params.get("element") || "";
  // A screen version (a variant) to open in the dedicated "Versions" window instead
  // of the "Current" window. Current keeps showing the screen's active variant.
  const versionVariantParam = params.get("versionVariant") || "";

  const {
    project,
    screen,
    component,
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

  const { open: openSearch } = useSearch();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<CanvasToolId>("cursor");
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [shellDeviceVisibility, setShellDeviceVisibility] = useState<ShellControlVisibility>("show");
  const [shellBackVisibility, setShellBackVisibility] = useState<ShellControlVisibility>("show");
  const [shellZoomVisibility, setShellZoomVisibility] = useState<ShellControlVisibility>("show");
  const [shellExpandVisibility, setShellExpandVisibility] = useState<ShellControlVisibility>("hover");
  const [shellTabSignal, setShellTabSignal] = useState(0);
  const { settings } = useResolvedCanvasSettings(projectIdParam || null);
  const fontTokens = useProjectFontTokens(projectIdParam || null);

  const editorTool = useEditorBridge((v) => v?.state.tool);
  const editorPanning = useEditorBridge((v) => v?.state.panning ?? false);
  const activeZoom = useEditorBridge((v) => v?.state.zoom);
  const activeViewportMode = useEditorBridge((v) => v?.state.viewportMode);
  const selectedNodeIds = useEditorBridge((v) => {
    if (!v || v.state.canvasStageActive) return [];
    return v.state.selectedIds;
  }, stringArraysEqual);
  const editorCanvasActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const getEditor = useEditorBridgeReader();

  const { data: allVariants } = useAllVariants();
  const parentSceneOwner = useMemo(() => {
    if (!component) return null;
    if (component.parentVariantId) return { ownerType: "variant" as const, ownerId: component.parentVariantId };
    if (component.screenId) {
      // A top-level component's parent scene is the screen's main variant.
      const mainVariantId = mainVariantIdForScreen(allVariants, component.screenId);
      if (mainVariantId) return { ownerType: "variant" as const, ownerId: mainVariantId };
    }
    return null;
  }, [component?.parentVariantId, component?.screenId, allVariants]);

  const { data: parentScene } = useScene(parentSceneOwner?.ownerType ?? null, parentSceneOwner?.ownerId ?? null);

  // The parent-frames overlay draws every ancestor frame of the edited component
  // (parent component(s) up to the screen) behind it as a visual guide. Resolving
  // each frame's size/position/background walks the full ancestry and loads
  // ancestor scenes, so it runs async into state rather than a synchronous memo.
  const [ancestorFrames, setAncestorFrames] = useState<AncestorFrame[]>([]);
  useEffect(() => {
    if (!component?.sourceNodeId) {
      setAncestorFrames([]);
      return;
    }
    let cancelled = false;
    void computeComponentAncestorFrames(component, projectComponents, projectScreens).then((frames) => {
      if (!cancelled) setAncestorFrames(frames);
    });
    return () => {
      cancelled = true;
    };
  }, [component, projectComponents, projectScreens]);

  const currentOwnerKey = sceneOwner
    ? `${sceneOwner.ownerType}:${sceneOwner.ownerId}`
    : "detached";
  const currentStorageKey = sceneOwner
    ? `desktop-canvas-editor:${sceneOwner.ownerType}:${sceneOwner.ownerId}:v1`
    : "desktop-canvas-editor:detached:v1";
  const currentSceneGraphJSON = scene?.graphJSON ?? null;
  // Memoized so isFactoryMockGraphJSON parses the graph only when it actually
  // changes, not on every Canvas render (and so the ref stays stable downstream).
  const effectiveSceneGraphJSON = useMemo(
    () =>
      !canUseFactoryMocks && isFactoryMockGraphJSON(currentSceneGraphJSON)
        ? null
        : currentSceneGraphJSON,
    [canUseFactoryMocks, currentSceneGraphJSON],
  );

  const currentMockTargetKey = useMemo(
    () => mockTargetKey({ canUseFactoryMocks, component, projectType, screen, projectComponents, projectScreens, variants: allVariants }),
    [canUseFactoryMocks, component, projectComponents, projectScreens, projectType, screen, allVariants],
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
        targetKind: component ? "component" : "screen",
      })
    ) {
      return mockScene.graphJSON;
    }
    return effectiveSceneGraphJSON;
  }, [component, effectiveSceneGraphJSON, mockScene.graphJSON, projectType]);

  const hasParent = !!component && (!!component.parentVariantId || !!component.screenId);
  const inheritParentBackground = settings.canvas.shell.inheritParentBackground;

  const effectiveShellBackground = useMemo(() => {
    if (!inheritParentBackground || !component) return DEFAULT_SHELL_BACKGROUND;
    return (
      getInheritedShellBackgroundFromGraph(parentScene?.graphJSON, component.sourceNodeId) ??
      DEFAULT_SHELL_BACKGROUND
    );
  }, [inheritParentBackground, component, parentScene?.graphJSON]);

  // Linked instance nodes are expanded read-only at canvas seed time. The scenes
  // table is hydrated by the time the current scene loads (currentReady gates the
  // editor), so a synchronous cache peek sees every master variant scene.
  const resolveMaster = useMemo(
    () => buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)),
    // Rebuilt whenever the current scene's graph changes — which is also when the
    // scenes table has just hydrated/updated.
    [resolvedSceneGraphJSON],
  );

  const currentDocument = useMemo(() => {
    const doc =
      canvasDocumentFromHtmlGraphJSON(resolvedSceneGraphJSON, {
        promoteSubjectRoot: true,
        resolveMaster,
      }) ?? createBlankDocumentForProjectType(projectType);
    return { ...doc, shellBackground: effectiveShellBackground };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component, projectType, resolvedSceneGraphJSON, effectiveShellBackground, resolveMaster]);

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

  const currentVariantId = sceneOwner?.ownerId ?? null;

  const versionModeRef = useRef<VersionModeModalHandle>(null);

  const {
    split,
    splitWindows: normalizedSplitWindows,
    activeTab,
    treeTab,
    extraCurrents,
    previewOpen,
    previewSettings,
    setPreviewSettings,
    canvasFeatures,
    enabledCanvasTabs,
    splitActive,
    canAddCurrent,
    changeCanvasTab,
    focusVersionsTab,
    handleAddCurrent,
    removeExtraCurrent,
    retargetExtraCurrent,
    changeSplitMode,
    changeSplitWindows,
    updateCanvasFeature,
    closePreview,
    togglePreview,
  } = useCanvasWindows({ versionVariantParam, sceneOwner });

  const {
    versionsSubject,
    setVersionsSubject,
    selectedVersionId,
    setSelectedVersionId,
    versionsVariants,
    versionsDocument,
    versionsReady,
    versionsStorageKey,
    versionsSubjectSize,
    versionsSubjectDisplayName,
    versionsBackNode,
    selectVersionsSubject,
    goBackVersions,
    handleAddVersion,
    canOpenVersionNode,
    openCanvasForVersionNode,
    handleVersionsDocumentChange,
  } = useVersionsWindow({
    allVariants,
    currentVariantId,
    versionVariantParam,
    component,
    screen,
    projectComponents,
    projectScreens,
    projectTree,
    projectId,
    projectName,
    flushPendingSave,
    versionModeRef,
    onFocusVersionsTab: focusVersionsTab,
  });

  useEffect(() => {
    const editor = getEditor();
    if (!editor) return;
    const doc = editor.state.document;
    if (doc.shellBackground === effectiveShellBackground) return;
    editor.dispatch({
      type: "commitDocument",
      document: updateShellBackground(doc, effectiveShellBackground),
    });
  }, [effectiveShellBackground, getEditor]);

  // Subject (name + kind) shown in each Current tab's hover popover. The primary
  // Current reflects the open subject; each extra Current resolves its mirrored/
  // retargeted variant back to its owning screen or component.
  const currentSubjects = useMemo<Record<CanvasWindowKey, { name: string; kind: "screen" | "component" }>>(() => {
    const map: Record<CanvasWindowKey, { name: string; kind: "screen" | "component" }> = {
      current: {
        name: componentName || screenTitle || projectName || "Current",
        kind: component ? "component" : "screen",
      },
    };
    for (const entry of extraCurrents) {
      const variant = allVariants.find((v) => v.id === entry.subject.ownerId);
      const node = variant ? findTreeNodeById(projectTree, variant.ownerId) : null;
      map[entry.key] = {
        name: node?.name ?? componentName ?? screenTitle ?? "Current",
        kind: variant?.ownerKind === "component" ? "component" : "screen",
      };
    }
    return map;
  }, [allVariants, component, componentName, extraCurrents, projectName, projectTree, screenTitle]);

  // When the layers tree is focused on an extra Current, its header reflects THAT
  // window's subject (not the primary's), and picking a project node re-points that
  // window instead of navigating the primary Current.
  const treeExtraCurrent = useMemo(
    () => (isCurrentKey(treeTab) && treeTab !== "current"
      ? extraCurrents.find((entry) => entry.key === treeTab) ?? null
      : null),
    [extraCurrents, treeTab],
  );
  const treeExtraSubjectId = useMemo(
    () => (treeExtraCurrent
      ? allVariants.find((v) => v.id === treeExtraCurrent.subject.ownerId)?.ownerId ?? null
      : null),
    [allVariants, treeExtraCurrent],
  );

  const { canOpenCanvasNode, openCanvasForNode, openProjectNodeCanvas } =
    useCanvasNavigation({
      component,
      canUseFactoryMocks,
      currentDocument,
      projectComponents,
      screen,
      variants: allVariants,
      projectId,
      projectType,
      flushPendingSave,
    });

  // Picking a project node from the layers-tree header: re-point the focused extra
  // Current at that subject (its main/active variant scene), or navigate the primary
  // Current as before.
  const handleOpenProjectNode = useCallback(
    (node: ProjectTreeNode) => {
      if (treeExtraCurrent) {
        const ownerId =
          node.kind === "screen"
            ? mainVariantIdForScreen(allVariants, node.id)
            : projectComponents.find((c) => c.id === node.id)?.activeVariantId ?? null;
        if (ownerId) retargetExtraCurrent(treeExtraCurrent.key, { ownerType: "variant", ownerId });
        return;
      }
      openProjectNodeCanvas(node);
    },
    [allVariants, openProjectNodeCanvas, projectComponents, retargetExtraCurrent, treeExtraCurrent],
  );

  const handleInheritParentBackgroundChange = useCallback(
    (value: boolean) => {
      putGlobalSettings({
        ...settings,
        canvas: {
          ...settings.canvas,
          shell: { ...settings.canvas.shell, inheritParentBackground: value },
        },
      });
    },
    [settings],
  );

  const toolbarConfig = useMemo(() => createToolbarConfig(settings), [settings]);
  const activeZoomLimits = useMemo(
    () => getViewportZoomLimits(activeViewportMode ?? "frame"),
    [activeViewportMode],
  );

  const handleToolChange = useCallback(
    (tool: CanvasToolId): boolean => {
      const editor = getEditor();
      if (tool === "wrapper" && editor && editor.state.selectedIds.length > 0) {
        const { document: next, wrapperId } = wrapElements(editor.state.document, editor.state.selectedIds);
        editor.dispatch({ type: "commitDocument", document: next, selectedIds: wrapperId ? [wrapperId] : [] });
        if (wrapperId) editor.noticeStore.show("Wrapper added");
        return true;
      }
      setActiveTool(tool);
      return tool === "actions";
    },
    [getEditor],
  );

  // Canvas elements feed the global search in default mode. Read live from the
  // editor bridge at call time so the result list always reflects the open scene.
  useSearchSource(
    "canvas:elements",
    () => {
      const editor = getEditor();
      if (!editor) return [];
      return Object.values(editor.state.document.elements).map<SearchItem>((el) => ({
        id: `canvas-element:${el.id}`,
        kind: "element",
        scope: "canvas",
        name: el.name || el.type,
        subtitle: `Element · ${el.type}`,
        run: () => {
          const ed = getEditor();
          if (!ed) return;
          ed.dispatch({ type: "setCanvasStageActive", active: false });
          ed.dispatch({ type: "setSelected", selectedIds: [el.id] });
        },
      }));
    },
    [getEditor],
  );

  // Canvas tools feed the ">" command mode while editing.
  useSearchSource(
    "canvas:tools",
    () =>
      (CANVAS_COMMAND_GROUPS.find((g) => g.label === "Tools")?.commands ?? []).flatMap<SearchItem>(
        (cmd) =>
          cmd.type === "key" && cmd.toolbarToolId
            ? [
                {
                  id: `canvas-tool:${cmd.id}`,
                  kind: "command",
                  mode: "command",
                  scope: "canvas",
                  name: cmd.label,
                  subtitle: "Canvas tool",
                  run: () => handleToolChange(cmd.toolbarToolId as CanvasToolId),
                },
              ]
            : [],
      ),
    [handleToolChange],
  );

  const openSelectedComponentInCanvas = useCallback((): boolean => {
    const editor = getEditor();
    const selectedId = editor?.state.selectedIds.length === 1 ? editor.state.selectedIds[0] : null;
    if (activeTab !== "current" || !selectedId || editor?.sourceId !== "current" || !canOpenCanvasNode(selectedId)) return false;
    openCanvasForNode(selectedId);
    return true;
  }, [activeTab, canOpenCanvasNode, getEditor, openCanvasForNode]);

  useEffect(() => {
    if (!editorTool) return;
    if (editorTool === "select") {
      setActiveTool((prev) => (prev === "cursor" || prev === "hand") ? prev : "cursor");
      return;
    }
    const mapped = EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP[editorTool];
    if (mapped) setActiveTool(mapped);
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

  const navigateToOwnerToken = useCallback(
    (token: string): boolean => {
      const sep = token.indexOf(":");
      const kind = sep >= 0 ? token.slice(0, sep) : "";
      const id = sep >= 0 ? token.slice(sep + 1) : "";
      if (!id) return false;
      if (kind === "variant") {
        navigate(`/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&variant=${encodeURIComponent(id)}`);
        return true;
      }
      if (kind === "screen") {
        navigate(`/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&screen=${encodeURIComponent(id)}`);
        return true;
      }
      return false;
    },
    [navigate, projectId, projectType],
  );

  // Back honors the "from" return context first (set when arriving via Go to
  // component), then falls back to the structural parent.
  const handleBackToParent = useCallback(() => {
    void flushPendingSave();
    if (fromParam && navigateToOwnerToken(fromParam)) return;
    if (parentProjectNode) openProjectNodeCanvas(parentProjectNode);
  }, [flushPendingSave, fromParam, navigateToOwnerToken, parentProjectNode, openProjectNodeCanvas]);

  // Opens the master variant a linked instance points to as the Current subject.
  // Shared by the layers tree and the Inspector's read-only banner.
  const goToInstanceMaster = useCallback(
    (variantId: string) => {
      void flushPendingSave();
      // Going to the master opens it as the Current subject — focus the Current tab
      // (the click may have come from the Versions window).
      changeCanvasTab("current");
      const origin = variantParam
        ? `variant:${variantParam}`
        : screenParam
          ? `screen:${screenParam}`
          : "";
      const fromQuery = origin ? `&from=${encodeURIComponent(origin)}` : "";
      navigate(
        `/canvas?project=${encodeURIComponent(projectId)}&type=${projectType}&variant=${encodeURIComponent(variantId)}${fromQuery}`,
      );
    },
    [flushPendingSave, changeCanvasTab, variantParam, screenParam, navigate, projectId, projectType],
  );

  // The references window shows references attached to the subject currently
  // open in the canvas (a component takes precedence over its screen). Null when
  // there is no concrete subject (e.g. a detached scene).
  const referencesContext = useMemo<CanvasReferencesContext | null>(() => {
    if (!projectId) return null;
    if (component) {
      return {
        projectId,
        ownerType: "component",
        ownerId: component.id,
        defaultComponentId: component.id,
        screens: projectScreens,
        components: projectComponents,
      };
    }
    if (screen) {
      return {
        projectId,
        ownerType: "screen",
        ownerId: screen.id,
        defaultScreenId: screen.id,
        screens: projectScreens,
        components: projectComponents,
      };
    }
    return null;
  }, [projectId, component, screen, projectScreens, projectComponents]);

  const selectedSubjectSize = component
    ? currentDocument.canvas
    : canvasSizeForProjectType(projectType);
  // While a transient pan gesture is active, surface the Hand tool in the toolbar
  // without changing the persistent tool. The gesture reverts to the real active
  // tool on release; only an explicit Hand selection keeps it active.
  const toolbarActiveTool: CanvasToolId = editorPanning ? "hand" : activeTool;

  return (
    <ElementFontTokensProvider value={fontTokens ?? null}>
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg)]">
      <CanvasRender
        treeOpen={treeOpen}
        inspectorOpen={inspectorOpen}
        split={split}
        activeTab={activeTab}
        enabledTabs={enabledCanvasTabs}
        splitWindows={normalizedSplitWindows}
        expanded={canvasExpanded}
        activeTool={activeTool}
        currentDocument={currentDocument}
        currentStorageKey={currentStorageKey}
        currentReady={currentReady}
        extraCurrents={extraCurrents}
        versionsDocument={versionsDocument}
        versionsStorageKey={versionsStorageKey}
        versionsReady={versionsReady}
        onVersionsDocumentChange={handleVersionsDocumentChange}
        projectType={projectType}
        parentTarget={parentProjectNode}
        isComponent={!!component}
        referencesContext={referencesContext}
        ancestorFrames={ancestorFrames}
        shellDeviceVisibility={shellDeviceVisibility}
        shellBackVisibility={shellBackVisibility}
        shellZoomVisibility={shellZoomVisibility}
        shellExpandVisibility={shellExpandVisibility}
        previewSettings={previewSettings}
        onClosePreview={closePreview}
        onCurrentDocumentChange={handleCurrentDocumentChange}
        onActiveCanvasChange={changeCanvasTab}
        onToggleExpand={() => setCanvasExpanded((v) => !v)}
        onBackToParent={handleBackToParent}
        settings={settings}
        onCanvasToolShortcut={handleToolChange}
        onOpenSelectedComponentShortcut={openSelectedComponentInCanvas}
      />

      <div className="fixed left-1/2 top-3 z-[12] -translate-x-1/2">
        <CanvasTabs
          activeTab={activeTab}
          enabledTabs={enabledCanvasTabs}
          onTabChange={changeCanvasTab}
          split={split}
          splitWindows={normalizedSplitWindows}
          canvasFeatures={canvasFeatures}
          extraCurrentKeys={extraCurrents.map((entry) => entry.key)}
          currentSubjects={currentSubjects}
          canAddCurrent={canAddCurrent}
          onAddCurrent={handleAddCurrent}
          onRemoveCurrent={removeExtraCurrent}
          onSplitChange={changeSplitMode}
          onSplitWindowsChange={changeSplitWindows}
          onCanvasFeatureChange={updateCanvasFeature}
        />
      </div>

      <div
        className="fixed left-3 top-3 z-[5] inline-flex items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] tracking-[0.2px] text-[var(--text-muted)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <Link
          to={backHref}
          aria-label="Back"
          onClick={() => { void flushPendingSave(); }}
          className="grid place-items-center text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <IconChevronLeft size={14} strokeWidth={1.6} />
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
        <SearchToggle onClick={openSearch} />
      </div>

      <Tree
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        componentName={
          treeExtraCurrent
            ? (currentSubjects[treeExtraCurrent.key]?.kind === "component" ? currentSubjects[treeExtraCurrent.key]?.name : undefined)
            : componentName || undefined
        }
        screenName={
          treeExtraCurrent
            ? (currentSubjects[treeExtraCurrent.key]?.kind === "screen" ? currentSubjects[treeExtraCurrent.key]?.name : undefined)
            : screenTitle || undefined
        }
        selectedNodeIds={selectedNodeIds}
        autoRevealSelection={settings.canvas.shell.tree.autoRevealSelection}
        canvasActive={editorCanvasActive}
        onSelectNode={(nodeId) => { getEditor()?.dispatch({ type: "setSelected", selectedIds: [nodeId] }); }}
        onMoveNode={(activeNodeId, overNodeId, mode) => {
          const editor = getEditor();
          if (!editor) return;
          const doc = editor.state.document;
          const over = doc.elements[overNodeId];
          if (!over) return;

          let newParentId: string | null;
          let beforeId: string | null;
          if (mode === "inside") {
            // Nest the dragged node inside the hovered one (appended on top).
            newParentId = overNodeId;
            beforeId = null;
          } else {
            newParentId = over.parentId;
            const siblings = over.parentId
              ? doc.elements[over.parentId]?.children ?? []
              : doc.rootIds;
            const overIndex = siblings.indexOf(overNodeId);
            beforeId =
              mode === "before"
                ? overNodeId
                : overIndex >= 0 && overIndex + 1 < siblings.length
                  ? siblings[overIndex + 1]
                  : null;
          }

          const nextDoc = moveElementToParent(doc, activeNodeId, newParentId, beforeId);
          if (nextDoc === doc) return;
          editor.dispatch({ type: "commitDocument", document: nextDoc });
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
        versionsCanOpenNodeCanvas={canOpenVersionNode}
        versionsOnOpenNodeCanvas={openCanvasForVersionNode}
        onGoToInstance={goToInstanceMaster}
        onDetachNode={(nodeId) => {
          const editor = getEditor();
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: detachInstance(editor.state.document, nodeId),
          });
        }}
        onOpenProjectNode={handleOpenProjectNode}
        activeTab={treeTab}
        enabledTabs={enabledCanvasTabs}
        onTabChange={changeCanvasTab}
        projectType={projectType}
        projectTree={projectTree}
        parentNode={parentProjectNode}
        versionsParentNode={versionsBackNode}
        onVersionsBack={goBackVersions}
        subjectSize={selectedSubjectSize}
        versionOptions={versionsVariants}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
        onAddVersion={handleAddVersion}
        currentSubjectId={treeExtraCurrent ? treeExtraSubjectId : component?.id ?? screen?.id ?? null}
        versionsSubjectId={versionsSubject?.id ?? null}
        versionsSubjectName={versionsSubjectDisplayName ?? componentName ?? screenTitle ?? undefined}
        versionsSubjectIsScreen={(versionsSubject?.kind ?? (component ? "component" : "screen")) === "screen"}
        versionsSubjectSize={versionsSubjectSize}
        onSelectVersionsSubject={(node) => selectVersionsSubject({ id: node.id, kind: node.kind })}
        onLinkVersionsToCurrent={() => {
          // Re-point the Versions window at whatever is open in Current, so it shows that
          // element's versions instead of the subject it was left on.
          if (component) setVersionsSubject({ id: component.id, kind: "component" });
          else if (screen) setVersionsSubject({ id: screen.id, kind: "screen" });
        }}
      />
      <TreeToggle open={treeOpen} onClick={() => setTreeOpen(true)} />

      <div className="pointer-events-none fixed bottom-3 right-3 top-3 z-[6] flex flex-col items-end gap-3">
        <PreviewLauncher
          previewOpen={previewOpen}
          onToggle={togglePreview}
          settings={previewSettings}
          onSettingsChange={setPreviewSettings}
          projectType={projectType}
        />
        <div className="flex min-h-0 flex-1">
        <Inspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          shellDeviceVisibility={shellDeviceVisibility}
          shellBackVisibility={shellBackVisibility}
          shellZoomVisibility={shellZoomVisibility}
          shellExpandVisibility={shellExpandVisibility}
          onShellDeviceVisibilityChange={setShellDeviceVisibility}
          onShellBackVisibilityChange={setShellBackVisibility}
          onShellZoomVisibilityChange={setShellZoomVisibility}
          onShellExpandVisibilityChange={setShellExpandVisibility}
          openShellTabSignal={shellTabSignal}
          isComponent={!!component}
          inheritParentBackground={inheritParentBackground}
          hasParent={hasParent}
          onInheritParentBackgroundChange={handleInheritParentBackgroundChange}
          ancestorFrames={ancestorFrames}
          onGoToInstance={goToInstanceMaster}
        />
        </div>
      </div>

      <div className="fixed bottom-6 right-3 z-[11] flex items-center gap-2">
        {!inspectorOpen && (
          <FloatingToggle onClick={() => setInspectorOpen(true)} aria="Inspector">
            <IconPanelRight size={13} strokeWidth={1.7} />
            Inspector
          </FloatingToggle>
        )}
      </div>

      <div className="fixed bottom-6 left-1/2 z-[10] -translate-x-1/2 flex items-end gap-2">
        <CanvasToolbarNotice />
        <Toolbar
          activeTool={toolbarActiveTool}
          onToolChange={handleToolChange}
          canvasExpanded={canvasExpanded}
          canvasControlsVisible={canvasExpanded || splitActive}
          zoom={activeZoom}
          onZoomChange={setActiveZoom}
          zoomLimits={activeZoomLimits}
          projectType={projectType}
          parentTarget={parentProjectNode}
          onBackToParent={handleBackToParent}
          onCanvasExpandedChange={setCanvasExpanded}
          config={toolbarConfig}
          checklistOwner={
            component?.id
              ? { ownerKind: "component", ownerId: component.id }
              : screen?.id
                ? { ownerKind: "screen", ownerId: screen.id }
                : null
          }
          componentPicker={{
            projectId: project?.id ?? null,
            openComponentId: component?.id ?? null,
            graphJSON: resolvedSceneGraphJSON ?? null,
            canvasName: currentCanvasName,
            // Editing a screen's MAIN scene → its own components are native
            // content here; only offer them as links in OTHER screens/versions.
            excludeScreenId:
              screen && currentVariantId === mainVariantIdForScreen(allVariants, screen.id)
                ? screen.id
                : null,
            // Nested components owned by the exact scene being edited are native content
            // here too — never offer them as links into their own origin.
            excludeParentVariantId: currentVariantId ?? null,
          }}
          onBadgeClick={() => {
            setInspectorOpen(true);
            setShellTabSignal((s) => s + 1);
          }}
        />
      </div>

      <VersionModeModal ref={versionModeRef} />
    </div>
    </ElementFontTokensProvider>
  );
}
