import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Crop,
  Eye,
  Layers,
  Image as ImageIcon,
  Minus,
  Move,
  Pencil,
  Pipette,
  Plus,
  RotateCcw,
  Save,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readFileAsDataUrl } from "@/lib/utils";
import {
  extFromName,
  loadReferenceFile,
  loadReferenceStackFile,
  readReferenceStackData,
  readRefsMeta,
  removeReferenceStack,
  saveReferenceFile,
  saveReferenceStackFile,
  writeReferenceStackData,
  writeRefsMeta,
} from "@/lib/tauri/referenceStorage";
import { stackSummaryFromData, type ReferenceStackData } from "@/lib/references/stackTypes";

const COMPONENT_STORAGE_PREFIX = "workspace.tools.components.";
const PRIMARY_COMPONENT_STORAGE_PREFIX = "workspace.tools.primary.";
const CROPS_OVERLAY_COLOR_STORAGE_KEY = "workspace.tools.cropsOverlayColor";
const CROPS_OVERLAY_ALPHA = 0.22;
const CROPS_OVERLAY_DEFAULT_COLOR = "#FFFFFF";
const CROPS_OVERLAY_PRESETS = [
  "#FFFFFF",
  "#4C8DFF",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
] as const;

type SidebarTab = "components" | "config";

type EditorTool = "move" | "crop" | "draw";
type ViewMode = "original" | "stack" | "component";

type ToolReference = {
  id: string;
  name: string;
  type: string;
  w: number;
  h: number;
  url: string;
};

type CropBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

const SELECTION_MIN_SIZE = 8;
const MIN_TOOL_ZOOM = 1;
const MAX_TOOL_ZOOM = 25;
const CUT_MATCH_IOU_THRESHOLD = 0.88;
const HIERARCHY_MIN_AREA_DELTA = 16;
const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const RADIUS_HANDLES = ["nw", "ne", "se", "sw"] as const;
const HANDLE_HIT_AREA = 28;
const HANDLE_DOT_SIZE = 8;
const RADIUS_DOT_SIZE = 6;
const RADIUS_HANDLE_MIN_INSET = 12;

type ResizeHandle = (typeof RESIZE_HANDLES)[number];
type RadiusHandle = (typeof RADIUS_HANDLES)[number];

type DrawingPath = { points: Array<{ x: number; y: number }> };

type SelectionInteraction =
  | { type: "draw"; pointerId: number; startPoint: { x: number; y: number } }
  | { type: "free-draw"; pointerId: number }
  | { type: "move"; pointerId: number; startPoint: { x: number; y: number }; startBox: CropBox }
  | {
      type: "resize";
      pointerId: number;
      handle: ResizeHandle;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "radius";
      pointerId: number;
      handle: RadiusHandle;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "pan";
      pointerId: number;
      startClient: { x: number; y: number };
      startPan: { x: number; y: number };
    };

type SavedComponent = {
  id: string;
  name: string;
  box: CropBox;
  dataUrl: string;
  type: string;
  createdAt: string;
  parentId?: string | null;
};

type ComponentState = {
  key: string;
  items: SavedComponent[];
};

type PendingConfirmation =
  | { type: "primary"; componentId: string }
  | { type: "reset" };

type ComponentTreeNode = {
  component: SavedComponent;
  children: ComponentTreeNode[];
  depth: number;
};

type ActiveSubject =
  | {
      kind: "original" | "stack";
      id: string;
      name: string;
      type: string;
      url: string;
      w: number;
      h: number;
      originBox: CropBox;
    }
  | {
      kind: "component";
      id: string;
      name: string;
      type: string;
      url: string;
      w: number;
      h: number;
      originBox: CropBox;
      component: SavedComponent;
    };

export function Tools() {
  const [searchParams, setSearchParams] = useSearchParams();
  const referenceId = searchParams.get("id");
  const [localSource, setLocalSource] = useState<ToolReference | null>(null);
  const [diskReference, setDiskReference] = useState<ToolReference | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);

  useEffect(() => {
    if (!referenceId) {
      setDiskReference(null);
      setReferenceLoading(false);
      return;
    }

    let cancelled = false;
    setDiskReference(null);
    setReferenceLoading(true);
    void readDiskReference(referenceId)
      .then((reference) => {
        if (!cancelled) setDiskReference(reference);
      })
      .finally(() => {
        if (!cancelled) setReferenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [referenceId]);

  const item = referenceId ? diskReference : localSource;

  const handleEmptyUpload = useCallback((next: ToolReference) => {
    writeSavedComponents(
      `${COMPONENT_STORAGE_PREFIX}${next.id}`,
      ensureRootComponent([], next),
    );
    writePrimaryComponentId(
      `${COMPONENT_STORAGE_PREFIX}${next.id}`,
      sourceRootComponentId(next.id),
    );
    setLocalSource(next);
  }, []);

  if (referenceId && referenceLoading) {
    return <ToolsLoadingShell />;
  }
  if (referenceId && !diskReference) {
    return <ToolsNotFoundShell />;
  }
  if (!item) {
    return <ToolsEmptyShell onUpload={handleEmptyUpload} />;
  }

  return (
    <ToolsEditor
      key={item.id}
      item={item}
      referenceId={referenceId}
      onUploadedLocally={(next) => {
        setLocalSource(next);
        setSearchParams({});
      }}
    />
  );
}

type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  onUploadedLocally: (next: ToolReference) => void;
};

function ToolsEditor({ item, referenceId, onUploadedLocally }: ToolsEditorProps) {
  const componentKey = `${COMPONENT_STORAGE_PREFIX}${item.id}`;
  const rootComponentId = sourceRootComponentId(item.id);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropsCanvasRef = useRef<HTMLCanvasElement>(null);
  const componentImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);

  const [currentTool, setCurrentTool] = useState<EditorTool>("move");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selection, setSelection] = useState<CropBox | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState<DrawingPath | null>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [showCropsOverlay, setShowCropsOverlay] = useState(false);
  const [toolZoom, setToolZoom] = useState(MIN_TOOL_ZOOM);
  const [toolPan, setToolPan] = useState({ x: 0, y: 0 });
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
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
    items: ensureRootComponent(readSavedComponents(componentKey), item),
  }));
  const [primaryComponentId, setPrimaryComponentId] = useState(
    () => readPrimaryComponentId(componentKey) ?? rootComponentId,
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("components");
  const [cropsOverlayColor, setCropsOverlayColor] = useState<string>(
    () => readCropsOverlayColor(),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_COLOR_STORAGE_KEY, cropsOverlayColor);
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayColor]);

  const components =
    componentState.key === componentKey
      ? componentState.items
      : ensureRootComponent(readSavedComponents(componentKey), item);

  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setStackSaveStatus(null);
      setComponentState((current) => {
        const base = ensureRootComponent(
          current.key === componentKey ? current.items : readSavedComponents(componentKey),
          item,
        );
        const next = ensureRootComponent(updater(base), item);
        writeSavedComponents(componentKey, next);
        return { key: componentKey, items: next };
      });
    },
    [componentKey, item],
  );

  const selectedComponent = components.find((component) => component.id === selectedComponentId) ?? null;
  const rootComponent = components.find((component) => component.id === rootComponentId) ?? createRootComponent(item);
  const primaryScopeId = components.some((component) => component.id === primaryComponentId)
    ? primaryComponentId
    : rootComponentId;
  const primaryComponent = components.find((component) => component.id === primaryScopeId) ?? rootComponent;
  const componentTree = useMemo(
    () => buildComponentTree(components, primaryScopeId),
    [components, primaryScopeId],
  );
  const scopedComponents = useMemo(() => flattenComponentTree(componentTree), [componentTree]);
  const stackedComponents = useMemo(
    () => scopedComponents.filter((component) => component.id !== primaryScopeId),
    [primaryScopeId, scopedComponents],
  );

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
      };
    }

    if (viewMode === "stack") {
      return {
        kind: "stack",
        id: primaryComponent.id,
        name: primaryComponent.name,
        type: primaryComponent.type || "PNG",
        url: primaryComponent.dataUrl,
        w: primaryComponent.box.w,
        h: primaryComponent.box.h,
        originBox: primaryComponent.box,
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
    };
  }, [item.h, item.id, item.name, item.type, item.url, item.w, primaryComponent, selectedComponent, viewMode]);
  const headerSubject =
    viewMode === "stack" && selectedComponent
      ? {
          name: selectedComponent.name,
          w: selectedComponent.box.w,
          h: selectedComponent.box.h,
          type: selectedComponent.type || "PNG",
        }
      : activeSubject;
  const canCrop = activeSubject.kind === "component";
  const cancelSelection = useCallback(() => {
    selectionInteractionRef.current = null;
    setDrawing(false);
    setSelection(null);
    setSelectionLocked(false);
    setDrawingPath(null);
    setEditingComponentId(null);
  }, []);

  const resetToolViewport = useCallback(() => {
    setToolZoom(MIN_TOOL_ZOOM);
    setToolPan({ x: 0, y: 0 });
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

  const openComponent = useCallback(
    (id: string) => {
      cancelSelection();
      expandComponentPath(id);
      setSelectedComponentId(id);
      setViewMode("component");
      resetToolViewport();
    },
    [cancelSelection, expandComponentPath, resetToolViewport],
  );

  const startEditComponent = useCallback(
    (id: string) => {
      const component = components.find((entry) => entry.id === id);
      if (!component || id === rootComponentId) return;
      const parentId = component.parentId ?? rootComponentId;

      selectionInteractionRef.current = null;
      setDrawing(false);
      setSelection(null);
      setSelectionLocked(false);
      setDrawingPath(null);

      expandComponentPath(parentId);
      if (parentId === rootComponentId) {
        setSelectedComponentId(null);
        setViewMode("original");
      } else {
        setSelectedComponentId(parentId);
        setViewMode("component");
      }

      resetToolViewport();
      setEditingComponentId(id);
      setCurrentTool("crop");
    },
    [components, expandComponentPath, resetToolViewport, rootComponentId],
  );

  const setPrimaryComponent = useCallback(
    (id: string) => {
      if (!components.some((component) => component.id === id)) return;
      const keepIds = componentSubtreeIds(components, id);
      writePrimaryComponentId(componentKey, id);
      updateComponents((current) =>
        current
          .filter((component) => component.id === rootComponentId || keepIds.has(component.id))
          .map((component) =>
            component.id === id && component.parentId && !keepIds.has(component.parentId)
              ? { ...component, parentId: rootComponentId }
              : component,
          ),
      );
      setPrimaryComponentId(id);
      setExpandedComponentIds(new Set([id]));
      openComponent(id);
    },
    [componentKey, components, openComponent, rootComponentId, updateComponents],
  );

  const resetToOriginalRoot = useCallback(() => {
    const resetComponents = ensureRootComponent([], item);
    writeSavedComponents(componentKey, resetComponents);
    writePrimaryComponentId(componentKey, rootComponentId);
    setComponentState({ key: componentKey, items: resetComponents });
    setPrimaryComponentId(rootComponentId);
    setExpandedComponentIds(new Set([rootComponentId]));
    setSelectedComponentId(null);
    setCurrentTool("move");
    setViewMode("original");
    cancelSelection();
    resetToolViewport();
  }, [cancelSelection, componentKey, item, resetToolViewport, rootComponentId]);

  const changeToolZoom = useCallback((direction: 1 | -1) => {
    setToolZoom((current) => {
      if (direction < 0 && current <= MIN_TOOL_ZOOM) return MIN_TOOL_ZOOM;
      const multiplier = direction > 0 ? 1.14 : 1 / 1.14;
      const next = clamp(current * multiplier, MIN_TOOL_ZOOM, MAX_TOOL_ZOOM);
      const rounded = Number(next.toFixed(2));
      setToolPan((pan) => clampToolPan(pan, rounded, stageViewportRef.current, imgRef.current));
      return rounded;
    });
  }, []);

  const handleStageWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (imageError) return;
      event.preventDefault();

      if (event.ctrlKey || event.metaKey || event.altKey || toolZoom <= MIN_TOOL_ZOOM) {
        if (event.deltaY < 0) {
          changeToolZoom(1);
        } else if (toolZoom > MIN_TOOL_ZOOM) {
          changeToolZoom(-1);
        }
        return;
      }

      setToolPan((pan) =>
        clampToolPan(
          {
            x: pan.x - event.deltaX,
            y: pan.y - event.deltaY,
          },
          toolZoom,
          stageViewportRef.current,
          imgRef.current,
        ),
      );
    },
    [changeToolZoom, imageError, toolZoom],
  );

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

  const requestPrimaryConfirmation = useCallback((componentId: string) => {
    setPendingConfirmation({ type: "primary", componentId });
  }, []);

  const requestResetConfirmation = useCallback(() => {
    setPendingConfirmation({ type: "reset" });
  }, []);

  const confirmPendingAction = useCallback(() => {
    const action = pendingConfirmation;
    if (!action) return;
    setPendingConfirmation(null);
    if (action.type === "primary") {
      setPrimaryComponent(action.componentId);
      return;
    }
    resetToOriginalRoot();
  }, [pendingConfirmation, resetToOriginalRoot, setPrimaryComponent]);

  const persistReferenceStack = useCallback(async () => {
    if (savingStack) return;
    setSavingStack(true);
    setStackSaveStatus(null);
    try {
      writeSavedComponents(componentKey, components);
      if (!referenceId || item.id !== referenceId) {
        setStackSaveStatus("Estado local salvo");
        return;
      }

      const data = await writeReferenceStackFromComponents({
        components,
        item,
        primaryComponentId: primaryScopeId,
        rootComponentId,
      });
      setStackSaveStatus(
        data
          ? `${data.components.length - 1} ${data.components.length - 1 === 1 ? "componente salvo" : "componentes salvos"}`
          : "Stack removido",
      );
    } catch (err) {
      console.error("[tools] stack save failed:", err);
      setStackSaveStatus("Falha ao salvar stack");
    } finally {
      setSavingStack(false);
    }
  }, [componentKey, components, item, primaryScopeId, referenceId, rootComponentId, savingStack]);

  const handleZoomIn = useCallback(() => {
    changeToolZoom(1);
  }, [changeToolZoom]);

  const handleZoomOut = useCallback(() => {
    if (toolZoom > MIN_TOOL_ZOOM) {
      changeToolZoom(-1);
    }
  }, [changeToolZoom, toolZoom]);

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

  const saveSelection = useCallback(async () => {
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
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        dataUrl = activeSubject.url;
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
    updateComponents((current) => [
      {
        id: nextId,
        name: shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt: new Date().toISOString(),
        parentId,
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
        writePrimaryComponentId(`${COMPONENT_STORAGE_PREFIX}${next.id}`, sourceRootComponentId(next.id));
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

    const applyState = (items: SavedComponent[], preferredPrimaryId: string | null) => {
      const next = ensureRootComponent(items, item);
      const nextPrimaryId = preferredPrimaryId && next.some((component) => component.id === preferredPrimaryId)
        ? preferredPrimaryId
        : rootComponentId;
      const hasStack = next.some((component) => component.id !== rootComponentId);
      writeSavedComponents(componentKey, next);
      writePrimaryComponentId(componentKey, nextPrimaryId);
      setComponentState({ key: componentKey, items: next });
      setPrimaryComponentId(nextPrimaryId);
      setExpandedComponentIds(new Set([nextPrimaryId]));
      setImageError(false);
      setHoveredComponentId(null);
      setSelectedComponentId(hasStack ? null : nextPrimaryId);
      setViewMode(hasStack ? "original" : "component");
      resetToolViewport();
      cancelSelection();
      setCurrentTool("move");
      setStackSaveStatus(null);
    };

    const localComponents = ensureRootComponent(readSavedComponents(componentKey), item);
    const storedPrimaryId = readPrimaryComponentId(componentKey);
    const hasLocalStack = localComponents.some((component) => component.id !== rootComponentId);

    if (!referenceId || item.id !== referenceId || hasLocalStack) {
      applyState(localComponents, storedPrimaryId);
      return () => {
        cancelled = true;
      };
    }

    void readReferenceStackComponents(item).then((savedStack) => {
      if (cancelled) return;
      if (!savedStack) {
        applyState(localComponents, storedPrimaryId);
        return;
      }
      applyState(savedStack.items, savedStack.primaryComponentId);
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
    const cache = componentImageCacheRef.current;
    const activeIds = new Set(components.map((component) => component.id));
    for (const id of Array.from(cache.keys())) {
      if (!activeIds.has(id)) cache.delete(id);
    }
    for (const component of components) {
      const existing = cache.get(component.id);
      if (existing && existing.src === component.dataUrl) continue;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      const handleSettled = () => setImagePaintVersion((value) => value + 1);
      image.onload = handleSettled;
      image.onerror = handleSettled;
      image.src = component.dataUrl;
      cache.set(component.id, image);
    }
  }, [components]);

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

  useEffect(() => {
    if (canCrop || (currentTool !== "crop" && currentTool !== "draw")) return;
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
      } else if (event.key === "Escape") {
        if (selection || drawingPath) cancelSelection();
      } else if (event.key === "Enter") {
        if (selectionLocked) void saveSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelSelection, saveSelection, selection, selectionLocked, setTool]);

  useEffect(() => {
    const onResize = () => {
      setImagePaintVersion((current) => current + 1);
      setToolPan((pan) => clampToolPan(pan, toolZoom, stageViewportRef.current, imgRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [toolZoom]);

  useEffect(() => {
    if (toolZoom <= MIN_TOOL_ZOOM) setToolPan({ x: 0, y: 0 });
  }, [toolZoom]);

  const selectionCrop = selection ? selectionToSubjectCoords(selection) : null;
  const selectionSourceBox = selectionCrop && canCrop ? toOriginalCoords(selectionCrop) : null;
  const selectionMatchesExistingCut = Boolean(
    selectionSourceBox &&
      componentAreaAlreadyExists(selectionSourceBox, scopedComponents, rootComponentId),
  );
  const canSaveSelection = Boolean(selectionLocked && selectionCrop && canCrop);
  const selectionSize = selectionCrop ?? { x: 0, y: 0, w: 0, h: 0 };
  const zoomPercent = Math.round(toolZoom * 100);
  const confirmationCopy = pendingConfirmation
    ? confirmationDialogCopy(pendingConfirmation, components)
    : null;

  useLayoutEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      paintOverlayCanvas({
        canvas: overlayCanvas,
        img: imgRef.current,
        toolZoom,
        selection,
        selectionLocked,
        drawingPath,
        viewMode,
        components,
        stackedComponents,
        activeSubject,
        rootComponentId,
        selectedComponentId,
        hoveredComponentId,
        editingComponentId,
        selectionMatchesExistingCut,
        selectionCrop,
        componentImageCache: componentImageCacheRef.current,
      });
    }
    const cropsCanvas = cropsCanvasRef.current;
    if (cropsCanvas) {
      paintCropsCanvas({
        canvas: cropsCanvas,
        img: imgRef.current,
        toolZoom,
        components,
        activeSubject,
        rootComponentId,
        editingComponentId,
        showCropsOverlay,
        viewMode,
        overlayFill: hexToRgba(cropsOverlayColor, CROPS_OVERLAY_ALPHA),
      });
    }
  }, [
    activeSubject,
    components,
    cropsOverlayColor,
    drawingPath,
    editingComponentId,
    hoveredComponentId,
    imagePaintVersion,
    rootComponentId,
    selectedComponentId,
    selection,
    selectionCrop,
    selectionLocked,
    selectionMatchesExistingCut,
    showCropsOverlay,
    stackedComponents,
    toolPan,
    toolZoom,
    viewMode,
  ]);

  function updateIdleCursorAndHover(event: PointerEvent<HTMLDivElement>) {
    const stage = stageViewportRef.current;
    const point = getContentPoint(event);
    let cursor = "";
    let nextHovered: string | null = null;

    if (point) {
      const cropOrDraw = currentTool === "crop" || currentTool === "draw";
      if (canCrop && selection && selectionLocked && cropOrDraw) {
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

    const point = getContentPoint(event);
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

    const point = getContentPoint(event);
    if (!point) return;
    const imageBounds = getImageContentBounds();

    if (interaction.type === "resize") {
      const bounds = imageBounds ?? getVisibleContentBounds();
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
      const bounds = imageBounds ?? getVisibleContentBounds();
      setSelection(moveCropBox(interaction.startBox, interaction.startPoint, point, bounds));
      setSelectionLocked(true);
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
    if (interaction.type === "pan") return;

    if (interaction.type === "free-draw") {
      const points = drawingPath?.points ?? [];
      setDrawingPath(null);
      const bounds = boundsFromDrawingPath(points);
      if (!bounds) {
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      const imageBounds = getImageContentBounds();
      const clipped = imageBounds ? intersectCropBoxes(bounds, imageBounds) : bounds;
      if (!clipped || clipped.w < SELECTION_MIN_SIZE || clipped.h < SELECTION_MIN_SIZE) {
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      setSelection(clipped);
      setSelectionLocked(true);
      return;
    }

    setSelection((current) => {
      if (!current || current.w < SELECTION_MIN_SIZE || current.h < SELECTION_MIN_SIZE) {
        setSelectionLocked(false);
        return null;
      }
      setSelectionLocked(true);
      return current;
    });
  }

  function getContentPoint(event: PointerEvent<HTMLDivElement>) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / toolZoom,
      y: (event.clientY - rect.top) / toolZoom,
    };
  }

  function getVisibleContentBounds(): CropBox | null {
    const stage = stageViewportRef.current;
    const img = imgRef.current;
    if (!stage || !img) return null;
    const stageRect = stage.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    return {
      x: (stageRect.left - imgRect.left) / toolZoom,
      y: (stageRect.top - imgRect.top) / toolZoom,
      w: stageRect.width / toolZoom,
      h: stageRect.height / toolZoom,
    };
  }

  function getImageContentBounds(): CropBox | null {
    const img = imgRef.current;
    if (!img || !img.clientWidth || !img.clientHeight) return null;
    return { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <TopBar
          extra={
            <div className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-medium">
              <span className="text-[var(--text-muted)]">Generate</span>
              <ChevronRight size={10} strokeWidth={1.8} />
              <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text)]">
                {item.name || "Ferramentas"}
              </span>
            </div>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void uploadImage(event.target.files?.[0])}
        />

        <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)_340px]">
          <aside className="flex flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-3">
            <RailToolButton
              active={currentTool === "move"}
              label="Mover"
              shortcut="V"
              onClick={() => setTool("move")}
            >
              <Move size={18} strokeWidth={1.7} />
            </RailToolButton>
            <RailToolButton
              active={currentTool === "crop"}
              disabled={!canCrop}
              label="Recortar"
              shortcut="C"
              onClick={() => setTool("crop")}
            >
              <Crop size={18} strokeWidth={1.7} />
            </RailToolButton>
            <RailToolButton
              active={currentTool === "draw"}
              disabled={!canCrop}
              label="Desenhar"
              shortcut="D"
              onClick={() => setTool("draw")}
            >
              <Pencil size={18} strokeWidth={1.7} />
            </RailToolButton>
            <span className="my-1.5 h-px w-7 bg-[var(--border)]" />
            <RailToolButton label="Conta-gotas" disabled>
              <Pipette size={18} strokeWidth={1.7} />
            </RailToolButton>
          </aside>

          <section
            className="relative flex min-h-0 min-w-0 flex-col bg-[#0A0A0B]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          >
            <div
              ref={stageViewportRef}
              className={[
                "relative flex flex-1 items-center justify-center overflow-hidden p-8",
                currentTool === "crop" || currentTool === "draw" ? "cursor-crosshair" : "cursor-default",
              ].join(" ")}
              onWheel={handleStageWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handleStagePointerLeave}
              onPointerCancel={cancelSelection}
            >
              <BuilderStackTabs
                active={viewMode === "stack" ? "stack" : "builder"}
                stackDisabled={stackedComponents.length === 0}
                onBuilder={openBuilderMode}
                onStack={openStackMode}
              />

              <ElementInfoCard
                name={headerSubject.name || "—"}
                width={headerSubject.w}
                height={headerSubject.h}
                type={activeSubject.kind === "stack" && !selectedComponent ? "Tudo junto" : headerSubject.type || "—"}
                thumbnailUrl={activeSubject.kind === "component" ? activeSubject.url : selectedComponent?.dataUrl ?? activeSubject.url}
                canPromote={Boolean(selectedComponent && selectedComponent.id !== primaryScopeId)}
                onPromote={() => {
                  if (selectedComponent && selectedComponent.id !== primaryScopeId) {
                    requestPrimaryConfirmation(selectedComponent.id);
                  }
                }}
              />

              <CropsOverlayToggle
                active={showCropsOverlay}
                onToggle={() => setShowCropsOverlay((value) => !value)}
              />


              {imageError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <ImageIcon size={24} strokeWidth={1.6} />
                  <h2 className="m-0 text-[16px] text-[var(--text)]">Imagem não encontrada</h2>
                  <p className="m-0 text-[13px]">
                    Volte para <Link className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline" to="/references">Referências</Link>.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="relative max-h-full max-w-full overflow-visible rounded-[8px] bg-[#0E0E0E] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
                    style={{
                      transform: `translate(${toolPan.x}px, ${toolPan.y}px) scale(${toolZoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={activeSubject.url}
                      alt={activeSubject.name}
                      crossOrigin="anonymous"
                      draggable={false}
                      onLoad={() => {
                        setImageError(false);
                        setImagePaintVersion((current) => current + 1);
                      }}
                      onError={() => setImageError(true)}
                      className="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]"
                      style={{ imageRendering: toolZoom > MIN_TOOL_ZOOM ? "pixelated" : "auto" }}
                    />
                  </div>
                  <canvas
                    ref={cropsCanvasRef}
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{ mixBlendMode: "screen" }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                  />
                </>
              )}

              <div
                data-selection-action
                className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[rgba(20,20,22,0.85)] p-1 text-[11.5px] tabular-nums text-[var(--text-muted)] backdrop-blur-[6px]"
              >
                <IconButton
                  aria-label="Diminuir zoom"
                  disabled={toolZoom <= MIN_TOOL_ZOOM}
                  className={toolZoom <= MIN_TOOL_ZOOM ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : ""}
                  onClick={handleZoomOut}
                >
                  <Minus size={13} />
                </IconButton>
                <span className="min-w-12 px-2 text-center text-[var(--text)]">{zoomPercent}%</span>
                <IconButton aria-label="Aumentar zoom" onClick={handleZoomIn}>
                  <Plus size={13} />
                </IconButton>
              </div>
            </div>

            <div className="sticky bottom-0 z-20 flex min-h-[56px] shrink-0 items-center gap-2.5 border-t border-[var(--border)] bg-[rgba(15,15,16,0.82)] px-3.5 py-2.5 backdrop-blur-[8px]">
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <ModeButton active={viewMode === "original"} onClick={openOriginal}>
                  <ImageIcon size={13} strokeWidth={1.8} />
                  Mostrar original
                </ModeButton>
                <ModeButton onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={13} strokeWidth={1.8} />
                  {uploading ? "Enviando..." : "Upload"}
                </ModeButton>
              </div>

              {selection ? (
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-[5px]">
                  <span className="px-1.5 font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">
                    {Math.round(selectionSize.w)} × {Math.round(selectionSize.h)}
                  </span>
                  <button
                    type="button"
                    data-selection-action
                    onClick={cancelSelection}
                    className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    data-selection-action
                    disabled={!canSaveSelection}
                    onClick={() => void saveSelection()}
                    className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--text-faint)]"
                  >
                    <Check size={11} strokeWidth={2.2} />
                    Salvar componente
                  </button>
                </div>
              ) : null}

              <div className="ml-auto min-w-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {!canCrop ? (
                  <span>Abra um componente da árvore para recortar. Original e tudo junto são apenas visualização.</span>
                ) : editingComponentId ? (
                  <span>
                    Editando recorte existente. Ajuste a caixa e <Key>Enter</Key> salva · <Key>Esc</Key> cancela
                  </span>
                ) : currentTool === "crop" ? (
                  <span>
                    Clique e arraste sobre o assunto aberto. Áreas filhas já recortadas aparecem como aviso. <Key>Enter</Key> salva ·{" "}
                    <Key>Esc</Key> cancela
                  </span>
                ) : currentTool === "draw" ? (
                  <span>
                    Desenhe livremente sobre a imagem. A área desenhada vira o recorte. <Key>Enter</Key> salva ·{" "}
                    <Key>Esc</Key> cancela
                  </span>
                ) : (
                  <span>
                    Selecione um componente para recortar dentro dele, ou use <Key>C</Key> para recortar ou <Key>D</Key> para desenhar.
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
            <SidebarTabs active={sidebarTab} onChange={setSidebarTab} />

            {sidebarTab === "components" ? (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">Componentes</h3>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-faint)]">
                        {scopedComponents.length}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 max-w-[210px] overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-[var(--text-faint)]">
                      Primário: {primaryComponent.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Abrir tudo"
                      title="Abrir toda a árvore"
                      onClick={expandAllComponents}
                      disabled={scopedComponents.length <= 1}
                      className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--surface)] disabled:hover:text-[var(--text-muted)]"
                    >
                      <ChevronsUpDown size={13} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      aria-label="Fechar tudo"
                      title="Fechar toda a árvore"
                      onClick={collapseAllComponents}
                      disabled={scopedComponents.length <= 1}
                      className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--surface)] disabled:hover:text-[var(--text-muted)]"
                    >
                      <ChevronsDownUp size={13} strokeWidth={1.8} />
                    </button>
                    {primaryScopeId !== rootComponentId ? (
                      <button
                        type="button"
                        aria-label="Resetar root"
                        title="Resetar root"
                        onClick={requestResetConfirmation}
                        className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      >
                        <RotateCcw size={13} strokeWidth={1.8} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
                  {componentTree.map((node) => (
                    <ComponentTreeItem
                      key={node.component.id}
                      node={node}
                      activeId={viewMode === "component" || viewMode === "stack" ? selectedComponentId : null}
                      hoveredId={hoveredComponentId}
                      editingId={editingComponentId}
                      expandedIds={expandedComponentIds}
                      rootId={rootComponentId}
                      primaryId={primaryScopeId}
                      onOpen={openTreeComponent}
                      onToggle={toggleComponentExpanded}
                      onHover={setHoveredComponentId}
                      onEdit={startEditComponent}
                      onRemove={(id) => {
                        const removedIds = componentSubtreeIds(components, id);
                        updateComponents((current) =>
                          current.filter((entry) => !removedIds.has(entry.id)),
                        );
                        if (removedIds.has(primaryScopeId)) {
                          resetToOriginalRoot();
                        }
                        if (selectedComponentId && removedIds.has(selectedComponentId)) {
                          openOriginal();
                        }
                      }}
                    />
                  ))}
                </div>

                <div className="flex shrink-0 border-t border-[var(--border)] bg-[rgba(15,15,16,0.82)] px-3 py-3 backdrop-blur-[8px]">
                  <button
                    type="button"
                    disabled={savingStack}
                    onClick={() => void persistReferenceStack()}
                    className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] px-3 text-[12.5px] font-semibold text-[var(--accent-fg)] transition-colors duration-[120ms] hover:bg-white"
                  >
                    {savingStack ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(0,0,0,0.25)] border-t-[var(--accent-fg)]" />
                    ) : (
                      <Save size={14} strokeWidth={1.9} />
                    )}
                    {savingStack ? "Salvando..." : stackSaveStatus ?? "Salvar"}
                  </button>
                </div>
              </>
            ) : (
              <SidebarConfigPanel
                cropsOverlayColor={cropsOverlayColor}
                onChangeCropsOverlayColor={setCropsOverlayColor}
              />
            )}
          </aside>
        </div>
      </div>
      {confirmationCopy ? (
        <ConfirmActionModal
          title={confirmationCopy.title}
          description={confirmationCopy.description}
          confirmLabel={confirmationCopy.confirmLabel}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </TooltipProvider>
  );
}

function ToolsShellContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <TopBar
        extra={
          <div className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-medium">
            <span className="text-[var(--text-muted)]">Generate</span>
          </div>
        }
      />
      <div
        className="flex flex-1 items-center justify-center"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
          backgroundSize: "22px 22px",
          backgroundColor: "#0A0A0B",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToolsLoadingShell() {
  return (
    <ToolsShellContainer>
      <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]" />
        <span className="text-[13px]">Carregando referência…</span>
      </div>
    </ToolsShellContainer>
  );
}

function ToolsNotFoundShell() {
  return (
    <ToolsShellContainer>
      <div className="flex flex-col items-center gap-2.5 text-[var(--text-muted)]">
        <ImageIcon size={24} strokeWidth={1.6} />
        <h2 className="m-0 text-[16px] text-[var(--text)]">Referência não encontrada</h2>
        <p className="m-0 text-[13px]">
          Volte para{" "}
          <Link
            className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline"
            to="/references"
          >
            Referências
          </Link>
          .
        </p>
      </div>
    </ToolsShellContainer>
  );
}

function ToolsEmptyShell({ onUpload }: { onUpload: (next: ToolReference) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const ingest = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      setUploading(true);
      try {
        const url = await readFileAsDataUrl(file);
        const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
        onUpload({
          id: `tool-upload-${Date.now().toString(36)}`,
          name: file.name,
          type: inferType(file.name),
          w: dims.w,
          h: dims.h,
          url,
        });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onUpload],
  );

  return (
    <ToolsShellContainer>
      <div className="mx-auto flex w-full max-w-[520px] px-6">
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            void ingest(event.dataTransfer.files?.[0]);
          }}
          className={[
            "flex w-full cursor-pointer flex-col items-center gap-4 rounded-[14px] border-[1.5px] border-dashed bg-[rgba(20,20,22,0.55)] px-10 py-16 text-center transition-colors backdrop-blur-[6px]",
            uploading
              ? "pointer-events-none border-[var(--border-strong)] opacity-70"
              : dragActive
                ? "border-[var(--text)]"
                : "border-[var(--border-strong)] hover:border-[var(--text)]",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={uploading}
            onChange={(event) => {
              void ingest(event.target.files?.[0]);
            }}
          />
          <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]">
            {uploading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]" />
            ) : (
              <Upload size={22} strokeWidth={1.7} />
            )}
          </span>
          <div>
            <p className="m-0 text-[15px] font-semibold text-[var(--text)]">
              {uploading ? "Processando…" : "Arraste uma imagem aqui"}
            </p>
            <p className="m-0 mt-1.5 text-[12.5px] text-[var(--text-muted)]">
              Clique para selecionar do disco. PNG, JPG, GIF, WebP ou SVG.
            </p>
            <p className="m-0 mt-2 text-[11.5px] text-[var(--text-faint)]">
              Ou abra uma referência salva em{" "}
              <Link
                to="/references"
                className="border-b border-[var(--border-strong)] text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
              >
                Referências
              </Link>
              .
            </p>
          </div>
        </label>
      </div>
    </ToolsShellContainer>
  );
}

function ModeButton({
  active = false,
  disabled = false,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        disabled ? "cursor-not-allowed opacity-45 hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function BuilderStackTabs({
  active,
  stackDisabled,
  onBuilder,
  onStack,
}: {
  active: "builder" | "stack";
  stackDisabled: boolean;
  onBuilder: () => void;
  onStack: () => void;
}) {
  return (
    <div
      data-selection-action
      className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[rgba(12,12,13,0.92)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-[8px]"
    >
      <FloatingTabButton active={active === "builder"} onClick={onBuilder}>
        Builder
      </FloatingTabButton>
      <FloatingTabButton active={active === "stack"} disabled={stackDisabled} onClick={onStack}>
        Stack
      </FloatingTabButton>
    </div>
  );
}

function FloatingTabButton({
  active,
  disabled = false,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-8 min-w-[86px] cursor-pointer rounded-[8px] border px-4 text-[14px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-transparent bg-[var(--surface-hover)] text-[var(--text)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]",
        disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SidebarTabs({
  active,
  onChange,
}: {
  active: SidebarTab;
  onChange: (tab: SidebarTab) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-2">
      <SidebarTabButton active={active === "components"} onClick={() => onChange("components")}>
        Componentes
      </SidebarTabButton>
      <SidebarTabButton active={active === "config"} onClick={() => onChange("config")}>
        Config
      </SidebarTabButton>
    </div>
  );
}

function SidebarTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-7 cursor-pointer rounded-[7px] border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SidebarConfigPanel({
  cropsOverlayColor,
  onChangeCropsOverlayColor,
}: {
  cropsOverlayColor: string;
  onChangeCropsOverlayColor: (color: string) => void;
}) {
  const alphaPct = Math.round(CROPS_OVERLAY_ALPHA * 100);
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <div>
          <h4 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">
            Cor do overlay de recortes
          </h4>
          <p className="m-0 mt-1 text-[10.5px] leading-[1.4] text-[var(--text-faint)]">
            Cor base aplicada sobre áreas já recortadas. Opacidade {alphaPct}% e blend
            (screen) são mantidos — cores mais claras aparecem mais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-[7px] border border-[var(--border-strong)]">
            <input
              type="color"
              value={cropsOverlayColor}
              onChange={(event) => onChangeCropsOverlayColor(event.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0 opacity-0"
            />
            <span
              aria-hidden
              className="block h-full w-full"
              style={{ background: cropsOverlayColor }}
            />
          </label>
          <span className="font-mono text-[11.5px] uppercase tabular-nums text-[var(--text-muted)]">
            {cropsOverlayColor}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {CROPS_OVERLAY_PRESETS.map((preset) => {
            const isActive = preset.toUpperCase() === cropsOverlayColor.toUpperCase();
            return (
              <button
                key={preset}
                type="button"
                aria-label={`Selecionar cor ${preset}`}
                onClick={() => onChangeCropsOverlayColor(preset)}
                className={[
                  "h-6 w-6 cursor-pointer rounded-full border transition-transform duration-[120ms] hover:scale-110",
                  isActive
                    ? "border-[var(--text)] ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg)]"
                    : "border-[var(--border-strong)]",
                ].join(" ")}
                style={{ background: preset }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CropsOverlayToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-selection-action
      aria-label={active ? "Esconder áreas recortadas" : "Mostrar áreas recortadas"}
      title={active ? "Esconder áreas recortadas" : "Mostrar áreas recortadas"}
      onClick={onToggle}
      className={[
        "absolute right-3 top-3 z-30 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 text-[11.5px] font-medium backdrop-blur-[8px] transition-colors duration-[120ms]",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[rgba(20,20,22,0.88)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      <Eye size={13} strokeWidth={1.8} />
      <span>Recortes</span>
    </button>
  );
}

function ElementInfoCard({
  name,
  width,
  height,
  type,
  thumbnailUrl,
  canPromote,
  onPromote,
}: {
  name: string;
  width: number;
  height: number;
  type: string;
  thumbnailUrl: string;
  canPromote: boolean;
  onPromote: () => void;
}) {
  return (
    <div
      data-selection-action
      className="absolute left-3 top-3 z-30 w-[210px] rounded-[12px] border border-[var(--border)] bg-[rgba(20,20,22,0.88)] p-2.5 shadow-[0_10px_34px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
          <ImageIcon size={12} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
            <span className="min-w-0 max-w-[76px] truncate font-semibold text-[var(--text)]">{name}</span>
            <span className="shrink-0 text-[var(--text-faint)]">·</span>
            <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{Math.round(width)} × {Math.round(height)}</span>
            <span className="shrink-0 text-[var(--text-faint)]">·</span>
          </div>
        </div>
        <span className="shrink-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[4.5px] font-medium text-[var(--text-muted)]">
          {type}
        </span>
      </div>
      <button
        type="button"
        disabled={!canPromote}
        onClick={onPromote}
        className={[
          "mt-2 h-7 w-full cursor-pointer rounded-[8px] border px-3 text-[11.5px] font-semibold transition-colors duration-[120ms]",
          canPromote
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            : "cursor-not-allowed border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)]",
        ].join(" ")}
      >
        <Layers size={12} strokeWidth={1.7} className="mr-1.5 inline-block align-[-2px]" />
        Tornar root
      </button>
    </div>
  );
}

function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.58)] px-4">
      <div className="w-full max-w-[380px] rounded-[8px] border border-[var(--border)] bg-[var(--bg-elev)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.5)]">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        <p className="m-0 mt-2 text-[12.5px] leading-5 text-[var(--text-muted)]">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-[7px] border border-[var(--accent)] bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-fg)] hover:bg-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function confirmationDialogCopy(action: PendingConfirmation, components: SavedComponent[]) {
  if (action.type === "reset") {
    return {
      title: "Resetar ferramenta",
      description:
        "Isso remove os recortes atuais e volta para a raiz da imagem original. A árvore será recriada apenas com o componente root.",
      confirmLabel: "Resetar",
    };
  }

  const component = components.find((entry) => entry.id === action.componentId);
  return {
    title: "Tornar primário",
    description: `Isso vai usar ${component?.name ?? "este componente"} como componente primário e remover pais e irmãos que não fazem mais parte desse escopo.`,
    confirmLabel: "Tornar primário",
  };
}

function ComponentTreeItem({
  node,
  activeId,
  hoveredId,
  editingId,
  expandedIds,
  rootId,
  primaryId,
  onOpen,
  onToggle,
  onHover,
  onRemove,
  onEdit,
}: {
  node: ComponentTreeNode;
  activeId: string | null;
  hoveredId: string | null;
  editingId: string | null;
  expandedIds: Set<string>;
  rootId: string;
  primaryId: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { component, children, depth } = node;
  const active = activeId === component.id;
  const hovered = hoveredId === component.id;
  const editing = editingId === component.id;
  const isRoot = component.id === rootId;
  const isPrimary = component.id === primaryId;
  const isProtected = isRoot || isPrimary;
  const canEdit = !isRoot;
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(component.id);

  return (
    <div className="flex flex-col gap-1">
      <div
        onClick={() => onOpen(component.id)}
        onMouseEnter={() => onHover(component.id)}
        onMouseLeave={() => onHover(null)}
        className={[
          "flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] border bg-[var(--bg-elev)] px-1.5 py-1 transition-colors duration-[120ms]",
          editing
            ? "border-[#4C8DFF]"
            : active || hovered
              ? "border-[var(--text)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]",
        ].join(" ")}
        style={{ marginLeft: depth * 10 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "Fechar filhos" : "Abrir filhos"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(component.id);
            }}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <ChevronRight
              size={13}
              strokeWidth={1.9}
              className={expanded ? "rotate-90 transition-transform duration-[120ms]" : "transition-transform duration-[120ms]"}
            />
          </button>
        ) : (
          <span aria-hidden className="h-6 w-6 shrink-0" />
        )}
        <div
          className="h-8 w-8 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${component.dataUrl}")` }}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--text)]">
          {component.name}
        </span>
        <div className="flex shrink-0">
          <IconButton
            aria-label="Editar recorte"
            disabled={!canEdit}
            className={[
              !canEdit ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
              editing ? "text-[#4C8DFF] hover:text-[#4C8DFF]" : "",
            ].join(" ")}
            onClick={(event) => {
              event.stopPropagation();
              if (canEdit) onEdit(component.id);
            }}
          >
            <SquarePen size={13} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            aria-label="Remover"
            danger
            disabled={isProtected}
            className={isProtected ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : ""}
            onClick={(event) => {
              event.stopPropagation();
              if (!isProtected) onRemove(component.id);
            }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </IconButton>
        </div>
      </div>
      {expanded
        ? children.map((child) => (
            <ComponentTreeItem
              key={child.component.id}
              node={child}
              activeId={activeId}
              hoveredId={hoveredId}
              editingId={editingId}
              expandedIds={expandedIds}
              rootId={rootId}
              primaryId={primaryId}
              onOpen={onOpen}
              onToggle={onToggle}
              onHover={onHover}
              onRemove={onRemove}
              onEdit={onEdit}
            />
          ))
        : null}
    </div>
  );
}

function RailToolButton({
  active = false,
  disabled = false,
  label,
  shortcut,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={[
        "relative h-10 w-10 cursor-pointer rounded-[9px] border text-[var(--text-muted)] shadow-none transition-colors duration-[120ms] hover:bg-[var(--surface)] hover:text-[var(--text)]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
          : "border-transparent bg-transparent",
        disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
      {shortcut ? (
        <span className="absolute bottom-[3px] right-1 text-[9px] tabular-nums text-[var(--text-faint)]">
          {shortcut}
        </span>
      ) : null}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {shortcut ? `${label} (${shortcut})` : label}
      </TooltipContent>
    </Tooltip>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-muted)]">
      {children}
    </span>
  );
}

function IconButton({
  danger = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        danger ? "hover:text-[#ff8a8a]" : "",
        className,
      ].join(" ")}
    />
  );
}

async function readDiskReference(id: string): Promise<ToolReference | null> {
  const metas = await readRefsMeta().catch(() => []);
  const meta = metas.find((entry) => entry.id === id);
  if (!meta || meta.mediaKind !== "image") return null;
  const ext = meta.ext || extFromName(meta.name);
  const blob = await loadReferenceFile(meta.id, ext).catch(() => null);
  if (!blob) return null;
  const url = await blobToDataUrl(blob);
  return {
    id: meta.id,
    name: meta.name,
    type: meta.type || inferType(meta.name),
    w: Number(meta.w || 0),
    h: Number(meta.h || 0),
    url,
  };
}

async function readReferenceStackComponents(
  item: ToolReference,
): Promise<{ items: SavedComponent[]; primaryComponentId: string } | null> {
  const data = await readReferenceStackData(item.id);
  if (!data || data.components.length === 0) return null;

  const items: SavedComponent[] = [];
  for (const component of data.components) {
    if (component.id === data.rootComponentId) {
      items.push({
        id: component.id,
        name: "root",
        box: { x: 0, y: 0, w: item.w || component.box.w, h: item.h || component.box.h },
        dataUrl: item.url,
        type: item.type || component.type || "IMG",
        createdAt: component.createdAt,
        parentId: null,
      });
      continue;
    }

    if (!component.file) continue;
    const blob = await loadReferenceStackFile(item.id, component.file, "image/png");
    if (!blob) continue;
    items.push({
      id: component.id,
      name: component.name,
      box: component.box,
      dataUrl: await blobToDataUrl(blob),
      type: component.type || "PNG",
      createdAt: component.createdAt,
      parentId: component.parentId,
    });
  }

  if (items.length <= 1) return null;
  return {
    items: ensureRootComponent(items, item),
    primaryComponentId: data.primaryComponentId,
  };
}

async function writeReferenceStackFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
}): Promise<ReferenceStackData | null> {
  const components = ensureRootComponent(input.components, input.item);
  const stackComponents = components.filter((component) => component.id !== input.rootComponentId);
  await saveReferenceFile(input.item.id, await dataUrlToBlob(input.item.url));
  await removeReferenceStack(input.item.id);

  if (stackComponents.length === 0) {
    await updateReferenceStackMeta(input.item.id, null);
    return null;
  }

  const data = referenceStackDataFromComponents({
    ...input,
    components,
  });

  for (const component of stackComponents) {
    const fileName = safeStackFileName(component.id);
    const blob = await dataUrlToBlob(component.dataUrl);
    await saveReferenceStackFile(input.item.id, fileName, blob);
  }

  await writeReferenceStackData(input.item.id, data);
  await updateReferenceStackMeta(input.item.id, data);
  return data;
}

function referenceStackDataFromComponents(input: {
  item: ToolReference;
  components: SavedComponent[];
  rootComponentId: string;
  primaryComponentId: string;
}): ReferenceStackData {
  const updatedAt = new Date().toISOString();
  return {
    version: 1,
    referenceId: input.item.id,
    mediaKind: "image",
    original: {
      name: input.item.name,
      type: input.item.type || "IMG",
      ext: extFromName(input.item.name),
      w: input.item.w,
      h: input.item.h,
    },
    rootComponentId: input.rootComponentId,
    primaryComponentId: input.primaryComponentId,
    components: input.components.map((component) => ({
      id: component.id,
      name: component.id === input.rootComponentId ? "root" : component.name,
      type: component.type || "PNG",
      box: component.box,
      file: component.id === input.rootComponentId ? null : safeStackFileName(component.id),
      parentId: component.id === input.rootComponentId ? null : component.parentId ?? input.rootComponentId,
      createdAt: component.createdAt || updatedAt,
    })),
    updatedAt,
  };
}

async function updateReferenceStackMeta(
  referenceId: string,
  data: ReferenceStackData | null,
): Promise<void> {
  const summary = stackSummaryFromData(data);
  const metas = await readRefsMeta().catch(() => []);
  await writeRefsMeta(
    metas.map((meta) =>
      meta.id === referenceId
        ? {
            ...meta,
            stack: summary,
            tags: summary?.enabled
              ? Array.from(new Set([...(meta.tags ?? []), "stack"]))
              : (meta.tags ?? []).filter((tag) => tag !== "stack"),
          }
        : meta,
    ),
  );
}

function sourceRootComponentId(sourceId: string) {
  return `root-${sourceId}`;
}

function createRootComponent(item: ToolReference): SavedComponent {
  return {
    id: sourceRootComponentId(item.id),
    name: "root",
    box: { x: 0, y: 0, w: item.w || 0, h: item.h || 0 },
    dataUrl: item.url,
    type: item.type || "IMG",
    createdAt: new Date(0).toISOString(),
    parentId: null,
  };
}

function ensureRootComponent(items: SavedComponent[], item: ToolReference): SavedComponent[] {
  const root = createRootComponent(item);
  let hasRoot = false;
  const normalized = items.map((entry) => {
    if (entry.id !== root.id) return entry;
    hasRoot = true;
    return {
      ...entry,
      name: root.name,
      box: root.box,
      dataUrl: root.dataUrl,
      type: root.type,
      parentId: null,
    };
  });

  if (!hasRoot) normalized.unshift(root);

  const ids = new Set(normalized.map((entry) => entry.id));
  const withParents = normalized.map((entry) => {
    if (entry.id === root.id) return entry;
    if (entry.parentId && ids.has(entry.parentId) && entry.parentId !== entry.id) return entry;
    return { ...entry, parentId: root.id };
  });

  const withRootFirst = [
    ...withParents.filter((entry) => entry.id === root.id),
    ...withParents.filter((entry) => entry.id !== root.id),
  ];

  return rebuildComponentHierarchy(withRootFirst, root.id);
}

function buildComponentTree(items: SavedComponent[], rootId: string): ComponentTreeNode[] {
  const root = items.find((entry) => entry.id === rootId);
  if (!root) return [];

  const byParent = new Map<string, SavedComponent[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }

  const visit = (component: SavedComponent, depth: number, seen: Set<string>): ComponentTreeNode => {
    if (seen.has(component.id)) return { component, depth, children: [] };
    const nextSeen = new Set(seen);
    nextSeen.add(component.id);
    return {
      component,
      depth,
      children: (byParent.get(component.id) ?? []).map((child) => visit(child, depth + 1, nextSeen)),
    };
  };

  return [visit(root, 0, new Set())];
}

function flattenComponentTree(nodes: ComponentTreeNode[]): SavedComponent[] {
  const flattened: SavedComponent[] = [];
  const visit = (node: ComponentTreeNode) => {
    flattened.push(node.component);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return flattened;
}

function componentSubtreeIds(items: SavedComponent[], id: string): Set<string> {
  const byParent = new Map<string, SavedComponent[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }

  const ids = new Set<string>();
  const visit = (componentId: string) => {
    ids.add(componentId);
    for (const child of byParent.get(componentId) ?? []) {
      if (!ids.has(child.id)) visit(child.id);
    }
  };
  visit(id);
  return ids;
}

function componentAncestorIds(items: SavedComponent[], id: string): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ancestors: string[] = [];
  let current = byId.get(id);
  let guard = 0;

  while (current?.parentId && guard < items.length) {
    ancestors.push(current.parentId);
    current = byId.get(current.parentId);
    guard += 1;
  }

  return ancestors;
}

function rebuildComponentHierarchy(items: SavedComponent[], rootId: string): SavedComponent[] {
  const root = items.find((item) => item.id === rootId);
  if (!root) return items;

  return items.map((item) => {
    if (item.id === rootId) return { ...item, parentId: null };
    const parent = findSpatialParent(item, items, rootId);
    return { ...item, parentId: parent?.id ?? rootId };
  });
}

function findSpatialParent(
  component: SavedComponent,
  items: SavedComponent[],
  rootId: string,
): SavedComponent | null {
  const candidates = items
    .filter((candidate) => candidate.id !== component.id)
    .filter((candidate) => isSpatialParent(candidate.box, component.box));

  if (candidates.length === 0) return items.find((item) => item.id === rootId) ?? null;

  return candidates.reduce((smallest, candidate) =>
    cropBoxArea(candidate.box) < cropBoxArea(smallest.box) ? candidate : smallest,
  );
}

function isSpatialParent(parent: CropBox, child: CropBox) {
  if (boxesRepresentSameCut(parent, child)) return false;

  const containmentTolerance = cropBoxContainmentTolerance(parent, child);
  const parentRight = parent.x + parent.w;
  const parentBottom = parent.y + parent.h;
  const childRight = child.x + child.w;
  const childBottom = child.y + child.h;
  const contains =
    child.x >= parent.x - containmentTolerance &&
    child.y >= parent.y - containmentTolerance &&
    childRight <= parentRight + containmentTolerance &&
    childBottom <= parentBottom + containmentTolerance;

  if (!contains) return false;

  // Use strict tolerance for the area-delta check so we don't accidentally
  // pair boxes that are basically the same cut once you account for the
  // generous containment slack above.
  const strictTolerance = cropBoxTolerance(parent, child);
  const areaDelta = cropBoxArea(parent) - cropBoxArea(child);
  return areaDelta > Math.max(HIERARCHY_MIN_AREA_DELTA, strictTolerance * strictTolerance);
}

function componentAreaAlreadyExists(
  box: CropBox,
  components: SavedComponent[],
  rootId: string,
) {
  return components.some((component) => {
    if (component.id === rootId) return false;
    return boxesRepresentSameCut(box, component.box);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function safeStackFileName(componentId: string): string {
  const base = componentId
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || `component-${Date.now()}`}.png`;
}

function readPrimaryComponentId(componentKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${PRIMARY_COMPONENT_STORAGE_PREFIX}${componentKey}`);
  } catch {
    return null;
  }
}

function writePrimaryComponentId(componentKey: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PRIMARY_COMPONENT_STORAGE_PREFIX}${componentKey}`, id);
  } catch {
    // ignore quota errors
  }
}

function readSavedComponents(key: string): SavedComponent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedComponent) : [];
  } catch {
    return [];
  }
}

function writeSavedComponents(key: string, items: SavedComponent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

function isSavedComponent(value: unknown): value is SavedComponent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedComponent>;
  return Boolean(item.id && item.name && item.box && item.dataUrl);
}

function componentBoxInSubject(box: CropBox, subject: ActiveSubject): CropBox | null {
  if (subject.kind === "original") return box;
  const origin = subject.originBox;
  const left = Math.max(box.x, origin.x);
  const top = Math.max(box.y, origin.y);
  const right = Math.min(box.x + box.w, origin.x + origin.w);
  const bottom = Math.min(box.y + box.h, origin.y + origin.h);
  if (right <= left || bottom <= top) return null;
  return {
    x: left - origin.x,
    y: top - origin.y,
    w: right - left,
    h: bottom - top,
  };
}

function imageClientFromSubjectBox(
  box: CropBox,
  img: HTMLImageElement | null,
): { left: number; top: number; width: number; height: number } | null {
  if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
    return null;
  }
  const sx = img.naturalWidth / img.clientWidth;
  const sy = img.naturalHeight / img.clientHeight;
  return {
    left: box.x / sx,
    top: box.y / sy,
    width: box.w / sx,
    height: box.h / sy,
  };
}

function resizeHandleCenter(handle: ResizeHandle, box: CropBox): { x: number; y: number } {
  const x = handle.includes("w")
    ? box.x
    : handle.includes("e")
      ? box.x + box.w
      : box.x + box.w / 2;
  const y = handle.includes("n")
    ? box.y
    : handle.includes("s")
      ? box.y + box.h
      : box.y + box.h / 2;
  return { x, y };
}

function radiusHandleCenter(
  handle: RadiusHandle,
  box: CropBox,
  zoom: number,
): { x: number; y: number } {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const maxOffset = Math.max(0, maxCropRadius(box) - 4);
  const inset = Math.min(maxOffset, Math.max(RADIUS_HANDLE_MIN_INSET / safeZoom, box.r ?? 0));
  const x = handle.includes("w") ? box.x + inset : box.x + box.w - inset;
  const y = handle.includes("n") ? box.y + inset : box.y + box.h - inset;
  return { x, y };
}

type SelectionHit =
  | { kind: "radius"; handle: RadiusHandle }
  | { kind: "resize"; handle: ResizeHandle }
  | { kind: "move" }
  | null;

function selectionHitTest(
  point: { x: number; y: number },
  selection: CropBox,
  locked: boolean,
  zoom: number,
): SelectionHit {
  if (!locked) return null;
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const radiusHit = HANDLE_HIT_AREA / 2 / safeZoom;
  const resizeHit = HANDLE_HIT_AREA / 2 / safeZoom;

  for (const handle of RADIUS_HANDLES) {
    const center = radiusHandleCenter(handle, selection, zoom);
    if (Math.abs(point.x - center.x) <= radiusHit && Math.abs(point.y - center.y) <= radiusHit) {
      return { kind: "radius", handle };
    }
  }
  for (const handle of RESIZE_HANDLES) {
    const center = resizeHandleCenter(handle, selection);
    if (Math.abs(point.x - center.x) <= resizeHit && Math.abs(point.y - center.y) <= resizeHit) {
      return { kind: "resize", handle };
    }
  }
  if (
    point.x >= selection.x &&
    point.x <= selection.x + selection.w &&
    point.y >= selection.y &&
    point.y <= selection.y + selection.h
  ) {
    return { kind: "move" };
  }
  return null;
}

function componentHitTest(
  point: { x: number; y: number },
  candidates: SavedComponent[],
  activeSubject: ActiveSubject,
  img: HTMLImageElement | null,
): SavedComponent | null {
  if (!img) return null;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const component = candidates[i];
    const subjectBox = componentBoxInSubject(component.box, activeSubject);
    if (!subjectBox) continue;
    const rect = imageClientFromSubjectBox(subjectBox, img);
    if (!rect) continue;
    if (
      point.x >= rect.left &&
      point.x <= rect.left + rect.width &&
      point.y >= rect.top &&
      point.y <= rect.top + rect.height
    ) {
      return component;
    }
  }
  return null;
}

function drawLabelBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  anchorY: number,
  zoom: number,
) {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const scale = 1 / safeZoom;
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(scale, scale);
  ctx.font = '500 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const metrics = ctx.measureText(text);
  const padX = 6;
  const padY = 3;
  const ascent = metrics.actualBoundingBoxAscent || 8;
  const descent = metrics.actualBoundingBoxDescent || 2;
  const textHeight = ascent + descent;
  const width = metrics.width + padX * 2;
  const height = textHeight + padY * 2;
  const top = -height;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  roundedRectPath(ctx, 0, top, width, height, 4);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.fillText(text, padX, top + padY + ascent);
  ctx.restore();
}

function drawSizeBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  anchorY: number,
  zoom: number,
) {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const scale = 1 / safeZoom;
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(scale, scale);
  ctx.font =
    '500 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  const metrics = ctx.measureText(text);
  const padX = 6;
  const padY = 3;
  const ascent = metrics.actualBoundingBoxAscent || 8;
  const descent = metrics.actualBoundingBoxDescent || 2;
  const textHeight = ascent + descent;
  const width = metrics.width + padX * 2;
  const height = textHeight + padY * 2;
  const offset = 4;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  roundedRectPath(ctx, -width, offset, width, height, 4);
  ctx.fill();
  ctx.fillStyle = "#000000";
  ctx.fillText(text, -padX, offset + padY + ascent);
  ctx.restore();
}

function drawCircleHandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
) {
  if (radius <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function waitForImage(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth) {
      resolve();
      return;
    }
    img.addEventListener("load", () => resolve(), { once: true });
  });
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function intersectCropBoxes(a: CropBox, b: CropBox): CropBox | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

function cropBoxArea(box: CropBox) {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function cropBoxTolerance(a: CropBox, b: CropBox) {
  const smallestEdge = Math.max(1, Math.min(a.w, a.h, b.w, b.h));
  return clamp(Math.round(smallestEdge * 0.012), 2, 14);
}

// More generous tolerance used to decide if a box is contained inside another.
// Allows for "logical" parent-child relationships where the child slightly
// overshoots the parent's edges (rounded corners, floating overlays, small
// drawing imprecisions, elements that visually span two adjacent containers).
function cropBoxContainmentTolerance(parent: CropBox, child: CropBox) {
  const childSmallest = Math.max(1, Math.min(child.w, child.h));
  const parentSmallest = Math.max(1, Math.min(parent.w, parent.h));
  const tolerance = Math.max(
    8, // base minimum so small overshoots always pass
    childSmallest * 0.35, // half-edge of the child (catches floating overlays)
    parentSmallest * 0.08, // proportional to parent for bigger scenes
  );
  // Cap so a child can't "drift" arbitrarily far and still count as inside.
  return Math.min(tolerance, parentSmallest * 0.4);
}

function cropBoxIoU(a: CropBox, b: CropBox) {
  const intersection = intersectCropBoxes(a, b);
  if (!intersection) return 0;
  const intersectionArea = cropBoxArea(intersection);
  const unionArea = cropBoxArea(a) + cropBoxArea(b) - intersectionArea;
  if (unionArea <= 0) return 0;
  return intersectionArea / unionArea;
}

function boxesRepresentSameCut(a: CropBox, b: CropBox) {
  const tolerance = cropBoxTolerance(a, b);
  const edgesWithinTolerance =
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.x + a.w - (b.x + b.w)) <= tolerance &&
    Math.abs(a.y + a.h - (b.y + b.h)) <= tolerance;

  if (edgesWithinTolerance) return true;

  const widthRatio = Math.min(a.w, b.w) / Math.max(a.w, b.w);
  const heightRatio = Math.min(a.h, b.h) / Math.max(a.h, b.h);
  return cropBoxIoU(a, b) >= CUT_MATCH_IOU_THRESHOLD && widthRatio >= 0.86 && heightRatio >= 0.86;
}

function clampToolPan(
  pan: { x: number; y: number },
  zoom: number,
  viewport: HTMLDivElement | null,
  content: HTMLElement | null,
) {
  if (zoom <= MIN_TOOL_ZOOM || !viewport || !content) return { x: 0, y: 0 };
  const viewportWidth = Math.max(1, viewport.clientWidth - 64);
  const viewportHeight = Math.max(1, viewport.clientHeight - 64);
  const scaledWidth = content.clientWidth * zoom;
  const scaledHeight = content.clientHeight * zoom;
  const maxX = Math.max(0, (scaledWidth - viewportWidth) / 2);
  const maxY = Math.max(0, (scaledHeight - viewportHeight) / 2);
  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

function cropBoxFromPoints(
  start: { x: number; y: number },
  point: { x: number; y: number },
): CropBox {
  return {
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    w: Math.abs(point.x - start.x),
    h: Math.abs(point.y - start.y),
  };
}

function maxCropRadius(box: CropBox) {
  return Math.max(0, Math.min(box.w, box.h) / 2);
}

function moveCropBox(
  startBox: CropBox,
  startPoint: { x: number; y: number },
  point: { x: number; y: number },
  bounds: CropBox | null,
): CropBox {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  let nextX = startBox.x + dx;
  let nextY = startBox.y + dy;
  if (bounds) {
    nextX = clamp(nextX, bounds.x, bounds.x + bounds.w - startBox.w);
    nextY = clamp(nextY, bounds.y, bounds.y + bounds.h - startBox.h);
  }
  return { ...startBox, x: nextX, y: nextY };
}

function boundsFromDrawingPath(points: Array<{ x: number; y: number }>): CropBox | null {
  if (points.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

function resizeCropBox(
  startBox: CropBox,
  handle: ResizeHandle,
  point: { x: number; y: number },
  bounds: CropBox,
): CropBox {
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.w;
  const maxY = bounds.y + bounds.h;
  let left = startBox.x;
  let top = startBox.y;
  let right = startBox.x + startBox.w;
  let bottom = startBox.y + startBox.h;

  if (handle.includes("w")) {
    left = clamp(point.x, minX, right - SELECTION_MIN_SIZE);
  }
  if (handle.includes("e")) {
    right = clamp(point.x, left + SELECTION_MIN_SIZE, maxX);
  }
  if (handle.includes("n")) {
    top = clamp(point.y, minY, bottom - SELECTION_MIN_SIZE);
  }
  if (handle.includes("s")) {
    bottom = clamp(point.y, top + SELECTION_MIN_SIZE, maxY);
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    r: Math.min(startBox.r ?? 0, (right - left) / 2, (bottom - top) / 2),
  };
}

function roundCropBox(
  startBox: CropBox,
  handle: RadiusHandle,
  startPoint: { x: number; y: number },
  point: { x: number; y: number },
): CropBox {
  const dx = point.x - startPoint.x;
  const dy = point.y - startPoint.y;
  const inwardX = handle.includes("w") ? dx : -dx;
  const inwardY = handle.includes("n") ? dy : -dy;
  const delta = (inwardX + inwardY) / 2;
  const startRadius = startBox.r ?? 0;
  return {
    ...startBox,
    r: clamp(startRadius + delta, 0, maxCropRadius(startBox)),
  };
}

function resizeCursor(handle: ResizeHandle) {
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  return "ew-resize";
}

function inferType(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  if (ext === "png") return "PNG";
  if (ext === "webp") return "WEBP";
  if (ext === "svg") return "SVG";
  if (ext === "gif") return "GIF";
  return "IMG";
}

function shortComponentName(id: string) {
  return id.replace(/^c-/, "").slice(0, 4);
}

function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error("Could not measure image"));
    img.src = src;
  });
}

function readCropsOverlayColor(): string {
  if (typeof window === "undefined") return CROPS_OVERLAY_DEFAULT_COLOR;
  try {
    const stored = window.localStorage.getItem(CROPS_OVERLAY_COLOR_STORAGE_KEY);
    if (stored && /^#[0-9a-fA-F]{6}$/.test(stored)) return stored;
  } catch {
    // ignore
  }
  return CROPS_OVERLAY_DEFAULT_COLOR;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type PaintOverlayArgs = {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  toolZoom: number;
  selection: CropBox | null;
  selectionLocked: boolean;
  drawingPath: DrawingPath | null;
  viewMode: ViewMode;
  components: SavedComponent[];
  stackedComponents: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  editingComponentId: string | null;
  selectionMatchesExistingCut: boolean;
  selectionCrop: CropBox | null;
  componentImageCache: Map<string, HTMLImageElement>;
};

type PaintCropsArgs = {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  toolZoom: number;
  components: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  editingComponentId: string | null;
  showCropsOverlay: boolean;
  viewMode: ViewMode;
  overlayFill: string;
};

function prepareImageCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  toolZoom: number,
): { ctx: CanvasRenderingContext2D; cssW: number; cssH: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const stageW = canvas.clientWidth;
  const stageH = canvas.clientHeight;
  const backingW = Math.max(1, Math.round(stageW * dpr));
  const backingH = Math.max(1, Math.round(stageH * dpr));
  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, stageW, stageH);

  if (!img || !img.clientWidth || !img.clientHeight) return null;

  const cssW = img.clientWidth;
  const cssH = img.clientHeight;
  const imgRect = img.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  ctx.translate(imgRect.left - canvasRect.left, imgRect.top - canvasRect.top);
  ctx.scale(toolZoom, toolZoom);
  return { ctx, cssW, cssH };
}

function paintCropsCanvas(args: PaintCropsArgs) {
  const {
    canvas,
    img,
    toolZoom,
    components,
    activeSubject,
    rootComponentId,
    editingComponentId,
    showCropsOverlay,
    viewMode,
    overlayFill,
  } = args;

  const setup = prepareImageCanvas(canvas, img, toolZoom);
  if (!setup || !img) return;
  if (!showCropsOverlay || viewMode === "stack") return;

  const { ctx } = setup;
  ctx.fillStyle = overlayFill;
  for (const component of components) {
    if (component.id === rootComponentId) continue;
    if (activeSubject.kind === "component" && component.id === activeSubject.id) continue;
    if (component.id === editingComponentId) continue;
    const subjectBox = componentBoxInSubject(component.box, activeSubject);
    if (!subjectBox) continue;
    const rect = imageClientFromSubjectBox(subjectBox, img);
    if (!rect) continue;
    const radius =
      img.naturalWidth && component.box.r
        ? (component.box.r * img.clientWidth) / img.naturalWidth
        : 0;
    ctx.beginPath();
    roundedRectPath(ctx, rect.left, rect.top, rect.width, rect.height, radius);
    ctx.fill();
  }
}

function paintOverlayCanvas(args: PaintOverlayArgs) {
  const {
    canvas,
    img,
    toolZoom,
    selection,
    selectionLocked,
    drawingPath,
    viewMode,
    components,
    stackedComponents,
    activeSubject,
    rootComponentId,
    selectedComponentId,
    hoveredComponentId,
    editingComponentId,
    selectionMatchesExistingCut,
    selectionCrop,
    componentImageCache,
  } = args;

  const setup = prepareImageCanvas(canvas, img, toolZoom);
  if (!setup || !img) return;
  const { ctx, cssW, cssH } = setup;

  const safeZoom = Math.max(MIN_TOOL_ZOOM, toolZoom);
  const stroke = 1 / safeZoom;

  if (viewMode === "stack") {
    ctx.imageSmoothingEnabled = toolZoom <= MIN_TOOL_ZOOM;
    for (let i = 0; i < stackedComponents.length; i++) {
      const component = stackedComponents[i];
      const subjectBox = componentBoxInSubject(component.box, activeSubject);
      if (!subjectBox) continue;
      const rect = imageClientFromSubjectBox(subjectBox, img);
      if (!rect) continue;
      const cached = componentImageCache.get(component.id);
      if (cached && cached.complete && cached.naturalWidth) {
        ctx.drawImage(cached, rect.left, rect.top, rect.width, rect.height);
      }
      const highlighted =
        selectedComponentId === component.id || hoveredComponentId === component.id;
      if (highlighted) {
        ctx.strokeStyle = "#4C8DFF";
        ctx.lineWidth = stroke;
        ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
      }
    }

    const focusedId = hoveredComponentId ?? selectedComponentId;
    const focused = focusedId ? components.find((c) => c.id === focusedId) : null;
    if (focused) {
      const subjectBox = componentBoxInSubject(focused.box, activeSubject);
      if (subjectBox) {
        const rect = imageClientFromSubjectBox(subjectBox, img);
        if (rect) {
          ctx.strokeStyle = "#4C8DFF";
          ctx.lineWidth = 1.5 * stroke;
          ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
        }
      }
    }
  }

  if (viewMode !== "stack" && hoveredComponentId) {
    const hovered = components.find((c) => c.id === hoveredComponentId);
    if (hovered && hovered.id !== rootComponentId) {
      const subjectBox = componentBoxInSubject(hovered.box, activeSubject);
      if (subjectBox) {
        const rect = imageClientFromSubjectBox(subjectBox, img);
        if (rect) {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 1.5 * stroke;
          ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
          drawLabelBadge(ctx, hovered.name, rect.left, rect.top - 4 * stroke, toolZoom);
        }
      }
    }
  }

  if (selection) {
    const imageBounds: CropBox = { x: 0, y: 0, w: cssW, h: cssH };
    const visible = intersectCropBoxes(selection, imageBounds);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    if (!visible) {
      ctx.fillRect(0, 0, cssW, cssH);
    } else {
      ctx.fillRect(0, 0, cssW, visible.y);
      ctx.fillRect(0, visible.y, visible.x, visible.h);
      ctx.fillRect(
        visible.x + visible.w,
        visible.y,
        cssW - (visible.x + visible.w),
        visible.h,
      );
      ctx.fillRect(0, visible.y + visible.h, cssW, cssH - (visible.y + visible.h));
    }

    const sw = Math.max(0, selection.w);
    const sh = Math.max(0, selection.h);
    ctx.beginPath();
    roundedRectPath(ctx, selection.x, selection.y, sw, sh, selection.r ?? 0);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.setLineDash([5 * stroke, 3 * stroke]);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();
    ctx.setLineDash([]);

    let badgeText: string;
    if (!selectionCrop) {
      badgeText = "fora da imagem";
    } else if (selectionMatchesExistingCut && !editingComponentId) {
      badgeText = "área já recortada";
    } else {
      badgeText = `${Math.round(selectionCrop.w)} × ${Math.round(selectionCrop.h)}${
        selectionCrop.r ? ` · r ${Math.round(selectionCrop.r)}` : ""
      }`;
    }
    drawSizeBadge(ctx, badgeText, selection.x + sw, selection.y + sh, toolZoom);

    if (selectionLocked) {
      const handleRadius = HANDLE_DOT_SIZE / 2 / safeZoom;
      const radiusRadius = RADIUS_DOT_SIZE / 2 / safeZoom;
      for (const handle of RESIZE_HANDLES) {
        const center = resizeHandleCenter(handle, selection);
        drawCircleHandle(
          ctx,
          center.x,
          center.y,
          handleRadius,
          "#FFFFFF",
          "#0A0A0B",
          1.5 * stroke,
        );
      }
      for (const handle of RADIUS_HANDLES) {
        const center = radiusHandleCenter(handle, selection, toolZoom);
        drawCircleHandle(
          ctx,
          center.x,
          center.y,
          radiusRadius,
          "#4C8DFF",
          "#0A0A0B",
          stroke,
        );
      }
    }
  }

  if (drawingPath && drawingPath.points.length > 1) {
    ctx.strokeStyle = "#4C8DFF";
    ctx.lineWidth = 1.5 * stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(drawingPath.points[0].x, drawingPath.points[0].y);
    for (let i = 1; i < drawingPath.points.length; i++) {
      ctx.lineTo(drawingPath.points[i].x, drawingPath.points[i].y);
    }
    ctx.stroke();
  }
}

