import type { CanvasDocument, ElementNode } from "./types";
import { cloneDocument, constrainAll, createId } from "./actions";
import { filterTopLevelIds } from "./geometry";

type ClipboardData = {
  elements: Record<string, ElementNode>;
  rootIds: string[];
};

export type Clipboard = {
  has(): boolean;
  copy(document: CanvasDocument, ids: string[]): void;
  paste(
    document: CanvasDocument,
  ): { document: CanvasDocument; selectedIds: string[] } | null;
};

/**
 * Creates a clipboard buffer. The canvas shell owns ONE instance shared by all
 * of its panes (Sketch/Current/Versions/extra Currents), so copying in one pane
 * pastes in another — the Sketch → Current flow is a Product.md [NOW] behavior
 * (G6). Paste remaps every id into the target document, and a copied root whose
 * original parent is absent there falls back to the frame root, so cross-pane
 * paste is structurally safe. Editors mounted without a shell-provided
 * clipboard get their own isolated instance.
 */
export function createClipboard(): Clipboard {
  let clipboard: ClipboardData | null = null;

  function copy(document: CanvasDocument, ids: string[]): void {
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
      rootIds: topLevelIds,
    };
  }

  function paste(
    document: CanvasDocument,
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
      // Drop children that weren't in the copied set — keeping the old id would
      // dangle a reference into the source document (L8).
      const newChildren = source.children
        .map((childId) => idMap.get(childId))
        .filter((id): id is string => id !== undefined);

      next.elements[newId] = {
        ...source,
        id: newId,
        parentId: newParentId,
        children: newChildren,
        styles: { ...source.styles },
      };
    }

    // Insert top-level clones (offset by 24px). Prefer the element's ORIGINAL
    // parent when it still exists in the target document — pasting back into the
    // same container is what users expect (Figma), instead of everything jumping
    // to the frame root (L22). Cross-document/split-pane paste, or a since-deleted
    // parent, falls back to the root.
    for (const oldRootId of clipboard.rootIds) {
      const newId = idMap.get(oldRootId);
      if (!newId) {
        continue;
      }

      const node = next.elements[newId];
      if (!node) {
        continue;
      }

      const originalParentId = clipboard.elements[oldRootId]?.parentId ?? null;
      const targetParent =
        originalParentId && !idMap.has(originalParentId)
          ? next.elements[originalParentId]
          : undefined;

      node.x += 24;
      node.y += 24;
      if (targetParent) {
        node.parentId = originalParentId;
        targetParent.children.push(newId);
      } else {
        node.parentId = null;
        next.rootIds.push(newId);
      }
      newSelectedIds.push(newId);
    }

    // Clamp the +24-offset pasted roots back inside the frame, otherwise repeated
    // pastes (which re-copy from the document below) cascade off-canvas forever.
    const constrained = constrainAll(next);

    // Update clipboard to the new (constrained) positions so subsequent pastes cascade
    copy(constrained, newSelectedIds);

    return {
      document: constrained,
      selectedIds: newSelectedIds,
    };
  }

  return {
    has: () => clipboard !== null && clipboard.rootIds.length > 0,
    copy,
    paste,
  };
}
