import type { CanvasDocument } from "../types";

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  if (typeof structuredClone === "function") return structuredClone(document);
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

export function updateElementText(document: CanvasDocument, id: string, content: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  node.content = content;
  return next;
}

export function updateElementImageSource(document: CanvasDocument, id: string, src: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node || node.type !== "image") return document;
  node.src = src.trim() || undefined;
  return next;
}

export function renameElement(document: CanvasDocument, id: string, name: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  node.name = name.trim() || node.name;
  return next;
}

export function setElementLocked(document: CanvasDocument, id: string, locked: boolean): CanvasDocument {
  const next = cloneDocument(document);
  if (next.elements[id]) next.elements[id].locked = locked;
  return next;
}

export function setElementVisible(document: CanvasDocument, id: string, visible: boolean): CanvasDocument {
  const next = cloneDocument(document);
  if (next.elements[id]) next.elements[id].visible = visible;
  return next;
}
