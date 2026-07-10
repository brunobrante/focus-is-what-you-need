import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Toolbar } from "@/canvas/shell/Toolbar";
import { VectorToolbar } from "@/canvas/shell/VectorToolbar";
import { CanvasToolbarNotice } from "@/canvas/shell/CanvasToolbarNotice";
import { Inspector } from "@/canvas/shell/Inspector";
import { Tree, TreeToggle, type ProjectTreeNode } from "@/canvas/shell/Tree";
import { FloatingToggle } from "@/canvas/shell/GalleryPanel";
import { SearchToggle } from "@/canvas/shell/SearchPalette";
import { CanvasRender, type ZoomSetter } from "@/canvas/shell/CanvasRender";
import type { CanvasReferencesContext } from "@/canvas/shell/CanvasReferencesWindow";
import type { ShellControlVisibility } from "@/canvas/shell/inspector/ShellTab";
import {
  DEFAULT_SHELL_CONTROLS_BY_WINDOW,
  shellWindowTypeOf,
  type ShellControlKey,
  type ShellControlsByWindow,
  type ShellWindowType,
} from "@/canvas/shell/shellControls";
import { EditorBridgeProvider, useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import { DEFAULT_SHELL_BACKGROUND, detachInstance, moveElementToParent, setElementLocked, setElementVisible, updateShellBackground, wrapElements } from "@/canvas/engine/actions";
import { buildMasterResolver, canvasDocumentFromHtmlGraphJSON, getInheritedShellBackgroundFromGraph } from "@/canvas/engine/htmlSceneAdapter";
import { getScenesSnapshot } from "@/application/scenes/useScenesSnapshot";
import type { CanvasToolId } from "@/canvas/tools";
import type { CanvasDocument } from "@/canvas/engine/types";
import { createToolbarConfig } from "@/canvas/toolbarConfig";
import { EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP } from "@/canvas/stage/canvasShellStyle";
import { useResolvedCanvasSettings } from "@/application/settings/useResolvedCanvasSettings";
import { useProjectFontTokens } from "@/application/settings/useProjectFontTokens";
import { ElementFontTokensProvider } from "@/canvas/stage/elementFontTokensContext";
import { CanvasUiVisibilityProvider } from "@/canvas/CanvasUiVisibilityContext";
import { useProjectSystemDesign } from "@/application/system-design/useSystemDesign";
import { ResolvedSystemDesignProvider } from "@/canvas/stage/resolvedSystemDesignContext";
import { ReferencesBridgeProvider, useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";
import { useSearch, useSearchSource } from "@/application/search/SearchProvider";
import { CANVAS_COMMAND_GROUPS } from "@/domain/settings/commands";
import type { SearchItem } from "@/domain/search/searchTypes";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import { svgForIconDocument } from "@/lib/canvas/export/svgExport";
import { writeIconArtBack } from "@/application/system-design/iconCanvas";
import { CanvasTabs } from "./CanvasTabs";
import { useAllVariants, useIcon, useScene } from "@/lib/storage/hooks";
import { mainVariantIdForScreen } from "@/lib/storage/repos/scenes.repo";
import { parentVariantIdOf, screenIdOfComponent } from "@/application/graph/componentOwnership";
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
  isFactoryMockDocument,
  mockTargetKey,
  normalizeProjectType,
  shouldUseMockGraph,
  type AncestorFrame,
  type CanvasWindowKey,
} from "./canvasUtils";
import { PreviewLauncher } from "./shell/PreviewLauncher";
import { IconChevronLeft, IconPanelRight } from "@/components/icons";
import { SKETCH_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";

export type { SplitMode } from "./canvasUtils";

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

// Sidebar resize bounds (session-only). Defaults preserve the prior fixed sizes.
const TREE_DEFAULT_WIDTH = 300;
const TREE_MIN_WIDTH = 240;
const TREE_MAX_WIDTH = 480;
const INSPECTOR_DEFAULT_WIDTH = 280;
const INSPECTOR_MIN_WIDTH = 240;
const INSPECTOR_MAX_WIDTH = 420;

export function CanvasPage() {
  return (
    <EditorBridgeProvider>
      <ReferencesBridgeProvider>
        <CanvasPageContent />
      </ReferencesBridgeProvider>
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
  // When editing an icon master, the optional `systemDesign` param lets the
  // save-back also refresh the referencing token's cached SVG (a draft icon has
  // no design, so this is empty and only the IconRow cache updates).
  const iconSystemDesignParam = params.get("systemDesign") || "";

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

  const { open: openSearch } = useSearch();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  // Session-only sidebar widths. Defaults match the historical fixed sizes; a
  // drag handle on each panel's inner edge mutates these and the canvas inset
  // recomputes from them. Not persisted — they reset on reload by design.
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  // Figma-style "Hide UI": collapses all floating chrome to a bare canvas.
  const [uiHidden, setUiHidden] = useState(false);
  const panelsOpen = treeOpen || inspectorOpen;
  const uiVisibility = useMemo(
    () => ({
      uiHidden,
      toggleUiHidden: () => setUiHidden((v) => !v),
      panelsOpen,
      togglePanels: () => {
        const next = !panelsOpen;
        setTreeOpen(next);
        setInspectorOpen(next);
      },
    }),
    [uiHidden, panelsOpen],
  );
  const [activeTool, setActiveTool] = useState<CanvasToolId>("cursor");
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  // Shell chrome controls are per window type (current/sketch/versions/references),
  // not shared — each window keeps its own device/back/zoom/expand visibility.
  const [shellControls, setShellControls] = useState<ShellControlsByWindow>(
    DEFAULT_SHELL_CONTROLS_BY_WINDOW,
  );
  const updateShellControl = useCallback(
    (windowType: ShellWindowType, key: ShellControlKey, value: ShellControlVisibility) => {
      setShellControls((prev) => ({
        ...prev,
        [windowType]: { ...prev[windowType], [key]: value },
      }));
    },
    [],
  );
  const [shellTabSignal, setShellTabSignal] = useState(0);
  const [sketchResetKey, setSketchResetKey] = useState(0);
  const clearSketch = useCallback(() => {
    localStorage.removeItem(SKETCH_CANVAS_STORAGE_KEY);
    setSketchResetKey((k) => k + 1);
  }, []);
  const { settings } = useResolvedCanvasSettings(projectIdParam || null);
  const fontTokens = useProjectFontTokens(projectIdParam || null);
  const projectSystemDesign = useProjectSystemDesign(projectIdParam || null);

  const editorTool = useEditorBridge((v) => v?.state.tool);
  const editorPanning = useEditorBridge((v) => v?.state.panning ?? false);
  const activeZoom = useEditorBridge((v) => v?.state.zoom);
  const activeViewportMode = useEditorBridge((v) => v?.state.viewportMode);
  const selectedNodeIds = useEditorBridge((v) => {
    if (!v || v.state.canvasStageActive) return [];
    return v.state.selectedIds;
  }, stringArraysEqual);
  const editorCanvasActive = useEditorBridge((v) => v?.state.canvasStageActive ?? false);
  const pathEditActive = useEditorBridge((v) => Boolean(v?.state.pathEditId));
  const vectorTool = useEditorBridge((v) => v?.state.vectorTool ?? "move");
  const getEditor = useEditorBridgeReader();

  const { data: allVariants } = useAllVariants();
  const parentSceneOwner = useMemo(() => {
    if (!component) return null;
    const parentVariantId = parentVariantIdOf(component.id);
    if (parentVariantId) return { ownerType: "variant" as const, ownerId: parentVariantId };
    const screenId = screenIdOfComponent(component.id);
    if (screenId) {
      // A top-level component's parent scene is the screen's main variant.
      const mainVariantId = mainVariantIdForScreen(allVariants, screenId);
      if (mainVariantId) return { ownerType: "variant" as const, ownerId: mainVariantId };
    }
    return null;
  }, [component?.id, allVariants]);

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
  // ENG-6: parse the persisted graph ONCE (plain, no instance resolution) and reuse
  // the document for both the factory-mock check and the mock-vs-persisted decision,
  // instead of re-parsing the same string in each. `currentDocument` below still
  // re-parses with promoteSubjectRoot + resolveMaster (a structurally different doc).
  const persistedPlainDoc = useMemo(
    () => canvasDocumentFromHtmlGraphJSON(currentSceneGraphJSON),
    [currentSceneGraphJSON],
  );
  // Memoized so the mock filter runs only when the graph actually changes, not on
  // every Canvas render (and so the ref stays stable downstream).
  const effectiveSceneGraphJSON = useMemo(
    () =>
      !canUseFactoryMocks && isFactoryMockDocument(persistedPlainDoc)
        ? null
        : currentSceneGraphJSON,
    [canUseFactoryMocks, currentSceneGraphJSON, persistedPlainDoc],
  );
  // The plain doc that matches `effectiveSceneGraphJSON` (null when the factory mock
  // was filtered out above), passed to shouldUseMockGraph without a re-parse.
  const effectivePersistedDoc =
    effectiveSceneGraphJSON === null ? null : persistedPlainDoc;

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

  // Parse the mock graph once (plain) so shouldUseMockGraph compares two already-parsed
  // documents (ENG-6).
  const mockPlainDoc = useMemo(
    () => canvasDocumentFromHtmlGraphJSON(mockScene.graphJSON ?? null),
    [mockScene.graphJSON],
  );

  const resolvedSceneGraphJSON = useMemo(() => {
    if (
      mockScene.graphJSON &&
      shouldUseMockGraph({
        persistedDoc: effectivePersistedDoc,
        mockDoc: mockPlainDoc,
        projectType,
        targetKind: component ? "component" : "screen",
      })
    ) {
      return mockScene.graphJSON;
    }
    return effectiveSceneGraphJSON;
  }, [component, effectivePersistedDoc, effectiveSceneGraphJSON, mockPlainDoc, mockScene.graphJSON, projectType]);

  const hasParent =
    !!component &&
    (!!(parentVariantIdOf(component.id)) ||
      !!(screenIdOfComponent(component.id)));
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
    () => buildMasterResolver(getScenesSnapshot()),
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
  }, [projectType, resolvedSceneGraphJSON, effectiveShellBackground, resolveMaster]);

  const currentReady =
    (!sceneOwner || !sceneLoading) &&
    !entityLoading &&
    !mockScene.loading &&
    mockScene.key === currentMockTargetKey;

  const screenTitle = screen?.title ?? "";
  const componentName = component?.name ?? "";
  // An icon master owns the opened variant (ownerKind "icon"); its id is the
  // variant's ownerId. Drives the save-back and the canvas subject label.
  const iconMasterId = variant?.ownerKind === "icon" ? variant.ownerId : null;
  const { data: iconRow } = useIcon(iconMasterId);
  const iconName = iconRow?.name ?? "";
  const currentCanvasName = componentName || screenTitle || iconName || projectName || "Canvas";

  // Icon save-back: when this canvas edits an icon master, serialize the whole
  // artboard (its paths are direct children — no sealed container) after each scene
  // save and refresh the IconRow's cached SVG (and, when opened from a System
  // Design, the referencing token's cached SVG).
  const onScenePersisted = useCallback(
    (doc: CanvasDocument) => {
      if (!iconMasterId) return;
      const raw = svgForIconDocument(doc, currentCanvasName);
      if (!raw) return;
      void writeIconArtBack(iconMasterId, raw, iconSystemDesignParam || undefined);
    },
    [iconMasterId, iconSystemDesignParam, currentCanvasName],
  );

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
    onScenePersisted,
  });

  const projectTree = useMemo(
    () => buildProjectTree(projectScreens, projectComponents),
    [projectComponents, projectScreens],
  );

  const parentProjectNode = useMemo<ProjectTreeNode | null>(() => {
    if (!component) return null;
    const parentVariantId = parentVariantIdOf(component.id);
    const screenId = screenIdOfComponent(component.id);
    if (!parentVariantId && screenId) {
      return projectTree.find((n) => n.id === screenId) ?? null;
    }
    if (parentVariantId) {
      const parentComponent = projectComponents.find(
        (c) => c.activeVariantId === parentVariantId,
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

  // Hide a single split pane (mirrors the Panels menu's per-pane "×"), keyed by
  // window instead of index so the canvas context menu can close the pane it was
  // opened in.
  const hideWindow = useCallback(
    (key: CanvasWindowKey) => {
      // Extra Current instances ("current-2", …) are owned session state.
      if (isCurrentKey(key) && key !== "current") {
        removeExtraCurrent(key);
        return;
      }
      // Any pane — including the primary "current" — is just dropped from the
      // split. With ≥2 panes left the split continues; below 2 it collapses.
      const next = normalizedSplitWindows.filter((windowKey) => windowKey !== key);
      changeCanvasTab(next[0] ?? "current");
      changeSplitWindows(next);
      if (next.length < 2) changeSplitMode("none");
      else if (split === "grid" && next.length < 3) changeSplitMode("vertical");
    },
    [normalizedSplitWindows, removeExtraCurrent, changeSplitWindows, changeCanvasTab, changeSplitMode, split],
  );

  // Only the Current window is live (no feature window enabled, no extra Currents):
  // the top nav has nothing to switch between, so it's hidden and the window controls
  // move into the Inspector's Layout tab instead. The canvas also rises to the top.
  const onlyCurrentWindow =
    !enabledCanvasTabs.some((tab) => tab !== "current" && tab !== "preview") &&
    extraCurrents.length === 0;
  const navbarVisible = !onlyCurrentWindow;

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

  // shellBackground has two non-redundant owners (ENG-10): `currentDocument`
  // seeds it into the INITIAL document so the first paint has the right colour
  // (no flash), while this effect is the live-sync owner that pushes later
  // changes (a settings toggle, or a parent scene edit) into the already-seeded
  // editor. The equality guard makes the two cooperate: when the seed already
  // carries the current value, this effect no-ops, so there is no double commit.
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
  const referencesZoom = useReferencesBridge().zoom;

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

  // When the focused window is References, the toolbar drives the references stage's
  // step-zoom (published to the bridge) instead of the canvas editor zoom — so the
  // expanded toolbar zoom works the same as it does for Current/Sketch/Versions.
  // References focused with no open item → no zoom in the toolbar (the `?.` leaves it
  // undefined, which the toolbar reads as "hide the zoom control"), matching the rule
  // that the zoom only shows when there is an item.
  const referencesFocused = treeTab === "references";
  const toolbarZoom = referencesFocused ? referencesZoom?.value : activeZoom;
  const toolbarZoomChange = referencesFocused ? referencesZoom?.onChange : setActiveZoom;
  const toolbarZoomLimits = referencesFocused ? referencesZoom?.limits : activeZoomLimits;

  // The Inspector's Shell tab edits the focused window's own controls.
  const activeShellWindowType = shellWindowTypeOf(treeTab);
  const activeShellControls = shellControls[activeShellWindowType];

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

  // A component or an icon master sizes its own artboard (an icon is 24×24, not a
  // device). Only a screen's frame matches the project's device size.
  const selectedSubjectSize = component || iconMasterId
    ? currentDocument.canvas
    : canvasSizeForProjectType(projectType);
  // While a transient pan gesture is active, surface the Hand tool in the toolbar
  // without changing the persistent tool. The gesture reverts to the real active
  // tool on release; only an explicit Hand selection keeps it active.
  const toolbarActiveTool: CanvasToolId = editorPanning ? "hand" : activeTool;

  // When the canvas has risen to the top (only the Current window) and a side panel
  // is closed, its top-row chrome drops to the bottom corner next to that panel's
  // reopen toggle: the header beside Layers (left), the Preview beside Inspector (right).
  const dropHeaderToBottom = onlyCurrentWindow && !treeOpen;
  const dropPreviewToBottom = onlyCurrentWindow && !inspectorOpen;

  const headerChipClass =
    "flex items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[#171717] px-3 py-2 text-[12px] tracking-[0.2px] text-[var(--text-muted)]";
  // An isolated subject (a draft/icon with no project) has no structural home to
  // link to — its `backHref` would fall to "/". Return to wherever it was opened
  // from (Drafts, a System Design, …) via history instead.
  const isolatedSubject = !projectId;
  const backButtonClass = "grid shrink-0 place-items-center text-[var(--text-muted)] hover:text-[var(--text)]";
  const headerChipInner = (
    <>
      {isolatedSubject ? (
        <button
          type="button"
          aria-label="Back"
          onClick={() => { void flushPendingSave(); navigate(-1); }}
          className={backButtonClass}
        >
          <IconChevronLeft size={14} strokeWidth={1.6} />
        </button>
      ) : (
        <Link
          to={backHref}
          aria-label="Back"
          onClick={() => { void flushPendingSave(); }}
          className={backButtonClass}
        >
          <IconChevronLeft size={14} strokeWidth={1.6} />
        </Link>
      )}
      <span className="h-3.5 w-px shrink-0 bg-[var(--border)]" />
      <span className="min-w-0 truncate font-medium text-[var(--text)]">
        {componentName || screenTitle || iconName || projectName}
      </span>
      {projectType && (
        <span className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
          {projectType}
        </span>
      )}
      <span className="flex-1" />
      <span className="h-3.5 w-px shrink-0 bg-[var(--border)]" />
      <SearchToggle onClick={openSearch} />
    </>
  );

  const previewLauncher = (
    <PreviewLauncher
      previewOpen={previewOpen}
      onToggle={togglePreview}
      settings={previewSettings}
      onSettingsChange={setPreviewSettings}
      projectType={projectType}
      compact={!inspectorOpen}
      menuUp={dropPreviewToBottom}
    />
  );

  return (
    <ElementFontTokensProvider value={fontTokens ?? null}>
    <ResolvedSystemDesignProvider value={projectSystemDesign.resolved}>
    <CanvasUiVisibilityProvider value={uiVisibility}>
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--bg)]">
      <CanvasRender
        treeOpen={treeOpen && !uiHidden}
        inspectorOpen={inspectorOpen && !uiHidden}
        treeWidth={treeWidth}
        inspectorWidth={inspectorWidth}
        split={split}
        activeTab={activeTab}
        enabledTabs={enabledCanvasTabs}
        splitWindows={normalizedSplitWindows}
        navbarVisible={navbarVisible}
        onHideWindow={hideWindow}
        expanded={canvasExpanded || uiHidden}
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
        isIconSubject={!!iconMasterId}
        referencesContext={referencesContext}
        ancestorFrames={ancestorFrames}
        shellControls={shellControls}
        previewSettings={previewSettings}
        onClosePreview={closePreview}
        onCurrentDocumentChange={handleCurrentDocumentChange}
        onActiveCanvasChange={changeCanvasTab}
        onToggleExpand={() => setCanvasExpanded((v) => !v)}
        onBackToParent={handleBackToParent}
        settings={settings}
        onCanvasToolShortcut={handleToolChange}
        onOpenSelectedComponentShortcut={openSelectedComponentInCanvas}
        sketchResetKey={sketchResetKey}
      />

      {!uiHidden && navbarVisible && (
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
      )}

      {!uiHidden && !dropHeaderToBottom && (
      <div
        className={`fixed left-3 top-3 z-[5] ${headerChipClass}`}
        style={{ boxShadow: "var(--shadow-pop)", width: treeOpen ? treeWidth : undefined }}
      >
        {headerChipInner}
      </div>
      )}

      {!uiHidden && (
      <>
      <Tree
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        width={treeWidth}
        minWidth={TREE_MIN_WIDTH}
        maxWidth={TREE_MAX_WIDTH}
        onResize={setTreeWidth}
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
        subjectName={iconName || undefined}
        isIcon={!!iconMasterId}
        isolated={!projectId}
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
        onClearSketch={clearSketch}
      />
      <div className="fixed bottom-6 left-3 z-[11] flex items-center gap-2">
        <TreeToggle open={treeOpen} onClick={() => setTreeOpen(true)} />
        {dropHeaderToBottom && (
          <div className={headerChipClass} style={{ boxShadow: "var(--shadow-pop)" }}>
            {headerChipInner}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed bottom-3 right-3 top-3 z-[6] flex flex-col items-end gap-3">
        {!dropPreviewToBottom && previewLauncher}
        <div className="flex min-h-0 flex-1">
        <Inspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          width={inspectorWidth}
          minWidth={INSPECTOR_MIN_WIDTH}
          maxWidth={INSPECTOR_MAX_WIDTH}
          onResize={setInspectorWidth}
          shellDeviceVisibility={activeShellControls.device}
          shellBackVisibility={activeShellControls.back}
          shellZoomVisibility={activeShellControls.zoom}
          shellExpandVisibility={activeShellControls.expand}
          onShellDeviceVisibilityChange={(v) => updateShellControl(activeShellWindowType, "device", v)}
          onShellBackVisibilityChange={(v) => updateShellControl(activeShellWindowType, "back", v)}
          onShellZoomVisibilityChange={(v) => updateShellControl(activeShellWindowType, "zoom", v)}
          onShellExpandVisibilityChange={(v) => updateShellControl(activeShellWindowType, "expand", v)}
          openShellTabSignal={shellTabSignal}
          isComponent={!!component}
          inheritParentBackground={inheritParentBackground}
          hasParent={hasParent}
          onInheritParentBackgroundChange={handleInheritParentBackgroundChange}
          ancestorFrames={ancestorFrames}
          onGoToInstance={goToInstanceMaster}
          activeCanvasTab={treeTab}
          canvasFeatures={canvasFeatures}
          onCanvasFeatureChange={updateCanvasFeature}
        />
        </div>
      </div>

      <div className="fixed bottom-6 right-3 z-[11] flex items-center gap-2">
        {dropPreviewToBottom && previewLauncher}
        {!inspectorOpen && (
          <FloatingToggle onClick={() => setInspectorOpen(true)} aria="Inspector">
            <IconPanelRight size={13} strokeWidth={1.7} />
            Inspector
          </FloatingToggle>
        )}
      </div>
      </>
      )}

      {!uiHidden && (
      <div className="fixed bottom-6 left-1/2 z-[10] -translate-x-1/2 flex items-end gap-2">
        <CanvasToolbarNotice />
        {pathEditActive ? (
          <VectorToolbar
            active={vectorTool}
            onSelect={(tool) => getEditor()?.dispatch({ type: "setVectorTool", vectorTool: tool })}
            onDone={() => getEditor()?.dispatch({ type: "exitPathEdit" })}
          />
        ) : (
        <Toolbar
          activeTool={toolbarActiveTool}
          onToolChange={handleToolChange}
          canvasExpanded={canvasExpanded}
          canvasControlsVisible={canvasExpanded || splitActive}
          zoom={toolbarZoom}
          onZoomChange={toolbarZoomChange}
          zoomLimits={toolbarZoomLimits}
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
        )}
      </div>
      )}

      <VersionModeModal ref={versionModeRef} />
    </div>
    </CanvasUiVisibilityProvider>
    </ResolvedSystemDesignProvider>
    </ElementFontTokensProvider>
  );
}
