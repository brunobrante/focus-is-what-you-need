import {
  htmlCanvasDocumentFromJSON,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
} from "@/lib/canvas/htmlScene";
import type { ComponentRow } from "@/lib/storage/schema";

/**
 * Pure graph transforms for the master/instance versioning model.
 *
 * Every function here is graph-in → graph-out (JSON string → JSON string or null)
 * with no I/O: no persistence, no record store, no thumbnails. The scenes repo
 * orchestrates persistence around them.
 */

/**
 * Resolves the parent-scene node that a child component corresponds to, for embed
 * sync (`replaceComponentSubtreeInGraph`) and linkify (`linkifyChildComponentsInGraph`).
 *
 * Matching is deliberately strict to avoid corrupting the wrong node:
 *   - when the child carries a `sourceNodeId`, match ONLY by that id — a missing id means
 *     the subtree is gone, so we skip rather than fall back to a fragile name guess;
 *   - otherwise match by normalized name, but only when it is UNAMBIGUOUS (exactly one
 *     non-root node bears that name). Ambiguous (duplicate names) or absent → no match.
 */
export function findChildTargetNode<N extends { id: string; name: string }>(
  nodes: ReadonlyArray<N>,
  child: { sourceNodeId?: string | null; name: string },
  rootId: string,
): N | null {
  if (child.sourceNodeId) {
    return nodes.find((node) => node.id === child.sourceNodeId) ?? null;
  }
  const key = normalizeName(child.name);
  const matches = nodes.filter((node) => node.id !== rootId && normalizeName(node.name) === key);
  return matches.length === 1 ? matches[0]! : null;
}

export function replaceComponentSubtreeInGraph(
  parentGraphJSON: string,
  childGraphJSON: string,
  component: ComponentRow,
): string | null {
  const parent = htmlCanvasDocumentFromJSON(parentGraphJSON);
  const child = htmlCanvasDocumentFromJSON(childGraphJSON);
  if (!parent || !child) return null;

  const childSubject = subjectNodeForDocument(child);
  if (!childSubject) return null;

  const target = findChildTargetNode(parent.nodes, component, parent.rootId);
  if (!target) return null;
  // If this parent uses the component as a linked instance, there is no embedded
  // subtree to sync — leave the bare instance node so its instanceOf is preserved
  // (it resolves the master at render time).
  if (target.instanceOf) return null;

  const childNodesByParent = groupNodesByParent(child.nodes);
  const parentDescendantIds = collectDescendantIds(parent.nodes, target.id);
  const keptNodes = parent.nodes.filter(
    (node) => node.id === target.id || !parentDescendantIds.has(node.id),
  );
  const usedIds = new Set(keptNodes.map((node) => node.id));
  const idMap = new Map<string, string>([[childSubject.id, target.id]]);

  const nextNodes = keptNodes.map((node) =>
    node.id === target.id
      ? mergeSubjectIntoTarget(target, childSubject)
      : node,
  );

  const appendChildren = (sourceParentId: string, nextParentId: string) => {
    const children = childNodesByParent.get(sourceParentId) ?? [];
    for (const childNode of children) {
      const nextId = uniqueNodeId(childNode.id, usedIds);
      usedIds.add(nextId);
      idMap.set(childNode.id, nextId);
      const nextParent = idMap.get(childNode.parentId ?? "") ?? nextParentId;
      nextNodes.push({
        ...childNode,
        id: nextId,
        parentId: nextParent,
      });
      appendChildren(childNode.id, nextId);
    }
  };

  appendChildren(childSubject.id, target.id);

  return serializeHtmlCanvasDocument({
    ...parent,
    nodes: nextNodes,
    updatedAt: Date.now(),
  });
}

/**
 * Collapses each given child component's node subtree into a bare linked instance
 * node — `instanceOf` set, all descendants removed. Used by the "Linked" version
 * mode so a new variant references the original child masters instead of deep-copying
 * their content. Returns the original JSON unchanged when no child node is matched.
 */
export function linkifyChildComponentsInGraph(
  graphJSON: string,
  children: ReadonlyArray<{
    id: string;
    activeVariantId: string;
    sourceNodeId: string | null;
    name: string;
  }>,
): string | null {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;

  const removed = new Set<string>();
  const instanceByNodeId = new Map<string, { componentId: string; variantId: string }>();
  // Build the parent→children index once and reuse it for every child, instead
  // of rebuilding it inside collectDescendantIds per child (DOM-6).
  const childrenByParent = groupNodesByParent(doc.nodes);

  for (const child of children) {
    const target = findChildTargetNode(doc.nodes, child, doc.rootId);
    if (!target || target.id === doc.rootId) continue;
    for (const id of collectDescendantIdsFrom(childrenByParent, target.id)) removed.add(id);
    instanceByNodeId.set(target.id, { componentId: child.id, variantId: child.activeVariantId });
  }

  if (instanceByNodeId.size === 0) return graphJSON;

  const nextNodes = doc.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) => {
      const ref = instanceByNodeId.get(n.id);
      return ref ? { ...n, instanceOf: ref } : n;
    });

  return serializeHtmlCanvasDocument({ ...doc, nodes: nextNodes, updatedAt: Date.now() });
}

/**
 * Permanently materializes linked instances of the given master components into
 * their parent scene: each matching instance node is replaced by a deep copy of the
 * master subject subtree (fresh ids, unlocked, link cleared). Nested instances inside
 * the master are preserved as bare instance nodes so their links survive. This is the
 * storage-level "detach" used when a master is about to be deleted.
 */
export function materializeInstancesInGraph(
  graphJSON: string,
  shouldMaterialize: (node: HtmlCanvasNode) => boolean,
  getMasterGraph: (variantId: string) => string | null,
): string | null {
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;
  const targets = doc.nodes.filter((n) => n.instanceOf && shouldMaterialize(n));
  if (targets.length === 0) return null;

  let nodes = doc.nodes;
  const usedIds = new Set(nodes.map((n) => n.id));

  for (const target of targets) {
    const ref = target.instanceOf!;
    const masterGraph = getMasterGraph(ref.variantId);
    const master = masterGraph ? htmlCanvasDocumentFromJSON(masterGraph) : null;
    const subject = master ? subjectNodeForDocument(master) : null;
    if (!master || !subject) {
      // No master to inline — just drop the link so it becomes plain content.
      nodes = nodes.map((n) => (n.id === target.id ? { ...n, instanceOf: null } : n));
      continue;
    }

    const childByParent = groupNodesByParent(master.nodes);
    const idMap = new Map<string, string>([[subject.id, target.id]]);
    const merged: HtmlCanvasNode = {
      ...subject,
      id: target.id,
      parentId: target.parentId,
      order: target.order,
      name: target.name,
      cssId: target.cssId,
      className: target.className,
      tag: target.tag,
      bounds: { ...target.bounds },
      visible: target.visible,
      locked: false,
      instanceOf: null,
    };

    const appended: HtmlCanvasNode[] = [];
    const appendChildren = (sourceParentId: string, fallbackParentId: string): void => {
      for (const childNode of childByParent.get(sourceParentId) ?? []) {
        const nextId = uniqueNodeId(`${target.id}~${childNode.id}`, usedIds);
        usedIds.add(nextId);
        idMap.set(childNode.id, nextId);
        const nextParentId = idMap.get(childNode.parentId ?? "") ?? fallbackParentId;
        appended.push({ ...childNode, id: nextId, parentId: nextParentId, locked: false });
        // Preserve nested links: a nested instance stays a bare instance node.
        if (!childNode.instanceOf) appendChildren(childNode.id, nextId);
      }
    };
    appendChildren(subject.id, target.id);

    nodes = nodes.map((n) => (n.id === target.id ? merged : n)).concat(appended);
  }

  return serializeHtmlCanvasDocument({ ...doc, nodes, updatedAt: Date.now() });
}

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

export function mergeSubjectIntoTarget(
  target: HtmlCanvasNode,
  subject: HtmlCanvasNode,
): HtmlCanvasNode {
  return {
    ...subject,
    id: target.id,
    parentId: target.parentId,
    order: target.order,
    bounds: {
      ...subject.bounds,
      x: target.bounds.x,
      y: target.bounds.y,
    },
    locked: target.locked,
    visible: target.visible,
  };
}

export function collectDescendantIds(
  nodes: HtmlCanvasNode[],
  nodeId: string,
): Set<string> {
  return collectDescendantIdsFrom(groupNodesByParent(nodes), nodeId);
}

/**
 * Like `collectDescendantIds`, but reuses a `groupNodesByParent` map the caller
 * already built. Callers that collect descendants for many nodes of the same
 * graph (e.g. linkifying every child) should build the map once and pass it here
 * instead of rebuilding it per call (DOM-6).
 */
function collectDescendantIdsFrom(
  childrenByParent: Map<string, HtmlCanvasNode[]>,
  nodeId: string,
): Set<string> {
  const result = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      result.add(child.id);
      walk(child.id);
    }
  };
  walk(nodeId);
  return result;
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

export function uniqueNodeId(preferred: string, usedIds: Set<string>): string {
  if (!usedIds.has(preferred)) return preferred;
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${preferred}-${index}`;
    if (!usedIds.has(candidate)) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
