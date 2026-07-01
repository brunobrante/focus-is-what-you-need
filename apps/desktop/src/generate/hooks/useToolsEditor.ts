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
  PaddingSides,
  PaddingValues,
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
import { growPenPath, penBounds, penPathFromPolygon } from "../engine/pen";
import { componentBoxes, foregroundBoundingBox, simplifyPath } from "../engine/contour";
import { computeEdgeMargins, computeSpacing } from "../engine/measure";
import { nextRingInset } from "../engine/radialRings";
import { snapAspect } from "../engine/aspectSnap";
import { CLASSIC_CV_MODEL_ID } from "@/lib/models/modelCatalog";
import type { MeasureOverlay } from "../engine/types";
import { useBuilderCanvasPainter } from "./useBuilderCanvasPainter";
import { useBuilderComponents } from "./useBuilderComponents";
import { useBuilderInteraction } from "./useBuilderInteraction";
import { useBuilderNavigation } from "./useBuilderNavigation";
import { useBuilderCutOperations } from "./useBuilderCutOperations";
import { useAutoDetect } from "./useAutoDetect";
import { useCropSegmentation } from "./useCropSegmentation";
import { useStackPersist } from "./useStackPersist";
import { useCutVariants } from "./useCutVariants";

// Rasterizes a subject-pixel crop region of `img` to a grayscale buffer (Rec.601
// luma) for in-app radial ring detection. Returns null if the box is degenerate
// or a 2D context is unavailable.
function rasterizeGray(
  img: HTMLImageElement,
  box: CropBox,
): { gray: Uint8Array; width: number; height: number } | null {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
  }
  return { gray, width: w, height: h };
}

// How long the stack must sit unchanged before it is auto-committed to the DB.
const AUTOSAVE_DEBOUNCE_MS = 1200;

// Cheap change-detector for the component stack: catches new/removed cuts,
// box/radius edits, re-rasterized images (whose encoded length changes) and
// variant changes, without hashing the full data URLs.
function componentsSignature(components: SavedComponent[]): string {
  let sig = String(components.length);
  for (const c of components) {
    const b = c.box;
    sig +=
      `|${c.id}:${c.parentId ?? ""}:` +
      `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)},${Math.round(b.r ?? 0)}:` +
      `${c.dataUrl?.length ?? 0}:${c.variants?.length ?? 0}:${c.activeVariantId ?? ""}`;
  }
  return sig;
}

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
  addPadding: (amount: number, sides: PaddingSides) => void;
  padding: PaddingValues | null;
  setPaddingValues: (values: PaddingValues) => void;
  showSizes: () => void;
  showingSizes: boolean;
  penClosed: boolean;
  penCrop: CropBox | null;
  cancelPen: () => void;
  savePen: () => void;
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

  // The closed pen silhouette's bounds in subject pixels — the region to segment
  // and the toolbar's size badge. Declared here so adjustCrop (below) can use it.
  const penBox = pen.penClosed && pen.penPath ? penBounds(pen.penPath) : null;
  const penCrop = penBox ? selectionToSubjectCoords(penBox) : null;

  // "Show sizes" overlay (object boxes + gaps), in subject coords, or null.
  const [measurements, setMeasurements] = useState<MeasureOverlay | null>(null);

  // Padding model: `paddingBase` is the rectangle crop (subject px) before any
  // padding; the per-side padding is how far the current selection has grown
  // beyond it. Captured fresh whenever the selection changes by non-padding means
  // (draw/resize/move/adjust), so the toolbar inputs show — and SET — the actual
  // padding on each side rather than blindly incrementing.
  const [paddingBase, setPaddingBase] = useState<CropBox | null>(null);
  const paddingApplyRef = useRef(false);

  useEffect(() => {
    if (paddingApplyRef.current) {
      paddingApplyRef.current = false;
      return;
    }
    setPaddingBase(selection ? selectionToSubjectCoords(selection) : null);
  }, [selection, selectionToSubjectCoords]);

  const { segmenting, segmentError, segment, clearSegmentation } =
    useCropSegmentation({ imgRef });

  // The measurement overlay belongs to one crop position; drop it when the crop
  // (rectangle or pen) moves.
  useEffect(() => {
    setMeasurements(null);
  }, [selection, pen.penPath]);

  // Reset any segmenting/error state when the rectangle selection changes.
  useEffect(() => {
    clearSegmentation();
  }, [selection, clearSegmentation]);

  // "Adjust crop" segments the object inside the user's drawn area and reshapes
  // the ACTIVE cut tool to it: the rectangle snaps to the object's bounds, the
  // pen is redrawn as a smooth path along the object's silhouette.
  const adjustCrop = useCallback(
    async (modelId: string | null) => {
      if (!canCrop || segmenting) return;
      const img = imgRef.current;
      if (!img || !img.naturalWidth || !img.naturalHeight || !img.clientWidth || !img.clientHeight) {
        return;
      }
      const fx = img.clientWidth / img.naturalWidth;
      const fy = img.clientHeight / img.naturalHeight;

      // Pen: redraw the path along the object contour (subject → content coords).
      if (currentTool === "pen" && pen.penClosed && penCrop) {
        const result = await segment(modelId, penCrop);
        if (!result || result.contour.length < 3) return;
        const eps = Math.max(2, Math.min(penCrop.w, penCrop.h) * 0.02);
        const poly = simplifyPath(result.contour, eps).map((p) => ({ x: p.x * fx, y: p.y * fy }));
        if (poly.length >= 3) pen.replacePenPath(penPathFromPolygon(poly));
        clearSegmentation();
        return;
      }

      // Rectangle: snap the box to ALL significant foreground (the whole word /
      // multi-part subject, not just the largest blob), keeping the radius.
      if (selection && selectionCrop) {
        // Commits a subject-space box as the new selection: if it lands a hair
        // off square (a 547×546 the anti-aliased edge cost a pixel), snap it to a
        // true square keeping the centre, then map subject → content px (the size
        // badge reads subject px) and clamp the radius. Returns false if degenerate.
        const commitSubjectBox = (sx: number, sy: number, sw: number, sh: number): boolean => {
          const sq = snapAspect(sw, sh);
          let bx = sx;
          let by = sy;
          let bw = sw;
          let bh = sh;
          if (sq) {
            bx -= (sq.w - sw) / 2;
            by -= (sq.h - sh) / 2;
            bw = sq.w;
            bh = sq.h;
          }
          const w = bw * fx;
          const h = bh * fy;
          if (w < 1 || h < 1) return false;
          setSelection({
            x: bx * fx,
            y: by * fy,
            w,
            h,
            r: Math.min(selection.r ?? 0, w / 2, h / 2),
          });
          setSelectionLocked(true);
          return true;
        };

        // Round/concentric subjects first (badges, coins, circular logos): SAM
        // fills the whole disc, so its bounds barely move and the crop looks
        // stuck. Read the crop radially and peel to the next ring inward — runs
        // in-app, no model, and clicking again peels the following ring.
        const ras = rasterizeGray(img, selectionCrop);
        const inset = ras ? nextRingInset(ras.gray, ras.width, ras.height) : null;
        if (inset != null) {
          const sb = selectionCrop;
          if (commitSubjectBox(sb.x + inset, sb.y + inset, sb.w - 2 * inset, sb.h - 2 * inset)) {
            return;
          }
        }

        const result = await segment(modelId, selectionCrop);
        if (!result) return;
        const bb = foregroundBoundingBox(result.mask.data, result.mask.width, result.mask.height);
        if (!bb) return;
        // Mask is crop-local at subject resolution → subject → content coords.
        if (!commitSubjectBox(bb.x + result.box.x, bb.y + result.box.y, bb.w, bb.h)) return;
        clearSegmentation();
      }
    },
    [
      canCrop,
      clearSegmentation,
      currentTool,
      imgRef,
      pen,
      penCrop,
      segment,
      segmenting,
      selection,
      selectionCrop,
      setSelection,
      setSelectionLocked,
    ],
  );

  // Grows the active crop area by `amount` (subject px) on the chosen sides: the
  // rectangle expands its edges (clamped to the image); the pen grows uniformly.
  const addPadding = useCallback(
    (amount: number, sides: PaddingSides) => {
      if (!amount || amount <= 0 || !canCrop) return;
      const img = imgRef.current;
      if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
        return;
      }
      const fx = img.clientWidth / img.naturalWidth;
      const fy = img.clientHeight / img.naturalHeight;

      if (currentTool === "pen" && pen.penClosed && pen.penPath) {
        pen.replacePenPath(growPenPath(pen.penPath, amount * ((fx + fy) / 2)));
        return;
      }

      if (selection) {
        const left = sides === "all" || sides === "horizontal" || sides === "left";
        const right = sides === "all" || sides === "horizontal" || sides === "right";
        const top = sides === "all" || sides === "vertical" || sides === "top";
        const bottom = sides === "all" || sides === "vertical" || sides === "bottom";
        const x0 = Math.max(0, selection.x - (left ? amount * fx : 0));
        const y0 = Math.max(0, selection.y - (top ? amount * fy : 0));
        const x1 = Math.min(img.clientWidth, selection.x + selection.w + (right ? amount * fx : 0));
        const y1 = Math.min(img.clientHeight, selection.y + selection.h + (bottom ? amount * fy : 0));
        const w = x1 - x0;
        const h = y1 - y0;
        if (w < 1 || h < 1) return;
        setSelection({ x: x0, y: y0, w, h, r: Math.min(selection.r ?? 0, w / 2, h / 2) });
        setSelectionLocked(true);
      }
    },
    [canCrop, currentTool, imgRef, pen, selection, setSelection, setSelectionLocked],
  );

  // The rectangle crop's current per-side padding (subject px) = how far the
  // selection has grown beyond its base box. Null for the pen (no axis-aligned
  // sides) or before a base is captured.
  const selectionSubject = selection ? selectionToSubjectCoords(selection) : null;
  const padding: PaddingValues | null =
    currentTool !== "pen" && paddingBase && selectionSubject
      ? {
          left: Math.max(0, Math.round(paddingBase.x - selectionSubject.x)),
          top: Math.max(0, Math.round(paddingBase.y - selectionSubject.y)),
          right: Math.max(
            0,
            Math.round(selectionSubject.x + selectionSubject.w - (paddingBase.x + paddingBase.w)),
          ),
          bottom: Math.max(
            0,
            Math.round(selectionSubject.y + selectionSubject.h - (paddingBase.y + paddingBase.h)),
          ),
        }
      : null;

  // Sets all four paddings to absolute values (subject px) at once, growing the
  // crop out from its base box and clamping to the image. One setSelection so the
  // sides don't fight stale state.
  const setPaddingValues = useCallback(
    (next: PaddingValues) => {
      const img = imgRef.current;
      if (!paddingBase || !selection || !img || !img.naturalWidth || !img.naturalHeight) return;
      if (!img.clientWidth || !img.clientHeight) return;
      const fx = img.clientWidth / img.naturalWidth;
      const fy = img.clientHeight / img.naturalHeight;
      const x0 = Math.max(0, paddingBase.x - Math.max(0, next.left));
      const y0 = Math.max(0, paddingBase.y - Math.max(0, next.top));
      const x1 = Math.min(img.naturalWidth, paddingBase.x + paddingBase.w + Math.max(0, next.right));
      const y1 = Math.min(img.naturalHeight, paddingBase.y + paddingBase.h + Math.max(0, next.bottom));
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      const w = (x1 - x0) * fx;
      const h = (y1 - y0) * fy;
      const nextSel = { x: x0 * fx, y: y0 * fy, w, h, r: Math.min(selection.r ?? 0, w / 2, h / 2) };
      if (
        Math.abs(nextSel.x - selection.x) < 0.01 &&
        Math.abs(nextSel.y - selection.y) < 0.01 &&
        Math.abs(nextSel.w - selection.w) < 0.01 &&
        Math.abs(nextSel.h - selection.h) < 0.01
      ) {
        return; // no change → don't strand the apply flag
      }
      paddingApplyRef.current = true;
      setSelection(nextSel);
      setSelectionLocked(true);
    },
    [imgRef, paddingBase, selection, setSelection, setSelectionLocked],
  );

  // "Show sizes": segment the objects inside the crop (always the built-in
  // classic-CV engine, which finds every foreground object — not SAM's single
  // pick) and measure the gaps between them. Toggles the overlay off when shown.
  const showSizes = useCallback(async () => {
    if (measurements) {
      setMeasurements(null);
      return;
    }
    if (!canCrop || segmenting) return;
    const region = currentTool === "pen" && pen.penClosed ? penCrop : selection ? selectionCrop : null;
    if (!region) return;
    const result = await segment(CLASSIC_CV_MODEL_ID, region);
    if (!result) return;
    const boxes = componentBoxes(result.mask.data, result.mask.width, result.mask.height).map((b) => ({
      x: b.x + result.box.x,
      y: b.y + result.box.y,
      w: b.w,
      h: b.h,
    }));
    // Gaps between objects + the four paddings to the crop frame (result.box).
    const spacing = [...computeSpacing(boxes), ...computeEdgeMargins(boxes, result.box)];
    setMeasurements({ boxes, spacing });
    clearSegmentation();
  }, [
    canCrop,
    clearSegmentation,
    currentTool,
    measurements,
    pen.penClosed,
    penCrop,
    segment,
    segmenting,
    selection,
    selectionCrop,
  ]);

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
    // Adjust crop now reshapes the active tool directly, so there is no separate
    // green silhouette preview to draw.
    segmentationContour: null,
    penPath: pen.penPath,
    penCursor: pen.penCursor,
    measurements,
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

  const { fileInputRef, uploading, setUploading, saveSelection, savePenCut, uploadImage, handleRemoveComponent } =
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

  // --- Pen cut toolbar (same flow as the rectangle) ------------------------

  const cancelPen = useCallback(() => pen.resetPen(), [pen]);
  const savePen = useCallback(() => {
    const path = pen.penPath;
    if (!path?.closed) return;
    void savePenCut(path).then(() => pen.resetPen());
  }, [pen, savePenCut]);

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

  // Auto-save: commit the reference stack to the DB on a debounce so the user
  // never has to press the Save button. The local working copy is already
  // written on every change (schedulePersist); this mirrors the durable commit
  // (`persistReferenceStack`) that used to be manual-only. Only for the
  // reference being edited, only after the stack has loaded, and only on a real
  // change — the first settle after a (re)load just records the baseline.
  const autosaveBaselineRef = useRef<{ key: string; sig: string } | null>(null);
  useEffect(() => {
    if (initializedKey !== componentKey) return;
    if (!referenceId || item.id !== referenceId) return;
    const sig = componentsSignature(components);
    const baseline = autosaveBaselineRef.current;
    if (!baseline || baseline.key !== componentKey) {
      autosaveBaselineRef.current = { key: componentKey, sig };
      return;
    }
    if (baseline.sig === sig) return;
    const timer = window.setTimeout(() => {
      autosaveBaselineRef.current = { key: componentKey, sig };
      void persistReferenceStack();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [components, initializedKey, componentKey, referenceId, item.id, persistReferenceStack]);

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
    addPadding,
    padding,
    setPaddingValues,
    showSizes,
    showingSizes: measurements !== null,
    penClosed: pen.penClosed,
    penCrop,
    cancelPen,
    savePen,
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
