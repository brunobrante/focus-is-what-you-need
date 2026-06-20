// Generic flat-list → nested forest builder, shared by the various
// "group children by parentId and recurse" call sites.

export type ForestNode<T> = {
  item: T;
  depth: number;
  children: ForestNode<T>[];
};

/**
 * Build a nested forest from a flat list, grouping by parent and guarding against
 * cycles (a node already on the current path contributes no children). When
 * `rootId` is given, returns the single subtree rooted there (or `[]` if absent);
 * otherwise returns every top-level node — those whose parent id is null/undefined
 * or points outside the list.
 */
export function buildForest<T>(
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null | undefined,
  rootId?: string,
): ForestNode<T>[] {
  const byParent = new Map<string, T[]>();
  for (const item of items) {
    const parentId = getParentId(item);
    if (parentId == null) continue;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(item);
    byParent.set(parentId, siblings);
  }

  const visit = (item: T, depth: number, seen: Set<string>): ForestNode<T> => {
    const id = getId(item);
    if (seen.has(id)) return { item, depth, children: [] };
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    return {
      item,
      depth,
      children: (byParent.get(id) ?? []).map((child) => visit(child, depth + 1, nextSeen)),
    };
  };

  if (rootId != null) {
    const root = items.find((item) => getId(item) === rootId);
    return root ? [visit(root, 0, new Set())] : [];
  }

  const ids = new Set(items.map(getId));
  return items
    .filter((item) => {
      const parentId = getParentId(item);
      return parentId == null || !ids.has(parentId);
    })
    .map((root) => visit(root, 0, new Set()));
}

/** Depth-first flatten of a forest into a flat node list (parents before children). */
export function flattenForest<T>(nodes: ForestNode<T>[]): ForestNode<T>[] {
  const out: ForestNode<T>[] = [];
  const visit = (node: ForestNode<T>) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return out;
}
