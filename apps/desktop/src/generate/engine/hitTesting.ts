import type { CropBox, ActiveSubject, SavedComponent, SelectionHit } from "./types";
import { CORNER_HANDLES, RADIUS_HANDLES, HANDLE_HIT_AREA } from "./types";
import { MIN_TOOL_ZOOM } from "../types";
import {
  resizeHandleCenter,
  radiusHandleCenter,
  componentBoxInSubject,
  imageClientFromSubjectBox,
} from "./geometry";

export function selectionHitTest(
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
  // Corners — small square hit area, checked before edges
  for (const handle of CORNER_HANDLES) {
    const center = resizeHandleCenter(handle, selection);
    if (Math.abs(point.x - center.x) <= resizeHit && Math.abs(point.y - center.y) <= resizeHit) {
      return { kind: "resize", handle };
    }
  }

  // Edges — full-length hit zone along each side
  const { x, y, w, h } = selection;
  const inX = point.x >= x && point.x <= x + w;
  const inY = point.y >= y && point.y <= y + h;
  if (inX && Math.abs(point.y - y) <= resizeHit)           return { kind: "resize", handle: "n" };
  if (inX && Math.abs(point.y - (y + h)) <= resizeHit)     return { kind: "resize", handle: "s" };
  if (inY && Math.abs(point.x - (x + w)) <= resizeHit)     return { kind: "resize", handle: "e" };
  if (inY && Math.abs(point.x - x) <= resizeHit)           return { kind: "resize", handle: "w" };

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

export function componentHitTest(
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
