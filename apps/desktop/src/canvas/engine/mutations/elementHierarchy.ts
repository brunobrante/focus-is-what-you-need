import type { CanvasDocument, ElementNode } from "../types";
import {
  filterTopLevelIds,
  getAbsoluteCenter,
  getAbsoluteRect,
  getCommonParentId,
  getDescendantIds,
  getEffectiveRotation,
  getParentSize,
  getSelectionBox,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  rotatePoint,
  roundAngle,
  roundPixel,
} from "../geometry";
import { cloneDocument, createId } from "./coreUtils";
import { clampNodeToParentBounds } from "./elementGeometry";
import { DEFAULT_SHELL_BACKGROUND } from "./documentDefaults";

// Mutates `document.elements[id]` in place. The caller is responsible for owning
// `document` (e.g. via a single top-level `cloneDocument`) so this never leaks into
// a shared document.
export function constrainElementInPlace(document: CanvasDocument, id: string): void {
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
  // Defensive default for a genuinely missing field — not a value migration.
  // Legacy data shapes (old shell-background hex, the removed "container" type)
  // are handled by nuke-and-reseed on a SCHEMA_VERSION bump, not here. See the
  // "Data Lifecycle & Migrations" section in CLAUDE.md.
  if (!next.shellBackground) next.shellBackground = DEFAULT_SHELL_BACKGROUND;
  // Clamp parents before children: a child's size is clamped against its parent's
  // current size, so processing a child before its oversized parent would clamp it
  // against a stale (too-large) parent (L10). Walk roots-first, depth-first.
  const visited = new Set<string>();
  const clampSubtree = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = next.elements[id];
    if (!node) return;
    constrainElementInPlace(next, id);
    for (const childId of node.children) clampSubtree(childId);
  };
  for (const rootId of next.rootIds) clampSubtree(rootId);
  // Any element unreachable from a root (defensive) still gets clamped.
  for (const id of Object.keys(next.elements)) clampSubtree(id);
  return next;
}

export function insertElement(document: CanvasDocument, node: ElementNode): CanvasDocument {
  const next = cloneDocument(document);
  const parentId = node.parentId;
  next.elements[node.id] = node;
  // Fall back to root if the parent id is stale, instead of throwing on
  // next.elements[parentId].children (L9).
  const parent = parentId ? next.elements[parentId] : undefined;
  if (parent) parent.children.push(node.id);
  else {
    node.parentId = null;
    next.rootIds.push(node.id);
  }
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

/**
 * Move a single node so it becomes a child of `newParentId` (or a root when null),
 * inserted immediately before `beforeId` (or appended when `beforeId` is null).
 *
 * Reparenting (the parent actually changes) re-derives the node's local position and
 * rotation so it stays put visually — same maths as {@link reparentElements}. A
 * same-parent move is a pure reorder and leaves geometry untouched.
 *
 * Dropping a node into itself or into one of its own descendants would create a cycle,
 * so those are rejected (returns the document unchanged).
 */
export function moveElementToParent(
  document: CanvasDocument,
  id: string,
  newParentId: string | null,
  beforeId: string | null,
): CanvasDocument {
  const node = document.elements[id];
  if (!node) return document;
  if (newParentId === id) return document;
  if (newParentId && newParentId !== node.parentId) {
    // Block cycles: the new parent must not be the node itself or a descendant.
    if (new Set(getDescendantIds(document, id)).has(newParentId)) return document;
  }
  if (newParentId && !document.elements[newParentId]) return document;

  const sameParent = node.parentId === newParentId;
  const next = cloneDocument(document);
  const moved = next.elements[id];

  // Detach from the old list (parent's children, or rootIds).
  const oldList = node.parentId ? next.elements[node.parentId]?.children : next.rootIds;
  if (oldList) {
    const oldIndex = oldList.indexOf(id);
    if (oldIndex >= 0) oldList.splice(oldIndex, 1);
  }

  if (!sameParent) {
    const visualCenter = getAbsoluteCenter(document, id);
    const oldParentId = node.parentId;
    const oldParentRotation = oldParentId ? getEffectiveRotation(document, oldParentId) : 0;
    const newParentRotation = newParentId ? getEffectiveRotation(document, newParentId) : 0;
    moved.rotation = roundAngle(
      normalizeAngle((node.rotation ?? 0) + oldParentRotation - newParentRotation),
    );

    if (visualCenter) {
      let localCx = visualCenter.x;
      let localCy = visualCenter.y;
      if (newParentId) {
        const newParent = document.elements[newParentId];
        const parentVisualCenter = getAbsoluteCenter(document, newParentId);
        if (newParent && parentVisualCenter) {
          const dx = visualCenter.x - parentVisualCenter.x;
          const dy = visualCenter.y - parentVisualCenter.y;
          const localOffset = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -newParentRotation);
          const bw = newParent.styles.borderWidth ?? 0;
          localCx = newParent.width / 2 + localOffset.x - bw;
          localCy = newParent.height / 2 + localOffset.y - bw;
        }
      }
      moved.x = roundPixel(localCx - node.width / 2);
      moved.y = roundPixel(localCy - node.height / 2);
    }

    moved.parentId = newParentId;
  }

  // Insert into the new list at the requested position.
  const newList = newParentId ? next.elements[newParentId]?.children : next.rootIds;
  if (!newList) return document;
  let insertIndex = newList.length;
  if (beforeId) {
    const beforeIndex = newList.indexOf(beforeId);
    if (beforeIndex >= 0) insertIndex = beforeIndex;
  }
  newList.splice(insertIndex, 0, id);

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

  const cloneTree = (sourceId: string, parentId: string | null, isTopLevel: boolean): string | null => {
    const source = document.elements[sourceId];
    // Skip a stale child/source id instead of throwing on source.type (L9).
    if (!source) return null;
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
      if (clonedChildId) clone.children.push(clonedChildId);
    }
    return newId;
  };

  for (const sourceId of topLevelIds) {
    const source = document.elements[sourceId];
    if (!source) continue;
    const newId = cloneTree(sourceId, source.parentId, true);
    if (!newId) continue;
    selectedIds.push(newId);
    const list = source.parentId ? next.elements[source.parentId]?.children ?? next.rootIds : next.rootIds;
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

/**
 * Ungroup / unwrap (G7) — the inverse of {@link wrapElements}. Reparents the
 * container's children to its parent (grandparent), preserving each child's
 * absolute position and rotation via `reparentElements`, re-inserts them at the
 * container's slot in the sibling order, then removes the now-empty container.
 * Returns the freed children as the new selection.
 */
export function unwrapElement(
  document: CanvasDocument,
  id: string,
): { document: CanvasDocument; selectedIds: string[] } {
  const wrapper = document.elements[id];
  if (!wrapper) return { document, selectedIds: [] };
  const childIds = [...wrapper.children];
  const grandparentId = wrapper.parentId ?? null;

  if (childIds.length === 0) {
    return { document: deleteElements(document, [id]), selectedIds: [] };
  }

  const siblingList = grandparentId
    ? document.elements[grandparentId]?.children ?? []
    : document.rootIds;
  const wrapperIndex = siblingList.indexOf(id);

  let next = reparentElements(document, childIds, grandparentId);
  next = deleteElements(next, [id]); // the container is childless now

  // Place the freed children at the container's old slot, keeping their order.
  const list = grandparentId ? next.elements[grandparentId]?.children : next.rootIds;
  if (list) {
    const childSet = new Set(childIds);
    const filtered = list.filter((cid) => !childSet.has(cid));
    const insertAt = Math.min(Math.max(wrapperIndex, 0), filtered.length);
    filtered.splice(insertAt, 0, ...childIds);
    if (grandparentId) {
      const gp = next.elements[grandparentId];
      if (gp) gp.children = filtered;
    } else {
      next.rootIds = filtered;
    }
  }

  return { document: next, selectedIds: childIds };
}
