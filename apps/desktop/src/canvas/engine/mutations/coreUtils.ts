import type { CanvasDocument, ElementNode } from "../types";

let fallbackId = 0;

export function createId(prefix = "el"): string {
  // Full UUID (not an 8-hex-char slice): a 32-bit id collides in practice on
  // large scenes / repeated duplication, and a collision silently overwrites a
  // live element and corrupts children arrays (L8).
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  fallbackId += 1;
  return `${prefix}-${fallbackId}`;
}

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  if (typeof structuredClone === "function") return structuredClone(document);
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

export function shallowCloneDocument(document: CanvasDocument): CanvasDocument {
  return {
    ...document,
    canvas: { ...document.canvas },
    rootIds: [...document.rootIds],
    elements: { ...document.elements },
  };
}

export function mutateElementShallow(doc: CanvasDocument, id: string): ElementNode | null {
  const source = doc.elements[id];
  if (!source) return null;
  const clone: ElementNode = { ...source };
  doc.elements[id] = clone;
  return clone;
}

export function mutateElementWithStyles(doc: CanvasDocument, id: string): ElementNode | null {
  const source = doc.elements[id];
  if (!source) return null;
  const clone: ElementNode = { ...source, styles: { ...source.styles } };
  doc.elements[id] = clone;
  return clone;
}
