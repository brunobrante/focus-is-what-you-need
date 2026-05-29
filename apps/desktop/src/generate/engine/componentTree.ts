import type { SavedComponent, ComponentTreeNode } from "./types";

export function buildComponentTree(items: SavedComponent[], rootId: string): ComponentTreeNode[] {
  const root = items.find((entry) => entry.id === rootId);
  if (!root) return [];

  const byParent = new Map<string, SavedComponent[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }

  const visit = (component: SavedComponent, depth: number, seen: Set<string>): ComponentTreeNode => {
    if (seen.has(component.id)) return { component, depth, children: [] };
    const nextSeen = new Set(seen);
    nextSeen.add(component.id);
    return {
      component,
      depth,
      children: (byParent.get(component.id) ?? []).map((child) => visit(child, depth + 1, nextSeen)),
    };
  };

  return [visit(root, 0, new Set())];
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
