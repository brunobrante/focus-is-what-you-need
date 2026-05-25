import {
  filterTopLevelIds,
  getAbsoluteRect,
  getElementAABB,
  getSelectionAABB,
  getSelectionBox,
} from "@/lib/editor/geometry";
import type { CanvasDocument, Point, Rect } from "@/lib/editor/types";
import type { Size } from "@/lib/editor/viewport";

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

export function getCanvasSize(document: CanvasDocument): Size {
  return { width: document.canvas.width, height: document.canvas.height };
}

export function getViewportSize(element: HTMLElement): Size {
  return { width: element.clientWidth, height: element.clientHeight };
}

export function isPointInsideCanvas(point: Point, document: CanvasDocument): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= document.canvas.width && point.y <= document.canvas.height;
}

export function screenDeltaToCanvasDelta(deltaX: number, deltaY: number, rotation: number, zoom: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const safeZoom = Math.max(zoom, 0.0001);
  return {
    x: (deltaX * cos + deltaY * sin) / safeZoom,
    y: (-deltaX * sin + deltaY * cos) / safeZoom,
  };
}

export function canvasDeltaToScreenDelta(deltaX: number, deltaY: number, rotation: number, zoom: number): Point {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: (deltaX * cos - deltaY * sin) * zoom,
    y: (deltaX * sin + deltaY * cos) * zoom,
  };
}

export function getResizeBox(document: CanvasDocument, ids: string[]): Rect | null {
  if (ids.length === 1) return getAbsoluteRect(document, ids[0]);
  return getSelectionAABB(document, ids) ?? getSelectionBox(document, ids);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
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
        if (node.children.length > 0) walk(node.children);
      }
    }
  }
  walk(document.rootIds);
  return result;
}

export function getDragBox(document: CanvasDocument, ids: string[]): Rect | null {
  return getSelectionAABB(document, ids) ?? getSelectionBox(document, ids);
}
