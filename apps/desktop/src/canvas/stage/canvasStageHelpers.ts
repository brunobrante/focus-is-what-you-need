import { elementNodesEqual } from "@/canvas/engine/history";
import type { CanvasDocument, Point, Rect } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import { elementToPaintViewportRect } from "./canvasToolingRenderer";
import { getCaretRect, getIndexFromPoint, getTextLayout } from "./textEditingLayout";
import type { TextEditState, ViewportClientRect } from "./canvasStageTypes";

export function isCanvasAlignmentDebugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem("fwyn:debug-canvas-alignment") === "1";
  } catch {
    return false;
  }
}

export function sizesEqual(a: Size, b: Size): boolean {
  return Math.abs(a.width - b.width) <= 0.01 && Math.abs(a.height - b.height) <= 0.01;
}

export function arrayValuesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function addElementAncestors(
  document: CanvasDocument | null,
  id: string,
  affectedIds: Set<string>,
): void {
  let parentId = document?.elements[id]?.parentId ?? null;
  while (parentId) {
    affectedIds.add(parentId);
    parentId = document?.elements[parentId]?.parentId ?? null;
  }
}

export function getAffectedElementRenderIds(
  previousDocument: CanvasDocument | null,
  nextDocument: CanvasDocument,
): ReadonlySet<string> {
  if (!previousDocument) {
    return new Set(Object.keys(nextDocument.elements));
  }

  const changedIds = new Set<string>();
  for (const id of Object.keys(previousDocument.elements)) {
    if (!elementNodesEqual(previousDocument.elements[id], nextDocument.elements[id])) {
      changedIds.add(id);
    }
  }
  for (const id of Object.keys(nextDocument.elements)) {
    if (!previousDocument.elements[id]) changedIds.add(id);
  }

  if (!arrayValuesEqual(previousDocument.rootIds, nextDocument.rootIds)) {
    for (const id of previousDocument.rootIds) changedIds.add(id);
    for (const id of nextDocument.rootIds) changedIds.add(id);
  }

  const affectedIds = new Set<string>(changedIds);
  for (const id of changedIds) {
    addElementAncestors(previousDocument, id, affectedIds);
    addElementAncestors(nextDocument, id, affectedIds);
  }
  return affectedIds;
}

export function selectionRangeFromAnchor(
  anchorIndex: number,
  focusIndex: number,
): Pick<TextEditState, "selectionStart" | "selectionEnd" | "anchorIndex"> {
  return {
    selectionStart: Math.min(anchorIndex, focusIndex),
    selectionEnd: Math.max(anchorIndex, focusIndex),
    anchorIndex,
  };
}

export function clampTextIndex(value: number, text: string): number {
  return Math.max(0, Math.min(Math.round(value), text.length));
}

export function replaceTextRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { value: string; caretIndex: number } {
  const start = clampTextIndex(Math.min(selectionStart, selectionEnd), value);
  const end = clampTextIndex(Math.max(selectionStart, selectionEnd), value);
  const nextValue = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return { value: nextValue, caretIndex: start + insert.length };
}

export function clearNativeTextSelection(): void {
  try {
    globalThis.getSelection?.()?.removeAllRanges();
  } catch {
    // Best effort only.
  }
}

export function localPointForTextNode(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): Point | null {
  const node = input.document.elements[input.nodeId];
  if (!node) return null;
  const rect = elementToPaintViewportRect(input.document, input.nodeId, input.viewportTransform);
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const viewportRect = input.viewportRect ?? input.viewport.getBoundingClientRect();
  const x = input.clientX - viewportRect.left - rect.x;
  const y = input.clientY - viewportRect.top - rect.y;
  return {
    x: x / (rect.width / Math.max(node.width, 1)),
    y: y / (rect.height / Math.max(node.height, 1)),
  };
}

export function textIndexFromClientPoint(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): number | null {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return null;
  const local = localPointForTextNode(input);
  if (!local) return null;
  return getIndexFromPoint(node, local.x, local.y);
}

export function isClientPointInsideTextNode(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): boolean {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return false;
  const local = localPointForTextNode(input);
  if (!local) return false;
  const layout = getTextLayout(node);
  const lastLine = layout.lines[layout.lines.length - 1];
  const textBottom = lastLine
    ? lastLine.y + layout.lineHeight
    : layout.contentY + layout.lineHeight;
  return (
    local.x >= 0 &&
    local.y >= 0 &&
    local.x <= node.width &&
    local.y <= Math.max(node.height, textBottom)
  );
}

export function isClientPointInsideTextContent(input: {
  document: CanvasDocument;
  nodeId: string;
  clientX: number;
  clientY: number;
  viewport: HTMLElement;
  viewportRect?: ViewportClientRect;
  viewportTransform: ViewportTransform;
}): boolean {
  const node = input.document.elements[input.nodeId];
  if (!node || node.type !== "text") return false;
  const local = localPointForTextNode(input);
  if (!local) return false;
  const layout = getTextLayout(node);
  return layout.lines.some(
    (line) =>
      local.y >= line.y &&
      local.y <= line.y + layout.lineHeight &&
      local.x >= line.x &&
      local.x <= line.x + line.width,
  );
}

export function viewportRectForLocalTextRect(input: {
  document: CanvasDocument;
  nodeId: string;
  localRect: Rect;
  viewportTransform: ViewportTransform;
}): Rect | null {
  const node = input.document.elements[input.nodeId];
  if (!node) return null;
  const elementRect = elementToPaintViewportRect(
    input.document,
    input.nodeId,
    input.viewportTransform,
  );
  if (!elementRect) return null;
  const scaleX = elementRect.width / Math.max(node.width, 1);
  const scaleY = elementRect.height / Math.max(node.height, 1);
  return {
    x: elementRect.x + input.localRect.x * scaleX,
    y: elementRect.y + input.localRect.y * scaleY,
    width: input.localRect.width * scaleX,
    height: input.localRect.height * scaleY,
  };
}

