import {
  filterTopLevelIds,
  getAbsoluteRect,
  getElementTransformedCorners,
  getParentBounds,
  getSelectionAABB,
  getSelectionBox,
  isInsideInstance,
} from "@/canvas/engine/geometry";
import type { CanvasDocument, ElementNode, Point, Rect, ViewportMode } from "@/canvas/engine/types";

// Convex-polygon vs axis-aligned-rect overlap via the Separating Axis Theorem:
// the shapes intersect iff no candidate axis (the rect's two axes + the polygon's
// edge normals) separates their projections. Used so the marquee tests an
// element's *oriented* box, not its rotation-inflated AABB (M6).
function projectionsOverlap(a: readonly Point[], b: readonly Point[], axisX: number, axisY: number): boolean {
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of a) {
    const d = p.x * axisX + p.y * axisY;
    if (d < minA) minA = d;
    if (d > maxA) maxA = d;
  }
  for (const p of b) {
    const d = p.x * axisX + p.y * axisY;
    if (d < minB) minB = d;
    if (d > maxB) maxB = d;
  }
  return maxA >= minB && maxB >= minA;
}

function orientedBoxIntersectsRect(corners: readonly Point[], rect: Rect): boolean {
  const rectCorners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  // Rect axes.
  if (!projectionsOverlap(corners, rectCorners, 1, 0)) return false;
  if (!projectionsOverlap(corners, rectCorners, 0, 1)) return false;
  // Polygon edge normals.
  for (let i = 0; i < corners.length; i += 1) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const axisX = -(p2.y - p1.y);
    const axisY = p2.x - p1.x;
    if (!projectionsOverlap(corners, rectCorners, axisX, axisY)) return false;
  }
  return true;
}

export function getTransformIds(document: CanvasDocument, selectedIds: string[]): string[] {
  return filterTopLevelIds(document, selectedIds).filter((id) => {
    const node = document.elements[id];
    // Children of a linked instance are read-only: selectable, but never moved/resized
    // (see Versioning.md §3.2). The instance root itself stays transformable.
    return Boolean(node && !node.locked && node.visible !== false && !isInsideInstance(document, id));
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
      // Locked nodes aren't marquee-selectable (matching the click paths), but
      // their unlocked descendants still are — so skip the match, keep recursing.
      const corners = node.locked ? null : getElementTransformedCorners(document, id);
      if (corners && orientedBoxIntersectsRect(corners, marquee)) {
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
