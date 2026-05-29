import {
  filterTopLevelIds,
  getAbsoluteRect,
  getElementAABB,
  getSelectionAABB,
  getSelectionBox,
} from "@/canvas/engine/geometry";
import type { CanvasDocument, Rect } from "@/canvas/engine/types";

export const DRAFT_BOUNDS: Rect = { x: -50000, y: -50000, width: 100000, height: 100000 };

export function getTransformIds(document: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(document, selectedIds).filter((id) => {
    const node = document.elements[id];
    return Boolean(node && !node.locked && node.visible !== false);
  });
}

export function getFallbackCanvasBounds(document: CanvasDocument): Rect {
  return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
}

export function getResizeBox(document: CanvasDocument, ids: string[]): Rect | null {
  if (ids.length === 1) return getAbsoluteRect(document, ids[0]);
  return getSelectionAABB(document, ids) ?? getSelectionBox(document, ids);
}

export function getDragBox(document: CanvasDocument, ids: string[]): Rect | null {
  return getSelectionAABB(document, ids) ?? getSelectionBox(document, ids);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function findElementsInMarquee(document: CanvasDocument, marquee: Rect): string[] {
  const result: string[] = [];
  function walk(ids: string[]) {
    for (const id of ids) {
      const node = document.elements[id];
      if (!node || node.visible === false) continue;
      const aabb = getElementAABB(document, id);
      if (aabb && rectsIntersect(marquee, aabb)) {
        result.push(id);
      }
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(document.rootIds);
  return result;
}
