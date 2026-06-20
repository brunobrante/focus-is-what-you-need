import type { CanvasDocument, ElementNode } from "./types";
import { cloneDocument, constrainAll, createId } from "./actions";
import { filterTopLevelIds } from "./geometry";

type ClipboardData = {
  elements: Record<string, ElementNode>;
  rootIds: string[];
};

let clipboard: ClipboardData | null = null;

export function hasClipboard(): boolean {
  return clipboard !== null && clipboard.rootIds.length > 0;
}

export function copyElements(document: CanvasDocument, ids: string[]): void {
  const topLevelIds = filterTopLevelIds(document, ids);
  if (topLevelIds.length === 0) {
    return;
  }

  const elements: Record<string, ElementNode> = {};

  const collectTree = (id: string) => {
    const node = document.elements[id];
    if (!node) {
      return;
    }
    elements[id] = { ...node, children: [...node.children] };
    for (const childId of node.children) {
      collectTree(childId);
    }
  };

  for (const id of topLevelIds) {
    collectTree(id);
  }

  clipboard = {
    elements,
    rootIds: topLevelIds
  };
}

export function pasteElements(
  document: CanvasDocument
): { document: CanvasDocument; selectedIds: string[] } | null {
  if (!clipboard || clipboard.rootIds.length === 0) {
    return null;
  }

  const next = cloneDocument(document);
  const newSelectedIds: string[] = [];
  const idMap = new Map<string, string>();

  // Generate new IDs for every element in clipboard
  for (const oldId of Object.keys(clipboard.elements)) {
    const node = clipboard.elements[oldId];
    idMap.set(oldId, createId(node.type));
  }

  // Clone each element with new IDs
  for (const [oldId, newId] of idMap) {
    const source = clipboard.elements[oldId];
    if (!source) {
      continue;
    }

    const newParentId = source.parentId ? idMap.get(source.parentId) ?? null : null;
    const newChildren = source.children.map((childId) => idMap.get(childId) ?? childId);

    next.elements[newId] = {
      ...source,
      id: newId,
      parentId: newParentId,
      children: newChildren,
      styles: { ...source.styles }
    };
  }

  // Insert top-level clones into the document (offset by 24px)
  for (const oldRootId of clipboard.rootIds) {
    const newId = idMap.get(oldRootId);
    if (!newId) {
      continue;
    }

    const node = next.elements[newId];
    if (!node) {
      continue;
    }

    // Top-level pasted elements go to the root
    node.parentId = null;
    node.x += 24;
    node.y += 24;
    next.rootIds.push(newId);
    newSelectedIds.push(newId);
  }

  // Clamp the +24-offset pasted roots back inside the frame, otherwise repeated
  // pastes (which re-copy from the document below) cascade off-canvas forever.
  const constrained = constrainAll(next);

  // Update clipboard to the new (constrained) positions so subsequent pastes cascade
  copyElements(constrained, newSelectedIds);

  return {
    document: constrained,
    selectedIds: newSelectedIds
  };
}
