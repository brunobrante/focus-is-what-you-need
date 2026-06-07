import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Crop,
  Image as ImageIcon,
  Minus,
  Move,
  Pencil,
  Pipette,
  Plus,
  Upload,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/layout/TopBar";
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
  SelectionInteraction,
  EditorTool,
  SidebarTab,
} from "./types";
import {
  MIN_TOOL_ZOOM,
  CROPS_OVERLAY_COLOR_STORAGE_KEY,
  COMPONENT_STORAGE_PREFIX,
} from "./types";

import {
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
} from "./engine/geometry";
import {
  selectionHitTest,
  componentHitTest,
} from "./engine/hitTesting";
import { roundedRectPath } from "./engine/drawing";
import {
  sourceRootComponentId,
  createRootComponent,
  ensureRootComponent,
  componentAreaAlreadyExists,
  writeReferenceStackFromComponents,
  readReferenceStackComponents,
} from "./engine/componentModel";
import {
  buildComponentTree,
  flattenComponentTree,
  componentSubtreeIds,
  componentAncestorIds,
} from "./engine/componentTree";
import {
  readSavedComponents,
  writeSavedComponents,
  writeDraftComponents,
  hasDraftComponents,
  removeSavedComponents,
  readCropsOverlayColor,
} from "./engine/storage";
import {
  canvasToDataUrl,
  inferType,
  measureImage,
  shortComponentName,
  waitForImage,
} from "./engine/image";

import { ComponentTreeItem } from "./ui/ComponentTreeItem";
import { ElementInfoCard } from "./ui/ElementInfoCard";
import { ModeButton } from "./ui/ModeButton";
import {
  RailToolButton,
  BuilderStackTabs,
  CropsOverlayToggle,
  IconButton,
  Key,
} from "./ui/RailTools";
import {
  SidebarTabs,
  SidebarComponentsHeader,
  SidebarSaveButton,
  SidebarConfigPanel,
} from "./ui/BuilderSidebar";
import { ConfirmActionModal, confirmationDialogCopy } from "./ui/ConfirmModal";
import { ReferenceGroupNavigator } from "./ui/ReferenceGroupNavigator";
import { RootSwitcher } from "./ui/RootSwitcher";
import { useBuilderViewport } from "./hooks/useBuilderViewport";
import { useBuilderCanvasPainter } from "./hooks/useBuilderCanvasPainter";

// Re-export CROPS_OVERLAY_COLOR_STORAGE_KEY and COMPONENT_STORAGE_PREFIX from types
// but they are already imported above

type ToolsEditorProps = {
  item: ToolReference;
  referenceId: string | null;
  groupContext: ToolReferenceGroupContext | null;
  onUploadedLocally: (next: ToolReference) => void;
};

export function ToolsEditor({ item, referenceId, groupContext, onUploadedLocally }: ToolsEditorProps) {
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
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [showCropsOverlay, setShowCropsOverlay] = useState(false);
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

  const bumpPaintVersion = useCallback(() => {
    setImagePaintVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_COLOR_STORAGE_KEY, cropsOverlayColor);
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayColor]);

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

  const updateComponents = useCallback(
    (updater: (items: SavedComponent[]) => SavedComponent[]) => {
      setStackSaveStatus(null);
      setComponentState((current) => {
        const base = ensureRootComponent(
          current.key === componentKey ? current.items : readSavedComponents(componentKey),
          item,
        );
        const next = ensureRootComponent(updater(base), item);
        if (referenceId && item.id === referenceId) {
          writeDraftComponents(componentKey, next);
        } else {
          writeSavedComponents(componentKey, next);
        }
        return { key: componentKey, items: next };
      });
    },
    [componentKey, item, referenceId],
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

  // Open the full-image root with the crop tool ready, so the user can cut a region
  // and then promote it to a root via "Become root".
  const beginRootCreation = useCallback(() => {
    cancelSelection();
    setActiveRootId(rootComponentId);
    setSelectedComponentId(rootComponentId);
    setViewMode("component");
    setCurrentTool("crop");
    resetToolViewport();
  }, [cancelSelection, resetToolViewport, rootComponentId]);

  // Promote an existing component (and its subtree) into an independent root.
  const promoteToRoot = useCallback(
    (id: string) => {
      const component = components.find((entry) => entry.id === id);
      if (!component || component.parentId == null) return;
      const subtree = componentSubtreeIds(components, id);
      updateComponents((current) =>
        current.map((entry) => {
          if (entry.id === id) {
            return { ...entry, parentId: null, kind: "root", rootId: id, isDefaultRoot: false };
          }
          if (subtree.has(entry.id)) return { ...entry, rootId: id };
          return entry;
        }),
      );
      cancelSelection();
      setEditingComponentId(null);
      setActiveRootId(id);
      setSelectedComponentId(id);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      setViewMode("component");
      resetToolViewport();
    },
    [cancelSelection, components, resetToolViewport, updateComponents],
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

  const resetToOriginalRoot = useCallback(() => {
    const resetComponents = ensureRootComponent([], item);
    writeSavedComponents(componentKey, resetComponents);
    setComponentState({ key: componentKey, items: resetComponents });
    setActiveRootId(rootComponentId);
    setExpandedComponentIds(new Set([rootComponentId]));
    setSelectedComponentId(null);
    setCurrentTool("move");
    setViewMode("original");
    cancelSelection();
    resetToolViewport();
  }, [cancelSelection, componentKey, item, resetToolViewport, rootComponentId]);

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
    resetToOriginalRoot();
  }, [pendingConfirmation, resetToOriginalRoot]);

  const persistReferenceStack = useCallback(async () => {
    if (savingStack) return;
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
      const rootCount = Math.max(0, (data?.roots?.length ?? 1) - 1);
      setStackSaveStatus(
        data
          ? `${cutCount} ${cutCount === 1 ? "cut" : "cuts"}` +
              (rootCount > 0 ? `, ${rootCount} ${rootCount === 1 ? "root" : "roots"} saved` : " saved")
          : "Stack removed",
      );
      removeSavedComponents(componentKey);
    } catch (err) {
      console.error("[tools] stack save failed:", err);
      setStackSaveStatus("Failed to save stack");
    } finally {
      setSavingStack(false);
    }
  }, [componentKey, components, item, referenceId, rootComponentId, savingStack]);

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
        dataUrl = await canvasToDataUrl(canvas, "image/png");
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
      } else if (event.key === "Enter") {
        if (selectionLocked) void saveSelection();
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
    selectionCrop,
    selectionMatchesExistingCut,
    drawingPath,
    selectedComponentId,
    hoveredComponentId,
    editingComponentId,
    showCropsOverlay,
    cropsOverlayColor,
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
      const imageBounds = getImageContentBounds(imgRef.current);
      const clipped = imageBounds ? intersectCropBoxes(bounds, imageBounds) : bounds;
      if (!clipped || clipped.w < 8 || clipped.h < 8) {
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
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

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <TopBar
          extra={
            <div className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-medium">
              <span className="text-[var(--text-muted)]">Generate</span>
              <ChevronRight size={10} strokeWidth={1.8} />
              {groupContext ? (
                <>
                  <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-muted)]">
                    {groupContext.name}
                  </span>
                  <ChevronRight size={10} strokeWidth={1.8} />
                </>
              ) : null}
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

        <div
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: showGroupNavigator
              ? "220px 56px minmax(0,1fr) 340px"
              : "56px minmax(0,1fr) 340px",
          }}
        >
          {showGroupNavigator && groupContext ? (
            <ReferenceGroupNavigator
              group={groupContext}
              activeReferenceId={item.id}
            />
          ) : null}

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
                (currentTool === "crop" || currentTool === "draw") && canCrop
                  ? "cursor-crosshair"
                  : "cursor-default",
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
                type={activeSubject.kind === "stack" && !selectedComponent ? "Full stack" : headerSubject.type || "—"}
                showBecomeRoot={Boolean(
                  selectedComponent &&
                    selectedComponent.parentId != null &&
                    !editingComponentId &&
                    !selection,
                )}
                onBecomeRoot={() => {
                  if (selectedComponent) promoteToRoot(selectedComponent.id);
                }}
              />

              <CropsOverlayToggle
                active={showCropsOverlay}
                onToggle={() => setShowCropsOverlay((value) => !value)}
              />

              {imageError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <ImageIcon size={24} strokeWidth={1.6} />
                  <h2 className="m-0 text-[16px] text-[var(--text)]">Image not found</h2>
                  <p className="m-0 text-[13px]">
                    Volte para <Link className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline" to="/references">References</Link>.
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
                        bumpPaintVersion();
                      }}
                      onError={() => setImageError(true)}
                      className="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]"
                      style={{ imageRendering: toolZoom > MIN_TOOL_ZOOM ? "pixelated" : "auto" }}
                    />
                  </div>
                  <canvas
                    ref={cropsCanvasRef}
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{ mixBlendMode: viewMode === "stack" ? "normal" : "screen" }}
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
                  {canCrop ? (
                    <button
                      type="button"
                      data-selection-action
                      disabled={!canSaveSelection}
                      onClick={() => void saveSelection()}
                      className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--text-faint)]"
                    >
                      <Check size={11} strokeWidth={2.2} />
                      Save component
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="ml-auto min-w-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {!canCrop ? (
                  <span>
                    Open a root from the switcher to crop inside it. Click any component to{" "}
                    <b className="text-[var(--text-muted)]">Become root</b>.
                  </span>
                ) : editingComponentId ? (
                  <span>
                    Editing existing crop. Adjust the box and <Key>Enter</Key> saves · <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "crop" ? (
                  <span>
                    Click and drag over the open subject. <Key>Enter</Key> saves a component ·{" "}
                    <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "draw" ? (
                  <span>
                    Draw freely over the image. The drawn area becomes the crop. <Key>Enter</Key> saves ·{" "}
                    <Key>Esc</Key> cancels
                  </span>
                ) : (
                  <span>
                    Use <Key>C</Key> to crop or <Key>D</Key> to draw a component. Click a component to{" "}
                    <b className="text-[var(--text-muted)]">Become root</b>.
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
            <SidebarTabs active={sidebarTab} onChange={setSidebarTab} />

            {sidebarTab === "components" ? (
              <>
                <RootSwitcher
                  roots={roots}
                  activeRootId={activeScopeId}
                  cutCountByRoot={cutCountByRoot}
                  onSelect={selectRoot}
                  onNewRoot={beginRootCreation}
                  creating={false}
                />

                <SidebarComponentsHeader
                  rootName={activeRoot.isDefaultRoot ? "Full image" : activeRoot.name}
                  scopedCount={scopedComponents.length}
                  showReset={components.length > 1}
                  onExpandAll={expandAllComponents}
                  onCollapseAll={collapseAllComponents}
                  onReset={requestResetConfirmation}
                />

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
                      primaryId={activeScopeId}
                      onOpen={openTreeComponent}
                      onToggle={toggleComponentExpanded}
                      onHover={setHoveredComponentId}
                      onEdit={startEditComponent}
                      onRemove={(id) => {
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
                      }}
                    />
                  ))}
                </div>

                <SidebarSaveButton
                  saving={savingStack}
                  saveStatus={stackSaveStatus}
                  onSave={() => void persistReferenceStack()}
                />
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

