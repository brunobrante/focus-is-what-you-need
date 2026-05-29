import type { CropBox, ActiveSubject, ResizeHandle, RadiusHandle } from "./types";
import { RADIUS_HANDLE_MIN_INSET } from "./types";
import { MIN_TOOL_ZOOM, SELECTION_MIN_SIZE } from "../types";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function intersectCropBoxes(a: CropBox, b: CropBox): CropBox | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function clampToolPan(
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

export function maxCropRadius(box: CropBox) {
  return Math.max(0, Math.min(box.w, box.h) / 2);
}

export function componentBoxInSubject(box: CropBox, subject: ActiveSubject): CropBox | null {
  if (subject.kind === "original") return box;
  const origin = subject.originBox;
  const left = Math.max(box.x, origin.x);
  const top = Math.max(box.y, origin.y);
  const right = Math.min(box.x + box.w, origin.x + origin.w);
  const bottom = Math.min(box.y + box.h, origin.y + origin.h);
  if (right <= left || bottom <= top) return null;
  return { x: left - origin.x, y: top - origin.y, w: right - left, h: bottom - top };
}

export function imageClientFromSubjectBox(
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

export function resizeHandleCenter(handle: ResizeHandle, box: CropBox): { x: number; y: number } {
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

export function radiusHandleCenter(
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

export function resizeCropBox(
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

  if (handle.includes("w")) left = clamp(point.x, minX, right - SELECTION_MIN_SIZE);
  if (handle.includes("e")) right = clamp(point.x, left + SELECTION_MIN_SIZE, maxX);
  if (handle.includes("n")) top = clamp(point.y, minY, bottom - SELECTION_MIN_SIZE);
  if (handle.includes("s")) bottom = clamp(point.y, top + SELECTION_MIN_SIZE, maxY);

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    r: Math.min(startBox.r ?? 0, (right - left) / 2, (bottom - top) / 2),
  };
}

export function moveCropBox(
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

export function roundCropBox(
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

export function resizeCursor(handle: ResizeHandle) {
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  return "ew-resize";
}

export function cropBoxFromPoints(
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

export function boundsFromDrawingPath(points: Array<{ x: number; y: number }>): CropBox | null {
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

export function getContentPoint(
  event: { clientX: number; clientY: number },
  img: HTMLImageElement | null,
  toolZoom: number,
): { x: number; y: number } | null {
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / toolZoom,
    y: (event.clientY - rect.top) / toolZoom,
  };
}

export function getImageContentBounds(img: HTMLImageElement | null): CropBox | null {
  if (!img || !img.clientWidth || !img.clientHeight) return null;
  return { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
}

export function getVisibleContentBounds(
  stage: HTMLDivElement | null,
  img: HTMLImageElement | null,
  toolZoom: number,
): CropBox | null {
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
