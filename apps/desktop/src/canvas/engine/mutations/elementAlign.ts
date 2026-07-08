// Align & distribute (G1). Pure document mutations, matching the elementOrder
// module's shape. Alignment operates on each element's axis-aligned bounding box
// (getElementAABB) — the Figma model, which aligns rotated elements by their
// visual box. Positions are moved by an absolute delta translated back into each
// element's parent-local space (un-rotating by the parent's effective rotation),
// so siblings under a rotated frame still align correctly.

import type { CanvasDocument, Rect } from "../types";
import {
  getAbsoluteRect,
  getEffectiveRotation,
  getElementAABB,
  rotatePoint,
  unionRects,
} from "../geometry";
import { cloneDocument } from "./coreUtils";
import { constrainElementInPlace } from "./elementHierarchy";

export type AlignEdge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

/** Movable = present and not locked. Locked nodes are left in place. */
function movableIds(document: CanvasDocument, ids: string[]): string[] {
  return ids.filter((id) => {
    const node = document.elements[id];
    return node && node.locked !== true;
  });
}

/** Absolute-space content rect a single-selected element aligns within: its
 *  parent's content area, or the canvas frame for a root element. */
function parentContentRect(document: CanvasDocument, id: string): Rect | null {
  const node = document.elements[id];
  if (!node) return null;
  if (!node.parentId) {
    return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
  }
  const parent = document.elements[node.parentId];
  const parentRect = getAbsoluteRect(document, node.parentId);
  if (!parent || !parentRect) return null;
  const bw = parent.styles.borderWidth ?? 0;
  return {
    x: parentRect.x + bw,
    y: parentRect.y + bw,
    width: Math.max(0, parentRect.width - bw * 2),
    height: Math.max(0, parentRect.height - bw * 2),
  };
}

/** Translate an absolute-space delta into `id`'s parent-local space and apply it. */
function moveByAbsoluteDelta(document: CanvasDocument, id: string, dxAbs: number, dyAbs: number): void {
  const node = document.elements[id];
  if (!node || (dxAbs === 0 && dyAbs === 0)) return;
  const parentRotation = node.parentId ? getEffectiveRotation(document, node.parentId) : 0;
  const local = parentRotation
    ? rotatePoint({ x: dxAbs, y: dyAbs }, { x: 0, y: 0 }, -parentRotation)
    : { x: dxAbs, y: dyAbs };
  node.x += local.x;
  node.y += local.y;
}

/**
 * Align the selection to a shared edge. With one element the reference is its
 * parent's content box; with several, the union of their bounding boxes.
 */
export function alignElements(
  document: CanvasDocument,
  ids: string[],
  edge: AlignEdge,
): CanvasDocument {
  // Every present element contributes to the reference bounds (locked ones act as
  // fixed anchors); only movable ones are repositioned.
  const present = ids.filter((id) => document.elements[id]);
  if (present.length === 0) return document;

  const rects = new Map<string, Rect>();
  for (const id of present) {
    const rect = getElementAABB(document, id);
    if (rect) rects.set(id, rect);
  }
  if (rects.size === 0) return document;

  const bounds =
    present.length === 1
      ? parentContentRect(document, present[0])
      : unionRects([...rects.values()]);
  if (!bounds) return document;

  const movable = new Set(movableIds(document, present));
  const next = cloneDocument(document);
  for (const id of present) {
    if (!movable.has(id)) continue;
    const rect = rects.get(id);
    if (!rect) continue;
    let dx = 0;
    let dy = 0;
    switch (edge) {
      case "left":
        dx = bounds.x - rect.x;
        break;
      case "right":
        dx = bounds.x + bounds.width - (rect.x + rect.width);
        break;
      case "hcenter":
        dx = bounds.x + bounds.width / 2 - (rect.x + rect.width / 2);
        break;
      case "top":
        dy = bounds.y - rect.y;
        break;
      case "bottom":
        dy = bounds.y + bounds.height - (rect.y + rect.height);
        break;
      case "vcenter":
        dy = bounds.y + bounds.height / 2 - (rect.y + rect.height / 2);
        break;
    }
    moveByAbsoluteDelta(next, id, dx, dy);
  }
  return next;
}

/**
 * Nudge the selection by a canvas-space delta (arrow-key nudge, G2). The delta is
 * translated into each element's parent-local space and each moved element is
 * re-clamped inside its parent. Locked elements are left in place.
 */
export function nudgeElements(
  document: CanvasDocument,
  ids: string[],
  dxAbs: number,
  dyAbs: number,
): CanvasDocument {
  const movable = movableIds(document, ids);
  if (movable.length === 0 || (dxAbs === 0 && dyAbs === 0)) return document;
  const next = cloneDocument(document);
  for (const id of movable) {
    moveByAbsoluteDelta(next, id, dxAbs, dyAbs);
    constrainElementInPlace(next, id);
  }
  return next;
}

/**
 * Distribute the selection so the gaps between adjacent bounding boxes are equal
 * along the axis (Figma's "distribute spacing"). The two extreme elements stay
 * put. Needs at least three elements.
 */
export function distributeElements(
  document: CanvasDocument,
  ids: string[],
  axis: DistributeAxis,
): CanvasDocument {
  const targets = movableIds(document, ids);
  if (targets.length < 3) return document;

  const entries: Array<{ id: string; rect: Rect }> = [];
  for (const id of targets) {
    const rect = getElementAABB(document, id);
    if (rect) entries.push({ id, rect });
  }
  if (entries.length < 3) return document;

  const horizontal = axis === "horizontal";
  const start = (r: Rect) => (horizontal ? r.x : r.y);
  const size = (r: Rect) => (horizontal ? r.width : r.height);

  entries.sort((a, b) => start(a.rect) - start(b.rect));
  const first = entries[0].rect;
  const last = entries[entries.length - 1].rect;
  const span = start(last) + size(last) - start(first);
  const totalSize = entries.reduce((sum, e) => sum + size(e.rect), 0);
  const gap = (span - totalSize) / (entries.length - 1);

  const next = cloneDocument(document);
  let cursor = start(first);
  for (const entry of entries) {
    const targetStart = cursor;
    const delta = targetStart - start(entry.rect);
    if (horizontal) moveByAbsoluteDelta(next, entry.id, delta, 0);
    else moveByAbsoluteDelta(next, entry.id, 0, delta);
    cursor += size(entry.rect) + gap;
  }
  return next;
}
