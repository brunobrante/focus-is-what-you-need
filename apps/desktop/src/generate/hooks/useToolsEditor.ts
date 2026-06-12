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
  ProposedRegion,
  SelectionInteraction,
  EditorTool,
  SidebarTab,
} from "../types";
import {
  MIN_TOOL_ZOOM,
  CROPS_OVERLAY_COLOR_STORAGE_KEY,
  CROPS_OVERLAY_ALPHA_STORAGE_KEY,
  COMPONENT_STORAGE_PREFIX,
} from "../types";

import {
  clamp,
  clampToolPan,
  intersectCropBoxes,
  cropBoxFromPoints,
  boundsFromDrawingPath,
  resizeCropBox,
  moveCropBox,
  roundCropBox,
  getContentPoint,
  getImageContentBounds,
  getVisibleContentBounds,
  resizeCursor,
  componentBoxInSubject,
} from "../engine/geometry";
import {
  selectionHitTest,
  componentHitTest,
  proposalHitTest,
} from "../engine/hitTesting";
import { roundedRectPath } from "../engine/drawing";
import {
  sourceRootComponentId,
  newRootComponentId,
  createRootComponent,
  ensureRootComponent,
  componentAreaAlreadyExists,
  writeReferenceStackFromComponents,
  readReferenceStackComponents,
} from "../engine/componentModel";
import {
  buildComponentTree,
  flattenComponentTree,
  componentSubtreeIds,
  componentAncestorIds,
} from "../engine/componentTree";
import {
  readSavedComponents,
  writeSavedComponents,
  writeDraftComponents,
  hasDraftComponents,
  removeSavedComponents,
  readCropsOverlayColor,
  readCropsOverlayAlpha,
} from "../engine/storage";
import {
  canvasToDataUrl,
  inferType,
  measureImage,
  shortComponentName,
  waitForImage,
} from "../engine/image";
import { useBuilderViewport } from "./useBuilderViewport";
import { useBuilderCanvasPainter } from "./useBuilderCanvasPainter";
import { confirmationDialogCopy } from "../ui/ConfirmModal";
import {
  bytesToPngDataUrl,
  runBirefnet,
  runRealEsrgan,
  runFlorence2,
  urlToBytes,
  type ProcessingFeatureKey,
} from "@/lib/models/modelCommands";

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
  proposedRegions: ProposedRegion[];
  autoDetecting: boolean;
  applyingProposals: boolean;
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
  openComponent: (id: string) => void;
  selectRoot: (id: string) => void;
  beginRootCreation: () => void;
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
  autoDetect: () => Promise<void>;
  applyProposedRegions: () => Promise<void>;
  discardProposedRegion: (id: string) => void;
  discardAllProposedRegions: () => void;
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
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);

  const [currentTool, setCurrentTool] = useState<EditorTool>("move");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selection, setSelection] = useState<CropBox | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState<DrawingPath | null>(null);
  const [brushSize, setBrushSize] = useState(4);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [showCropsOverlay, setShowCropsOverlay] = useState(false);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [isHoveringSelection, setIsHoveringSelection] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imagePaintVersion, setImagePaintVersion] = useState(0);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [savingStack, setSavingStack] = useState(false);
  const [stackSaveStatus, setStackSaveStatus] = useState<string | null>(null);
  const [expandedComponentIds, setExpandedComponentIds] = useState<Set<string>>(
    () => new Set([rootComponentId]),
  );
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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("components");
  const [cropsOverlayColor, setCropsOverlayColor] = useState<string>(
    () => readCropsOverlayColor(),
  );
  const [cropsOverlayAlpha, setCropsOverlayAlpha] = useState<number>(
    () => readCropsOverlayAlpha(),
  );
  // Florence-2 auto-detect: transient proposals staged over the open subject,
  // plus the running flag and a short-lived status message (toast).
  const [proposedRegions, setProposedRegions] = useState<ProposedRegion[]>([]);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [applyingProposals, setApplyingProposals] = useState(false);
  const [autoDetectMessage, setAutoDetectMessage] = useState<string | null>(null);
  const autoDetectMessageTimer = useRef<number | null>(null);

  // Repaints are coalesced to one per animation frame. N cut images settling
  // asynchronously (plus resize/onload) would otherwise trigger N full canvas
  // repaints in the same tick; rAF collapses them into a single bump.
  const paintRafRef = useRef<number | null>(null);
  const bumpPaintVersion = useCallback(() => {
    if (paintRafRef.current != null) return;
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = null;
      setImagePaintVersion((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (paintRafRef.current != null) cancelAnimationFrame(paintRafRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_COLOR_STORAGE_KEY, cropsOverlayColor);
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayColor]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_ALPHA_STORAGE_KEY, String(cropsOverlayAlpha));
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayAlpha]);

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

  const components =
    componentState.key === componentKey
      ? componentState.items
      : ensureRootComponent(readSavedComponents(componentKey), item);

  // Persisting the component array to localStorage serialises every cut's PNG
  // data URL. Doing that synchronously inside the state updater stalls the main
  // thread on each commit. Instead we keep the latest snapshot in a ref and flush
  // it on a debounce / at unmount, off the interaction's critical path.
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

  // Flush any queued draft before the editor unmounts (e.g. switching references,
  // which remounts via `key={item.id}`), so unsaved edits are never dropped.
  useEffect(() => flushPendingPersist, [flushPendingPersist]);

  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setStackSaveStatus(null);
      setComponentState((current) => {
        // `current.items` is already normalised; only re-normalise when the key
        // changed (stale snapshot from a previous reference).
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

  const selectedComponent = components.find((component) => component.id === selectedComponentId) ?? null;
  const rootComponent = components.find((component) => component.id === rootComponentId) ?? createRootComponent(item);
  const roots = useMemo(() => {
    const list = components.filter((component) => component.parentId == null);
    return list.sort((a, b) => {
      if (a.isDefaultRoot && !b.isDefaultRoot) return -1;
      if (!a.isDefaultRoot && b.isDefaultRoot) return 1;
      return (a.createdAt || "").localeCompare(b.createdAt || "");
    });
  }, [components]);
  const activeScopeId = components.some((component) => component.id === activeRootId)
    ? activeRootId
    : rootComponentId;
  const activeRoot = components.find((component) => component.id === activeScopeId) ?? rootComponent;
  const componentTree = useMemo(
    () => buildComponentTree(components, activeScopeId),
    [components, activeScopeId],
  );
  const scopedComponents = useMemo(() => flattenComponentTree(componentTree), [componentTree]);
  const stackedComponents = useMemo(
    () => scopedComponents.filter((component) => component.id !== activeScopeId),
    [activeScopeId, scopedComponents],
  );
  const cutCountByRoot = useMemo(() => {
    const counts = new Map<string, number>();
    for (const component of components) {
      if (component.parentId == null) continue;
      const rid = component.rootId ?? rootComponentId;
      counts.set(rid, (counts.get(rid) ?? 0) + 1);
    }
    return counts;
  }, [components, rootComponentId]);

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
  }, [activeRoot, item.h, item.id, item.name, item.type, item.url, item.w, rootComponentId, selectedComponent, viewMode]);

  const headerSubject =
    viewMode === "stack" && selectedComponent
      ? {
          name: selectedComponent.name,
          w: selectedComponent.box.w,
          h: selectedComponent.box.h,
          type: selectedComponent.type || "PNG",
        }
      : activeSubject;
  // Cutting happens inside an opened root (component view) and produces child
  // components. Any component can later be promoted to a root via "Become root".
  const canCrop = activeSubject.kind === "component";

  const cancelSelection = useCallback(() => {
    selectionInteractionRef.current = null;
    setDrawing(false);
    setSelection(null);
    setSelectionLocked(false);
    setDrawingPath(null);
    setEditingComponentId(null);
  }, []);

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
    setExpandedComponentIds(new Set(components.map((entry) => entry.id)));
  }, [components]);

  const collapseAllComponents = useCallback(() => {
    setExpandedComponentIds(new Set());
  }, []);

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

  // Opening any node (root or cut) shows it as the editable subject and scopes the
  // tree to its owning root. A root opens as its own croppable subject.
  const openComponent = useCallback(
    (id: string) => {
      const component = components.find((entry) => entry.id === id);
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
    [cancelSelection, components, expandComponentPath, resetToolViewport, rootComponentId],
  );

  // Select a root from the switcher and open it for editing.
  const selectRoot = useCallback(
    (id: string) => {
      openComponent(id);
    },
    [openComponent],
  );

  // "+ New" creates a brand-new, independent root seeded with the original image.
  // The original is only a starting point: each root is its own workspace and can
  // later be narrowed to a section via "Become root".
  const beginRootCreation = useCallback(() => {
    const id = newRootComponentId();
    const newRoot: SavedComponent = {
      id,
      name: "New stack",
      box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
      dataUrl: item.url,
      type: item.type || "IMG",
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
  }, [cancelSelection, item.h, item.type, item.url, item.w, resetToolViewport, updateComponents]);

  // "Become root" redefines the currently open root *in place* to be the selected
  // section: the section's pixels/bounds replace the root's, its own children move
  // up to the root, and the other crops of that root (along with the previous root
  // image) are discarded. No copy is made and no extra root is created — the
  // element simply becomes the root of its workspace.
  const promoteToRoot = useCallback(
    (id: string) => {
      const section = components.find((entry) => entry.id === id);
      if (!section || section.parentId == null) return;
      const targetRootId = section.rootId ?? activeScopeId ?? rootComponentId;
      const subtree = componentSubtreeIds(components, id);
      updateComponents((current) =>
        current
          .filter((entry) => {
            // Drop the redefined root's crops that aren't part of the section's subtree.
            const inTargetRoot = (entry.rootId ?? null) === targetRootId && entry.id !== targetRootId;
            return !inTargetRoot || subtree.has(entry.id);
          })
          .map((entry): SavedComponent | null => {
            if (entry.id === targetRootId) {
              // Adopt the section's identity while keeping the root id stable so the
              // surviving subtree's rootId references stay valid.
              return {
                ...entry,
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
            if (entry.id === id) return null; // section is now merged into the root
            if (subtree.has(entry.id)) {
              return {
                ...entry,
                parentId: entry.parentId === id ? targetRootId : entry.parentId,
                rootId: targetRootId,
              };
            }
            return entry;
          })
          .filter((entry): entry is SavedComponent => entry != null),
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
    [activeScopeId, cancelSelection, components, resetToolViewport, rootComponentId, updateComponents],
  );

  const startEditComponent = useCallback(
    (id: string) => {
      const component = components.find((entry) => entry.id === id);
      if (!component || component.parentId == null) return;
      const parentId = component.parentId;

      selectionInteractionRef.current = null;
      setDrawing(false);
      setSelection(null);
      setSelectionLocked(false);
      setDrawingPath(null);

      expandComponentPath(parentId);
      setActiveRootId(component.rootId ?? rootComponentId);
      setSelectedComponentId(parentId);
      setViewMode("component");

      resetToolViewport();
      setEditingComponentId(id);
      setCurrentTool("crop");
    },
    [components, expandComponentPath, resetToolViewport, rootComponentId],
  );

  // Reset only the active stack back to the original image: drop its crops and
  // restore its root node to the full original image. Other stacks of this image
  // are left untouched.
  const resetActiveStack = useCallback(() => {
    cancelPendingPersist();
    const stackId = activeScopeId;
    const isDefault = stackId === rootComponentId;
    updateComponents((current) =>
      current
        .filter((entry) => {
          const belongsToStack = (entry.rootId ?? null) === stackId && entry.id !== stackId;
          return !belongsToStack;
        })
        .map((entry): SavedComponent =>
          entry.id === stackId
            ? {
                ...entry,
                name: isDefault ? "root" : entry.name,
                box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
                dataUrl: item.url,
                type: item.type || "IMG",
                parentId: null,
                kind: "root",
                rootId: stackId,
                isDefaultRoot: isDefault,
              }
            : entry,
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
    item.h,
    item.type,
    item.url,
    item.w,
    resetToolViewport,
    rootComponentId,
    updateComponents,
  ]);

  const selectStackComponent = useCallback(
    (id: string) => {
      cancelSelection();
      expandComponentPath(id);
      setSelectedComponentId(id);
    },
    [cancelSelection, expandComponentPath],
  );

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

  const requestResetConfirmation = useCallback(() => {
    setPendingConfirmation({ type: "reset" });
  }, []);

  const confirmPendingAction = useCallback(() => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    resetActiveStack();
  }, [pendingConfirmation, resetActiveStack]);

  const persistReferenceStack = useCallback(async () => {
    if (savingStack) return;
    // An explicit save supersedes any queued draft write; drop it so a late
    // flush can't resurrect the draft we are about to clear.
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

  const selectionToSubjectCoords = useCallback(
    (box: CropBox): CropBox | null => {
      const img = imgRef.current;
      if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
        return null;
      }
      const imageBox = { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
      const visibleBox = intersectCropBoxes(box, imageBox);
      if (!visibleBox || visibleBox.w < 1 || visibleBox.h < 1) return null;

      const sx = (img.naturalWidth || activeSubject.w || img.clientWidth) / img.clientWidth;
      const sy = (img.naturalHeight || activeSubject.h || img.clientHeight) / img.clientHeight;
      return {
        x: (visibleBox.x - imageBox.x) * sx,
        y: (visibleBox.y - imageBox.y) * sy,
        w: visibleBox.w * sx,
        h: visibleBox.h * sy,
        r: Math.min(
          ((box.r ?? 0) * (sx + sy)) / 2,
          (visibleBox.w * sx) / 2,
          (visibleBox.h * sy) / 2,
        ),
      };
    },
    [activeSubject.h, activeSubject.w],
  );

  const toOriginalCoords = useCallback(
    (subjectBox: CropBox): CropBox => {
      const origin = activeSubject.kind === "component" ? activeSubject.originBox : null;
      const x = (origin?.x ?? 0) + subjectBox.x;
      const y = (origin?.y ?? 0) + subjectBox.y;
      const maxW = item.w ? Math.max(1, item.w - x) : subjectBox.w;
      const maxH = item.h ? Math.max(1, item.h - y) : subjectBox.h;
      return {
        x,
        y,
        w: Math.min(subjectBox.w, maxW),
        h: Math.min(subjectBox.h, maxH),
        r: Math.min(subjectBox.r ?? 0, subjectBox.w / 2, subjectBox.h / 2),
      };
    },
    [activeSubject, item.h, item.w],
  );

  const saveSelection = useCallback(async (postProcess?: ProcessingFeatureKey) => {
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
          subjectBox.x,
          subjectBox.y,
          subjectBox.w,
          subjectBox.h,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        if (radius > 0) ctx.restore();
        dataUrl = await canvasToDataUrl(canvas, "image/png");
      } catch {
        dataUrl = activeSubject.url;
      }
    }

    // Optionally run an AI model on the freshly cropped image and bake the
    // result into the cut. On failure, fall back to the plain crop.
    if (postProcess) {
      try {
        const input = await urlToBytes(dataUrl);
        const output =
          postProcess === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
        dataUrl = bytesToPngDataUrl(output);
      } catch (error) {
        console.error(`Draw post-process (${postProcess}) failed`, error);
      }
    }

    if (editingComponentId) {
      const editedId = editingComponentId;
      updateComponents((current) =>
        current.map((entry) =>
          entry.id === editedId
            ? { ...entry, box: sourceBox, dataUrl, type: entry.type || "PNG" }
            : entry,
        ),
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
    const parentId = activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
    const rootId = activeSubject.rootId ?? activeScopeId;
    updateComponents((current) => [
      {
        id: nextId,
        name: shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt: new Date().toISOString(),
        parentId,
        kind: "cut",
        rootId,
      },
      ...current,
    ]);
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
  }, [
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
    toOriginalCoords,
    updateComponents,
  ]);

  // --- Florence-2 auto-detect ---------------------------------------------

  const flashAutoDetectMessage = useCallback((message: string) => {
    setAutoDetectMessage(message);
    if (autoDetectMessageTimer.current != null) {
      clearTimeout(autoDetectMessageTimer.current);
    }
    autoDetectMessageTimer.current = window.setTimeout(() => {
      autoDetectMessageTimer.current = null;
      setAutoDetectMessage(null);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (autoDetectMessageTimer.current != null) {
        clearTimeout(autoDetectMessageTimer.current);
      }
    };
  }, []);

  const updateProposalBox = useCallback((id: string, box: CropBox) => {
    setProposedRegions((current) =>
      current.map((region) => (region.id === id ? { ...region, box } : region)),
    );
  }, []);

  const discardProposedRegion = useCallback((id: string) => {
    setProposedRegions((current) => current.filter((region) => region.id !== id));
  }, []);

  const discardAllProposedRegions = useCallback(() => {
    setProposedRegions([]);
  }, []);

  // Run Florence-2 on the open subject and stage the result as proposals. Boxes
  // are mapped into the same content/display space the manual selection uses, so
  // they render and edit identically.
  const autoDetect = useCallback(async () => {
    if (autoDetecting || !canCrop) return;
    const img = imgRef.current;
    const cw = img?.clientWidth ?? 0;
    const ch = img?.clientHeight ?? 0;
    if (!cw || !ch) {
      flashAutoDetectMessage("Open a stack before auto-detecting");
      return;
    }
    setAutoDetecting(true);
    setAutoDetectMessage(null);
    setProposedRegions([]);
    try {
      const bytes = await urlToBytes(activeSubject.url);
      const regions = await runFlorence2(bytes);
      if (regions.length === 0) {
        flashAutoDetectMessage("No components detected — try drawing regions manually");
        return;
      }
      const mapped: ProposedRegion[] = regions.map((region, index) => {
        const x = clamp(region.x * cw, 0, cw);
        const y = clamp(region.y * ch, 0, ch);
        return {
          id: `fp-${index}-${Math.random().toString(36).slice(2, 7)}`,
          label: region.label,
          confidence: region.confidence,
          box: {
            x,
            y,
            w: clamp(region.w * cw, 1, cw - x),
            h: clamp(region.h * ch, 1, ch - y),
          },
        };
      });
      setProposedRegions(mapped);
    } catch (error) {
      console.error("[tools] auto-detect failed", error);
      flashAutoDetectMessage("Auto-detect failed — see console for details");
    } finally {
      setAutoDetecting(false);
    }
  }, [activeSubject.url, autoDetecting, canCrop, flashAutoDetectMessage]);

  // Commit every staged proposal as a real cut, through the same crop pipeline a
  // hand-drawn region uses. The proposal's label becomes the cut name.
  const applyProposedRegions = useCallback(async () => {
    if (applyingProposals || proposedRegions.length === 0 || !canCrop) return;
    const img = imgRef.current;
    const parentId = activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
    const rootId = activeSubject.rootId ?? activeScopeId;
    setApplyingProposals(true);
    try {
      const created: SavedComponent[] = [];
      for (const region of proposedRegions) {
        const subjectBox = selectionToSubjectCoords(region.box);
        if (!subjectBox) continue;
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
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              img,
              subjectBox.x,
              subjectBox.y,
              subjectBox.w,
              subjectBox.h,
              0,
              0,
              canvas.width,
              canvas.height,
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
      if (created.length === 0) return;
      updateComponents((current) => [...created, ...current]);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(parentId);
        for (const component of created) next.add(component.id);
        return next;
      });
      setProposedRegions([]);
      setSelectedComponentId(created[0].id);
      setViewMode("component");
      resetToolViewport();
      cancelSelection();
    } finally {
      setApplyingProposals(false);
    }
  }, [
    activeScopeId,
    activeSubject,
    applyingProposals,
    canCrop,
    cancelSelection,
    proposedRegions,
    resetToolViewport,
    rootComponent.id,
    selectionToSubjectCoords,
    toOriginalCoords,
    updateComponents,
  ]);

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

  useEffect(() => {
    let cancelled = false;

    const hasContent = (items: SavedComponent[]) =>
      items.some((component) => component.parentId != null) ||
      items.filter((component) => component.parentId == null).length > 1;

    const applyState = (
      items: SavedComponent[],
      preferredRootId: string | null,
      persistDraft: boolean,
    ) => {
      const next = ensureRootComponent(items, item);
      const nextRootId = preferredRootId && next.some((component) => component.id === preferredRootId)
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
      // Fresh image with no stack: open the default root for immediate cropping.
      // Existing stack: land on the original overview so the user picks a root.
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
      return () => {
        cancelled = true;
      };
    }

    void readReferenceStackComponents(item).then((savedStack) => {
      if (cancelled) return;
      if (savedStack) {
        if (!hasDraft) removeSavedComponents(componentKey);
        applyState(savedStack.items, savedStack.activeRootId, false);
        return;
      }

      const fallbackLocalComponents = hasDraft
        ? localComponents
        : ensureRootComponent(readSavedComponents(componentKey), item);
      applyState(fallbackLocalComponents, rootComponentId, hasContent(fallbackLocalComponents));
    });

    return () => {
      cancelled = true;
    };
  }, [cancelSelection, componentKey, item, referenceId, resetToolViewport, rootComponentId]);

  useEffect(() => {
    if ((viewMode !== "component" && viewMode !== "stack") || !selectedComponentId || selectedComponent) return;
    setSelectedComponentId(null);
    setViewMode("original");
  }, [selectedComponent, selectedComponentId, viewMode]);

  useEffect(() => {
    if (!editingComponentId || selection) return;
    const component = components.find((entry) => entry.id === editingComponentId);
    if (!component) {
      setEditingComponentId(null);
      return;
    }
    const expectedSubjectId = component.parentId ?? rootComponentId;
    let activeSubjectId: string | null = null;
    if (activeSubject.kind === "component") {
      activeSubjectId = activeSubject.id;
    } else if (activeSubject.kind === "original") {
      activeSubjectId = rootComponentId;
    }
    if (activeSubjectId !== expectedSubjectId) return;

    const img = imgRef.current;
    if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
      return;
    }

    const subjectBox = componentBoxInSubject(component.box, activeSubject);
    if (!subjectBox) {
      setEditingComponentId(null);
      return;
    }

    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const avgScale = (sx + sy) / 2;

    setSelection({
      x: subjectBox.x / sx,
      y: subjectBox.y / sy,
      w: subjectBox.w / sx,
      h: subjectBox.h / sy,
      r: (component.box.r ?? 0) / (avgScale || 1),
    });
    setSelectionLocked(true);
  }, [activeSubject, components, editingComponentId, imagePaintVersion, rootComponentId, selection]);

  useEffect(() => {
    if (!selectedComponentId) return;
    expandComponentPath(selectedComponentId);
  }, [expandComponentPath, selectedComponentId]);

  // Proposals are defined in the open subject's coordinate space, so they are
  // dropped whenever the subject changes (opening another node, or leaving the
  // croppable component view).
  useEffect(() => {
    setProposedRegions([]);
  }, [activeSubject.id, viewMode]);

  useEffect(() => {
    if ((currentTool !== "crop" && currentTool !== "draw") || canCrop) return;
    setCurrentTool("move");
    cancelSelection();
  }, [canCrop, cancelSelection, currentTool]);

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

  const selectionCrop = selection ? selectionToSubjectCoords(selection) : null;
  const selectionSourceBox = selectionCrop && canCrop ? toOriginalCoords(selectionCrop) : null;
  const selectionMatchesExistingCut = Boolean(
    selectionSourceBox &&
      componentAreaAlreadyExists(selectionSourceBox, scopedComponents, rootComponentId),
  );
  const canSaveSelection = Boolean(
    selectionLocked && selectionCrop && canCrop,
  );
  const selectionSize = selectionCrop ?? { x: 0, y: 0, w: 0, h: 0 };
  const confirmationCopy = pendingConfirmation
    ? confirmationDialogCopy(pendingConfirmation)
    : null;
  const showGroupNavigator = Boolean(groupContext && groupContext.references.length > 1);

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
    proposedRegions,
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

  function updateIdleCursorAndHover(event: PointerEvent<HTMLDivElement>) {
    const stage = stageViewportRef.current;
    const point = getContentPoint(event, imgRef.current, toolZoom);
    let cursor = "";
    let nextHovered: string | null = null;

    if (point) {
      const selectionTool = currentTool === "crop" || currentTool === "draw";
      if (canCrop && selection && selectionLocked && selectionTool) {
        const hit = selectionHitTest(point, selection, true, toolZoom);
        if (hit?.kind === "radius") cursor = "grab";
        else if (hit?.kind === "resize") cursor = resizeCursor(hit.handle);
        else if (hit?.kind === "move" && currentTool === "crop") cursor = "move";
      }

      if (viewMode === "stack") {
        const hovered = componentHitTest(point, stackedComponents, activeSubject, imgRef.current);
        nextHovered = hovered?.id ?? null;
        if (!cursor && hovered) cursor = "pointer";
      }

      const nextHoveringSelection = Boolean(
        selection &&
          point.x >= selection.x && point.x <= selection.x + selection.w &&
          point.y >= selection.y && point.y <= selection.y + selection.h,
      );
      if (nextHoveringSelection !== isHoveringSelection) setIsHoveringSelection(nextHoveringSelection);
    } else if (isHoveringSelection) {
      setIsHoveringSelection(false);
    }

    if (stage && stage.style.cursor !== cursor) stage.style.cursor = cursor;
    if (viewMode === "stack" && nextHovered !== hoveredComponentId) {
      setHoveredComponentId(nextHovered);
    }
  }

  function handleStagePointerLeave() {
    const stage = stageViewportRef.current;
    if (stage) stage.style.cursor = "";
    if (viewMode === "stack" && hoveredComponentId) setHoveredComponentId(null);
    if (isHoveringSelection) setIsHoveringSelection(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1 && toolZoom > MIN_TOOL_ZOOM) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      selectionInteractionRef.current = {
        type: "pan",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPan: toolPan,
      };
      setDrawing(true);
      return;
    }

    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-selection-action]")) return;

    const point = getContentPoint(event, imgRef.current, toolZoom);
    if (!point) return;

    if (viewMode === "stack") {
      const hit = componentHitTest(point, stackedComponents, activeSubject, imgRef.current);
      if (hit) {
        event.preventDefault();
        selectStackComponent(hit.id);
      }
      return;
    }

    if (!canCrop) return;

    // Staged Florence-2 proposals are editable regardless of the active tool:
    // click "×" to discard, a corner to resize, or the body to move.
    if (proposedRegions.length > 0) {
      const hit = proposalHitTest(point, proposedRegions, toolZoom);
      if (hit) {
        event.preventDefault();
        if (hit.kind === "discard") {
          discardProposedRegion(hit.id);
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        selectionInteractionRef.current =
          hit.kind === "resize"
            ? {
                type: "proposal-resize",
                pointerId: event.pointerId,
                id: hit.id,
                handle: hit.handle,
                startPoint: point,
                startBox: hit.box,
              }
            : {
                type: "proposal-move",
                pointerId: event.pointerId,
                id: hit.id,
                startPoint: point,
                startBox: hit.box,
              };
        setDrawing(true);
        return;
      }
    }

    if (currentTool !== "crop" && currentTool !== "draw") return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (selection && selectionLocked) {
      const hit = selectionHitTest(point, selection, true, toolZoom);
      if (hit?.kind === "radius") {
        selectionInteractionRef.current = {
          type: "radius",
          pointerId: event.pointerId,
          handle: hit.handle,
          startPoint: point,
          startBox: selection,
        };
        setDrawing(true);
        return;
      }
      if (hit?.kind === "resize") {
        selectionInteractionRef.current = {
          type: "resize",
          pointerId: event.pointerId,
          handle: hit.handle,
          startPoint: point,
          startBox: selection,
        };
        setDrawing(true);
        return;
      }
      if (hit?.kind === "move" && currentTool === "crop") {
        selectionInteractionRef.current = {
          type: "move",
          pointerId: event.pointerId,
          startPoint: point,
          startBox: selection,
        };
        setDrawing(true);
        return;
      }
    }

    if (currentTool === "draw") {
      selectionInteractionRef.current = { type: "free-draw", pointerId: event.pointerId };
      setDrawing(true);
      setSelectionLocked(false);
      setSelection(null);
      setDrawingPath({ points: [point] });
      return;
    }

    selectionInteractionRef.current = { type: "draw", pointerId: event.pointerId, startPoint: point };
    setDrawing(true);
    setSelectionLocked(false);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = selectionInteractionRef.current;
    if (!drawing || !interaction) {
      updateIdleCursorAndHover(event);
      return;
    }

    if (interaction.type === "pan") {
      setToolPan(
        clampToolPan(
          {
            x: interaction.startPan.x + event.clientX - interaction.startClient.x,
            y: interaction.startPan.y + event.clientY - interaction.startClient.y,
          },
          toolZoom,
          stageViewportRef.current,
          imgRef.current,
        ),
      );
      return;
    }

    const point = getContentPoint(event, imgRef.current, toolZoom);
    if (!point) return;
    const imageBounds = getImageContentBounds(imgRef.current);

    if (interaction.type === "resize") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      if (!bounds) return;
      setSelection(
        resizeCropBox(interaction.startBox, interaction.handle, point, bounds),
      );
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "radius") {
      setSelection(
        roundCropBox(interaction.startBox, interaction.handle, interaction.startPoint, point),
      );
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "move") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      setSelection(moveCropBox(interaction.startBox, interaction.startPoint, point, bounds));
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "proposal-resize") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      if (!bounds) return;
      updateProposalBox(
        interaction.id,
        resizeCropBox(interaction.startBox, interaction.handle, point, bounds),
      );
      return;
    }

    if (interaction.type === "proposal-move") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      updateProposalBox(
        interaction.id,
        moveCropBox(interaction.startBox, interaction.startPoint, point, bounds),
      );
      return;
    }

    if (interaction.type === "free-draw") {
      setDrawingPath((current) => {
        if (!current) return { points: [point] };
        const last = current.points[current.points.length - 1];
        if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) {
          return current;
        }
        return { points: [...current.points, point] };
      });
      return;
    }

    const rawBox = cropBoxFromPoints(interaction.startPoint, point);
    if (imageBounds) {
      const clipped = intersectCropBoxes(rawBox, imageBounds);
      setSelection(clipped ?? { x: rawBox.x, y: rawBox.y, w: 0, h: 0 });
    } else {
      setSelection(rawBox);
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || !selectionInteractionRef.current) return;
    const interaction = selectionInteractionRef.current;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDrawing(false);
    selectionInteractionRef.current = null;
    if (
      interaction.type === "pan" ||
      interaction.type === "proposal-move" ||
      interaction.type === "proposal-resize"
    ) {
      return;
    }

    if (interaction.type === "free-draw") {
      const points = drawingPath?.points ?? [];
      const bounds = boundsFromDrawingPath(points);
      if (!bounds) {
        setDrawingPath(null);
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      const imageBounds = getImageContentBounds(imgRef.current);
      const clipped = imageBounds ? intersectCropBoxes(bounds, imageBounds) : bounds;
      if (!clipped || clipped.w < 8 || clipped.h < 8) {
        setDrawingPath(null);
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      // Keep the freehand stroke painted on the canvas. It stays until an action
      // is picked from the draw toolbar (which commits) or the user cancels.
      setSelection(clipped);
      setSelectionLocked(true);
      return;
    }

    setSelection((current) => {
      if (!current || current.w < 8 || current.h < 8) {
        setSelectionLocked(false);
        return null;
      }
      setSelectionLocked(true);
      return current;
    });
  }

  const handleRemoveComponent = useCallback(
    (id: string) => {
      const removedIds = componentSubtreeIds(components, id);
      updateComponents((current) =>
        current.filter((entry) => !removedIds.has(entry.id)),
      );
      if (removedIds.has(activeScopeId)) {
        setActiveRootId(rootComponentId);
        openOriginal();
      } else if (selectedComponentId && removedIds.has(selectedComponentId)) {
        openOriginal();
      }
    },
    [activeScopeId, components, openOriginal, rootComponentId, selectedComponentId, updateComponents],
  );

  return {
    // Refs
    fileInputRef,
    stageViewportRef,
    imgRef,
    overlayCanvasRef,
    cropsCanvasRef,

    // State
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
    proposedRegions,
    autoDetecting,
    applyingProposals,
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

    // Setters
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

    // Viewport
    toolZoom,
    toolPan,
    setToolPan,
    resetToolViewport,
    handleStageWheel,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,

    // Computed values
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

    // Handlers
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
    openComponent,
    selectRoot,
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
    autoDetect,
    applyProposedRegions,
    discardProposedRegion,
    discardAllProposedRegions,
    uploadImage,
    updateIdleCursorAndHover,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRemoveComponent,
  };
}
