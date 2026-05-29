import type { CanvasDocument, ElementNode } from "../types";
import {
  clampRotatedRectToBounds,
  filterTopLevelIds,
  getAbsoluteCenter,
  getAbsoluteRect,
  getCommonParentId,
  getDescendantIds,
  getEffectiveRotation,
  getParentBounds,
  getParentSize,
  getSelectionBox,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  rotatePoint,
  roundAngle,
  roundPixel,
} from "../geometry";
import { cloneDocument, createId } from "./coreUtils";
import { DEFAULT_SHELL_BACKGROUND, DEFAULT_SHELL_PATTERN } from "./documentDefaults";

function clampNodeToParentBounds(document: CanvasDocument, id: string): void {
  const node = document.elements[id];
  if (!node) return;
  const parentBounds = getParentBounds(document, id);
  const clamped = clampRotatedRectToBounds(
    { x: parentBounds.x + node.x, y: parentBounds.y + node.y, width: node.width, height: node.height },
    node.rotation,
    parentBounds,
  );
  node.x = roundPixel(clamped.x - parentBounds.x);
  node.y = roundPixel(clamped.y - parentBounds.y);
}

// Mutates `document.elements[id]` in place. The caller is responsible for owning
// `document` (e.g. via a single top-level `cloneDocument`) so this never leaks into
// a shared document.
function constrainElementInPlace(document: CanvasDocument, id: string): void {
  const node = document.elements[id];
  if (!node) return;
  const parentSize = getParentSize(document, id);
  node.rotation = roundAngle(normalizeAngle(node.rotation ?? 0));
  node.width = Math.min(Math.max(node.width, MIN_ELEMENT_SIZE), parentSize.width);
  node.height = Math.min(Math.max(node.height, MIN_ELEMENT_SIZE), parentSize.height);
  node.x = roundPixel(Math.max(0, Math.min(node.x, parentSize.width - node.width)));
  node.y = roundPixel(Math.max(0, Math.min(node.y, parentSize.height - node.height)));
  clampNodeToParentBounds(document, id);
}

export function constrainElement(document: CanvasDocument, id: string): CanvasDocument {
  if (!document.elements[id]) return document;
  const next = cloneDocument(document);
  constrainElementInPlace(next, id);
  return next;
}

export function constrainAll(document: CanvasDocument): CanvasDocument {
  const next = cloneDocument(document);
  if (!next.shellBackground || (next.shellBackground === "#e9edf3" && !next.shellPattern)) {
    next.shellBackground = DEFAULT_SHELL_BACKGROUND;
  }
  next.shellPattern = next.shellPattern ?? DEFAULT_SHELL_PATTERN;
  for (const node of Object.values(next.elements)) {
    if ((node.type as string) === "container") node.type = "rect";
  }
  // Clone once, then clamp every node in place. Parents are only clamped within
  // their own parent (never resized), so clamping children after parents matches
  // the previous per-call behavior.
  for (const id of Object.keys(next.elements)) {
    constrainElementInPlace(next, id);
  }
  return next;
}

export function insertElement(document: CanvasDocument, node: ElementNode): CanvasDocument {
  const next = cloneDocument(document);
  const parentId = node.parentId;
  next.elements[node.id] = node;
  if (parentId) next.elements[parentId].children.push(node.id);
  else next.rootIds.push(node.id);
  constrainElementInPlace(next, node.id);
  return next;
}

export function reparentElements(
  document: CanvasDocument,
  ids: string[],
  newParentId: string | null,
): CanvasDocument {
  const next = cloneDocument(document);

  for (const id of ids) {
    const node = next.elements[id];
    if (!node) continue;
    if (node.parentId === newParentId) continue;

    const visualCenter = getAbsoluteCenter(document, id);
    if (!visualCenter) continue;

    const oldParentId = node.parentId;
    if (oldParentId) {
      const oldParent = next.elements[oldParentId];
      if (oldParent) oldParent.children = oldParent.children.filter((cid) => cid !== id);
    } else {
      next.rootIds = next.rootIds.filter((rid) => rid !== id);
    }

    const oldParentRotation = oldParentId ? getEffectiveRotation(document, oldParentId) : 0;
    const newParentRotation = newParentId ? getEffectiveRotation(document, newParentId) : 0;
    node.rotation = roundAngle(normalizeAngle((node.rotation ?? 0) + oldParentRotation - newParentRotation));

    let localCx = visualCenter.x;
    let localCy = visualCenter.y;

    if (newParentId) {
      const newParent = document.elements[newParentId];
      if (newParent) {
        const parentVisualCenter = getAbsoluteCenter(document, newParentId);
        if (parentVisualCenter) {
          const dx = visualCenter.x - parentVisualCenter.x;
          const dy = visualCenter.y - parentVisualCenter.y;
          const localOffset = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -newParentRotation);
          const bw = newParent.styles.borderWidth ?? 0;
          localCx = newParent.width / 2 + localOffset.x - bw;
          localCy = newParent.height / 2 + localOffset.y - bw;
        }
      }
    }

    node.parentId = newParentId;
    node.x = roundPixel(localCx - node.width / 2);
    node.y = roundPixel(localCy - node.height / 2);

    if (newParentId) {
      const newParent = next.elements[newParentId];
      if (newParent && !newParent.children.includes(id)) newParent.children.push(id);
    } else if (!next.rootIds.includes(id)) {
      next.rootIds.push(id);
    }
  }

  return next;
}

export function deleteElements(document: CanvasDocument, ids: string[]): CanvasDocument {
  const next = cloneDocument(document);
  const topLevelIds = filterTopLevelIds(document, ids);
  const idsToDelete = new Set<string>();
  for (const id of topLevelIds) {
    if (document.elements[id]?.locked) continue;
    idsToDelete.add(id);
    for (const descendantId of getDescendantIds(document, id)) idsToDelete.add(descendantId);
  }
  for (const id of idsToDelete) {
    const node = next.elements[id];
    if (!node) continue;
    const list = node.parentId ? next.elements[node.parentId]?.children : next.rootIds;
    if (list) {
      const index = list.indexOf(id);
      if (index >= 0) list.splice(index, 1);
    }
  }
  for (const id of idsToDelete) delete next.elements[id];
  return next;
}

export function duplicateElements(
  document: CanvasDocument,
  ids: string[],
): { document: CanvasDocument; selectedIds: string[] } {
  const next = cloneDocument(document);
  const topLevelIds = filterTopLevelIds(document, ids).filter((id) => !document.elements[id]?.locked);
  const selectedIds: string[] = [];

  const cloneTree = (sourceId: string, parentId: string | null, isTopLevel: boolean): string => {
    const source = document.elements[sourceId];
    const newId = createId(source.type);
    // `styles` is the only nested mutable object a node owns; `children` is
    // rebuilt by the recursion below. So this spread is a complete deep copy of a
    // node — no per-node document clone needed.
    const clone: ElementNode = {
      ...source,
      styles: { ...source.styles },
      id: newId, parentId, children: [],
      name: isTopLevel ? `${source.name} copy` : source.name,
      x: source.x + (isTopLevel ? 24 : 0),
      y: source.y + (isTopLevel ? 24 : 0),
    };
    next.elements[newId] = clone;
    for (const childId of source.children) {
      const clonedChildId = cloneTree(childId, newId, false);
      clone.children.push(clonedChildId);
    }
    return newId;
  };

  for (const sourceId of topLevelIds) {
    const source = document.elements[sourceId];
    const newId = cloneTree(sourceId, source.parentId, true);
    selectedIds.push(newId);
    const list = source.parentId ? next.elements[source.parentId].children : next.rootIds;
    const sourceIndex = list.indexOf(sourceId);
    list.splice(sourceIndex >= 0 ? sourceIndex + 1 : list.length, 0, newId);
  }

  return { document: next, selectedIds };
}

export function wrapElements(
  document: CanvasDocument,
  ids: string[],
): { document: CanvasDocument; wrapperId: string | null } {
  if (ids.length === 0) return { document, wrapperId: null };
  const box = getSelectionBox(document, ids);
  if (!box) return { document, wrapperId: null };
  const commonParentId = getCommonParentId(document, ids);
  let localX = box.x;
  let localY = box.y;
  if (commonParentId) {
    const parentAbsRect = getAbsoluteRect(document, commonParentId);
    const bw = document.elements[commonParentId]?.styles.borderWidth ?? 0;
    if (parentAbsRect) { localX = box.x - parentAbsRect.x - bw; localY = box.y - parentAbsRect.y - bw; }
  }
  const wrapperId = createId("wrapper");
  const wrapperNode: ElementNode = {
    id: wrapperId, type: "rect", parentId: commonParentId ?? null, children: [],
    name: "Wrapper", x: roundPixel(localX), y: roundPixel(localY),
    width: roundPixel(box.width), height: roundPixel(box.height),
    rotation: 0, visible: true, locked: false, styles: { opacity: 1 },
  };
  let next = cloneDocument(document);
  next.elements[wrapperId] = wrapperNode;
  const parentList = commonParentId ? next.elements[commonParentId].children : next.rootIds;
  const selectedIndices = ids.map((id) => parentList.indexOf(id)).filter((i) => i >= 0);
  parentList.splice(selectedIndices.length > 0 ? Math.min(...selectedIndices) : parentList.length, 0, wrapperId);
  next = reparentElements(next, ids, wrapperId);
  return { document: next, wrapperId };
}
