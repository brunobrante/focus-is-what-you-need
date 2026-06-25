import type { CanvasDocument } from "@/canvas/engine/types";
import type { HtmlCanvasDocument, HtmlCanvasNode } from "@/lib/canvas/htmlScene";
import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  buildMasterResolver,
  resolveInstances,
} from "@/lib/canvas/htmlScene";
import { htmlCanvasDocumentFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import { peekTable } from "@/lib/storage/recordStore";
import { TABLES } from "@/lib/storage/storeKeys";
import type { SceneRow } from "@/lib/storage/schema";

/**
 * Build an `HtmlCanvasDocument` rooted at one element (its subtree), for the
 * SVG / raster export paths. Linked instances are expanded read-only so the
 * export shows the master content. The subtree root is pinned to (0,0) and the
 * viewport equals the element's own size — a true-intrinsic-size snapshot
 * (Product.md Law 4). Returns null if the element is not found.
 */
export function htmlSubtreeForElement(
  document: CanvasDocument,
  nodeId: string,
  fallbackName = "Element",
): HtmlCanvasDocument | null {
  const full = resolveInstances(
    htmlCanvasDocumentFromCanvasDocument(document, null, fallbackName),
    buildMasterResolver(peekTable<SceneRow>(TABLES.scenes)),
  );

  const target = full.nodes.find((node) => node.id === nodeId);
  if (!target) return null;

  const childrenByParent = new Map<string, HtmlCanvasNode[]>();
  for (const node of full.nodes) {
    if (!node.parentId) continue;
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  }

  const root: HtmlCanvasNode = {
    ...target,
    parentId: null,
    order: 0,
    bounds: { ...target.bounds, x: 0, y: 0 },
  };
  const nodes: HtmlCanvasNode[] = [root];
  const walk = (id: string) => {
    for (const child of childrenByParent.get(id) ?? []) {
      nodes.push(child);
      walk(child.id);
    }
  };
  walk(target.id);

  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId: root.id,
    viewport: { width: root.bounds.width, height: root.bounds.height },
    nodes,
    updatedAt: full.updatedAt,
  };
}
