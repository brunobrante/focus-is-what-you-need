import type { SavedComponent, ComponentTreeNode } from "./types";
import { buildForest, type ForestNode } from "@/lib/tree";

export function buildComponentTree(items: SavedComponent[], rootId: string): ComponentTreeNode[] {
  const toNode = (node: ForestNode<SavedComponent>): ComponentTreeNode => ({
    component: node.item,
    depth: node.depth,
    children: node.children.map(toNode),
  });
  // `|| null` matches the original `!item.parentId` (a falsy/"" parent = a root).
  return buildForest(items, (c) => c.id, (c) => c.parentId || null, rootId).map(toNode);
}

export function flattenComponentTree(nodes: ComponentTreeNode[]): SavedComponent[] {
  const flattened: SavedComponent[] = [];
  const visit = (node: ComponentTreeNode) => {
    flattened.push(node.component);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return flattened;
}

export function componentSubtreeIds(items: SavedComponent[], id: string): Set<string> {
  const byParent = new Map<string, SavedComponent[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }

  const ids = new Set<string>();
  const visit = (componentId: string) => {
    ids.add(componentId);
    for (const child of byParent.get(componentId) ?? []) {
      if (!ids.has(child.id)) visit(child.id);
    }
  };
  visit(id);
  return ids;
}

export function componentAncestorIds(items: SavedComponent[], id: string): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ancestors: string[] = [];
  let current = byId.get(id);
  let guard = 0;

  while (current?.parentId && guard < items.length) {
    ancestors.push(current.parentId);
    current = byId.get(current.parentId);
    guard += 1;
  }

  return ancestors;
}
