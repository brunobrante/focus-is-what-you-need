import type { CanvasDocument } from "../types";
import { cloneDocument } from "./coreUtils";

// Group the ids by the sibling list (parent children array / rootIds) each one
// lives in, so a multi-selection reorders within each list independently while
// preserving the selection's relative order (G12).
function groupBySiblingList(
  document: CanvasDocument,
  ids: string[],
): Map<string | null, Set<string>> {
  const groups = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const node = document.elements[id];
    if (!node) continue;
    const key = node.parentId ?? null;
    const group = groups.get(key) ?? new Set<string>();
    group.add(id);
    groups.set(key, group);
  }
  return groups;
}

function siblingList(document: CanvasDocument, parentId: string | null): string[] | null {
  if (parentId === null) return document.rootIds;
  return document.elements[parentId]?.children ?? null;
}

export function reorderElements(
  document: CanvasDocument,
  ids: string[],
  direction: "forward" | "backward",
): CanvasDocument {
  const groups = groupBySiblingList(document, ids);
  if (groups.size === 0) return document;
  const next = cloneDocument(document);
  let changed = false;
  for (const [parentId, selected] of groups) {
    const list = siblingList(next, parentId);
    if (!list) continue;
    // Step each selected item one slot toward the target, without letting the
    // block leapfrog itself: process from the leading edge, and skip an item
    // whose neighbor is also selected (the block moves as one unit).
    if (direction === "forward") {
      for (let i = list.length - 2; i >= 0; i--) {
        if (selected.has(list[i]) && !selected.has(list[i + 1])) {
          [list[i], list[i + 1]] = [list[i + 1], list[i]];
          changed = true;
        }
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        if (selected.has(list[i]) && !selected.has(list[i - 1])) {
          [list[i], list[i - 1]] = [list[i - 1], list[i]];
          changed = true;
        }
      }
    }
  }
  return changed ? next : document;
}

export function reorderElement(
  document: CanvasDocument,
  id: string,
  direction: "forward" | "backward",
): CanvasDocument {
  return reorderElements(document, [id], direction);
}

export function moveElementBefore(
  document: CanvasDocument,
  activeId: string,
  overId: string,
): CanvasDocument {
  const active = document.elements[activeId];
  const over = document.elements[overId];
  if (!active || !over || active.parentId !== over.parentId || activeId === overId) return document;
  const next = cloneDocument(document);
  const list = active.parentId ? next.elements[active.parentId].children : next.rootIds;
  const from = list.indexOf(activeId);
  const to = list.indexOf(overId);
  if (from === -1 || to === -1) return document;
  list.splice(from, 1);
  list.splice(from < to ? to - 1 : to, 0, activeId);
  return next;
}

export function bringElementsToFront(document: CanvasDocument, ids: string[]): CanvasDocument {
  const groups = groupBySiblingList(document, ids);
  if (groups.size === 0) return document;
  const next = cloneDocument(document);
  let changed = false;
  for (const [parentId, selected] of groups) {
    const list = siblingList(next, parentId);
    if (!list) continue;
    const reordered = [
      ...list.filter((id) => !selected.has(id)),
      ...list.filter((id) => selected.has(id)),
    ];
    if (reordered.some((id, index) => id !== list[index])) {
      list.splice(0, list.length, ...reordered);
      changed = true;
    }
  }
  return changed ? next : document;
}

export function sendElementsToBack(document: CanvasDocument, ids: string[]): CanvasDocument {
  const groups = groupBySiblingList(document, ids);
  if (groups.size === 0) return document;
  const next = cloneDocument(document);
  let changed = false;
  for (const [parentId, selected] of groups) {
    const list = siblingList(next, parentId);
    if (!list) continue;
    const reordered = [
      ...list.filter((id) => selected.has(id)),
      ...list.filter((id) => !selected.has(id)),
    ];
    if (reordered.some((id, index) => id !== list[index])) {
      list.splice(0, list.length, ...reordered);
      changed = true;
    }
  }
  return changed ? next : document;
}

export function bringToFront(document: CanvasDocument, id: string): CanvasDocument {
  return bringElementsToFront(document, [id]);
}

export function sendToBack(document: CanvasDocument, id: string): CanvasDocument {
  return sendElementsToBack(document, [id]);
}
