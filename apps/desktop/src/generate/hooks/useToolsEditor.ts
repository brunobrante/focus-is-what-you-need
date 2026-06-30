import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";

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
  sourceRootComponentId,
  ensureRootComponent,
  readReferenceStackComponents,
} from "../engine/componentModel";
import {
  buildComponentTree,
} from "../engine/componentTree";
import {
  readSavedComponents,
  writeSavedComponents,
  writeDraftComponents,
  hasDraftComponents,
  removeSavedComponents,
} from "../engine/storage";
import type { ProcessingActionKind } from "@/lib/models/modelCommands";
import type { ReferenceAttachment } from "@/lib/storage/schema";
import { confirmationDialogCopy } from "../ui/ConfirmModal";

import { useBuilderViewport } from "./useBuilderViewport";
import { usePenTool } from "./usePenTool";
import { useBuilderCanvasPainter } from "./useBuilderCanvasPainter";
import { useBuilderComponents } from "./useBuilderComponents";
import { useBuilderInteraction } from "./useBuilderInteraction";
import { useBuilderNavigation } from "./useBuilderNavigation";
import { useBuilderCutOperations } from "./useBuilderCutOperations";
import { useAutoDetect } from "./useAutoDetect";
import { useCropSegmentation } from "./useCropSegmentation";
import { useStackPersist } from "./useStackPersist";
import { useCutVariants } from "./useCutVariants";

export type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  groupContext: ToolReferenceGroupContext | null;
  onUploadedLocally: (next: ToolReference) => void;
  /**
   * When the Builder is opened from inside a project/screen/component, this is the
   * owner to link the worked reference into on save. The Builder stays a general,
   * workspace-agnostic route; this is the only project context it carries.
   */
  linkTarget?: ReferenceAttachment | null;
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
  /** False until the opening subject is resolved; the stage hides the image so the raw original never flashes. */
  editorReady: boolean;
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
  segmenting: boolean;
  segmentError: string | null;
  adjustCrop: (modelId: string | null) => void;
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
  saveSelection: (postProcess?: ProcessingActionKind) => Promise<void>;
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

  const stageViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [currentTool, setCurrentTool] = useState<EditorTool>("move");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  // The componentKey for which the editor has resolved its opening subject. Until
  // this matches the current key, the opening screen is still being resolved (the
  // saved stack may load asynchronously), so the stage must not paint the raw
  // original image — otherwise it flashes before the main screen replaces it.
  const [initializedKey, setInitializedKey] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imagePaintVersion, setImagePaintVersion] = useState(0);

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
    handleZoomIn,
    handleZoomOut,
    zoomPercent,
  } = useBuilderViewport({ stageViewportRef, imgRef, imageError });

  // --- Pen tool ------------------------------------------------------------

  const pen = usePenTool({ imgRef, toolZoom, active: currentTool === "pen" });

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

  const { savingStack, setSavingStack, stackSaveStatus, setStackSaveStatus, persistReferenceStack } =
    useStackPersist({ components, item, referenceId, componentKey, rootComponentId, cancelPendingPersist });

  // Wrap so any component mutation also clears the save-status badge.
  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setStackSaveStatus(null);
      rawUpdateComponents(updater);
    },
    [rawUpdateComponents, setStackSaveStatus],
  );

  const { addCutVariant, setCutVariant, removeCutVariant } = useCutVariants({ updateComponents });

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

  // cancelSelection is returned from the interaction hook (defined below); a
  // stable forward-ref lets selectStackComponent call it without a cycle.
  const cancelSelectionRef = useRef<(() => void) | null>(null);
  const cancelSelectionStable = useCallback(() => {
    cancelSelectionRef.current?.();
  }, []);

  const selectStackComponent = useCallback(
    (id: string) => {
      cancelSelectionStable();
      expandComponentPath(id);
      setSelectedComponentId(id);
    },
    [cancelSelectionStable, expandComponentPath],
  );

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
    onSelectStackComponent: selectStackComponent,
    pen,
  });

  // Wire the stable forward-ref now that the real cancelSelection is available.
  useEffect(() => {
    cancelSelectionRef.current = cancelSelection;
  });

  const { autoDetecting, autoDetectMessage, autoDetect } = useAutoDetect({
    canCrop,
    activeSubject,
    rootComponent,
    activeScopeId,
    imgRef,
    selectionToSubjectCoords,
    toOriginalCoords,
    updateComponents,
    setExpandedComponentIds,
    setSelectedComponentId,
    setViewMode,
    cancelSelection,
    resetToolViewport,
  });

  // --- Adjust crop (object segmentation) -----------------------------------

  const { segmenting, segmentError, segmentation, segment, clearSegmentation } =
    useCropSegmentation({ imgRef });

  // The silhouette belongs to one specific crop rectangle; any change to the
  // selection (drag, resize, cancel) makes the preview stale, so drop it.
  useEffect(() => {
    clearSegmentation();
  }, [selection, clearSegmentation]);

  const adjustCrop = useCallback(
    (modelId: string | null) => {
      if (!canCrop || !selectionCrop || segmenting) return;
      void segment(modelId, selectionCrop);
    },
    [canCrop, segment, segmenting, selectionCrop],
  );

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
    segmentationContour: segmentation?.contour ?? null,
    penPath: pen.penPath,
    penCursor: pen.penCursor,
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

  const {
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
  } = useBuilderNavigation({
    item,
    rootComponentId,
    canCrop,
    viewMode,
    components,
    roots,
    activeScopeId,
    cutCountByRoot,
    stackedComponentsLength: stackedComponents.length,
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
  });

  // --- Operations ----------------------------------------------------------

  const { fileInputRef, uploading, setUploading, saveSelection, uploadImage, handleRemoveComponent } =
    useBuilderCutOperations({
      imgRef,
      selection,
      selectionLocked,
      canCrop,
      activeSubject,
      activeScopeId,
      rootComponentId,
      rootComponent,
      components,
      editingComponentId,
      selectedComponentId,
      selectionToSubjectCoords,
      toOriginalCoords,
      updateComponents,
      setEditingComponentId,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      setActiveRootId,
      cancelSelection,
      resetToolViewport,
      openOriginal,
      onUploadedLocally,
    });

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
      // The "main screen" is the root flagged primary, falling back to the
      // resolved root. We always open a screen (root) as the editable subject —
      // never the raw original image. A fresh image lands on its default root;
      // an existing stack lands on the main screen so the user keeps building.
      const primaryRootId =
        next.find((c) => c.parentId == null && c.isPrimaryRoot)?.id ?? nextRootId;
      const openRootId = hasStack ? primaryRootId : nextRootId;
      if (persistDraft) {
        if (referenceId && item.id === referenceId) {
          writeDraftComponents(componentKey, next);
        } else {
          writeSavedComponents(componentKey, next);
        }
      }
      setComponentState({ key: componentKey, items: next });
      setActiveRootId(openRootId);
      setExpandedComponentIds(new Set([openRootId]));
      setImageError(false);
      setHoveredComponentId(null);
      setSelectedComponentId(openRootId);
      setViewMode("component");
      resetToolViewport();
      cancelSelection();
      setCurrentTool("move");
      setStackSaveStatus(null);
      // The opening subject is now resolved — the stage may paint it.
      setInitializedKey(componentKey);
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
  // Keyed by item.id — which componentKey and rootComponentId both derive from —
  // plus referenceId, the one input read here that is NOT derived from item.id and
  // can change independently (BLD-10). `item` and the setters are intentionally
  // read fresh at fire time rather than retriggering this whole load effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, referenceId]);

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
      } else if (event.key === "p" || event.key === "P") {
        setTool("pen");
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
    editorReady: initializedKey === componentKey,
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
    segmenting,
    segmentError,
    adjustCrop,
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
