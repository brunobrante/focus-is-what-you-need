import type { CanvasDocument, CanvasProperties, ElementNode, ElementSizing, ElementStyles } from "./types";

function arrayValuesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function elementStylesEqual(a: ElementStyles, b: ElementStyles): boolean {
  return (
    a.background === b.background &&
    a.color === b.color &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.fontWeight === b.fontWeight &&
    a.textAlign === b.textAlign &&
    a.borderRadius === b.borderRadius &&
    a.borderWidth === b.borderWidth &&
    a.borderColor === b.borderColor &&
    a.opacity === b.opacity &&
    a.display === b.display &&
    a.justifyContent === b.justifyContent &&
    a.alignItems === b.alignItems &&
    a.gap === b.gap &&
    a.padding === b.padding &&
    a.overflow === b.overflow &&
    a.objectFit === b.objectFit
  );
}

function elementSizingEqual(a: ElementSizing | undefined, b: ElementSizing | undefined): boolean {
  return (a?.width ?? "fixed") === (b?.width ?? "fixed") && (a?.height ?? "fixed") === (b?.height ?? "fixed");
}

export function elementNodesEqual(a: ElementNode | undefined, b: ElementNode | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.parentId === b.parentId &&
    arrayValuesEqual(a.children, b.children) &&
    a.name === b.name &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.content === b.content &&
    a.src === b.src &&
    a.locked === b.locked &&
    a.visible === b.visible &&
    elementSizingEqual(a.sizing, b.sizing) &&
    elementStylesEqual(a.styles, b.styles)
  );
}

function canvasPropertiesEqual(a: CanvasProperties, b: CanvasProperties): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.background === b.background &&
    a.rotation === b.rotation &&
    a.borderRadius === b.borderRadius &&
    a.borderWidth === b.borderWidth &&
    a.borderColor === b.borderColor &&
    a.opacity === b.opacity &&
    a.padding === b.padding
  );
}

export function documentsEqual(a: CanvasDocument, b: CanvasDocument): boolean {
  if (a === b) return true;
  if (a.shellBackground !== b.shellBackground) return false;
  if (!canvasPropertiesEqual(a.canvas, b.canvas)) return false;
  if (!arrayValuesEqual(a.rootIds, b.rootIds)) return false;

  const aKeys = Object.keys(a.elements);
  if (aKeys.length !== Object.keys(b.elements).length) return false;
  for (const key of aKeys) {
    if (!elementNodesEqual(a.elements[key], b.elements[key])) return false;
  }
  return true;
}

export function limitHistory(history: CanvasDocument[], maxLength = 80): CanvasDocument[] {
  if (history.length <= maxLength) {
    return history;
  }
  return history.slice(history.length - maxLength);
}
