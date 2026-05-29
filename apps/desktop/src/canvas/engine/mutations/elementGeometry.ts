import type { CanvasDocument, ElementStyles, Rect } from "../types";
import {
  clamp,
  clampBorderRadiusForSize,
  clampRotatedRectToBounds,
  getParentBounds,
  getParentSize,
  MIN_ELEMENT_SIZE,
  normalizeAngle,
  roundAngle,
  roundPixel,
} from "../geometry";

export function cloneDocument(document: CanvasDocument): CanvasDocument {
  if (typeof structuredClone === "function") return structuredClone(document);
  return JSON.parse(JSON.stringify(document)) as CanvasDocument;
}

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

export function updateElementGeometry(document: CanvasDocument, id: string, patch: Partial<Rect>): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  const parentSize = getParentSize(next, id);
  const width = Math.min(Math.max(patch.width ?? node.width, MIN_ELEMENT_SIZE), parentSize.width);
  const height = Math.min(Math.max(patch.height ?? node.height, MIN_ELEMENT_SIZE), parentSize.height);
  node.width = roundPixel(width);
  node.height = roundPixel(height);
  node.x = roundPixel(clamp(patch.x ?? node.x, 0, parentSize.width - node.width));
  node.y = roundPixel(clamp(patch.y ?? node.y, 0, parentSize.height - node.height));
  clampNodeToParentBounds(next, id);
  return next;
}

export function updateElementRotation(document: CanvasDocument, id: string, rotation: number): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  node.rotation = roundAngle(normalizeAngle(rotation));
  clampNodeToParentBounds(next, id);
  return next;
}

export function updateElementStyles(
  document: CanvasDocument,
  id: string,
  styles: Partial<ElementStyles>,
): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  node.styles = { ...node.styles, ...styles };
  if (styles.borderRadius !== undefined) {
    node.styles.borderRadius = roundPixel(clampBorderRadiusForSize(styles.borderRadius, node.width, node.height));
  }
  return next;
}
