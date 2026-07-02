import type { CanvasDocument } from "../types";
import { cloneDocument, mutateElementShallow, shallowCloneDocument } from "./coreUtils";
import { applyTextFitSizingInPlace } from "./elementGeometry";

export function updateElementText(document: CanvasDocument, id: string, content: string): CanvasDocument {
  const next = cloneDocument(document);
  const node = next.elements[id];
  if (!node) return document;
  node.content = content;
  applyTextFitSizingInPlace(next, id);
  return next;
}

/**
 * Hot-path variant of {@link updateElementText} for per-keystroke text edits.
 * `content` is a scalar on the node, so a shallow document clone plus a shallow
 * clone of just the edited node is sufficient — O(1) per keystroke instead of a
 * full `structuredClone` of the whole scene. Commit still uses the deep
 * `updateElementText` (see useTextEditingSession.commitTextEditing).
 */
export function updateElementTextShallow(
  document: CanvasDocument,
  id: string,
  content: string,
): CanvasDocument {
  const next = shallowCloneDocument(document);
  const node = mutateElementShallow(next, id);
  if (!node) return document;
  node.content = content;
  applyTextFitSizingInPlace(next, id);
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

/**
 * Breaks a linked instance: clears `instanceOf` and unlocks the inlined master
 * content so it becomes editable own content. Because the resolved subtree is
 * already present in the in-memory document, simply dropping the link and
 * unlocking the descendants is enough — on save it persists as a deep copy
 * (the adapter only skips children of nodes that still carry `instanceOf`).
 *
 * Nested linked instances are preserved as links: the nested instance node is
 * unlocked (so it can be moved/detached within the now-editable content), but its
 * own inlined children stay read-only and the walk does not recurse past it. This
 * keeps child components that are themselves components as openable instances after
 * the parent is detached, instead of flattening them into plain content.
 */
export function detachInstance(document: CanvasDocument, id: string): CanvasDocument {
  const node = document.elements[id];
  if (!node || !node.instanceOf) return document;
  const next = cloneDocument(document);
  const target = next.elements[id];
  if (!target) return document;
  target.instanceOf = null;
  const stack = [...target.children];
  while (stack.length > 0) {
    const childId = stack.pop()!;
    const child = next.elements[childId];
    if (!child) continue;
    child.locked = false;
    // Stop at a nested instance boundary: its inlined children remain read-only.
    if (child.instanceOf) continue;
    stack.push(...child.children);
  }
  return next;
}
