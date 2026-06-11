import type {
  CropBox,
  PaintOverlayArgs,
  PaintCropsArgs,
} from "./types";
import { RESIZE_HANDLES, CORNER_HANDLES, RADIUS_HANDLES, HANDLE_DOT_SIZE, RADIUS_DOT_SIZE } from "./types";
import { MIN_TOOL_ZOOM } from "../types";
import {
  resizeHandleCenter,
  radiusHandleCenter,
  componentBoxInSubject,
  imageClientFromSubjectBox,
  intersectCropBoxes,
} from "./geometry";

export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function roundedRectPath(
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

export function drawLabelBadge(
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

export function drawSizeBadge(
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
    '700 10.5px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const metrics = ctx.measureText(text);
  const padX = 8;
  const padY = 4;
  const ascent = metrics.actualBoundingBoxAscent || 9;
  const descent = metrics.actualBoundingBoxDescent || 2;
  const textHeight = ascent + descent;
  const width = metrics.width + padX * 2;
  const height = textHeight + padY * 2;
  const offset = 6;
  ctx.fillStyle = "#89C4FF";
  ctx.beginPath();
  roundedRectPath(ctx, -width / 2, offset, width, height, 5);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, 0, offset + padY + ascent);
  ctx.restore();
}

export function drawCircleHandle(
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

// A small circular "×" badge at a box corner, used to discard a proposal.
export function drawDiscardBadge(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  zoom: number,
) {
  const safeZoom = Math.max(MIN_TOOL_ZOOM, zoom);
  const scale = 1 / safeZoom;
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.scale(scale, scale);
  const radius = 8;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#A78BFA";
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1.5;
  const arm = 3.2;
  ctx.beginPath();
  ctx.moveTo(-arm, -arm);
  ctx.lineTo(arm, arm);
  ctx.moveTo(arm, -arm);
  ctx.lineTo(-arm, arm);
  ctx.stroke();
  ctx.restore();
}

export function drawSquareHandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
) {
  if (size <= 0) return;
  const half = size / 2;
  const r = size * 0.28;
  ctx.beginPath();
  roundedRectPath(ctx, cx - half, cy - half, size, size, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

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

export function paintCropsCanvas(args: PaintCropsArgs) {
  const {
    canvas,
    img,
    toolZoom,
    components,
    stackedComponents,
    activeSubject,
    rootComponentId,
    editingComponentId,
    showCropsOverlay,
    viewMode,
    overlayFill,
    overlayStroke,
    componentImageCache,
  } = args;

  const setup = prepareImageCanvas(canvas, img, toolZoom);
  if (!setup || !img) return;

  const { ctx } = setup;
  if (viewMode === "stack") {
    ctx.imageSmoothingEnabled = toolZoom <= MIN_TOOL_ZOOM;
    for (const component of stackedComponents) {
      if (component.id === editingComponentId) continue;
      const subjectBox = componentBoxInSubject(component.box, activeSubject);
      if (!subjectBox) continue;
      const rect = imageClientFromSubjectBox(subjectBox, img);
      if (!rect) continue;
      const cached = componentImageCache.get(component.id);
      if (cached && cached.complete && cached.naturalWidth) {
        ctx.drawImage(cached, rect.left, rect.top, rect.width, rect.height);
      }
    }
    return;
  }

  if (!showCropsOverlay) return;

  // The overlay is a guide for where you've already cropped *inside the element
  // you currently have open*. Only the direct children of that element are
  // shown — ancestors and unrelated crops would just clutter the view.
  const openedId = activeSubject.kind === "component" ? activeSubject.id : rootComponentId;
  const safeZoom = Math.max(MIN_TOOL_ZOOM, toolZoom);
  const stroke = 1 / safeZoom;

  for (const component of components) {
    if (component.parentId !== openedId) continue;
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
    ctx.fillStyle = overlayFill;
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = overlayStroke;
    ctx.stroke();
  }
}

export function paintOverlayCanvas(args: PaintOverlayArgs) {
  const {
    canvas,
    img,
    toolZoom,
    selection,
    selectionLocked,
    drawingPath,
    brushSize,
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
    proposedRegions,
  } = args;

  const setup = prepareImageCanvas(canvas, img, toolZoom);
  if (!setup || !img) return;
  const { ctx, cssW, cssH } = setup;

  const safeZoom = Math.max(MIN_TOOL_ZOOM, toolZoom);
  const stroke = 1 / safeZoom;

  if (viewMode === "stack") {
    const outlinedIds = new Set(
      [selectedComponentId, hoveredComponentId].filter((id): id is string => Boolean(id)),
    );
    for (const id of outlinedIds) {
      const outlined = stackedComponents.find((component) => component.id === id);
      if (!outlined) continue;
      const subjectBox = componentBoxInSubject(outlined.box, activeSubject);
      if (!subjectBox) continue;
      const rect = imageClientFromSubjectBox(subjectBox, img);
      if (!rect) continue;
      const highlighted =
        id === hoveredComponentId || (id === selectedComponentId && !hoveredComponentId);
      ctx.strokeStyle = "#4C8DFF";
      ctx.lineWidth = highlighted ? 1.5 * stroke : stroke;
      ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
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
      ctx.fillRect(visible.x + visible.w, visible.y, cssW - (visible.x + visible.w), visible.h);
      ctx.fillRect(0, visible.y + visible.h, cssW, cssH - (visible.y + visible.h));
    }

    const sw = Math.max(0, selection.w);
    const sh = Math.max(0, selection.h);
    ctx.beginPath();
    roundedRectPath(ctx, selection.x, selection.y, sw, sh, selection.r ?? 0);
    ctx.fillStyle = "rgba(100,180,255,0.06)";
    ctx.fill();
    ctx.lineWidth = 2.5 * stroke;
    ctx.strokeStyle = "#89C4FF";
    ctx.stroke();

    let badgeText: string;
    if (!selectionCrop) {
      badgeText = "outside image";
    } else if (selectionMatchesExistingCut && !editingComponentId) {
      badgeText = "area already cropped";
    } else {
      badgeText = `${Math.round(selectionCrop.w)} × ${Math.round(selectionCrop.h)}${
        selectionCrop.r ? ` · r ${Math.round(selectionCrop.r)}` : ""
      }`;
    }
    drawSizeBadge(ctx, badgeText, selection.x + sw / 2, selection.y + sh, toolZoom);

    if (selectionLocked) {
      const handleSize = HANDLE_DOT_SIZE / safeZoom;
      for (const handle of CORNER_HANDLES) {
        const center = resizeHandleCenter(handle, selection);
        drawSquareHandle(ctx, center.x, center.y, handleSize, "#89C4FF", "#FFFFFF", stroke);
      }
      if (args.isHoveringSelection) {
        const radiusRadius = RADIUS_DOT_SIZE / 2 / safeZoom;
        for (const handle of RADIUS_HANDLES) {
          const center = radiusHandleCenter(handle, selection, toolZoom);
          drawCircleHandle(ctx, center.x, center.y, radiusRadius, "#89C4FF", "#FFFFFF", stroke);
        }
      }
    }
  }

  // Florence-2 proposals: dashed purple boxes with a label, corner handles, and
  // a discard "×" — visually a sibling of the manual selection, but staged.
  if (proposedRegions && proposedRegions.length > 0) {
    for (const region of proposedRegions) {
      const { box } = region;
      const bw = Math.max(0, box.w);
      const bh = Math.max(0, box.h);
      ctx.fillStyle = "rgba(167,139,250,0.08)";
      ctx.fillRect(box.x, box.y, bw, bh);
      ctx.save();
      ctx.setLineDash([6 * stroke, 4 * stroke]);
      ctx.lineWidth = 2 * stroke;
      ctx.strokeStyle = "#A78BFA";
      ctx.strokeRect(box.x, box.y, bw, bh);
      ctx.restore();

      drawLabelBadge(ctx, region.label || "Region", box.x, box.y - 4 * stroke, toolZoom);

      const handleSize = HANDLE_DOT_SIZE / safeZoom;
      for (const handle of CORNER_HANDLES) {
        const center = resizeHandleCenter(handle, box);
        drawSquareHandle(ctx, center.x, center.y, handleSize, "#A78BFA", "#FFFFFF", stroke);
      }
      drawDiscardBadge(ctx, box.x + bw, box.y, toolZoom);
    }
  }

  if (drawingPath && drawingPath.points.length > 1) {
    ctx.strokeStyle = "#4C8DFF";
    ctx.lineWidth = Math.max(1, brushSize) * stroke;
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
