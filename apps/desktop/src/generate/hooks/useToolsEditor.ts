import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { readFileAsDataUrl } from "@/lib/utils";

import type {
  CropBox,
  ToolReference,
  ToolReferenceGroupContext,
  SavedComponent,
  ComponentState,
  PendingConfirmation,
  ActiveSubject,
  ViewMode,
  DrawingPath,
  EditorTool,
  SidebarTab,
  NewScreenSource,
  CutVariantTool,
} from "../types";
import {
  COMPONENT_STORAGE_PREFIX,
} from "../types";

import {
  roundedRectPath,
} from "../engine/drawing";
import {
  sourceRootComponentId,
  newRootComponentId,
  createRootComponent,
  ensureRootComponent,
  writeReferenceStackFromComponents,
  readReferenceStackComponents,
} from "../engine/componentModel";
import {
  buildComponentTree,
  componentSubtreeIds,
} from "../engine/componentTree";
import {
  addVariant,
  setActiveVariant as setActiveVariantOn,
  removeVariant as removeVariantFrom,
  setOriginalVariantImage,
} from "../engine/variants";
import {
  readSavedComponents,
  writeSavedComponents,
  writeDraftComponents,
  hasDraftComponents,
  removeSavedComponents,
} from "../engine/storage";
import {
  canvasToDataUrl,
  inferType,
  measureImage,
  shortComponentName,
  waitForImage,
} from "../engine/image";
import {
  bytesToPngDataUrl,
  runBirefnet,
  runRealEsrgan,
  runAutoDetect,
  urlToBytes,
  type ProcessingFeatureKey,
} from "@/lib/models/modelCommands";
import { clamp } from "../engine/geometry";
import { confirmationDialogCopy } from "../ui/ConfirmModal";

import { useBuilderViewport } from "./useBuilderViewport";
import { useBuilderCanvasPainter } from "./useBuilderCanvasPainter";
import { useBuilderComponents } from "./useBuilderComponents";
import { useBuilderInteraction } from "./useBuilderInteraction";

export type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  groupContext: ToolReferenceGroupContext | null;
  onUploadedLocally: (next: ToolReference) => void;
};

export type ToolsEditorState = {
  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  stageViewportRef: React.RefObject<HTMLDivElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cropsCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  // State
  currentTool: EditorTool;
  viewMode: ViewMode;
  selectedComponentId: string | null;
  selection: CropBox | null;
  selectionLocked: boolean;
  drawing: boolean;
  drawingPath: DrawingPath | null;
  brushSize: number;
  editingComponentId: string | null;
  showCropsOverlay: boolean;
  hoveredComponentId: string | null;
  imageError: boolean;
  uploading: boolean;
  autoDetecting: boolean;
  autoDetectMessage: string | null;
  imagePaintVersion: number;
  pendingConfirmation: PendingConfirmation | null;
  savingStack: boolean;
  stackSaveStatus: string | null;
  expandedComponentIds: Set<string>;
  componentState: ComponentState;
  activeRootId: string;
  sidebarTab: SidebarTab;
  cropsOverlayColor: string;
  cropsOverlayAlpha: number;

  // Setters
  setCurrentTool: React.Dispatch<React.SetStateAction<EditorTool>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setSelectedComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelection: React.Dispatch<React.SetStateAction<CropBox | null>>;
  setSelectionLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawingPath: React.Dispatch<React.SetStateAction<DrawingPath | null>>;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  setEditingComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowCropsOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  setHoveredComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setImageError: React.Dispatch<React.SetStateAction<boolean>>;
  setUploading: React.Dispatch<React.SetStateAction<boolean>>;
  setImagePaintVersion: React.Dispatch<React.SetStateAction<number>>;
  setPendingConfirmation: React.Dispatch<React.SetStateAction<PendingConfirmation | null>>;
  setSavingStack: React.Dispatch<React.SetStateAction<boolean>>;
  setStackSaveStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedComponentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setComponentState: React.Dispatch<React.SetStateAction<ComponentState>>;
  setActiveRootId: React.Dispatch<React.SetStateAction<string>>;
  setSidebarTab: React.Dispatch<React.SetStateAction<SidebarTab>>;
  setCropsOverlayColor: React.Dispatch<React.SetStateAction<string>>;
  setCropsOverlayAlpha: React.Dispatch<React.SetStateAction<number>>;

  // Viewport
  toolZoom: number;
  toolPan: { x: number; y: number };
  setToolPan: (pan: { x: number; y: number }) => void;
  resetToolViewport: () => void;
  handleStageWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  zoomPercent: number;

  // Computed values
  components: SavedComponent[];
  selectedComponent: SavedComponent | null;
  rootComponent: SavedComponent;
  roots: SavedComponent[];
  activeScopeId: string;
  activeRoot: SavedComponent;
  componentTree: ReturnType<typeof buildComponentTree>;
  scopedComponents: SavedComponent[];
  stackedComponents: SavedComponent[];
  cutCountByRoot: Map<string, number>;
  activeSubject: ActiveSubject;
  headerSubject: {
    name: string;
    w: number;
    h: number;
    type: string;
  };
  canCrop: boolean;
  selectionCrop: CropBox | null;
  selectionSourceBox: CropBox | null;
  selectionMatchesExistingCut: boolean;
  canSaveSelection: boolean;
  selectionSize: { x: number; y: number; w: number; h: number };
  confirmationCopy: ReturnType<typeof confirmationDialogCopy> | null;
  showGroupNavigator: boolean;
  rootComponentId: string;

  // Handlers
  bumpPaintVersion: () => void;
  flushPendingPersist: () => void;
  cancelPendingPersist: () => void;
  schedulePersist: (items: SavedComponent[], isDraft: boolean) => void;
  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
  cancelSelection: () => void;
  expandComponentPath: (id: string) => void;
  toggleComponentExpanded: (id: string) => void;
  expandAllComponents: () => void;
  collapseAllComponents: () => void;
  setTool: (tool: EditorTool) => void;
  openOriginal: () => void;
  openBuilderMode: () => void;
  openStackMode: () => void;
  openGalleryMode: () => void;
  focusGalleryCut: (id: string | null) => void;
  openComponent: (id: string) => void;
  selectRoot: (id: string) => void;
  setPrimaryRoot: (id: string) => void;
  requestRootDeletion: (id: string) => void;
  beginRootCreation: (source?: NewScreenSource) => void;
  promoteToRoot: (id: string) => void;
  startEditComponent: (id: string) => void;
  resetActiveStack: () => void;
  selectStackComponent: (id: string) => void;
  openTreeComponent: (id: string) => void;
  requestResetConfirmation: () => void;
  confirmPendingAction: () => void;
  persistReferenceStack: () => Promise<void>;
  selectionToSubjectCoords: (box: CropBox) => CropBox | null;
  toOriginalCoords: (subjectBox: CropBox) => CropBox;
  saveSelection: (postProcess?: ProcessingFeatureKey) => Promise<void>;
  addCutVariant: (cutId: string, input: { tool: CutVariantTool; dataUrl: string }) => void;
  setCutVariant: (cutId: string, variantId: string) => void;
  removeCutVariant: (cutId: string, variantId: string) => void;
  autoDetect: (modelId: string | null) => Promise<void>;
  uploadImage: (file: File | null | undefined) => Promise<void>;
  updateIdleCursorAndHover: (event: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
  handlePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  handleRemoveComponent: (id: string) => void;
};

export function useToolsEditor(props: ToolsEditorProps): ToolsEditorState {
  const { item, referenceId, groupContext, onUploadedLocally } = props;

  const componentKey = `${COMPONENT_STORAGE_PREFIX}${item.id}`;
  const rootComponentId = sourceRootComponentId(item.id);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [currentTool, setCurrentTool] = useState<EditorTool>("move");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePaintVersion, setImagePaintVersion] = useState(0);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [savingStack, setSavingStack] = useState(false);
  const [stackSaveStatus, setStackSaveStatus] = useState<string | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectMessage, setAutoDetectMessage] = useState<string | null>(null);
  const autoDetectMessageTimer = useRef<number | null>(null);

  // Coalesce repaints to one per animation frame: N async cut images settling in
  // the same tick would otherwise trigger N full canvas repaints.
  const paintRafRef = useRef<number | null>(null);
  const bumpPaintVersion = useCallback(() => {
    if (paintRafRef.current != null) return;
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = null;
      setImagePaintVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (paintRafRef.current != null) cancelAnimationFrame(paintRafRef.current);
    };
  }, []);

  // --- Viewport ------------------------------------------------------------

  const {
    toolZoom,
    toolPan,
    setToolPan,
    resetToolViewport,
    handleStageWheel,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,
  } = useBuilderViewport({ stageViewportRef, imgRef, imageError });

  // --- Components ----------------------------------------------------------

  const {
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
    updateComponents: rawUpdateComponents,
    flushPendingPersist,
    cancelPendingPersist,
    schedulePersist,
    expandComponentPath,
    toggleComponentExpanded,
    expandAllComponents,
    collapseAllComponents,
  } = useBuilderComponents({
    item,
    referenceId,
    componentKey,
    rootComponentId,
    selectedComponentId,
  });

  // Wrap so any component mutation also clears the save-status badge.
  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setStackSaveStatus(null);
      rawUpdateComponents(updater);
    },
    [rawUpdateComponents],
  );

  // --- Active subject / canCrop --------------------------------------------

  const activeSubject = useMemo<ActiveSubject>(() => {
    if (viewMode === "component" && selectedComponent) {
      return {
        kind: "component",
        id: selectedComponent.id,
        name: selectedComponent.name,
        type: selectedComponent.type || "PNG",
        url: selectedComponent.dataUrl,
        w: selectedComponent.box.w,
        h: selectedComponent.box.h,
        originBox: selectedComponent.box,
        component: selectedComponent,
        rootId: selectedComponent.rootId ?? selectedComponent.id,
      };
    }

    if (viewMode === "stack") {
      return {
        kind: "stack",
        id: activeRoot.id,
        name: activeRoot.name,
        type: activeRoot.type || "PNG",
        url: activeRoot.dataUrl,
        w: activeRoot.box.w,
        h: activeRoot.box.h,
        originBox: activeRoot.box,
        rootId: activeRoot.id,
      };
    }

    return {
      kind: "original",
      id: item.id,
      name: item.name,
      type: item.type || "IMG",
      url: item.url,
      w: item.w,
      h: item.h,
      originBox: { x: 0, y: 0, w: item.w, h: item.h },
      rootId: rootComponentId,
    };
  }, [activeRoot, item, rootComponentId, selectedComponent, viewMode]);

  const canCrop = activeSubject.kind === "component";

  // --- Interaction ---------------------------------------------------------

  const selectStackComponent = useCallback(
    (id: string) => {
      cancelSelection();
      expandComponentPath(id);
      setSelectedComponentId(id);
    },
    // cancelSelection is defined below — React guarantees stable refs for setState,
    // so we reference the stable expandComponentPath + setSelectedComponentId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expandComponentPath],
  );

  // cancelSelection is returned from the interaction hook; we need a stable
  // forward-ref so it can be used in onSelectStackComponent without a cycle.
  const cancelSelectionRef = useRef<(() => void) | null>(null);
  const cancelSelectionStable = useCallback(() => {
    cancelSelectionRef.current?.();
  }, []);

  const {
    selection,
    setSelection,
    selectionLocked,
    setSelectionLocked,
    drawing,
    setDrawing,
    drawingPath,
    setDrawingPath,
    editingComponentId,
    setEditingComponentId,
    showCropsOverlay,
    setShowCropsOverlay,
    hoveredComponentId,
    setHoveredComponentId,
    brushSize,
    setBrushSize,
    cropsOverlayColor,
    setCropsOverlayColor,
    cropsOverlayAlpha,
    setCropsOverlayAlpha,
    isHoveringSelection,
    cancelSelection,
    selectionToSubjectCoords,
    toOriginalCoords,
    selectionCrop,
    selectionSourceBox,
    selectionMatchesExistingCut,
    canSaveSelection,
    selectionSize,
    updateIdleCursorAndHover,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useBuilderInteraction({
    item,
    imgRef,
    stageViewportRef,
    toolZoom,
    toolPan,
    setToolPan,
    currentTool,
    setCurrentTool,
    canCrop,
    viewMode,
    stackedComponents,
    activeSubject,
    scopedComponents,
    rootComponentId,
    components,
    imagePaintVersion,
    onSelectStackComponent: useCallback(
      (id: string) => {
        cancelSelectionStable();
        expandComponentPath(id);
        setSelectedComponentId(id);
      },
      [cancelSelectionStable, expandComponentPath],
    ),
  });

  // Wire the stable forward-ref now that the real cancelSelection is available.
  useEffect(() => {
    cancelSelectionRef.current = cancelSelection;
  });

  // --- Canvas painter ------------------------------------------------------

  const { overlayCanvasRef, cropsCanvasRef } = useBuilderCanvasPainter({
    imgRef,
    components,
    stackedComponents,
    activeSubject,
    rootComponentId,
    viewMode,
    toolZoom,
    toolPan,
    selection,
    selectionLocked,
    isHoveringSelection,
    selectionCrop,
    selectionMatchesExistingCut,
    drawingPath,
    brushSize,
    selectedComponentId,
    hoveredComponentId,
    editingComponentId,
    showCropsOverlay,
    cropsOverlayColor,
    cropsOverlayAlpha,
    imagePaintVersion,
    bumpPaintVersion,
  });

  // --- Navigation ----------------------------------------------------------

  const setTool = useCallback(
    (tool: EditorTool) => {
      if ((tool === "crop" || tool === "draw") && !canCrop) {
        setCurrentTool("move");
        cancelSelection();
        return;
      }
      setCurrentTool(tool);
      if (tool === "move") cancelSelection();
    },
    [canCrop, cancelSelection],
  );

  const openOriginal = useCallback(() => {
    cancelSelection();
    setSelectedComponentId(null);
    setViewMode("original");
    setCurrentTool("move");
    resetToolViewport();
  }, [cancelSelection, resetToolViewport]);

  const openBuilderMode = useCallback(() => {
    cancelSelection();
    setCurrentTool("move");
    resetToolViewport();
    setViewMode(selectedComponentId && selectedComponent ? "component" : "original");
  }, [cancelSelection, resetToolViewport, selectedComponent, selectedComponentId]);

  const openStackMode = useCallback(() => {
    if (stackedComponents.length === 0) return;
    cancelSelection();
    setCurrentTool("move");
    resetToolViewport();
    setViewMode("stack");
  }, [cancelSelection, resetToolViewport, stackedComponents.length]);

  const openGalleryMode = useCallback(() => {
    cancelSelection();
    setViewMode("gallery");
  }, [cancelSelection]);

  const focusGalleryCut = useCallback((id: string | null) => {
    setSelectedComponentId(id);
  }, []);

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
    [cancelSelection, components, expandComponentPath, resetToolViewport, rootComponentId, setActiveRootId],
  );

  const selectRoot = useCallback(
    (id: string) => {
      const keepStack = viewMode === "stack" && (cutCountByRoot.get(id) ?? 0) > 0;
      openComponent(id);
      if (keepStack) setViewMode("stack");
    },
    [cutCountByRoot, openComponent, viewMode],
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
    [cancelSelection, item, resetToolViewport, setActiveRootId, setExpandedComponentIds, updateComponents],
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
      setEditingComponentId,
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
    setExpandedComponentIds,
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
    [activeScopeId, components, openComponent, openOriginal, roots, rootComponentId, setActiveRootId, updateComponents],
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

  // --- Operations ----------------------------------------------------------

  const persistReferenceStack = useCallback(async () => {
    if (savingStack) return;
    cancelPendingPersist();
    setSavingStack(true);
    setStackSaveStatus(null);
    try {
      if (!referenceId || item.id !== referenceId) {
        writeSavedComponents(componentKey, components);
        setStackSaveStatus("Local state saved");
        return;
      }

      const data = await writeReferenceStackFromComponents({
        components,
        item,
        primaryComponentId: rootComponentId,
        rootComponentId,
      });
      const cutCount = data?.components.length ?? 0;
      const extraStackCount = Math.max(0, (data?.roots?.length ?? 1) - 1);
      setStackSaveStatus(
        data
          ? `${cutCount} ${cutCount === 1 ? "cut" : "cuts"}` +
              (extraStackCount > 0
                ? `, ${extraStackCount} ${extraStackCount === 1 ? "stack" : "stacks"} saved`
                : " saved")
          : "Stack removed",
      );
      removeSavedComponents(componentKey);
    } catch (err) {
      console.error("[tools] stack save failed:", err);
      setStackSaveStatus("Failed to save stack");
    } finally {
      setSavingStack(false);
    }
  }, [cancelPendingPersist, componentKey, components, item, referenceId, rootComponentId, savingStack]);

  const saveSelection = useCallback(
    async (postProcess?: ProcessingFeatureKey) => {
      if (!selection || !selectionLocked || !canCrop) return;
      const img = imgRef.current;
      const subjectBox = selectionToSubjectCoords(selection);
      if (!subjectBox) return;
      const sourceBox = toOriginalCoords(subjectBox);
      let dataUrl = activeSubject.url;

      if (img) {
        try {
          await waitForImage(img);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(subjectBox.w));
          canvas.height = Math.max(1, Math.round(subjectBox.h));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          const radius = Math.min(subjectBox.r ?? 0, canvas.width / 2, canvas.height / 2);
          ctx.imageSmoothingEnabled = false;
          if (radius > 0) {
            ctx.save();
            roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, radius);
            ctx.clip();
          }
          ctx.drawImage(
            img,
            subjectBox.x, subjectBox.y, subjectBox.w, subjectBox.h,
            0, 0, canvas.width, canvas.height,
          );
          if (radius > 0) ctx.restore();
          dataUrl = await canvasToDataUrl(canvas, "image/png");
        } catch {
          dataUrl = activeSubject.url;
        }
      }

      let processed: { tool: CutVariantTool; dataUrl: string } | null = null;
      if (postProcess) {
        try {
          const input = await urlToBytes(dataUrl);
          const output =
            postProcess === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
          processed = { tool: postProcess as CutVariantTool, dataUrl: bytesToPngDataUrl(output) };
        } catch (error) {
          console.error(`Draw post-process (${postProcess}) failed`, error);
        }
      }

      if (editingComponentId) {
        const editedId = editingComponentId;
        updateComponents((current) =>
          current.map((c) => {
            if (c.id !== editedId) return c;
            let next = setOriginalVariantImage({ ...c, box: sourceBox }, dataUrl);
            if (processed) next = addVariant(next, { ...processed, createdAt: new Date().toISOString() });
            return next;
          }),
        );
        setEditingComponentId(null);
        setExpandedComponentIds((current) => {
          const next = new Set(current);
          next.add(editedId);
          return next;
        });
        setSelectedComponentId(editedId);
        setViewMode("component");
        resetToolViewport();
        cancelSelection();
        return;
      }

      const nextId = `c-${Math.random().toString(36).slice(2, 9)}`;
      const parentId =
        activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
      const rootId = activeSubject.rootId ?? activeScopeId;
      const createdAt = new Date().toISOString();
      let cut: SavedComponent = {
        id: nextId,
        name: shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt,
        parentId,
        kind: "cut",
        rootId,
      };
      if (processed) cut = addVariant(cut, { ...processed, createdAt });
      updateComponents((current) => [cut, ...current]);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(parentId);
        next.add(nextId);
        return next;
      });
      setSelectedComponentId(nextId);
      setViewMode("component");
      resetToolViewport();
      cancelSelection();
    },
    [
      activeScopeId,
      activeSubject,
      canCrop,
      cancelSelection,
      editingComponentId,
      resetToolViewport,
      rootComponent.id,
      selection,
      selectionLocked,
      selectionToSubjectCoords,
      setEditingComponentId,
      setExpandedComponentIds,
      toOriginalCoords,
      updateComponents,
    ],
  );

  const addCutVariant = useCallback(
    (cutId: string, input: { tool: CutVariantTool; dataUrl: string }) => {
      const createdAt = new Date().toISOString();
      updateComponents((current) =>
        current.map((c) =>
          c.id === cutId && c.parentId != null
            ? addVariant(c, { ...input, createdAt })
            : c,
        ),
      );
    },
    [updateComponents],
  );

  const setCutVariant = useCallback(
    (cutId: string, variantId: string) => {
      updateComponents((current) =>
        current.map((c) => (c.id === cutId ? setActiveVariantOn(c, variantId) : c)),
      );
    },
    [updateComponents],
  );

  const removeCutVariant = useCallback(
    (cutId: string, variantId: string) => {
      updateComponents((current) =>
        current.map((c) => (c.id === cutId ? removeVariantFrom(c, variantId) : c)),
      );
    },
    [updateComponents],
  );

  const flashAutoDetectMessage = useCallback((message: string) => {
    setAutoDetectMessage(message);
    if (autoDetectMessageTimer.current != null) clearTimeout(autoDetectMessageTimer.current);
    autoDetectMessageTimer.current = window.setTimeout(() => {
      autoDetectMessageTimer.current = null;
      setAutoDetectMessage(null);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (autoDetectMessageTimer.current != null) clearTimeout(autoDetectMessageTimer.current);
    };
  }, []);

  const autoDetect = useCallback(
    async (modelId: string | null) => {
      if (autoDetecting || !canCrop) return;
      if (!modelId) {
        flashAutoDetectMessage("Install an auto-detect model in Settings first");
        return;
      }
      const img = imgRef.current;
      const cw = img?.clientWidth ?? 0;
      const ch = img?.clientHeight ?? 0;
      if (!cw || !ch) {
        flashAutoDetectMessage("Open a stack before auto-detecting");
        return;
      }
      const parentId =
        activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
      const rootId = activeSubject.rootId ?? activeScopeId;
      setAutoDetecting(true);
      setAutoDetectMessage(null);
      try {
        const bytes = await urlToBytes(activeSubject.url);
        const regions = await runAutoDetect(modelId, bytes);
        if (regions.length === 0) {
          flashAutoDetectMessage("No components detected — try drawing regions manually");
          return;
        }
        if (img) await waitForImage(img).catch(() => {});
        const created: SavedComponent[] = [];
        for (const region of regions) {
          const x = clamp(region.x * cw, 0, cw);
          const y = clamp(region.y * ch, 0, ch);
          const displayBox = {
            x,
            y,
            w: clamp(region.w * cw, 1, cw - x),
            h: clamp(region.h * ch, 1, ch - y),
          };
          const subjectBox = selectionToSubjectCoords(displayBox);
          if (!subjectBox) continue;
          const sourceBox = toOriginalCoords(subjectBox);
          let dataUrl = activeSubject.url;
          if (img) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(subjectBox.w));
              canvas.height = Math.max(1, Math.round(subjectBox.h));
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Canvas unavailable");
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(
                img,
                subjectBox.x, subjectBox.y, subjectBox.w, subjectBox.h,
                0, 0, canvas.width, canvas.height,
              );
              dataUrl = await canvasToDataUrl(canvas, "image/png");
            } catch {
              dataUrl = activeSubject.url;
            }
          }
          const nextId = `c-${Math.random().toString(36).slice(2, 9)}`;
          const trimmedLabel = region.label?.trim();
          created.push({
            id: nextId,
            name: trimmedLabel ? trimmedLabel : shortComponentName(nextId),
            box: sourceBox,
            dataUrl,
            type: "PNG",
            createdAt: new Date().toISOString(),
            parentId,
            kind: "cut",
            rootId,
          });
        }
        if (created.length === 0) {
          flashAutoDetectMessage("No components detected — try drawing regions manually");
          return;
        }
        updateComponents((current) => [...created, ...current]);
        setExpandedComponentIds((current) => {
          const next = new Set(current);
          next.add(parentId);
          for (const c of created) next.add(c.id);
          return next;
        });
        setSelectedComponentId(created[0].id);
        setViewMode("component");
        resetToolViewport();
        cancelSelection();
      } catch (error) {
        console.error("[tools] auto-detect failed", error);
        flashAutoDetectMessage("Auto-detect failed — see console for details");
      } finally {
        setAutoDetecting(false);
      }
    },
    [
      activeScopeId,
      activeSubject,
      autoDetecting,
      canCrop,
      cancelSelection,
      flashAutoDetectMessage,
      resetToolViewport,
      rootComponent.id,
      selectionToSubjectCoords,
      setExpandedComponentIds,
      toOriginalCoords,
      updateComponents,
    ],
  );

  const uploadImage = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        const url = await readFileAsDataUrl(file);
        const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
        const next: ToolReference = {
          id: `tool-upload-${Date.now().toString(36)}`,
          name: file.name,
          type: inferType(file.name),
          w: dims.w,
          h: dims.h,
          url,
        };
        writeSavedComponents(`${COMPONENT_STORAGE_PREFIX}${next.id}`, ensureRootComponent([], next));
        onUploadedLocally(next);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onUploadedLocally],
  );

  const handleRemoveComponent = useCallback(
    (id: string) => {
      const removedIds = componentSubtreeIds(components, id);
      updateComponents((current) => current.filter((c) => !removedIds.has(c.id)));
      if (removedIds.has(activeScopeId)) {
        setActiveRootId(rootComponentId);
        openOriginal();
      } else if (selectedComponentId && removedIds.has(selectedComponentId)) {
        openOriginal();
      }
    },
    [activeScopeId, components, openOriginal, rootComponentId, selectedComponentId, setActiveRootId, updateComponents],
  );

  // --- Effects -------------------------------------------------------------

  // Load component state from storage / network when the reference item changes.
  useEffect(() => {
    let cancelled = false;

    const hasContent = (items: SavedComponent[]) =>
      items.some((c) => c.parentId != null) ||
      items.filter((c) => c.parentId == null).length > 1;

    const applyState = (
      items: SavedComponent[],
      preferredRootId: string | null,
      persistDraft: boolean,
    ) => {
      const next = ensureRootComponent(items, item);
      const nextRootId =
        preferredRootId && next.some((c) => c.id === preferredRootId)
          ? preferredRootId
          : rootComponentId;
      const hasStack = hasContent(next);
      if (persistDraft) {
        if (referenceId && item.id === referenceId) {
          writeDraftComponents(componentKey, next);
        } else {
          writeSavedComponents(componentKey, next);
        }
      }
      setComponentState({ key: componentKey, items: next });
      setActiveRootId(nextRootId);
      setExpandedComponentIds(new Set([nextRootId]));
      setImageError(false);
      setHoveredComponentId(null);
      setSelectedComponentId(hasStack ? null : nextRootId);
      setViewMode(hasStack ? "original" : "component");
      resetToolViewport();
      cancelSelection();
      setCurrentTool("move");
      setStackSaveStatus(null);
    };

    const hasDraft = hasDraftComponents(componentKey);
    const shouldReadLocalImmediately = !referenceId || item.id !== referenceId || hasDraft;
    const localComponents = ensureRootComponent(
      shouldReadLocalImmediately ? readSavedComponents(componentKey) : [],
      item,
    );
    const hasLocalStack = hasContent(localComponents);

    if (!referenceId || item.id !== referenceId || (hasDraft && hasLocalStack)) {
      applyState(localComponents, rootComponentId, !referenceId || item.id !== referenceId || hasLocalStack);
      return () => { cancelled = true; };
    }

    void readReferenceStackComponents(item).then((savedStack) => {
      if (cancelled) return;
      if (savedStack) {
        if (!hasDraft) removeSavedComponents(componentKey);
        applyState(savedStack.items, savedStack.activeRootId, false);
        return;
      }
      const fallback = hasDraft
        ? localComponents
        : ensureRootComponent(readSavedComponents(componentKey), item);
      applyState(fallback, rootComponentId, hasContent(fallback));
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Deselect when navigating away from a component that no longer exists.
  useEffect(() => {
    if ((viewMode !== "component" && viewMode !== "stack") || !selectedComponentId || selectedComponent) return;
    setSelectedComponentId(null);
    setViewMode("original");
  }, [selectedComponent, selectedComponentId, viewMode]);

  // Auto-expand the tree path to the selected component.
  useEffect(() => {
    if (!selectedComponentId) return;
    expandComponentPath(selectedComponentId);
  }, [expandComponentPath, selectedComponentId]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if (event.key === "v" || event.key === "V") {
        setTool("move");
      } else if (event.key === "c" || event.key === "C") {
        setTool("crop");
      } else if (event.key === "d" || event.key === "D") {
        setTool("draw");
      } else if (event.key === "f" || event.key === "F") {
        beginRootCreation();
      } else if (event.key === "Escape") {
        if (selection || drawingPath) cancelSelection();
      } else if (event.key === " ") {
        if (selectionLocked) { event.preventDefault(); void saveSelection(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginRootCreation, cancelSelection, drawingPath, saveSelection, selection, selectionLocked, setTool]);

  // --- Derived display values ----------------------------------------------

  const headerSubject =
    viewMode === "stack" && selectedComponent
      ? {
          name: selectedComponent.name,
          w: selectedComponent.box.w,
          h: selectedComponent.box.h,
          type: selectedComponent.type || "PNG",
        }
      : activeSubject;

  const confirmationCopy = pendingConfirmation ? confirmationDialogCopy(pendingConfirmation) : null;
  const showGroupNavigator = Boolean(groupContext && groupContext.references.length >= 1);

  // --- Return --------------------------------------------------------------

  return {
    fileInputRef,
    stageViewportRef,
    imgRef,
    overlayCanvasRef,
    cropsCanvasRef,

    currentTool,
    viewMode,
    selectedComponentId,
    selection,
    selectionLocked,
    drawing,
    drawingPath,
    brushSize,
    editingComponentId,
    showCropsOverlay,
    hoveredComponentId,
    imageError,
    uploading,
    autoDetecting,
    autoDetectMessage,
    imagePaintVersion,
    pendingConfirmation,
    savingStack,
    stackSaveStatus,
    expandedComponentIds,
    componentState,
    activeRootId,
    sidebarTab,
    cropsOverlayColor,
    cropsOverlayAlpha,

    setCurrentTool,
    setViewMode,
    setSelectedComponentId,
    setSelection,
    setSelectionLocked,
    setDrawing,
    setDrawingPath,
    setBrushSize,
    setEditingComponentId,
    setShowCropsOverlay,
    setHoveredComponentId,
    setImageError,
    setUploading,
    setImagePaintVersion,
    setPendingConfirmation,
    setSavingStack,
    setStackSaveStatus,
    setExpandedComponentIds,
    setComponentState,
    setActiveRootId,
    setSidebarTab,
    setCropsOverlayColor,
    setCropsOverlayAlpha,

    toolZoom,
    toolPan,
    setToolPan,
    resetToolViewport,
    handleStageWheel,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,

    components,
    selectedComponent,
    rootComponent,
    roots,
    activeScopeId,
    activeRoot,
    componentTree,
    scopedComponents,
    stackedComponents,
    cutCountByRoot,
    activeSubject,
    headerSubject,
    canCrop,
    selectionCrop,
    selectionSourceBox,
    selectionMatchesExistingCut,
    canSaveSelection,
    selectionSize,
    confirmationCopy,
    showGroupNavigator,
    rootComponentId,

    bumpPaintVersion,
    flushPendingPersist,
    cancelPendingPersist,
    schedulePersist,
    updateComponents,
    cancelSelection,
    expandComponentPath,
    toggleComponentExpanded,
    expandAllComponents,
    collapseAllComponents,
    setTool,
    openOriginal,
    openBuilderMode,
    openStackMode,
    openGalleryMode,
    focusGalleryCut,
    openComponent,
    selectRoot,
    setPrimaryRoot,
    requestRootDeletion,
    beginRootCreation,
    promoteToRoot,
    startEditComponent,
    resetActiveStack,
    selectStackComponent,
    openTreeComponent,
    requestResetConfirmation,
    confirmPendingAction,
    persistReferenceStack,
    selectionToSubjectCoords,
    toOriginalCoords,
    saveSelection,
    addCutVariant,
    setCutVariant,
    removeCutVariant,
    autoDetect,
    uploadImage,
    updateIdleCursorAndHover,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRemoveComponent,
  };
}
