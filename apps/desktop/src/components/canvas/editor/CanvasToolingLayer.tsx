import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { filterTopLevelIds, getCommonParentId, getSelectionBox } from "@/lib/editor/geometry";
import { useEditor } from "@/lib/editor/store";
import type { CanvasDocument, Point, Rect } from "@/lib/editor/types";
import type { RadiusCorner, ToolingGeometry, ToolingHit } from "./canvasToolingHitTest";
import { hitTestTooling } from "./canvasToolingHitTest";
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
import type { ToolingDropTargetCommand, ToolingRendererAdapter } from "./toolingRenderAdapter";

export type { RadiusCorner } from "./canvasToolingHitTest";

export type CanvasToolingRef = {
  hitTest: (viewportX: number, viewportY: number) => ToolingHit;
};

export type CanvasToolingLayerProps = {
  viewportTransform: ViewportTransform;
  suppressHover: boolean;
  interactionType: string | null;
  marqueeRect: Rect | null;
  dropTargetId: string | null;
};

function computeTransformIds(doc: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(doc, selectedIds).filter((id) => {
    const node = doc.elements[id];
    return Boolean(node && !node.locked && node.visible !== false);
  });
}

function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
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

function clampToolbarCenter(x: number, viewportWidth: number): number {
  const halfW = 90; // ~half of the toolbar's approximate width
  const pad = 8;
  if (viewportWidth <= (halfW + pad) * 2) return viewportWidth / 2;
  return Math.min(Math.max(x, halfW + pad), viewportWidth - halfW - pad);
}

type ContextTool = { id: string; label: string; icon: React.ReactNode } | "divider";

const CONTEXT_TOOLS: ContextTool[] = [
  {
    id: "edit",
    label: "Editar",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: "duplicate",
    label: "Duplicar",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  },
  {
    id: "wrap",
    label: "Agrupar",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
      </svg>
    ),
  },
  "divider",
  {
    id: "forward",
    label: "Para frente",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="8" width="12" height="12" rx="1.5" />
        <rect x="4" y="4" width="12" height="12" rx="1.5" strokeDasharray="2.5 2" />
      </svg>
    ),
  },
  {
    id: "backward",
    label: "Para trás",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="12" height="12" rx="1.5" />
        <rect x="8" y="8" width="12" height="12" rx="1.5" strokeDasharray="2.5 2" />
      </svg>
    ),
  },
  "divider",
  {
    id: "delete",
    label: "Excluir",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
];

const EMPTY_GEOMETRY: ToolingGeometry = {
  selectionBox: null,
  radiusHandlePositions: null,
  canResize: false,
  canRotate: false,
  hasRadiusHandles: false,
  cursorRotation: 0,
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

export const CanvasToolingLayer = forwardRef<CanvasToolingRef, CanvasToolingLayerProps>(
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
    const { state } = useEditor();
    const doc = state.document;
    const t = props.viewportTransform;

    const [altKeyDown, setAltKeyDown] = useState(false);
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Alt") setAltKeyDown(true); };
      const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Alt") setAltKeyDown(false); };
      const onBlur = () => setAltKeyDown(false);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", onBlur);
      };
    }, []);
    const overlaySize = {
      width: hostRect.width,
      height: hostRect.height,
    };

    const isEditingText = Boolean(state.editingTextId);
    const isDragging =
      props.interactionType === "drag" || props.interactionType === "draw";
    const isRadiusDragging = props.interactionType === "radius";
    const suppressHandles = isDragging || isEditingText;
    const visibleSelectedIds = state.selectedIds.filter(
      (id) => doc.elements[id]?.visible !== false,
    );
    const transformIds = computeTransformIds(doc, visibleSelectedIds);
    const sizeLabelCanvasRect = getSelectionBox(doc, transformIds);
    const sizeLabelViewportRect = unionRects(
      transformIds
        .map((id) => getElementViewportRect(doc, id, t))
        .filter((rect): rect is Rect => rect !== null),
    );
    const commonParentId =
      transformIds.length > 0 ? getCommonParentId(doc, transformIds) : undefined;
    const canSelectionResize =
      transformIds.length > 0 && commonParentId !== undefined;
    const canSelectionRotate = transformIds.length === 1;
    const radiusElement =
      transformIds.length === 1 ? doc.elements[transformIds[0]] : null;
    const radiusEligible = Boolean(
      radiusElement &&
        !radiusElement.locked &&
        (radiusElement.type === "rect" || radiusElement.type === "image"),
    );
    const radiusElementHovered = Boolean(
      radiusElement && state.hoveredId === radiusElement.id,
    );
    const showRadiusHandles = radiusEligible && (radiusElementHovered || isRadiusDragging);
    const hoveredEligibleId =
      !props.suppressHover &&
      !isEditingText &&
      state.hoveredId &&
      !state.selectedIds.includes(state.hoveredId) &&
      doc.elements[state.hoveredId]
        ? state.hoveredId
        : null;
    const dropTargetNode = props.dropTargetId ? doc.elements[props.dropTargetId] : null;
    const sizeLabel =
      !state.canvasStageActive &&
      !isDragging &&
      !isEditingText &&
      sizeLabelCanvasRect &&
      sizeLabelViewportRect
        ? {
            text: `${formatSizeValue(sizeLabelCanvasRect.width)} × ${formatSizeValue(sizeLabelCanvasRect.height)}`,
            left: clampLabelCenter(
              sizeLabelViewportRect.x + sizeLabelViewportRect.width / 2,
              overlaySize.width,
            ),
            top:
              sizeLabelViewportRect.y + sizeLabelViewportRect.height + 30 <= overlaySize.height
                ? sizeLabelViewportRect.y + sizeLabelViewportRect.height + 8
                : Math.max(0, sizeLabelViewportRect.y - 30),
          }
        : null;

    const CONTEXT_TOOLBAR_HEIGHT = 36;
    const contextualToolbar =
      altKeyDown &&
      !state.canvasStageActive &&
      !isDragging &&
      !isEditingText &&
      transformIds.length === 1 &&
      sizeLabelViewportRect
        ? {
            left: clampToolbarCenter(
              sizeLabelViewportRect.x + sizeLabelViewportRect.width / 2,
              overlaySize.width,
            ),
            top:
              sizeLabelViewportRect.y - CONTEXT_TOOLBAR_HEIGHT - 10 >= 4
                ? sizeLabelViewportRect.y - CONTEXT_TOOLBAR_HEIGHT - 10
                : sizeLabelViewportRect.y + sizeLabelViewportRect.height + 10,
          }
        : null;

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
      const selectionBox =
        transformIds.length === 1
          ? transformViewportBoxes[0] ?? null
          : boxFromRects(transformViewportRects);
      const canResize = Boolean(selectionBox && canSelectionResize);
      const canRotate = Boolean(selectionBox && canSelectionRotate);

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

      const hoverRect = hoveredEligibleId ? resolveRect(hoveredEligibleId) : null;
      const hoverBox = hoveredEligibleId ? resolveBox(hoveredEligibleId) : null;
      const groupRect =
        !state.canvasStageActive && !isDragging && selectedViewportRects.length > 1
          ? unionRects(selectedViewportRects)
          : null;
      const groupBox = groupRect ? rectToToolingBox(groupRect) : null;
      const renderedSelectedBoxes =
        !state.canvasStageActive && !isDragging ? selectedViewportBoxes : [];

      const canvasRect = state.canvasStageActive
        ? canvasRectToViewport(
            { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height },
            t,
          )
        : null;
      const canvasBox = canvasRect ? rectToToolingBox(canvasRect) : null;

      const dropTargetRect =
        dropTargetNode && props.dropTargetId ? resolveRect(props.dropTargetId) : null;
      const dropTarget: ToolingDropTargetCommand | null =
        dropTargetNode && dropTargetRect
          ? {
              rect: dropTargetRect,
              borderRadius: dropTargetNode.styles.borderRadius ?? 0,
              displayZoom: t.displayZoom,
            }
          : null;

      if (state.canvasStageActive) {
        geometryRef.current = {
          selectionBox: canvasBox,
          radiusHandlePositions: null,
          canResize: true,
          canRotate: true,
          hasRadiusHandles: false,
          cursorRotation: doc.canvas.rotation ?? 0,
        };
      } else {
        geometryRef.current = {
          selectionBox: suppressHandles ? null : selectionBox,
          radiusHandlePositions: suppressHandles ? null : radiusHandlePositions,
          canResize: suppressHandles ? false : canResize,
          canRotate: suppressHandles ? false : canRotate,
          hasRadiusHandles: suppressHandles ? false : hasRadiusHandles,
          cursorRotation: selectionBox ? getToolingBoxRotation(selectionBox) : 0,
        };
      }

      adapterRef.current?.render({
        left: hostRect.left,
        top: hostRect.top,
        width: overlaySize.width,
        height: overlaySize.height,
        outlines: state.canvasStageActive
          ? [{ rect: canvasBox?.rect ?? null, corners: canvasBox?.corners, color: SELECTION_COLOR }]
          : [
              { rect: groupBox?.rect ?? null, corners: groupBox?.corners, color: SELECTION_COLOR, fill: GROUP_FILL },
              ...renderedSelectedBoxes.map((box) => ({ rect: box.rect, corners: box.corners, color: SELECTION_COLOR })),
              { rect: hoverBox?.rect ?? hoverRect, corners: hoverBox?.corners, color: HOVER_COLOR },
            ],
        resizeBox: state.canvasStageActive
          ? canvasBox
          : !suppressHandles && canResize
            ? selectionBox
            : null,
        radiusHandlePositions:
          !state.canvasStageActive && !suppressHandles && hasRadiusHandles
            ? radiusHandlePositions
            : null,
        guides: state.guides,
        viewportTransform: t,
        marqueeRect: props.marqueeRect,
        dropTarget,
      });
    });

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
            key={String(altKeyDown)} // remount on toggle to replay animation
            className="context-toolbar"
            style={{
              left: contextualToolbar.left,
              top: contextualToolbar.top,
            }}
          >
            {CONTEXT_TOOLS.map((tool, i) =>
              tool === "divider" ? (
                <div key={`div-${i}`} className="context-toolbar-divider" aria-hidden />
              ) : (
                <div
                  key={tool.id}
                  className="context-toolbar-btn"
                  role="presentation"
                  aria-label={tool.label}
                  title={tool.label}
                >
                  {tool.icon}
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    );
  },
);
