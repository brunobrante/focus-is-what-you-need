import {
  filterTopLevelIds,
  getAbsoluteRect,
  getElementAABB,
  getParentBounds,
  getSelectionAABB,
  getSelectionBox,
} from "@/canvas/engine/geometry";
import type { CanvasDocument, Rect, ViewportMode } from "@/canvas/engine/types";

export function getTransformIds(document: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(document, selectedIds).filter((id) => {
    const node = document.elements[id];
    return Boolean(node && !node.locked && node.visible !== false);
  });
}

export function getFallbackCanvasBounds(document: CanvasDocument): Rect {
  return { x: 0, y: 0, width: document.canvas.width, height: document.canvas.height };
}

export function getSurfaceCreationBounds(document: CanvasDocument, _viewportMode: ViewportMode): Rect {
  return getFallbackCanvasBounds(document);
}

export function getRootParentBounds(document: CanvasDocument, _viewportMode: ViewportMode): Rect {
  return getFallbackCanvasBounds(document);
}

export function getSurfaceParentBounds(
  document: CanvasDocument,
  viewportMode: ViewportMode,
  elementId: string | undefined,
): Rect {
  const node = elementId ? document.elements[elementId] : null;
  if (!node?.parentId) return getRootParentBounds(document, viewportMode);
  return getParentBounds(document, elementId);
}

export function getInteractionParentBounds(
  document: CanvasDocument,
  viewportMode: ViewportMode,
  commonParentId: string | null | undefined,
  elementId: string | undefined,
): Rect {
  if (commonParentId === undefined) return getSurfaceCreationBounds(document, viewportMode);
  return getSurfaceParentBounds(document, viewportMode, elementId);
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
        // Selecting a node implies its whole subtree moves with it, so we stop
        // here: never return a parent together with its descendants, and skip
        // descending into matched subtrees. A child that overflows a parent that
        // did NOT match is still reachable, because we only recurse when the
        // parent itself didn't intersect.
        result.push(id);
        continue;
      }
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(document.rootIds);
  return result;
}
