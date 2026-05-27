import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Circle,
  Crop,
  Layers,
  Image as ImageIcon,
  Minus,
  Move,
  Pencil,
  Pipette,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Type,
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

type EditorTool = "move" | "crop" | "annotate";
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
const RESIZE_HANDLES = ["nw", "ne", "se", "sw"] as const;

type ResizeHandle = (typeof RESIZE_HANDLES)[number];

type SelectionInteraction =
  | { type: "draw"; pointerId: number; startPoint: { x: number; y: number } }
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
      handle: ResizeHandle;
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);

  const [currentTool, setCurrentTool] = useState<EditorTool>("move");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selection, setSelection] = useState<CropBox | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [drawing, setDrawing] = useState(false);
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

  const setTool = useCallback(
    (tool: EditorTool) => {
      if (tool === "crop" && !canCrop) {
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
      setToolPan((pan) => clampToolPan(pan, rounded, stageViewportRef.current, overlayRef.current));
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
          overlayRef.current,
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
    if (!selectedComponentId) return;
    expandComponentPath(selectedComponentId);
  }, [expandComponentPath, selectedComponentId]);

  useEffect(() => {
    if (canCrop || currentTool !== "crop") return;
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
      } else if (event.key === "Escape") {
        if (selection) cancelSelection();
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
      setToolPan((pan) => clampToolPan(pan, toolZoom, stageViewportRef.current, overlayRef.current));
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
  const imageContentSize = {
    w: imgRef.current?.clientWidth ?? 0,
    h: imgRef.current?.clientHeight ?? 0,
  };
  const zoomPercent = Math.round(toolZoom * 100);

  const hoveredComponent = components.find((component) => component.id === hoveredComponentId);
  const hoveredSubjectBox = hoveredComponent
    ? componentBoxInSubject(hoveredComponent.box, activeSubject)
    : null;
  const hoverStyle = hoveredSubjectBox
    ? renderedBoxStyle(hoveredSubjectBox, imgRef.current, imagePaintVersion)
    : null;
  const stackFocusedComponent =
    viewMode === "stack"
      ? components.find((component) => component.id === (hoveredComponentId ?? selectedComponentId)) ?? null
      : null;
  const stackFocusedSubjectBox = stackFocusedComponent
    ? componentBoxInSubject(stackFocusedComponent.box, activeSubject)
    : null;
  const stackFocusedStyle = stackFocusedSubjectBox
    ? renderedBoxStyle(stackFocusedSubjectBox, imgRef.current, imagePaintVersion)
    : null;
  const confirmationCopy = pendingConfirmation
    ? confirmationDialogCopy(pendingConfirmation, components)
    : null;

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

    if (!canCrop || currentTool !== "crop" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-selection-action]")) return;
    if ((event.target as HTMLElement).closest("[data-layer-component]")) return;
    const point = getContentPoint(event);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const radiusElement = (event.target as HTMLElement).closest("[data-selection-radius-handle]") as
      | HTMLElement
      | null;
    const radiusHandle = radiusElement?.dataset.selectionRadiusHandle;
    const handleElement = (event.target as HTMLElement).closest("[data-selection-handle]") as
      | HTMLElement
      | null;
    const handle = handleElement?.dataset.selectionHandle;

    if (selection && selectionLocked && isResizeHandle(radiusHandle)) {
      selectionInteractionRef.current = {
        type: "radius",
        pointerId: event.pointerId,
        handle: radiusHandle,
        startPoint: point,
        startBox: selection,
      };
      setDrawing(true);
      return;
    }

    if (selection && selectionLocked && isResizeHandle(handle)) {
      selectionInteractionRef.current = {
        type: "resize",
        pointerId: event.pointerId,
        handle,
        startPoint: point,
        startBox: selection,
      };
      setDrawing(true);
      return;
    }

    selectionInteractionRef.current = { type: "draw", pointerId: event.pointerId, startPoint: point };
    setDrawing(true);
    setSelectionLocked(false);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = selectionInteractionRef.current;
    if (!drawing || !interaction) return;

    if (interaction.type === "pan") {
      setToolPan(
        clampToolPan(
          {
            x: interaction.startPan.x + event.clientX - interaction.startClient.x,
            y: interaction.startPan.y + event.clientY - interaction.startClient.y,
          },
          toolZoom,
          stageViewportRef.current,
          overlayRef.current,
        ),
      );
      return;
    }

    const point = getContentPoint(event);
    if (!point) return;

    if (interaction.type === "resize") {
      const contentBounds = getVisibleContentBounds();
      if (!contentBounds) return;
      setSelection(
        resizeCropBox(interaction.startBox, interaction.handle, point, contentBounds),
      );
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "radius") {
      setSelection(roundCropBox(interaction.startBox, interaction.handle, point));
      setSelectionLocked(true);
      return;
    }

    setSelection(cropBoxFromPoints(interaction.startPoint, point));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || !selectionInteractionRef.current) return;
    const interaction = selectionInteractionRef.current;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDrawing(false);
    selectionInteractionRef.current = null;
    if (interaction.type === "pan") return;
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
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / toolZoom,
      y: (event.clientY - rect.top) / toolZoom,
    };
  }

  function getVisibleContentBounds(): CropBox | null {
    const stage = stageViewportRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay) return null;
    const stageRect = stage.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      x: (stageRect.left - overlayRect.left) / toolZoom,
      y: (stageRect.top - overlayRect.top) / toolZoom,
      w: stageRect.width / toolZoom,
      h: stageRect.height / toolZoom,
    };
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
            <span className="my-1.5 h-px w-7 bg-[var(--border)]" />
            <RailToolButton
              active={currentTool === "annotate"}
              label="Anotação"
              onClick={() => setTool("annotate")}
            >
              <Pencil size={18} strokeWidth={1.7} />
            </RailToolButton>
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
                currentTool === "crop" ? "cursor-crosshair" : "cursor-default",
              ].join(" ")}
              onWheel={handleStageWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
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

              {currentTool === "annotate" ? <AnnotationToolbar /> : null}

              {imageError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <ImageIcon size={24} strokeWidth={1.6} />
                  <h2 className="m-0 text-[16px] text-[var(--text)]">Imagem não encontrada</h2>
                  <p className="m-0 text-[13px]">
                    Volte para <Link className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline" to="/references">Referências</Link>.
                  </p>
                </div>
              ) : (
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
                  <div
                    ref={overlayRef}
                    className="absolute inset-0"
                  >
                    {viewMode === "stack"
                      ? stackedComponents.map((component, index) => {
                          const layerStyle = renderedBoxStyle(
                            componentBoxInSubject(component.box, activeSubject) ?? component.box,
                            imgRef.current,
                            imagePaintVersion,
                          );
                          if (!layerStyle) return null;
                          const active = selectedComponentId === component.id;
                          const highlighted = active || hoveredComponentId === component.id;
                          return (
                            <button
                              key={component.id}
                              type="button"
                              data-layer-component
                              onPointerDown={(event) => {
                                if (event.button !== 1) event.stopPropagation();
                              }}
                              onClick={() => selectStackComponent(component.id)}
                              onMouseEnter={() => setHoveredComponentId(component.id)}
                              onMouseLeave={() => setHoveredComponentId(null)}
                              className={[
                                "absolute cursor-pointer overflow-hidden rounded-[2px] border bg-transparent p-0 transition-colors duration-[120ms]",
                                highlighted
                                  ? "border-[#4C8DFF]"
                                  : "border-transparent hover:border-[#4C8DFF]",
                              ].join(" ")}
                              style={{ ...layerStyle, zIndex: index + 1 }}
                            >
                              <img
                                src={component.dataUrl}
                                alt={component.name}
                                draggable={false}
                                className="h-full w-full select-none object-fill"
                                style={{ imageRendering: toolZoom > MIN_TOOL_ZOOM ? "pixelated" : "auto" }}
                              />
                            </button>
                          );
                        })
                      : null}
                    {viewMode === "stack" && stackFocusedStyle ? (
                      <div
                        className="pointer-events-none absolute rounded-[2px] border-[1.5px] border-[#4C8DFF]"
                        style={{ ...stackFocusedStyle, zIndex: stackedComponents.length + 2 }}
                      />
                    ) : null}
                    {viewMode !== "stack" && hoveredComponent && hoverStyle ? (
                      <div
                        className="pointer-events-none absolute rounded-[2px] border-[1.5px] border-[rgba(255,255,255,0.55)] bg-[rgba(255,255,255,0.04)]"
                        style={hoverStyle}
                      >
                        <span className="absolute left-0 top-[-22px] rounded-[4px] bg-white px-1.5 py-0.5 text-[10px] font-medium text-black">
                          {hoveredComponent.name}
                        </span>
                      </div>
                    ) : null}
                    {selection ? (
                      <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
                        <SelectionDimmer
                          selection={selection}
                          width={imageContentSize.w}
                          height={imageContentSize.h}
                        />
                        <div
                          className="pointer-events-none absolute border-[1.5px] border-dashed border-white bg-[rgba(255,255,255,0.08)]"
                          style={{
                            left: selection.x,
                            top: selection.y,
                            width: selection.w,
                            height: selection.h,
                            borderRadius: selection.r ?? 0,
                            borderWidth: 1.5 / toolZoom,
                          }}
                        >
                          <span
                            className="absolute right-0 rounded-[4px] bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-black shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
                            style={{
                              bottom: -24 / toolZoom,
                              transform: `scale(${1 / toolZoom})`,
                              transformOrigin: "bottom right",
                            }}
                          >
                            {selectionMatchesExistingCut
                              ? "área já recortada"
                              : selectionCrop
                                ? `${Math.round(selectionSize.w)} × ${Math.round(selectionSize.h)}${
                                    selectionSize.r ? ` · r ${Math.round(selectionSize.r)}` : ""
                                  }`
                                : "fora da imagem"}
                          </span>
                          {selectionLocked
                            ? (
                                <>
                                  {RESIZE_HANDLES.map((handle) => (
                                    <button
                                      key={handle}
                                      type="button"
                                      aria-label={`Redimensionar ${handle}`}
                                      data-selection-handle={handle}
                                      className="pointer-events-auto absolute border-0 bg-transparent p-0"
                                      style={resizeHandleHitAreaStyle(handle, toolZoom)}
                                    >
                                      <span
                                        aria-hidden
                                        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                                        style={resizeHandleVisualStyle(toolZoom)}
                                      />
                                    </button>
                                  ))}
                                  {RESIZE_HANDLES.map((handle) => (
                                    <button
                                      key={`radius-${handle}`}
                                      type="button"
                                      aria-label={`Arredondar ${handle}`}
                                      data-selection-radius-handle={handle}
                                      className="pointer-events-auto absolute h-[9px] w-[9px] rounded-full border border-[#0A0A0B] bg-[#4C8DFF] shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
                                      style={radiusHandleStyle(handle, selection, toolZoom)}
                                    />
                                  ))}
                                </>
                              )
                            : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
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
                ) : currentTool === "crop" ? (
                  <span>
                    Clique e arraste sobre o assunto aberto. Áreas filhas já recortadas aparecem como aviso. <Key>Enter</Key> salva ·{" "}
                    <Key>Esc</Key> cancela
                  </span>
                ) : (
                  <span>
                    Selecione um componente na lateral para recortar dentro dele, ou use <Key>C</Key>.
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
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
                  expandedIds={expandedComponentIds}
                  rootId={rootComponentId}
                  primaryId={primaryScopeId}
                  onOpen={openTreeComponent}
                  onToggle={toggleComponentExpanded}
                  onHover={setHoveredComponentId}
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

function AnnotationToolbar() {
  return (
    <div
      data-selection-action
      className="absolute bottom-3.5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[rgba(20,20,22,0.92)] p-1 shadow-[0_10px_34px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
    >
      <AnnotationToolButton label="Lápis" active>
        <Pencil size={13} strokeWidth={1.8} />
      </AnnotationToolButton>
      <AnnotationToolButton label="Texto">
        <Type size={13} strokeWidth={1.8} />
      </AnnotationToolButton>
      <AnnotationToolButton label="Retângulo">
        <Square size={13} strokeWidth={1.8} />
      </AnnotationToolButton>
      <AnnotationToolButton label="Círculo">
        <Circle size={13} strokeWidth={1.8} />
      </AnnotationToolButton>
    </div>
  );
}

function AnnotationToolButton({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        "grid h-8 w-8 cursor-pointer place-items-center rounded-[8px] border transition-colors duration-[120ms]",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </button>
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

function SelectionDimmer({
  selection,
  width,
  height,
}: {
  selection: CropBox;
  width: number;
  height: number;
}) {
  if (width <= 0 || height <= 0) return null;
  const visibleSelection = intersectCropBoxes(selection, { x: 0, y: 0, w: width, h: height });

  if (!visibleSelection) {
    return <div className="pointer-events-none absolute inset-0 bg-[rgba(0,0,0,0.42)]" />;
  }

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 top-0 bg-[rgba(0,0,0,0.42)]"
        style={{ width: "100%", height: visibleSelection.y }}
      />
      <div
        className="pointer-events-none absolute left-0 bg-[rgba(0,0,0,0.42)]"
        style={{ top: visibleSelection.y, width: visibleSelection.x, height: visibleSelection.h }}
      />
      <div
        className="pointer-events-none absolute right-0 bg-[rgba(0,0,0,0.42)]"
        style={{
          top: visibleSelection.y,
          left: visibleSelection.x + visibleSelection.w,
          height: visibleSelection.h,
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 bg-[rgba(0,0,0,0.42)]"
        style={{ top: visibleSelection.y + visibleSelection.h, width: "100%" }}
      />
    </>
  );
}

function ComponentTreeItem({
  node,
  activeId,
  hoveredId,
  expandedIds,
  rootId,
  primaryId,
  onOpen,
  onToggle,
  onHover,
  onRemove,
}: {
  node: ComponentTreeNode;
  activeId: string | null;
  hoveredId: string | null;
  expandedIds: Set<string>;
  rootId: string;
  primaryId: string;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const { component, children, depth } = node;
  const active = activeId === component.id;
  const hovered = hoveredId === component.id;
  const isRoot = component.id === rootId;
  const isPrimary = component.id === primaryId;
  const isProtected = isRoot || isPrimary;
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
          active || hovered
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
              expandedIds={expandedIds}
              rootId={rootId}
              primaryId={primaryId}
              onOpen={onOpen}
              onToggle={onToggle}
              onHover={onHover}
              onRemove={onRemove}
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
  const tolerance = cropBoxTolerance(parent, child);
  const parentRight = parent.x + parent.w;
  const parentBottom = parent.y + parent.h;
  const childRight = child.x + child.w;
  const childBottom = child.y + child.h;
  const contains =
    child.x >= parent.x - tolerance &&
    child.y >= parent.y - tolerance &&
    childRight <= parentRight + tolerance &&
    childBottom <= parentBottom + tolerance;

  if (!contains) return false;

  const areaDelta = cropBoxArea(parent) - cropBoxArea(child);
  return areaDelta > Math.max(HIERARCHY_MIN_AREA_DELTA, tolerance * tolerance);
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

function renderedBoxStyle(
  box: CropBox,
  img: HTMLImageElement | null,
  _paintVersion: number,
): CSSProperties | null {
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
  overlay: HTMLDivElement | null,
) {
  if (zoom <= MIN_TOOL_ZOOM || !viewport || !overlay) return { x: 0, y: 0 };
  const viewportWidth = Math.max(1, viewport.clientWidth - 64);
  const viewportHeight = Math.max(1, viewport.clientHeight - 64);
  const scaledWidth = overlay.clientWidth * zoom;
  const scaledHeight = overlay.clientHeight * zoom;
  const maxX = Math.max(0, (scaledWidth - viewportWidth) / 2);
  const maxY = Math.max(0, (scaledHeight - viewportHeight) / 2);
  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

function isResizeHandle(value: string | undefined): value is ResizeHandle {
  return RESIZE_HANDLES.includes(value as ResizeHandle);
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
  handle: ResizeHandle,
  point: { x: number; y: number },
): CropBox {
  const left = startBox.x;
  const top = startBox.y;
  const right = startBox.x + startBox.w;
  const bottom = startBox.y + startBox.h;
  const maxRadius = maxCropRadius(startBox);
  let radius = startBox.r ?? 0;

  if (handle === "nw") radius = Math.max(point.x - left, point.y - top);
  if (handle === "ne") radius = Math.max(right - point.x, point.y - top);
  if (handle === "se") radius = Math.max(right - point.x, bottom - point.y);
  if (handle === "sw") radius = Math.max(point.x - left, bottom - point.y);

  return {
    ...startBox,
    r: clamp(radius, 0, maxRadius),
  };
}

function resizeHandleHitAreaStyle(handle: ResizeHandle, zoom: number): CSSProperties {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const hitSize = 22 / safeZoom;
  const edgeOffset = -hitSize / 2;
  const style: CSSProperties = {
    cursor: resizeCursor(handle),
    width: hitSize,
    height: hitSize,
  };

  if (handle.includes("n")) {
    style.top = edgeOffset;
  } else if (handle.includes("s")) {
    style.bottom = edgeOffset;
  }

  if (handle.includes("w")) {
    style.left = edgeOffset;
  } else if (handle.includes("e")) {
    style.right = edgeOffset;
  }

  return style;
}

function resizeHandleVisualStyle(zoom: number): CSSProperties {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const size = 11 / safeZoom;
  return {
    width: size,
    height: size,
    borderWidth: 1 / safeZoom,
  };
}

function radiusHandleStyle(handle: ResizeHandle, box: CropBox, zoom: number): CSSProperties {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const size = 9 / safeZoom;
  const maxOffset = Math.max(0, maxCropRadius(box) - 5);
  const centerOffset = Math.min(maxOffset, Math.max(14 / safeZoom, box.r ?? 0));
  const offset = centerOffset - size / 2;
  const style: CSSProperties = {
    cursor: "grab",
    width: size,
    height: size,
    borderWidth: 1 / safeZoom,
  };

  if (handle.includes("n")) {
    style.top = offset;
  } else {
    style.bottom = offset;
  }

  if (handle.includes("w")) {
    style.left = offset;
  } else {
    style.right = offset;
  }

  return style;
}

function resizeCursor(handle: ResizeHandle) {
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "nwse-resize";
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

