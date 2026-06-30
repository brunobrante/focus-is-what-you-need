import type {
  PaintOverlayArgs,
  PaintCropsArgs,
} from "./types";
import { RESIZE_HANDLES, CORNER_HANDLES, RADIUS_HANDLES, HANDLE_DOT_SIZE, RADIUS_DOT_SIZE } from "./types";
import { MIN_TOOL_ZOOM } from "../types";
import {
  resizeHandleCenter,
  radiusHandleCenter,
  maxCropRadius,
  componentBoxInSubject,
  imageClientFromSubjectBox,
  intersectCropBoxes,
} from "./geometry";
import { nearFirstAnchor, type PenPath } from "./pen";

const PEN_COLOR = "#A78BFA";
// Matches the canvas selection box (canvasToolingRenderer SELECTION_COLOR) so the
// crop selection's outline, resize squares, and radius balls look identical.
const SELECTION_COLOR = "#0d99ff";

/**
 * Draws the Bézier pen path: the curve (filled when closed), the rubber-band to
 * the live cursor while building, the control handles, and the anchor dots. The
 * first anchor is highlighted when the cursor is near enough to close the path.
 * Everything is in content space — the caller's ctx is already translated to the
 * image origin and scaled by the zoom; sizes are pre-divided by the zoom.
 */
function drawPenPath(
  ctx: CanvasRenderingContext2D,
  path: PenPath,
  cursor: { x: number; y: number } | null,
  stroke: number,
  dotSize: number,
  closeTol: number,
) {
  const { anchors, closed } = path;
  if (anchors.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(anchors[0].x, anchors[0].y);
  const segs = closed ? anchors.length : anchors.length - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    ctx.bezierCurveTo(a.out?.x ?? a.x, a.out?.y ?? a.y, b.in?.x ?? b.x, b.in?.y ?? b.y, b.x, b.y);
  }
  if (closed) {
    ctx.closePath();
    ctx.fillStyle = "rgba(167,139,250,0.12)";
    ctx.fill();
  }
  ctx.lineWidth = 2 * stroke;
  ctx.strokeStyle = PEN_COLOR;
  ctx.stroke();

  // Rubber-band preview from the last anchor to the cursor while building.
  if (!closed && cursor) {
    const last = anchors[anchors.length - 1];
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.setLineDash([4 * stroke, 3 * stroke]);
    ctx.lineWidth = 1.5 * stroke;
    ctx.strokeStyle = "rgba(167,139,250,0.7)";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Control handles: a thin line from the anchor to a round handle dot.
  ctx.lineWidth = stroke;
  ctx.strokeStyle = "rgba(167,139,250,0.85)";
  for (const a of anchors) {
    for (const h of [a.in, a.out]) {
      if (!h) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      drawCircleHandle(ctx, h.x, h.y, dotSize * 0.42, PEN_COLOR, "#FFFFFF", stroke);
    }
  }

  // Anchor dots; highlight the first when the cursor is in closing range.
  for (const a of anchors) {
    drawSquareHandle(ctx, a.x, a.y, dotSize, PEN_COLOR, "#FFFFFF", stroke);
  }
  if (!closed && cursor && anchors.length >= 3 && nearFirstAnchor(path, cursor, closeTol)) {
    drawCircleHandle(ctx, anchors[0].x, anchors[0].y, dotSize * 0.85, "#FFFFFF", PEN_COLOR, 1.5 * stroke);
  }
}

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

/**
 * Traces a closed path through `pts` with quadratic curves between edge
 * midpoints, rounding the polygon into a smooth silhouette ("bordas com curvas").
 */
function drawSmoothClosedPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  ctx.beginPath();
  const first = mid(pts[n - 1], pts[0]);
  ctx.moveTo(first.x, first.y);
  for (let i = 0; i < n; i += 1) {
    const curr = pts[i];
    const m = mid(curr, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(curr.x, curr.y, m.x, m.y);
  }
  ctx.closePath();
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
    segmentationContour,
    penPath,
    penCursor,
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
    const sw = Math.max(0, selection.w);
    const sh = Math.max(0, selection.h);
    const radius = Math.min(selection.r ?? 0, maxCropRadius(selection));

    // Dim everything OUTSIDE the rounded selection by filling the image with a
    // rounded-rect hole (even-odd) — so the crop visibly takes the corner radius
    // instead of leaving the bounding-box corners bright.
    const visible = intersectCropBoxes(selection, { x: 0, y: 0, w: cssW, h: cssH });
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    if (!visible) {
      ctx.fillRect(0, 0, cssW, cssH);
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, cssW, cssH);
      ctx.roundRect(selection.x, selection.y, sw, sh, radius);
      ctx.fill("evenodd");
    }

    // Outline: native roundRect = true circular arcs, the same shape and 1px
    // #0d99ff line the canvas selection box draws.
    ctx.beginPath();
    ctx.roundRect(selection.x, selection.y, sw, sh, radius);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = SELECTION_COLOR;
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
      // White fill, blue border — the canvas handle styling (HANDLE_FILL +
      // SELECTION_COLOR), not the Builder's previous inverted blue squares.
      const handleSize = HANDLE_DOT_SIZE / safeZoom;
      for (const handle of CORNER_HANDLES) {
        const center = resizeHandleCenter(handle, selection);
        drawSquareHandle(ctx, center.x, center.y, handleSize, "#FFFFFF", SELECTION_COLOR, stroke);
      }
      if (args.isHoveringSelection) {
        const radiusRadius = RADIUS_DOT_SIZE / 2 / safeZoom;
        for (const handle of RADIUS_HANDLES) {
          const center = radiusHandleCenter(handle, selection, toolZoom);
          drawCircleHandle(ctx, center.x, center.y, radiusRadius, "#FFFFFF", SELECTION_COLOR, stroke);
        }
      }
    }
  }

  // "Adjust crop" silhouette preview: the segmentation contour (subject coords)
  // mapped into image-client space, drawn smooth and in a distinct green so it
  // reads as a refined, clickable cut area over the blue selection rectangle.
  if (
    segmentationContour &&
    segmentationContour.length >= 3 &&
    img.naturalWidth &&
    img.naturalHeight
  ) {
    const fx = img.clientWidth / img.naturalWidth;
    const fy = img.clientHeight / img.naturalHeight;
    const pts = segmentationContour.map((p) => ({ x: p.x * fx, y: p.y * fy }));
    drawSmoothClosedPath(ctx, pts);
    ctx.fillStyle = "rgba(61,220,132,0.12)";
    ctx.fill();
    ctx.lineWidth = 2 * stroke;
    ctx.strokeStyle = "#3DDC84";
    ctx.stroke();
  }

  if (penPath) {
    const dotSize = HANDLE_DOT_SIZE / safeZoom;
    const closeTol = 11 / safeZoom;
    drawPenPath(ctx, penPath, penCursor, stroke, dotSize, closeTol);
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
