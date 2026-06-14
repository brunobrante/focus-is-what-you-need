import {
  filterTopLevelIds,
  getAbsoluteRect,
  getElementAABB,
  getParentBounds,
  getSelectionAABB,
  getSelectionBox,
} from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode, Rect, ViewportMode } from "@/canvas/engine/types";

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

/**
 * True when a color string would paint nothing — undefined, `transparent`,
 * `none`, or any rgba()/hsla() with a zero alpha channel.
 */
function isVisibleColor(color: string | undefined): boolean {
  if (!color) return false;
  const value = color.trim().toLowerCase();
  if (value === "transparent" || value === "none") return false;
  const fn = value.match(/(?:rgba?|hsla?)\(([^)]+)\)/);
  if (fn) {
    const parts = fn[1].split(",").map((part) => part.trim());
    const alpha = parts[3] !== undefined ? Number(parts[3]) : 1;
    return Number.isFinite(alpha) ? alpha > 0 : true;
  }
  return true;
}

/**
 * A node that paints nothing on its own: a `rect`/wrapper with no fill and no
 * visible border. Other element types (text, image, icon, shapes) always render
 * something, so they are never considered visually empty here.
 */
export function isVisuallyEmptyNode(node: ElementNode): boolean {
  if (node.type !== "rect") return false;
  if ((node.styles.opacity ?? 1) <= 0) return true;
  const hasFill = isVisibleColor(node.styles.background);
  const hasBorder = (node.styles.borderWidth ?? 0) > 0 && isVisibleColor(node.styles.borderColor);
  return !hasFill && !hasBorder;
}

/**
 * True when nothing inside this subtree renders any pixels — the node itself is
 * visually empty (or hidden) and every descendant is too. Dragging such a node
 * shows nothing on screen, so the tooling layer draws a ghost in its place.
 */
export function isSubtreeInvisible(document: CanvasDocument, id: string): boolean {
  const node = document.elements[id];
  if (!node) return true;
  if (node.visible === false) return true;
  if (!isVisuallyEmptyNode(node)) return false;
  return node.children.every((childId) => isSubtreeInvisible(document, childId));
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
