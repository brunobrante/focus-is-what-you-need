import { forwardRef, memo, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { filterTopLevelIds, getCommonParentId, getInstanceRootId, getParentDistanceMeasurements, getSelectionBox, isInsideInstance, unionRects } from "@/canvas/engine/geometry";
import { useHoveredId } from "@/canvas/engine/store";
import { getElementDefinition } from "@/canvas/engine/elementDefinitions";
import type { CanvasDocument, ElementNode, Point, Rect, ResizeHandle, SnapGuide } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import { isModifierCommandActive } from "@/domain/settings/resolve";
import type { GlobalSettings } from "@/domain/settings/types";
import type { CanvasDropTarget } from "./canvasStageTypes";
import type { RadiusCorner, ToolingGeometry, ToolingHit } from "./canvasHitTesting";
import { hitTestTooling } from "./canvasHitTesting";
import { computePathEditGeometry } from "./pathEditGeometry";
import {
  type ViewportTransform,
  GROUP_FILL,
  HOVER_COLOR,
  INSTANCE_HOVER_COLOR,
  INSTANCE_SELECTION_COLOR,
  RADIUS_MIN_ELEMENT_SCREEN,
  RESIZE_HANDLE_MIN_ELEMENT_SCREEN,
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
import { ContextToolbar } from "./ContextToolbar";
import type {
  ToolingDropTargetCommand,
  ToolingGhostCommand,
  ToolingOutlineCommand,
  ToolingParentDistanceCommand,
  ToolingPathEditCommand,
  ToolingRadiusLabelCommand,
  ToolingRendererAdapter,
  ToolingSizeLabelCommand,
} from "./toolingRenderAdapter";
import { isSubtreeInvisible } from "./canvasToolingUtils";

export type { RadiusCorner } from "./canvasHitTesting";

export type CanvasToolingRef = {
  hitTest: (viewportX: number, viewportY: number) => ToolingHit;
};

export type CanvasToolingLayerProps = {
  document: CanvasDocument;
  selectedIds: string[];
  editingTextId: string | null;
  pathEditId: string | null;
  penToolActive: boolean;
  scaleToolActive: boolean;
  canvasStageActive: boolean;
  guides: SnapGuide[];
  viewportTransform: ViewportTransform;
  suppressHover: boolean;
  interactionType: string | null;
  radiusDragCorner?: RadiusCorner | null;
  marqueeRect: Rect | null;
  dropTarget: CanvasDropTarget | null;
  onCommitDocument: (document: CanvasDocument, selectedIds?: string[]) => void;
  settings?: GlobalSettings;
};

function computeTransformIds(doc: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(doc, selectedIds).filter((id) => {
    const node = doc.elements[id];
    // Children of a linked instance are read-only: they keep a (purple) selection
    // outline but get no transform handles and cannot be dragged (Versioning.md §3.2).
    return Boolean(node && !node.locked && node.visible !== false && !isInsideInstance(doc, id));
  });
}

function formatSizeValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Size-label layout geometry, in CSS px. Hoisted out of the render body so the
// magic offsets live in one labelled place. (Context-toolbar layout geometry now
// lives in ContextToolbar.tsx.)
const SIZE_LABEL_EDGE_MARGIN = 38; // size-label clamp margin from the viewport edge

function clampLabelCenter(x: number, width: number): number {
  const margin = SIZE_LABEL_EDGE_MARGIN;
  if (width <= margin * 2) return width / 2;
  return Math.min(Math.max(x, margin), width - margin);
}

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
  scaleMode: false,
  allowedResizeHandles: null,
  pathEdit: null,
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

const RADIUS_CORNER_INDEX: Record<RadiusCorner, number> = { nw: 0, ne: 1, se: 2, sw: 3 };
const RADIUS_LABEL_GAP = 14;

function boxFromRects(rects: Rect[]): ToolingBox | null {
  const rect = unionRects(rects);
  return rect ? rectToToolingBox(rect) : null;
}

type ToolingRenderData = {
  transformIds: string[];
  sizeLabelCanvasRect: Rect | null;
  sizeLabelViewportRect: Rect | null;
  transformHandlesFit: boolean;
  hitGeometry: ToolingGeometry;
  outlines: ToolingOutlineCommand[];
  ghosts: ToolingGhostCommand[];
  resizeBox: ToolingBox | null;
  radiusHandlePositions: Point[] | null;
  radiusLabel: ToolingRadiusLabelCommand | null;
  dropTarget: ToolingDropTargetCommand | null;
  parentDistances: ToolingParentDistanceCommand | null;
  pathEdit: ToolingPathEditCommand | null;
  isInstanceSelection: boolean;
  isDragging: boolean;
  isEditingText: boolean;
};

const CanvasToolingLayerImpl = forwardRef<CanvasToolingRef, CanvasToolingLayerProps>(
  (props, ref) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const adapterRef = useRef<ToolingRendererAdapter | null>(null);
    const geometryRef = useRef<ToolingGeometry>(EMPTY_GEOMETRY);
    const animationFrameRef = useRef<number | null>(null);
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
    const [parentDistanceModifierDown, setParentDistanceModifierDown] = useState(false);
    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (isModifierCommandActive(event, settings, "canvas.selection.contextToolbar")) {
          setContextToolbarModifierDown(true);
        }
        if (isModifierCommandActive(event, settings, "canvas.overlay.parentDistances")) {
          setParentDistanceModifierDown(true);
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (!isModifierCommandActive(event, settings, "canvas.selection.contextToolbar")) {
          setContextToolbarModifierDown(false);
        }
        if (!isModifierCommandActive(event, settings, "canvas.overlay.parentDistances")) {
          setParentDistanceModifierDown(false);
        }
      };
      const onBlur = () => {
        setContextToolbarModifierDown(false);
        setParentDistanceModifierDown(false);
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
      if (!props.editingTextId) return;
      setContextToolbarModifierDown(false);
      setParentDistanceModifierDown(false);
    }, [props.editingTextId]);

    const overlaySize = useMemo(() => ({
      width: hostRect.width,
      height: hostRect.height,
    }), [hostRect.height, hostRect.width]);

    const renderData = useMemo<ToolingRenderData>(() => {
      const isEditingText = Boolean(props.editingTextId);
      const isDragging =
        props.interactionType === "drag" || props.interactionType === "draw";
      const isRadiusDragging = props.interactionType === "radius";
      const pathEditNode = props.pathEditId ? doc.elements[props.pathEditId] : null;
      const pathEditGeometry =
        pathEditNode && pathEditNode.type === "path"
          ? computePathEditGeometry(doc, pathEditNode, t, props.penToolActive)
          : null;
      const pathEditActive = pathEditGeometry !== null;
      // In path edit mode the box + resize/rotate/radius handles are hidden; only
      // the anchor/handle overlay is interactive.
      const suppressHandles = isDragging || isEditingText || pathEditActive;
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
      // Once the selection is too small on screen the square resize / rotation
      // handles would blanket it, so we drop them (keeping only the outline) —
      // mirroring how the radius balls are gated by RADIUS_MIN_ELEMENT_SCREEN,
      // just at a smaller threshold so the balls always vanish first. The
      // on-screen size grows as the user zooms in, so the handles reappear.
      const selectionScreenSize = selectionBox
        ? Math.min(selectionBox.rect.width, selectionBox.rect.height)
        : 0;
      const transformHandlesFit =
        selectionScreenSize >= RESIZE_HANDLE_MIN_ELEMENT_SCREEN;
      const canResize = Boolean(
        selectionBox && canSelectionResize && transformHandlesFit,
      );
      const canRotate = Boolean(
        selectionBox && canSelectionRotate && transformHandlesFit,
      );
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
          // A linked instance is read-only — its radius is owned by the master.
          // The root stays unlocked (so it can be moved as a whole), so guard on
          // instanceOf explicitly to drop the radius handles and their drag.
          !radiusElement.instanceOf &&
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
          // Per-corner radii place each ball at its own corner's offset (F4).
          const handleRadii =
            radiusElement.styles.cornerRadii ?? radiusElement.styles.borderRadius ?? 0;
          radiusHandlePositions = elemBox
            ? getOrientedRadiusHandlePositions(
                elemBox,
                handleRadii,
                t.displayZoom,
                isRadiusDragging ? 0 : undefined,
              )
            : getRadiusHandlePositions(
                elemRect,
                handleRadii,
                t.displayZoom,
                isRadiusDragging ? 0 : undefined,
              );
        }
      }

      // Value tag shown beside the dragged ball while adjusting the corner radius.
      let radiusLabel: ToolingRenderData["radiusLabel"] = null;
      if (
        isRadiusDragging &&
        hasRadiusHandles &&
        radiusHandlePositions &&
        props.radiusDragCorner &&
        radiusElement
      ) {
        const cornerIndex = RADIUS_CORNER_INDEX[props.radiusDragCorner];
        const ball = radiusHandlePositions[cornerIndex];
        if (ball) {
          const onLeftEdge =
            props.radiusDragCorner === "nw" || props.radiusDragCorner === "sw";
          radiusLabel = {
            text: formatSizeValue(
              radiusElement.styles.cornerRadii?.[cornerIndex] ??
                radiusElement.styles.borderRadius ??
                0,
            ),
            x: onLeftEdge ? ball.x - RADIUS_LABEL_GAP : ball.x + RADIUS_LABEL_GAP,
            centerY: ball.y,
            align: onLeftEdge ? "end" : "start",
          };
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
      const renderedSelected =
        !props.canvasStageActive && !isDragging
          ? visibleSelectedIds
              .map((id) => ({ id, box: resolveBox(id) }))
              .filter((entry): entry is { id: string; box: ToolingBox } => entry.box !== null)
          : [];

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
      const parentDistances =
        !props.canvasStageActive &&
        !isEditingText &&
        parentDistanceModifierDown &&
        transformIds.length === 1
          ? getParentDistanceMeasurements(doc, transformIds[0])
          : null;

      // The selection is an "external component" when every selected node is a linked
      // instance — then the whole selection chrome (outline + handles + size tag) is purple.
      const isInstanceSelection =
        transformIds.length > 0 &&
        transformIds.every((id) => Boolean(doc.elements[id]?.instanceOf));
      const selectionColor = isInstanceSelection ? INSTANCE_SELECTION_COLOR : SELECTION_COLOR;

      const hitGeometry = props.canvasStageActive
        ? {
            selectionBox: canvasBox,
            radiusHandlePositions: null,
            canResize: true,
            canRotate: true,
            hasRadiusHandles: false,
            cursorRotation: doc.canvas.rotation ?? 0,
            scaleMode: props.scaleToolActive,
            allowedResizeHandles: null,
            pathEdit: null,
          }
        : {
            selectionBox: suppressHandles ? null : selectionBox,
            radiusHandlePositions: suppressHandles ? null : radiusHandlePositions,
            canResize: suppressHandles ? false : canResize,
            canRotate: suppressHandles ? false : canRotate,
            hasRadiusHandles: suppressHandles ? false : hasRadiusHandles,
            cursorRotation: selectionBox ? getToolingBoxRotation(selectionBox) : 0,
            scaleMode: props.scaleToolActive,
            allowedResizeHandles: suppressHandles ? null : allowedResizeHandles,
            pathEdit: pathEditGeometry,
          };

      // While moving a selection, any dragged element whose whole subtree paints
      // nothing (e.g. an empty wrapper) is invisible — draw a ghost so the user
      // can see what they are dragging.
      const ghosts: ToolingGhostCommand[] =
        props.interactionType === "drag" && settings.canvas.shell.invisibleDragGhost
          ? transformIds.flatMap((id) => {
              if (!isSubtreeInvisible(doc, id)) return [];
              const box = resolveBox(id);
              if (!box) return [];
              return [
                {
                  rect: box.rect,
                  corners: box.corners,
                  borderRadius: doc.elements[id]?.styles.borderRadius ?? 0,
                  displayZoom: t.displayZoom,
                },
              ];
            })
          : [];

      return {
        transformIds,
        sizeLabelCanvasRect,
        sizeLabelViewportRect,
        transformHandlesFit,
        hitGeometry,
        ghosts,
        outlines: props.canvasStageActive
          ? [{ rect: canvasBox?.rect ?? null, corners: canvasBox?.corners, color: SELECTION_COLOR }]
          : [
              { rect: groupBox?.rect ?? null, corners: groupBox?.corners, color: SELECTION_COLOR, fill: GROUP_FILL },
              ...renderedSelected.map(({ id, box }) => ({
                rect: box.rect,
                corners: box.corners,
                // Purple for a linked instance AND everything inside it (read-only).
                color: getInstanceRootId(doc, id) ? INSTANCE_SELECTION_COLOR : SELECTION_COLOR,
              })),
              {
                rect: hoverBox?.rect ?? hoverRect,
                corners: hoverBox?.corners,
                // Purple hover for a linked instance and anything inside it.
                color: getInstanceRootId(doc, hoveredEligibleId) ? INSTANCE_HOVER_COLOR : HOVER_COLOR,
              },
            ],
        resizeBox: props.canvasStageActive
          ? canvasBox
          : !suppressHandles && canResize && selectionBox
            ? { ...selectionBox, allowedHandles: allowedResizeHandles, color: selectionColor }
            : null,
        radiusHandlePositions:
          !props.canvasStageActive && !suppressHandles && hasRadiusHandles
            ? radiusHandlePositions
            : null,
        radiusLabel,
        dropTarget,
        parentDistances,
        pathEdit: pathEditGeometry
          ? {
              anchors: pathEditGeometry.anchors.map((a) => ({
                point: a.point,
                inHandle: a.inHandle,
                outHandle: a.outHandle,
                selected: a.selected,
              })),
              segments: pathEditGeometry.segments.map((s) => s.samples),
              closeTarget: pathEditGeometry.closeTarget,
            }
          : null,
        isInstanceSelection,
        isDragging,
        isEditingText,
      };
      // Depend on selectedIdsKey (the joined-content string) instead of the
      // props.selectedIds array ref: the store can hand back a new array with the
      // same contents, and that should not rebuild all the outline geometry. The
      // body reads props.selectedIds, but its content is fully captured by the key.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      doc,
      hoveredId,
      props.canvasStageActive,
      props.dropTarget,
      props.editingTextId,
      props.pathEditId,
      props.penToolActive,
      props.interactionType,
      props.radiusDragCorner,
      selectedIdsKey,
      props.suppressHover,
      parentDistanceModifierDown,
      settings.canvas.shell.invisibleDragGhost,
      t,
    ]);

    const sizeLabel = useMemo<ToolingSizeLabelCommand | null>(() => (
      !props.canvasStageActive &&
      !renderData.isDragging &&
      !renderData.isEditingText &&
      // The WxH badge belongs to the resize chrome — when the element is too
      // small on screen and the resize handles are culled, the badge goes too.
      renderData.transformHandlesFit &&
      renderData.sizeLabelCanvasRect &&
      renderData.sizeLabelViewportRect
        ? {
            text: `${formatSizeValue(renderData.sizeLabelCanvasRect.width)} × ${formatSizeValue(renderData.sizeLabelCanvasRect.height)}`,
            centerX: clampLabelCenter(
              renderData.sizeLabelViewportRect.x + renderData.sizeLabelViewportRect.width / 2,
              overlaySize.width,
            ),
            top:
              renderData.sizeLabelViewportRect.y + renderData.sizeLabelViewportRect.height + 30 <= overlaySize.height
                ? renderData.sizeLabelViewportRect.y + renderData.sizeLabelViewportRect.height + 8
                : Math.max(0, renderData.sizeLabelViewportRect.y - 30),
            color: renderData.isInstanceSelection ? INSTANCE_SELECTION_COLOR : SELECTION_COLOR,
          }
        : null
    ), [
      overlaySize.height,
      overlaySize.width,
      props.canvasStageActive,
      renderData.isDragging,
      renderData.isEditingText,
      renderData.isInstanceSelection,
      renderData.transformHandlesFit,
      renderData.sizeLabelCanvasRect,
      renderData.sizeLabelViewportRect,
    ]);

    // Single-selection node feeding the context toolbar. All toolbar UI state and
    // engine-action handlers live in ContextToolbar; the tooling layer only computes
    // the geometry/visibility inputs it needs.
    const selectedId = renderData.transformIds.length === 1 ? renderData.transformIds[0] : null;
    const selectedNode = selectedId ? doc.elements[selectedId] ?? null : null;

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
        ghosts: renderData.ghosts,
        resizeBox: renderData.resizeBox,
        radiusHandlePositions: renderData.radiusHandlePositions,
        guides: props.guides,
        viewportTransform: t,
        marqueeRect: props.marqueeRect,
        dropTarget: renderData.dropTarget,
        parentDistances: renderData.parentDistances,
        sizeLabel,
        radiusLabel: renderData.radiusLabel,
        pathEdit: renderData.pathEdit,
      });
    }, [
      hostRect.left,
      hostRect.top,
      overlaySize.height,
      overlaySize.width,
      props.guides,
      props.marqueeRect,
      renderData,
      sizeLabel,
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
        <ContextToolbar
          doc={doc}
          selectedId={selectedId}
          selectedNode={selectedNode}
          selectedIdsKey={selectedIdsKey}
          fallbackSelectedIds={props.selectedIds}
          canvasStageActive={props.canvasStageActive}
          isDragging={renderData.isDragging}
          isEditingText={renderData.isEditingText}
          transformIdsLength={renderData.transformIds.length}
          sizeLabelViewportRect={renderData.sizeLabelViewportRect}
          overlayWidth={overlaySize.width}
          overlayHeight={overlaySize.height}
          editingTextId={props.editingTextId}
          contextToolbarModifierDown={contextToolbarModifierDown}
          onCommitDocument={props.onCommitDocument}
        />
      </div>
    );
  },
);

export const CanvasToolingLayer = memo(CanvasToolingLayerImpl);
