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
import { buildMasterResolver, canvasDocumentFromHtmlGraphJSON, getInheritedShellBackgroundFromGraph, getNodeAbsoluteBoundsInGraph } from "@/canvas/engine/htmlSceneAdapter";
import { peekTable, TABLES } from "@/lib/storage/store";
import type { SceneRow } from "@/lib/storage/schema";
import type { CanvasToolId } from "@/canvas/tools";
import { createToolbarConfig } from "@/canvas/toolbarConfig";
import { EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP } from "@/canvas/stage/canvasShellStyle";
import { useGlobalSettings } from "@/application/settings/useGlobalSettings";
import { useSearch, useSearchSource } from "@/application/search/SearchProvider";
import { CANVAS_COMMAND_GROUPS } from "@/domain/settings/commands";
import type { SearchItem } from "@/domain/search/searchTypes";
import { putGlobalSettings } from "@/lib/storage/repos/settings.repo";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import { CanvasTabs } from "./CanvasTabs";
import { useAllVariants, useScene, useVariant } from "@/lib/storage/hooks";
import { mainVariantIdForScreen } from "@/lib/storage/repos/scenes.repo";
import { createScreenVersion } from "@/lib/storage/repos/screens.repo";
import { duplicateVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import { VersionModeModal, type VersionModeModalHandle } from "@/components/modals/VersionModeModal";
import { useCanvasEntities } from "./hooks/useCanvasEntities";
import { useMockScene } from "./hooks/useMockScene";
import { useDeferredPersistence } from "./hooks/useDeferredPersistence";
import { useVersionScenePersistence } from "./hooks/useVersionScenePersistence";
import { useCanvasNavigation } from "./hooks/useCanvasNavigation";
import {
  DEFAULT_CANVAS_FEATURES,
  addCanvasWindowToSplit,
  buildProjectTree,
  canvasSizeForProjectType,
  computeComponentDeviceOrigin,
  createBlankDocumentForProjectType,
  enabledCanvasWindowTypes,
  findTreeNodeById,
  isFactoryMockGraphJSON,
  mockTargetKey,
  normalizeCanvasSplitWindows,
  normalizeProjectType,
  shouldUseMockGraph,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
  type CanvasSplitWindows,
  type CanvasWindowType,
  type SplitMode,
} from "./canvasUtils";
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
  const [activeTab, setActiveTab] = useState<CanvasWindowType>(
    versionVariantParam ? "versions" : "current",
  );
  const [treeTab, setTreeTab] = useState<CanvasWindowType>(
    versionVariantParam ? "versions" : "current",
  );
  const [split, setSplit] = useState<SplitMode>("none");
  const [splitWindows, setSplitWindows] = useState<CanvasSplitWindows>(["current", "drafts"]);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [canvasFeatures, setCanvasFeatures] = useState<CanvasFeatureFlags>(() => ({
    ...DEFAULT_CANVAS_FEATURES,
    // The references window is now a real, wired surface — make it reachable.
    references: true,
    // The Versions window is a persistent surface bound to the current subject's
    // variants — always reachable, not gated on a URL param.
    versions: true,
  }));
  const [shellDeviceVisibility, setShellDeviceVisibility] = useState<ShellControlVisibility>("show");
  const [shellBackVisibility, setShellBackVisibility] = useState<ShellControlVisibility>("show");
  const [shellZoomVisibility, setShellZoomVisibility] = useState<ShellControlVisibility>("show");
  const [shellExpandVisibility, setShellExpandVisibility] = useState<ShellControlVisibility>("hover");
  const [shellTabSignal, setShellTabSignal] = useState(0);
  const { settings } = useGlobalSettings();
  const enabledCanvasTabs = useMemo(
    () => enabledCanvasWindowTypes(canvasFeatures),
    [canvasFeatures],
  );
  const normalizedSplitWindows = useMemo(
    () => normalizeCanvasSplitWindows(splitWindows, enabledCanvasTabs),
    [enabledCanvasTabs, splitWindows],
  );

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

  // The device overlay's "original position" must be the component's absolute
  // position on the screen (device), which means walking the full ancestry — a
  // component nested inside another component is positioned relative to that
  // parent's frame, not the device. That walk loads ancestor scenes, so it runs
  // async into state rather than a synchronous useMemo.
  const [componentOriginPosition, setComponentOriginPosition] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!component?.sourceNodeId) {
      setComponentOriginPosition(null);
      return;
    }
    let cancelled = false;
    void computeComponentDeviceOrigin(component, projectComponents).then((origin) => {
      if (!cancelled) setComponentOriginPosition(origin);
    });
    return () => {
      cancelled = true;
    };
  }, [component, projectComponents]);

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

  // --- Versions window: a persistent second canvas, decoupled from Current. The user
  // picks ANY screen or component (first dropdown) and then one of its versions (second
  // dropdown), and the selected version renders as an editable surface — a clone of
  // Current. The `versionVariant` URL param only pre-selects and focuses; the window is
  // always there, never created on open.
  const [versionsSubject, setVersionsSubject] = useState<{
    id: string;
    kind: "screen" | "component";
  } | null>(null);
  // Seed the versions subject from the current subject until the user picks another one.
  useEffect(() => {
    if (versionsSubject) return;
    if (component) setVersionsSubject({ id: component.id, kind: "component" });
    else if (screen) setVersionsSubject({ id: screen.id, kind: "screen" });
  }, [component, screen, versionsSubject]);

  // Every variant of the selected versions subject, main first. Filtered from the full
  // variant table so the subject can roam the whole project, not just the open one.
  const versionsSubjectVariants = useMemo(() => {
    if (!versionsSubject) return [];
    return allVariants
      .filter((v) => v.ownerKind === versionsSubject.kind && v.ownerId === versionsSubject.id)
      .slice()
      .sort((a, b) => a.order - b.order);
  }, [allVariants, versionsSubject]);

  // The Versions window browses real versions (V1, V2…) — never the main, and never
  // the variant already open in Current (that would mount two editors on one scene).
  const currentVariantId = sceneOwner?.ownerId ?? null;
  const availableVersions = useMemo(
    () => versionsSubjectVariants.filter((v) => v.order > 0 && v.id !== currentVariantId),
    [versionsSubjectVariants, currentVariantId],
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(versionVariantParam || null);
  // Opening a version (URL param) selects it.
  useEffect(() => {
    if (versionVariantParam) setSelectedVersionId(versionVariantParam);
  }, [versionVariantParam]);
  // Keep the selection valid against the available versions (e.g. after switching the
  // subject), defaulting to the first. Null when there are none → the window shows its
  // empty state. `versionsSubjectVariants` always has the main once loaded, so an empty
  // array means "still loading" — don't clobber a URL-selected version then.
  useEffect(() => {
    if (versionsSubjectVariants.length === 0) return;
    if (selectedVersionId && availableVersions.some((v) => v.id === selectedVersionId)) return;
    setSelectedVersionId(availableVersions[0]?.id ?? null);
  }, [versionsSubjectVariants, availableVersions, selectedVersionId]);

  const versionsVariants = useMemo(
    () => availableVersions.map((v) => ({ id: v.id, label: variantVersionLabel(v) })),
    [availableVersions],
  );

  const versionSceneOwner = selectedVersionId
    ? { ownerType: "variant" as const, ownerId: selectedVersionId }
    : null;
  const { data: versionScene, loading: versionSceneLoading } = useScene(
    versionSceneOwner?.ownerType ?? null,
    versionSceneOwner?.ownerId ?? null,
  );
  const { data: selectedVersionRow } = useVariant(selectedVersionId);
  const versionGraphJSON = versionScene?.graphJSON ?? null;
  const versionsReady = !versionSceneOwner || !versionSceneLoading;
  const versionsStorageKey = selectedVersionId
    ? `desktop-canvas-editor:versions:${selectedVersionId}:v1`
    : "desktop-canvas-editor:versions:none:v1";
  const versionsResolveMaster = useMemo(
    () => buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)),
    [versionGraphJSON],
  );
  const versionsDocument = useMemo(() => {
    if (!selectedVersionId) return undefined;
    return (
      canvasDocumentFromHtmlGraphJSON(versionGraphJSON, {
        promoteSubjectRoot: true,
        resolveMaster: versionsResolveMaster,
      }) ?? createBlankDocumentForProjectType(projectType)
    );
  }, [selectedVersionId, versionGraphJSON, projectType, versionsResolveMaster]);
  const versionsCanvasName =
    selectedVersionRow?.name || component?.name || screen?.title || projectName || "Version";
  const handleVersionsDocumentChange = useVersionScenePersistence({
    variantId: selectedVersionId,
    ready: versionsReady,
    baseGraphJSON: versionGraphJSON,
    canvasName: versionsCanvasName,
  });

  // Opening a version (URL param) focuses the Versions window.
  useEffect(() => {
    if (!versionVariantParam) return;
    setActiveTab("versions");
    setTreeTab("versions");
  }, [versionVariantParam]);

  // "Add version" from the Versions window: create a new version of the SELECTED versions
  // subject (Linked/Copy chosen via the modal) and focus the Versions window. The new
  // version appears in the dropdown; when it is the subject's first version it auto-shows.
  const versionModeRef = useRef<VersionModeModalHandle>(null);
  const handleAddVersion = useCallback(() => {
    const subject = versionsSubject;
    if (!subject) return;
    versionModeRef.current?.open({
      onSelect: async (mode) => {
        if (subject.kind === "component") {
          const mainId = versionsSubjectVariants.find((v) => v.order <= 0)?.id;
          if (!mainId) return;
          await duplicateVariant({
            ownerKind: "component",
            ownerId: subject.id,
            sourceVariantId: mainId,
            name: `Variant ${versionsSubjectVariants.length + 1}`,
            mode,
          });
        } else {
          await createScreenVersion({ screenId: subject.id, mode });
        }
        setActiveTab("versions");
        setTreeTab("versions");
      },
    });
  }, [versionsSubject, versionsSubjectVariants]);

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

  // Display info for the Versions window's first ("Screen") dropdown: the selected
  // subject's tree node (name + kind) and the rendered version's intrinsic size.
  const versionsSubjectNode = useMemo<ProjectTreeNode | null>(
    () => (versionsSubject ? findTreeNodeById(projectTree, versionsSubject.id) : null),
    [versionsSubject, projectTree],
  );
  const versionsSubjectSize = versionsDocument?.canvas;

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

  useEffect(() => {
    if (!enabledCanvasTabs.includes(activeTab)) setActiveTab("current");
    if (!enabledCanvasTabs.includes(treeTab)) setTreeTab("current");
    setSplitWindows((current) => normalizeCanvasSplitWindows(current, enabledCanvasTabs));
    if (split !== "none" && (enabledCanvasTabs.length < 2 || normalizedSplitWindows.length < 2)) {
      setSplit("none");
    } else if (split === "grid" && normalizedSplitWindows.length < 3) {
      setSplit("vertical");
    }
  }, [activeTab, enabledCanvasTabs, normalizedSplitWindows.length, split, treeTab]);

  const changeCanvasTab = useCallback((tab: CanvasWindowType) => {
    const nextTab = enabledCanvasTabs.includes(tab) ? tab : "current";
    setActiveTab(nextTab);
    setTreeTab(nextTab);
    if (split !== "none" && enabledCanvasTabs.length >= 2) {
      setSplitWindows((current) => addCanvasWindowToSplit(current, enabledCanvasTabs, nextTab));
    }
  }, [enabledCanvasTabs, split]);

  const changeSplitMode = useCallback((mode: SplitMode) => {
    if (mode !== "none" && enabledCanvasTabs.length < 2) {
      setSplit("none");
      return;
    }
    const nextMode =
      mode === "grid" && normalizedSplitWindows.length < 3
        ? "vertical"
        : mode;
    setSplit(nextMode);
    if (mode !== "none") {
      setSplitWindows((current) => normalizeCanvasSplitWindows(current, enabledCanvasTabs));
    }
  }, [enabledCanvasTabs, normalizedSplitWindows.length]);

  const changeSplitWindows = useCallback((windows: readonly CanvasWindowType[]) => {
    setSplitWindows(normalizeCanvasSplitWindows(windows, enabledCanvasTabs));
  }, [enabledCanvasTabs]);

  const updateCanvasFeature = useCallback((feature: CanvasFeatureWindowType, enabled: boolean) => {
    setCanvasFeatures((current) => {
      if (current[feature] === enabled) return current;
      return { ...current, [feature]: enabled };
    });
  }, []);
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

  const splitActive = split !== "none";
  const selectedSubjectSize = component
    ? currentDocument.canvas
    : canvasSizeForProjectType(projectType);
  // While a transient pan gesture is active, surface the Hand tool in the toolbar
  // without changing the persistent tool. The gesture reverts to the real active
  // tool on release; only an explicit Hand selection keeps it active.
  const toolbarActiveTool: CanvasToolId = editorPanning ? "hand" : activeTool;

  return (
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
        versionsDocument={versionsDocument}
        versionsStorageKey={versionsStorageKey}
        versionsReady={versionsReady}
        onVersionsDocumentChange={handleVersionsDocumentChange}
        projectType={projectType}
        parentTarget={parentProjectNode}
        isComponent={!!component}
        referencesContext={referencesContext}
        componentOriginPosition={componentOriginPosition}
        shellDeviceVisibility={shellDeviceVisibility}
        shellBackVisibility={shellBackVisibility}
        shellZoomVisibility={shellZoomVisibility}
        shellExpandVisibility={shellExpandVisibility}
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
        componentName={componentName || undefined}
        screenName={screenTitle || undefined}
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
        onGoToInstance={(variantId) => {
          void flushPendingSave();
          // Going to the master opens it as the Current subject — focus the Current tab
          // (the click may have come from the Versions window's layers tree).
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
        }}
        onDetachNode={(nodeId) => {
          const editor = getEditor();
          if (!editor) return;
          editor.dispatch({
            type: "commitDocument",
            document: detachInstance(editor.state.document, nodeId),
          });
        }}
        onOpenProjectNode={openProjectNodeCanvas}
        activeTab={treeTab}
        enabledTabs={enabledCanvasTabs}
        onTabChange={changeCanvasTab}
        projectType={projectType}
        projectTree={projectTree}
        parentNode={parentProjectNode}
        subjectSize={selectedSubjectSize}
        versionOptions={versionsVariants}
        selectedVersionId={selectedVersionId}
        onSelectVersion={setSelectedVersionId}
        onAddVersion={handleAddVersion}
        currentSubjectId={component?.id ?? screen?.id ?? null}
        versionsSubjectId={versionsSubject?.id ?? null}
        versionsSubjectName={versionsSubjectNode?.name ?? componentName ?? screenTitle ?? undefined}
        versionsSubjectIsScreen={(versionsSubject?.kind ?? (component ? "component" : "screen")) === "screen"}
        versionsSubjectSize={versionsSubjectSize}
        onSelectVersionsSubject={(node) => setVersionsSubject({ id: node.id, kind: node.kind })}
        onLinkVersionsToCurrent={() => {
          // Re-point the Versions window at whatever is open in Current, so it shows that
          // element's versions instead of the subject it was left on.
          if (component) setVersionsSubject({ id: component.id, kind: "component" });
          else if (screen) setVersionsSubject({ id: screen.id, kind: "screen" });
        }}
      />
      <TreeToggle open={treeOpen} onClick={() => setTreeOpen(true)} />

      <div className="pointer-events-none fixed bottom-3 right-3 top-3 z-[6] flex items-stretch gap-3">
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
        />
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
          onBadgeClick={() => {
            setInspectorOpen(true);
            setShellTabSignal((s) => s + 1);
          }}
        />
      </div>

      <VersionModeModal ref={versionModeRef} />
    </div>
  );
}
