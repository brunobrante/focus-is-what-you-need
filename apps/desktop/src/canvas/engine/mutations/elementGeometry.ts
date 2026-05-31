import { getElementDefinition } from "../elementDefinitions";
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
  const c = getElementDefinition(node.type).capabilities.constraints;
  const minW = c.width.min;
  const maxW = Math.min(parentSize.width, c.width.max ?? parentSize.width);
  const minH = c.height.min;
  const maxH = Math.min(parentSize.height, c.height.max ?? parentSize.height);
  node.width = roundPixel(clamp(patch.width ?? node.width, minW, maxW));
  node.height = roundPixel(clamp(patch.height ?? node.height, minH, maxH));
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
  const def = getElementDefinition(node.type).capabilities;
  if (styles.borderRadius !== undefined) {
    if (def.radiusRole === "corner") {
      node.styles.borderRadius = roundPixel(clampBorderRadiusForSize(styles.borderRadius, node.width, node.height));
    } else if (def.radiusRole === "ratio" && def.constraints.radius) {
      const { min, max } = def.constraints.radius;
      node.styles.borderRadius = roundPixel(clamp(styles.borderRadius, min, max ?? styles.borderRadius));
    }
  }
  return next;
}
