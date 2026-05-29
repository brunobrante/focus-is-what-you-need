import type { CanvasDocument } from "../types";

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  if (typeof structuredClone === "function") return structuredClone(document);
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

export function reorderElement(
  document: CanvasDocument,
  id: string,
  direction: "forward" | "backward",
): CanvasDocument {
  const node = document.elements[id];
  if (!node) return document;
  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index === -1) return document;
  const targetIndex = direction === "forward" ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= list.length) return document;
  list.splice(index, 1);
  list.splice(targetIndex, 0, id);
  return next;
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

export function bringToFront(document: CanvasDocument, id: string): CanvasDocument {
  const node = document.elements[id];
  if (!node) return document;
  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index === -1 || index === list.length - 1) return document;
  list.splice(index, 1);
  list.push(id);
  return next;
}

export function sendToBack(document: CanvasDocument, id: string): CanvasDocument {
  const node = document.elements[id];
  if (!node) return document;
  const next = cloneDocument(document);
  const list = node.parentId ? next.elements[node.parentId].children : next.rootIds;
  const index = list.indexOf(id);
  if (index <= 0) return document;
  list.splice(index, 1);
  list.unshift(id);
  return next;
}
