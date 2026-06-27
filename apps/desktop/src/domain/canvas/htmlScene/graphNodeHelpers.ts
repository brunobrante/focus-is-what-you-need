import type { HtmlCanvasDocument, HtmlCanvasNode } from "./types";

/**
 * Pure graph-node helpers shared by the master/instance graph transforms
 * (`domain/canvas/graphTransforms`) and the live instance resolver
 * (`resolveInstances`). Kept in one place so the subject heuristic and the
 * descendant walks can't silently diverge between the two and corrupt embeds
 * (DOM-4). Depends only on the `HtmlCanvas*` types, so importing it never forms a
 * cycle with either consumer.
 */

/**
 * The "subject" node of a scene — the actual screen/component frame. Scenes wrap the
 * subject in a "<name> Canvas" root; when that wrapper is present the subject is its sole
 * full-bleed child, otherwise the root itself is the subject. Top-level subcomponents are
 * the subject's direct children, NOT the root's.
 */
export function subjectNodeForDocument(document: HtmlCanvasDocument): HtmlCanvasNode | null {
  const root = document.nodes.find((node) => node.id === document.rootId);
  if (!root) return null;
  const rootChildren = document.nodes.filter((node) => node.parentId === root.id);
  if (
    root.name.endsWith(" Canvas") &&
    rootChildren.length === 1 &&
    rootChildren[0] &&
    rootChildren[0].bounds.x === 0 &&
    rootChildren[0].bounds.y === 0 &&
    Math.round(rootChildren[0].bounds.width) === Math.round(root.bounds.width) &&
    Math.round(rootChildren[0].bounds.height) === Math.round(root.bounds.height)
  ) {
    return rootChildren[0];
  }
  return root;
}

export function groupNodesByParent(
  nodes: HtmlCanvasNode[],
): Map<string, HtmlCanvasNode[]> {
  const groups = new Map<string, HtmlCanvasNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const group = groups.get(node.parentId) ?? [];
    group.push(node);
    groups.set(node.parentId, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.order - b.order);
  }
  return groups;
}

/**
 * Collect every descendant id of `nodeId` from a prebuilt parent→children map.
 * Callers walking many nodes of the same graph should build the map once with
 * `groupNodesByParent` and reuse it here (DOM-6). The membership check makes a
 * malformed cyclic graph terminate instead of recursing forever.
 */
export function collectDescendantIdsFrom(
  childrenByParent: Map<string, HtmlCanvasNode[]>,
  nodeId: string,
): Set<string> {
  const result = new Set<string>();
  const walk = (parentId: string): void => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (result.has(child.id)) continue;
      result.add(child.id);
      walk(child.id);
    }
  };
  walk(nodeId);
  return result;
}

/** Like `collectDescendantIdsFrom`, but builds the parent map for a one-off walk. */
export function collectDescendantIds(
  nodes: HtmlCanvasNode[],
  nodeId: string,
): Set<string> {
  return collectDescendantIdsFrom(groupNodesByParent(nodes), nodeId);
}

export function uniqueNodeId(preferred: string, usedIds: Set<string>): string {
  if (!usedIds.has(preferred)) return preferred;
  // The used set is finite, so a suffix bump is guaranteed to terminate; loop
  // without a fixed ceiling rather than fall back to an unchecked id that could
  // already be in use (DOM-8).
  for (let index = 1; ; index += 1) {
    const candidate = `${preferred}-${index}`;
    if (!usedIds.has(candidate)) return candidate;
  }
}
