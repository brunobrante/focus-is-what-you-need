import { isPointInElement } from "@/lib/editor/geometry";
import type { CanvasDocument, Point } from "@/lib/editor/types";

export function findChildAtPoint(document: CanvasDocument, parentId: string, point: Point): string | null {
  const parent = document.elements[parentId];
  if (!parent) return null;
  let bestId: string | null = null;
  function walk(ids: string[]): void {
    for (const id of ids) {
      const node = document.elements[id];
      if (!node || node.visible === false || node.locked) continue;
      if (isPointInElement(document, id, point)) {
        bestId = id;
      }
      walk(node.children);
    }
  }
  walk(parent.children);
  return bestId;
}

function canContainChildren(type: string): boolean {
  return type === "rect";
}

export function findDropTarget(document: CanvasDocument, point: Point, excludeIds: Set<string>): string | null {
  let bestId: string | null = null;
  function walk(ids: string[]): void {
    for (const id of ids) {
      if (excludeIds.has(id)) continue;
      const node = document.elements[id];
      if (!node || node.visible === false || node.locked) continue;
      if (isPointInElement(document, id, point)) {
        if (canContainChildren(node.type)) bestId = id;
        walk(node.children);
      }
    }
  }
  walk(document.rootIds);
  return bestId;
}

export function isDescendantOf(document: CanvasDocument, id: string, ancestorId: string): boolean {
  let parentId = document.elements[id]?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = document.elements[parentId]?.parentId ?? null;
  }
  return false;
}

export function retargetForIsolatedParent(
  document: CanvasDocument,
  isolatedParentId: string | null,
  targetId: string | null,
): string | null {
  if (!isolatedParentId || !targetId || !document.elements[isolatedParentId]) {
    return targetId;
  }
  if (targetId === isolatedParentId || isDescendantOf(document, targetId, isolatedParentId)) {
    return isolatedParentId;
  }
  return targetId;
}
