import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ALargeSmall, Check, Copy, FoldVertical, Pencil, Rows3, Trash2, X } from "lucide-react";
import {
  deleteElements,
  duplicateElements,
  fitTextElementToContent,
  renameElement,
  setTextElementSizing,
  updateElementStyles,
} from "@/canvas/engine/actions";
import { filterTopLevelIds, getCommonParentId, getSelectionBox, unionRects } from "@/canvas/engine/geometry";
import { useHoveredId } from "@/canvas/engine/store";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import type { CanvasDocument, ElementNode, ElementStyles, Point, Rect, ResizeHandle, SnapGuide } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";
import type { GlobalSettings } from "@/domain/settings/types";
import type { CanvasDropTarget } from "./canvasStageTypes";
import type { RadiusCorner, ToolingGeometry, ToolingHit } from "./canvasHitTesting";
import { hitTestTooling } from "./canvasHitTesting";
import {
  type ViewportTransform,
  GROUP_FILL,
  HOVER_COLOR,
  RADIUS_MIN_ELEMENT_SCREEN,
  SELECTION_COLOR,
  canvasRectToViewport,
  elementToViewportBox,
  elementToPaintViewportRect,
  getOrientedRadiusHandlePositions,
  getRadiusHandlePositions,
  getToolingBoxRotation,
  rectToToolingBox,
  type ToolingBox,
} from "./canvasToolingRenderer";
import { createToolingRendererAdapter } from "./toolingRendererFactory";
import type {
  ToolingDropTargetCommand,
  ToolingOutlineCommand,
  ToolingRendererAdapter,
} from "./toolingRenderAdapter";

export type { RadiusCorner } from "./canvasHitTesting";

export type CanvasToolingRef = {
  hitTest: (viewportX: number, viewportY: number) => ToolingHit;
};

export type CanvasToolingLayerProps = {
  document: CanvasDocument;
  selectedIds: string[];
  editingTextId: string | null;
  canvasStageActive: boolean;
  guides: SnapGuide[];
  viewportTransform: ViewportTransform;
  suppressHover: boolean;
  interactionType: string | null;
  marqueeRect: Rect | null;
  dropTarget: CanvasDropTarget | null;
  onCommitDocument: (document: CanvasDocument, selectedIds?: string[]) => void;
  settings?: GlobalSettings;
};

function computeTransformIds(doc: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(doc, selectedIds).filter((id) => {
    const node = doc.elements[id];
    return Boolean(node && !node.locked && node.visible !== false);
  });
}

function formatSizeValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function clampLabelCenter(x: number, width: number): number {
  const margin = 38;
  if (width <= margin * 2) return width / 2;
  return Math.min(Math.max(x, margin), width - margin);
}

function clampToolbarCenter(x: number, viewportWidth: number, halfWidth = 126): number {
  const halfW = halfWidth;
  const pad = 8;
  if (viewportWidth <= (halfW + pad) * 2) return viewportWidth / 2;
  return Math.min(Math.max(x, halfW + pad), viewportWidth - halfW - pad);
}

type ContextToolId =
  | "text-style"
  | "fit-text"
  | "layout-flex"
  | "duplicate"
  | "rename"
  | "delete";

type ContextTool = {
  id: ContextToolId;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
} | "divider";

type ToolbarPanel = "text-style" | "layout" | null;

const FONT_SIZE_OPTIONS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 96];

const DEFAULT_FONT_FAMILY = "Inter, system-ui, sans-serif";

const FONT_FAMILY_OPTIONS = [
  { label: "Inter", value: DEFAULT_FONT_FAMILY },
  { label: "Geist", value: "'Geist Variable', system-ui, sans-serif" },
  { label: "System", value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

const JUSTIFY_CONTENT_OPTIONS = [
  { label: "Start", value: "flex-start" },
  { label: "Center", value: "center" },
  { label: "End", value: "flex-end" },
  { label: "Between", value: "space-between" },
];

const ALIGN_ITEMS_OPTIONS = [
  { label: "Stretch", value: "stretch" },
  { label: "Start", value: "flex-start" },
  { label: "Center", value: "center" },
  { label: "End", value: "flex-end" },
];

const ALL_RESIZE_HANDLES: readonly ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

function resizeHandlesForNode(node: ElementNode, baseHandles: readonly ResizeHandle[] | "all"): readonly ResizeHandle[] | null {
  const handles = baseHandles === "all" ? ALL_RESIZE_HANDLES : baseHandles;
  if (node.type !== "text") return baseHandles === "all" ? null : baseHandles;
  const widthFit = node.sizing?.width === "fit";
  const heightFit = node.sizing?.height === "fit";
  if (!widthFit && !heightFit) return baseHandles === "all" ? null : baseHandles;
  return handles.filter((handle) => {
    const changesWidth = handle.includes("e") || handle.includes("w");
    const changesHeight = handle.includes("n") || handle.includes("s");
    return (!widthFit || !changesWidth) && (!heightFit || !changesHeight);
  });
}

const EMPTY_GEOMETRY: ToolingGeometry = {
  selectionBox: null,
  radiusHandlePositions: null,
  canResize: false,
  canRotate: false,
  hasRadiusHandles: false,
  cursorRotation: 0,
  allowedResizeHandles: null,
};

const TOOLING_RENDERER_KIND = "skia";

const TOOLING_HOST_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  top: 0,
  left: 0,
  pointerEvents: "none",
  zIndex: 8,
};

type ToolingHostRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function getElementViewportRect(doc: CanvasDocument, id: string, t: ViewportTransform): Rect | null {
  return elementToPaintViewportRect(doc, id, t);
}

function getElementViewportBox(doc: CanvasDocument, id: string, t: ViewportTransform): ToolingBox | null {
  return elementToViewportBox(doc, id, t);
}

function boxFromRects(rects: Rect[]): ToolingBox | null {
  const rect = unionRects(rects);
  return rect ? rectToToolingBox(rect) : null;
}

type ToolingRenderData = {
  transformIds: string[];
  sizeLabelCanvasRect: Rect | null;
  sizeLabelViewportRect: Rect | null;
  hitGeometry: ToolingGeometry;
  outlines: ToolingOutlineCommand[];
  resizeBox: ToolingBox | null;
  radiusHandlePositions: Point[] | null;
  dropTarget: ToolingDropTargetCommand | null;
  isDragging: boolean;
  isEditingText: boolean;
};

const CanvasToolingLayerImpl = forwardRef<CanvasToolingRef, CanvasToolingLayerProps>(
  (props, ref) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const adapterRef = useRef<ToolingRendererAdapter | null>(null);
    const geometryRef = useRef<ToolingGeometry>(EMPTY_GEOMETRY);
    const animationFrameRef = useRef<number | null>(null);
    const [openPanel, setOpenPanel] = useState<ToolbarPanel>(null);
    const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");
    const [hostRect, setHostRect] = useState<ToolingHostRect>({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    const doc = props.document;
    const t = props.viewportTransform;
    const hoveredId = useHoveredId();

    const settings = props.settings ?? DEFAULT_GLOBAL_SETTINGS;
    const [contextToolbarModifierDown, setContextToolbarModifierDown] = useState(false);
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (isModifierCommandActive(event, settings, "canvas.selection.contextToolbar")) {
          setContextToolbarModifierDown(true);
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (!isModifierCommandActive(event, settings, "canvas.selection.contextToolbar")) {
          setContextToolbarModifierDown(false);
        }
      };
      const onBlur = () => {
        setContextToolbarModifierDown(false);
        setOpenPanel(null);
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
      };
    }, [settings]);

    const selectedIdsKey = props.selectedIds.join("|");
    useEffect(() => {
      setOpenPanel(null);
      setRenamingElementId(null);
      setRenameDraft("");
    }, [selectedIdsKey]);

    useEffect(() => {
      if (!props.editingTextId) return;
      setContextToolbarModifierDown(false);
      setOpenPanel(null);
      setRenamingElementId(null);
      setRenameDraft("");
    }, [props.editingTextId]);

    useEffect(() => {
      if (!renamingElementId) return;
      const frame = globalThis.requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
      return () => globalThis.cancelAnimationFrame(frame);
    }, [renamingElementId]);

    useEffect(() => {
      if (!openPanel) return;
      const onPointerDown = (event: PointerEvent) => {
        if (toolbarRef.current?.contains(event.target as Node)) return;
        setOpenPanel(null);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpenPanel(null);
      };
      window.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
      return () => {
        window.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("keydown", onKeyDown, true);
      };
    }, [openPanel]);
    const overlaySize = useMemo(() => ({
      width: hostRect.width,
      height: hostRect.height,
    }), [hostRect.height, hostRect.width]);

    const renderData = useMemo<ToolingRenderData>(() => {
      const isEditingText = Boolean(props.editingTextId);
      const isDragging =
        props.interactionType === "drag" || props.interactionType === "draw";
      const isRadiusDragging = props.interactionType === "radius";
      const suppressHandles = isDragging || isEditingText;
      const visibleSelectedIds = props.selectedIds.filter(
        (id) => doc.elements[id]?.visible !== false,
      );
      const transformIds = computeTransformIds(doc, visibleSelectedIds);
      const sizeLabelCanvasRect = getSelectionBox(doc, transformIds);

      const boxCache = new Map<string, ToolingBox | null>();
      const resolveBox = (id: string): ToolingBox | null => {
        if (!boxCache.has(id)) {
          boxCache.set(id, getElementViewportBox(doc, id, t));
        }
        return boxCache.get(id) ?? null;
      };
      const resolveRect = (id: string): Rect | null =>
        resolveBox(id)?.rect ?? getElementViewportRect(doc, id, t);

      const selectedViewportBoxes = visibleSelectedIds
        .map((id) => resolveBox(id))
        .filter((box): box is ToolingBox => box !== null);
      const selectedViewportRects = selectedViewportBoxes.map((box) => box.rect);
      const transformViewportBoxes = transformIds
        .map((id) => resolveBox(id))
        .filter((box): box is ToolingBox => box !== null);
      const transformViewportRects = transformViewportBoxes.map((box) => box.rect);
      const sizeLabelViewportRect = unionRects(transformViewportRects);
      const commonParentId =
        transformIds.length > 0 ? getCommonParentId(doc, transformIds) : undefined;
      const canSelectionResize =
        transformIds.length > 0 && commonParentId !== undefined;
      const canSelectionRotate = transformIds.length === 1;
      const selectionBox =
        transformIds.length === 1
          ? transformViewportBoxes[0] ?? null
          : boxFromRects(transformViewportRects);
      const canResize = Boolean(selectionBox && canSelectionResize);
      const canRotate = Boolean(selectionBox && canSelectionRotate);
      const singleElement = transformIds.length === 1 ? doc.elements[transformIds[0]] : null;
      const allowedResizeHandles = singleElement
        ? (() => {
            const h = getElementDefinition(singleElement.type).capabilities.resizeHandles;
            return resizeHandlesForNode(singleElement, h);
          })()
        : null;
      const radiusElement =
        transformIds.length === 1 ? doc.elements[transformIds[0]] : null;
      const radiusEligible = Boolean(
        radiusElement &&
          !radiusElement.locked &&
          getElementDefinition(radiusElement.type).capabilities.radius,
      );
      const radiusElementHovered = Boolean(
        radiusElement && hoveredId === radiusElement.id,
      );
      const showRadiusHandles = radiusEligible && (radiusElementHovered || isRadiusDragging);

      let radiusHandlePositions: Point[] | null = null;
      let hasRadiusHandles = false;
      if (showRadiusHandles && radiusElement) {
        const elemBox = resolveBox(radiusElement.id);
        const elemRect = elemBox?.rect ?? null;
        if (
          elemRect &&
          elemRect.width >= RADIUS_MIN_ELEMENT_SCREEN &&
          elemRect.height >= RADIUS_MIN_ELEMENT_SCREEN
        ) {
          hasRadiusHandles = true;
          radiusHandlePositions = elemBox
            ? getOrientedRadiusHandlePositions(
                elemBox,
                radiusElement.styles.borderRadius ?? 0,
                t.displayZoom,
                isRadiusDragging ? 0 : undefined,
              )
            : getRadiusHandlePositions(
                elemRect,
                radiusElement.styles.borderRadius ?? 0,
                t.displayZoom,
                isRadiusDragging ? 0 : undefined,
              );
        }
      }

      const hoveredEligibleId =
        !props.suppressHover &&
        !isEditingText &&
        hoveredId &&
        !props.selectedIds.includes(hoveredId) &&
        doc.elements[hoveredId]
          ? hoveredId
          : null;
      const hoverBox = hoveredEligibleId ? resolveBox(hoveredEligibleId) : null;
      const hoverRect = hoveredEligibleId ? resolveRect(hoveredEligibleId) : null;
      const groupRect =
        !props.canvasStageActive && !isDragging && selectedViewportRects.length > 1
          ? unionRects(selectedViewportRects)
          : null;
      const groupBox = groupRect ? rectToToolingBox(groupRect) : null;
      const renderedSelectedBoxes =
        !props.canvasStageActive && !isDragging ? selectedViewportBoxes : [];

      const canvasRect = props.canvasStageActive
        ? canvasRectToViewport(
            { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height },
            t,
          )
        : null;
      const canvasBox = canvasRect ? rectToToolingBox(canvasRect) : null;

      const dropTargetId = props.dropTarget?.targetId ?? null;
      const dropTargetNode = dropTargetId ? doc.elements[dropTargetId] : null;
      const dropTargetRect =
        dropTargetNode && dropTargetId ? resolveRect(dropTargetId) : null;
      const dropTarget: ToolingDropTargetCommand | null =
        dropTargetNode && dropTargetRect && props.dropTarget
          ? {
              rect: dropTargetRect,
              borderRadius: dropTargetNode.styles.borderRadius ?? 0,
              displayZoom: t.displayZoom,
              intent: props.dropTarget.intent,
            }
          : null;

      const hitGeometry = props.canvasStageActive
        ? {
            selectionBox: canvasBox,
            radiusHandlePositions: null,
            canResize: true,
            canRotate: true,
            hasRadiusHandles: false,
            cursorRotation: doc.canvas.rotation ?? 0,
            allowedResizeHandles: null,
          }
        : {
            selectionBox: suppressHandles ? null : selectionBox,
            radiusHandlePositions: suppressHandles ? null : radiusHandlePositions,
            canResize: suppressHandles ? false : canResize,
            canRotate: suppressHandles ? false : canRotate,
            hasRadiusHandles: suppressHandles ? false : hasRadiusHandles,
            cursorRotation: selectionBox ? getToolingBoxRotation(selectionBox) : 0,
            allowedResizeHandles: suppressHandles ? null : allowedResizeHandles,
          };

      return {
        transformIds,
        sizeLabelCanvasRect,
        sizeLabelViewportRect,
        hitGeometry,
        outlines: props.canvasStageActive
          ? [{ rect: canvasBox?.rect ?? null, corners: canvasBox?.corners, color: SELECTION_COLOR }]
          : [
              { rect: groupBox?.rect ?? null, corners: groupBox?.corners, color: SELECTION_COLOR, fill: GROUP_FILL },
              ...renderedSelectedBoxes.map((box) => ({ rect: box.rect, corners: box.corners, color: SELECTION_COLOR })),
              { rect: hoverBox?.rect ?? hoverRect, corners: hoverBox?.corners, color: HOVER_COLOR },
            ],
        resizeBox: props.canvasStageActive
          ? canvasBox
          : !suppressHandles && canResize && selectionBox
            ? { ...selectionBox, allowedHandles: allowedResizeHandles }
            : null,
        radiusHandlePositions:
          !props.canvasStageActive && !suppressHandles && hasRadiusHandles
            ? radiusHandlePositions
            : null,
        dropTarget,
        isDragging,
        isEditingText,
      };
    }, [
      doc,
      hoveredId,
      props.canvasStageActive,
      props.dropTarget,
      props.editingTextId,
      props.interactionType,
      props.selectedIds,
      props.suppressHover,
      t,
    ]);

    const sizeLabel = useMemo(() => (
      !props.canvasStageActive &&
      !renderData.isDragging &&
      !renderData.isEditingText &&
      renderData.sizeLabelCanvasRect &&
      renderData.sizeLabelViewportRect
        ? {
            text: `${formatSizeValue(renderData.sizeLabelCanvasRect.width)} × ${formatSizeValue(renderData.sizeLabelCanvasRect.height)}`,
            left: clampLabelCenter(
              renderData.sizeLabelViewportRect.x + renderData.sizeLabelViewportRect.width / 2,
              overlaySize.width,
            ),
            top:
              renderData.sizeLabelViewportRect.y + renderData.sizeLabelViewportRect.height + 30 <= overlaySize.height
                ? renderData.sizeLabelViewportRect.y + renderData.sizeLabelViewportRect.height + 8
                : Math.max(0, renderData.sizeLabelViewportRect.y - 30),
          }
        : null
    ), [
      overlaySize.height,
      overlaySize.width,
      props.canvasStageActive,
      renderData.isDragging,
      renderData.isEditingText,
      renderData.sizeLabelCanvasRect,
      renderData.sizeLabelViewportRect,
    ]);

    const selectedId = renderData.transformIds.length === 1 ? renderData.transformIds[0] : null;
    const selectedNode = selectedId ? doc.elements[selectedId] ?? null : null;
    const isTextSelection = selectedNode?.type === "text";
    const isBoxLayoutSelection = selectedNode?.type === "rect";
    const isTextFitSelection =
      selectedNode?.type === "text" &&
      (selectedNode.sizing?.width === "fit" || selectedNode.sizing?.height === "fit");
    const isFlexDisplaySelection = selectedNode?.styles.display === "flex";
    const selectedJustifyContent = selectedNode?.styles.justifyContent ?? "flex-start";
    const selectedAlignItems = selectedNode?.styles.alignItems ?? "stretch";
    const selectedFontSize = selectedNode?.type === "text" ? Math.round(selectedNode.styles.fontSize ?? 14) : 14;
    const fontSizeSelectOptions = useMemo(
      () => (
        FONT_SIZE_OPTIONS.includes(selectedFontSize)
          ? FONT_SIZE_OPTIONS
          : [...FONT_SIZE_OPTIONS, selectedFontSize].sort((a, b) => a - b)
      ),
      [selectedFontSize],
    );
    const selectedFontFamily =
      selectedNode?.type === "text" ? selectedNode.styles.fontFamily ?? DEFAULT_FONT_FAMILY : DEFAULT_FONT_FAMILY;
    const fontFamilySelectOptions = useMemo(
      () => (
        FONT_FAMILY_OPTIONS.some((font) => font.value === selectedFontFamily)
          ? FONT_FAMILY_OPTIONS
          : [{ label: "Current", value: selectedFontFamily }, ...FONT_FAMILY_OPTIONS]
      ),
      [selectedFontFamily],
    );
    const isRenamingSelection = renamingElementId !== null && renamingElementId === selectedId;
    const toolbarActive = contextToolbarModifierDown || openPanel !== null || isRenamingSelection;

    const contextTools = useMemo<ContextTool[]>(() => {
      const tools: ContextTool[] = [];

      if (isTextSelection) {
        tools.push(
          {
            id: "text-style",
            label: "Text style",
            icon: <ALargeSmall size={15} strokeWidth={1.8} />,
            active: openPanel === "text-style",
          },
          {
            id: "fit-text",
            label: "Fit width and height",
            icon: <FoldVertical size={15} strokeWidth={1.8} />,
            active: isTextFitSelection,
          },
          "divider",
        );
      }

      if (isBoxLayoutSelection) {
        tools.push(
          {
            id: "layout-flex",
            label: "Flex layout",
            icon: <Rows3 size={15} strokeWidth={1.8} />,
            active: isFlexDisplaySelection || openPanel === "layout",
          },
          "divider",
        );
      }

      tools.push(
        {
          id: "rename",
          label: "Rename",
          icon: <Pencil size={14} strokeWidth={1.8} />,
        },
        {
          id: "duplicate",
          label: "Duplicate",
          icon: <Copy size={14} strokeWidth={1.8} />,
        },
        {
          id: "delete",
          label: "Delete",
          icon: <Trash2 size={14} strokeWidth={1.8} />,
          destructive: true,
        },
      );

      return tools;
    }, [isBoxLayoutSelection, isFlexDisplaySelection, isTextFitSelection, isTextSelection, openPanel]);

    const commitSelectedDocument = (document: CanvasDocument, selectedIds = selectedId ? [selectedId] : props.selectedIds) => {
      props.onCommitDocument(document, selectedIds);
    };

    const stopToolbarPointer = (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const stopMenuPointer = (event: ReactPointerEvent) => {
      event.stopPropagation();
    };

    const cancelRename = () => {
      setRenamingElementId(null);
      setRenameDraft("");
    };

    const saveRename = () => {
      if (!selectedId || !selectedNode || renamingElementId !== selectedId) {
        cancelRename();
        return;
      }
      const nextName = renameDraft.trim();
      if (nextName && nextName !== selectedNode.name) {
        commitSelectedDocument(renameElement(doc, selectedId, nextName));
      }
      cancelRename();
    };

    const applyLayoutStyle = (style: Partial<ElementStyles>) => {
      if (!selectedId || !selectedNode || !isBoxLayoutSelection) return;
      commitSelectedDocument(updateElementStyles(doc, selectedId, style));
    };

    const setLayoutDisplay = (display: ElementStyles["display"]) => {
      if (display === "flex") {
        applyLayoutStyle({
          display: "flex",
          justifyContent: selectedJustifyContent,
          alignItems: selectedAlignItems,
        });
        return;
      }
      applyLayoutStyle({ display: "block" });
      setOpenPanel(null);
    };

    const handleToolClick = (toolId: ContextToolId) => {
      if (!selectedId || !selectedNode) return;

      if (toolId !== "text-style" && toolId !== "layout-flex") setOpenPanel(null);

      switch (toolId) {
        case "text-style":
          if (selectedNode.type === "text") {
            setOpenPanel((current) => (current === "text-style" ? null : "text-style"));
          }
          return;
        case "fit-text":
          if (selectedNode.type === "text") {
            commitSelectedDocument(
              isTextFitSelection
                ? setTextElementSizing(doc, selectedId, { width: "fixed", height: "fixed" })
                : fitTextElementToContent(doc, selectedId),
            );
          }
          return;
        case "layout-flex":
          if (isBoxLayoutSelection) {
            if (!isFlexDisplaySelection) {
              setLayoutDisplay("flex");
              setOpenPanel("layout");
              return;
            }
            setOpenPanel((current) => (current === "layout" ? null : "layout"));
          }
          return;
        case "duplicate": {
          const duplicated = duplicateElements(doc, [selectedId]);
          props.onCommitDocument(duplicated.document, duplicated.selectedIds);
          return;
        }
        case "rename":
          setRenamingElementId(selectedId);
          setRenameDraft(selectedNode.name);
          return;
        case "delete":
          props.onCommitDocument(deleteElements(doc, [selectedId]), []);
          return;
      }
    };

    const applyTextFontSize = (fontSize: number) => {
      if (!selectedId || selectedNode?.type !== "text") return;
      commitSelectedDocument(updateElementStyles(doc, selectedId, { fontSize }));
      setOpenPanel(null);
    };

    const applyTextFontFamily = (fontFamily: string) => {
      if (!selectedId || selectedNode?.type !== "text") return;
      commitSelectedDocument(updateElementStyles(doc, selectedId, { fontFamily }));
      setOpenPanel(null);
    };

    const CONTEXT_TOOLBAR_HEIGHT = 36;
    const contextualToolbar = useMemo(() => (
      toolbarActive &&
      !props.canvasStageActive &&
      !renderData.isDragging &&
      !renderData.isEditingText &&
      renderData.transformIds.length === 1 &&
      renderData.sizeLabelViewportRect
        ? {
            left: clampToolbarCenter(
              renderData.sizeLabelViewportRect.x + renderData.sizeLabelViewportRect.width / 2,
              overlaySize.width,
              isRenamingSelection ? 150 : 126,
            ),
            top:
              renderData.sizeLabelViewportRect.y - CONTEXT_TOOLBAR_HEIGHT - 10 >= 4
                ? renderData.sizeLabelViewportRect.y - CONTEXT_TOOLBAR_HEIGHT - 10
                : renderData.sizeLabelViewportRect.y + renderData.sizeLabelViewportRect.height + 10,
          }
        : null
    ), [
      overlaySize.width,
      isRenamingSelection,
      toolbarActive,
      props.canvasStageActive,
      renderData.isDragging,
      renderData.isEditingText,
      renderData.sizeLabelViewportRect,
      renderData.transformIds.length,
    ]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const adapter = createToolingRendererAdapter(TOOLING_RENDERER_KIND);
      adapterRef.current = adapter;
      void adapter.mount(host);
      return () => {
        adapter.destroy();
        if (adapterRef.current === adapter) adapterRef.current = null;
      };
    }, []);

    useLayoutEffect(() => {
      const target = hostRef.current?.parentElement;
      if (!target) return;

      const readRect = (): ToolingHostRect => {
        const rect = target.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
      };

      const changed = (next: ToolingHostRect, prev: ToolingHostRect): boolean =>
        Math.abs(next.left - prev.left) > 0.01 ||
        Math.abs(next.top - prev.top) > 0.01 ||
        Math.abs(next.width - prev.width) > 0.01 ||
        Math.abs(next.height - prev.height) > 0.01;

      const sync = () => {
        animationFrameRef.current = null;
        const next = readRect();
        setHostRect((prev) => (changed(next, prev) ? next : prev));
      };

      const scheduleSync = () => {
        if (animationFrameRef.current !== null) return;
        animationFrameRef.current = globalThis.requestAnimationFrame(sync);
      };

      sync();
      const observer = new ResizeObserver(scheduleSync);
      observer.observe(target);
      globalThis.addEventListener("resize", scheduleSync);
      globalThis.visualViewport?.addEventListener("resize", scheduleSync);
      globalThis.visualViewport?.addEventListener("scroll", scheduleSync);

      return () => {
        observer.disconnect();
        globalThis.removeEventListener("resize", scheduleSync);
        globalThis.visualViewport?.removeEventListener("resize", scheduleSync);
        globalThis.visualViewport?.removeEventListener("scroll", scheduleSync);
        if (animationFrameRef.current !== null) {
          globalThis.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, []);

    useLayoutEffect(() => {
      geometryRef.current = renderData.hitGeometry;
      adapterRef.current?.render({
        left: hostRect.left,
        top: hostRect.top,
        width: overlaySize.width,
        height: overlaySize.height,
        outlines: renderData.outlines,
        resizeBox: renderData.resizeBox,
        radiusHandlePositions: renderData.radiusHandlePositions,
        guides: props.guides,
        viewportTransform: t,
        marqueeRect: props.marqueeRect,
        dropTarget: renderData.dropTarget,
      });
    }, [
      hostRect.left,
      hostRect.top,
      overlaySize.height,
      overlaySize.width,
      props.guides,
      props.marqueeRect,
      renderData,
      t,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        hitTest(viewportX: number, viewportY: number): ToolingHit {
          return hitTestTooling(viewportX, viewportY, geometryRef.current);
        },
      }),
      [],
    );

    return (
      <div
        ref={hostRef}
        style={TOOLING_HOST_STYLE}
      >
        {sizeLabel ? (
          <div
            className="selection-size-tag"
            style={{
              left: sizeLabel.left,
              top: sizeLabel.top,
            }}
          >
            {sizeLabel.text}
          </div>
        ) : null}

        {contextualToolbar ? (
          <div
            key={isRenamingSelection ? "rename" : String(contextToolbarModifierDown)} // remount on toggle to replay animation
            ref={toolbarRef}
            className={`context-toolbar${isRenamingSelection ? " context-toolbar--rename" : ""}`}
            style={{
              left: contextualToolbar.left,
              top: contextualToolbar.top,
            }}
            onPointerDown={stopToolbarPointer}
            onContextMenu={(event) => event.preventDefault()}
          >
            {isRenamingSelection ? (
              <form
                className="context-toolbar-rename-form"
                onPointerDown={stopMenuPointer}
                onClick={(event) => event.stopPropagation()}
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  saveRename();
                }}
              >
                <input
                  ref={renameInputRef}
                  className="context-toolbar-name-input"
                  value={renameDraft}
                  aria-label="Element name"
                  onChange={(event) => setRenameDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                />
                <div className="context-toolbar-rename-actions">
                  <button
                    type="submit"
                    className="context-toolbar-btn context-toolbar-rename-btn"
                    aria-label="Save name"
                    title="Save"
                  >
                    <Check size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    className="context-toolbar-btn context-toolbar-rename-btn"
                    aria-label="Cancel rename"
                    title="Cancel"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelRename();
                    }}
                  >
                    <X size={14} strokeWidth={1.9} />
                  </button>
                </div>
              </form>
            ) : contextTools.map((tool, i) =>
              tool === "divider" ? (
                <div key={`div-${i}`} className="context-toolbar-divider" aria-hidden />
              ) : (
                <div key={tool.id} className="context-toolbar-tool">
                  <button
                    type="button"
                    className={[
                      "context-toolbar-btn",
                      tool.active ? "is-active" : "",
                      tool.destructive ? "is-danger" : "",
                    ].filter(Boolean).join(" ")}
                    aria-label={tool.label}
                    title={tool.label}
                    onPointerDown={stopToolbarPointer}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleToolClick(tool.id);
                    }}
                  >
                    {tool.icon}
                  </button>
                  {tool.id === "text-style" && openPanel === "text-style" && selectedNode?.type === "text" ? (
                    <div
                      className="context-toolbar-menu"
                      onPointerDown={stopMenuPointer}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="context-toolbar-menu-section">
                        <label className="context-toolbar-menu-label" htmlFor="context-toolbar-font-size">
                          Size
                        </label>
                        <select
                          id="context-toolbar-font-size"
                          className="context-toolbar-select"
                          value={selectedFontSize}
                          onPointerDown={stopMenuPointer}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            applyTextFontSize(Number(event.currentTarget.value));
                          }}
                        >
                          {fontSizeSelectOptions.map((fontSize) => (
                            <option key={fontSize} value={fontSize}>
                              {fontSize}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="context-toolbar-menu-section">
                        <label className="context-toolbar-menu-label" htmlFor="context-toolbar-font-family">
                          Font
                        </label>
                        <select
                          id="context-toolbar-font-family"
                          className="context-toolbar-select"
                          value={selectedFontFamily}
                          onPointerDown={stopMenuPointer}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            applyTextFontFamily(event.currentTarget.value);
                          }}
                        >
                          {fontFamilySelectOptions.map((font) => (
                            <option key={font.value} value={font.value}>
                              {font.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                  {tool.id === "layout-flex" && openPanel === "layout" && selectedNode?.type === "rect" ? (
                    <div
                      className="context-toolbar-menu context-toolbar-menu--layout"
                      onPointerDown={stopMenuPointer}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="context-toolbar-menu-section">
                        <label className="context-toolbar-menu-label" htmlFor="context-toolbar-display">
                          Display
                        </label>
                        <select
                          id="context-toolbar-display"
                          className="context-toolbar-select"
                          value={selectedNode.styles.display ?? "block"}
                          onPointerDown={stopMenuPointer}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            setLayoutDisplay(event.currentTarget.value as ElementStyles["display"]);
                          }}
                        >
                          <option value="block">Block</option>
                          <option value="flex">Flex</option>
                        </select>
                      </div>
                      <div className="context-toolbar-menu-section">
                        <label className="context-toolbar-menu-label" htmlFor="context-toolbar-justify">
                          Horizontal
                        </label>
                        <select
                          id="context-toolbar-justify"
                          className="context-toolbar-select"
                          value={selectedJustifyContent}
                          onPointerDown={stopMenuPointer}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            applyLayoutStyle({
                              display: "flex",
                              justifyContent: event.currentTarget.value,
                            });
                          }}
                        >
                          {JUSTIFY_CONTENT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="context-toolbar-menu-section">
                        <label className="context-toolbar-menu-label" htmlFor="context-toolbar-align">
                          Vertical
                        </label>
                        <select
                          id="context-toolbar-align"
                          className="context-toolbar-select"
                          value={selectedAlignItems}
                          onPointerDown={stopMenuPointer}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            applyLayoutStyle({
                              display: "flex",
                              alignItems: event.currentTarget.value,
                            });
                          }}
                        >
                          {ALIGN_ITEMS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    );
  },
);

export const CanvasToolingLayer = memo(CanvasToolingLayerImpl);
