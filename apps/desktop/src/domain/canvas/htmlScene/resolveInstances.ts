import { htmlCanvasDocumentFromJSON } from "./document";
import {
  collectDescendantIdsFrom,
  groupNodesByParent,
  subjectNodeForDocument,
  uniqueNodeId,
} from "./graphNodeHelpers";
import type { HtmlCanvasDocument, HtmlCanvasInstanceRef, HtmlCanvasNode } from "./types";

// Re-exported so the `htmlScene` barrel keeps exposing it from this module.
export { subjectNodeForDocument };

/**
 * Resolves linked instance nodes for DISPLAY only.
 *
 * A stored instance node (one carrying `instanceOf`) has no children of its own.
 * This expands it by inlining the master component's subject subtree underneath it,
 * marking every inlined node read-only (`locked: true`) so the editor never lets the
 * user mutate master content through an instance. The instance node itself is left
 * editable as a whole (move / delete / detach).
 *
 * Resolution is NEVER persisted: see `stripResolvedInstanceChildren`, which the save
 * path uses to drop these inlined descendants again before writing storage.
 *
 * `getMaster` returns the master's scene document for a given reference, or null when
 * it cannot be found. Cycles (A → B → A) are guarded with a visited set keyed by
 * `componentId:variantId`; a cycle or missing master leaves the instance as an empty
 * read-only container rather than recursing forever.
 */
export type MasterResolver = (ref: HtmlCanvasInstanceRef) => HtmlCanvasDocument | null;

/**
 * Builds a MasterResolver from a flat list of scene rows. Only `ownerType: "variant"`
 * scenes are masters; their graphs are parsed lazily and cached per variant id.
 */
export function buildMasterResolver(
  scenes: ReadonlyArray<{ ownerType: string; ownerId: string; graphJSON: string }>,
): MasterResolver {
  const graphByVariant = new Map<string, string>();
  for (const scene of scenes) {
    if (scene.ownerType === "variant") graphByVariant.set(scene.ownerId, scene.graphJSON);
  }
  const parsed = new Map<string, HtmlCanvasDocument | null>();
  return (ref: HtmlCanvasInstanceRef): HtmlCanvasDocument | null => {
    if (parsed.has(ref.variantId)) return parsed.get(ref.variantId) ?? null;
    const doc = htmlCanvasDocumentFromJSON(graphByVariant.get(ref.variantId) ?? null);
    parsed.set(ref.variantId, doc);
    return doc;
  };
}

export function resolveInstances(
  document: HtmlCanvasDocument,
  getMaster: MasterResolver,
): HtmlCanvasDocument {
  // Fast path: nothing to resolve.
  if (!document.nodes.some((node) => node.instanceOf)) return document;

  const usedIds = new Set(document.nodes.map((node) => node.id));
  const nextNodes: HtmlCanvasNode[] = [];

  for (const node of document.nodes) {
    if (!node.instanceOf) {
      nextNodes.push(node);
      continue;
    }
    nextNodes.push(...inlineMaster(node, node.instanceOf, getMaster, usedIds, new Set()));
  }

  return { ...document, nodes: nextNodes };
}

function inlineMaster(
  instanceNode: HtmlCanvasNode,
  ref: HtmlCanvasInstanceRef,
  getMaster: MasterResolver,
  usedIds: Set<string>,
  visited: Set<string>,
): HtmlCanvasNode[] {
  const key = `${ref.componentId}:${ref.variantId}`;
  if (visited.has(key)) {
    // Cycle: keep the instance as an empty read-only container.
    return [instanceNode];
  }

  const master = getMaster(ref);
  const subject = master ? subjectNodeForDocument(master) : null;
  if (!master || !subject) {
    // Missing master: keep the bare instance node so the link is still visible.
    return [instanceNode];
  }

  const nextVisited = new Set(visited).add(key);
  const merged = mergeSubjectIntoInstance(instanceNode, subject);
  const result: HtmlCanvasNode[] = [merged];

  const childrenByParent = groupNodesByParent(master.nodes);
  const idMap = new Map<string, string>([[subject.id, instanceNode.id]]);

  const appendChildren = (sourceParentId: string, fallbackParentId: string): void => {
    for (const childNode of childrenByParent.get(sourceParentId) ?? []) {
      const nextId = uniqueNodeId(`${instanceNode.id}~${childNode.id}`, usedIds);
      usedIds.add(nextId);
      idMap.set(childNode.id, nextId);
      const nextParentId = idMap.get(childNode.parentId ?? "") ?? fallbackParentId;

      if (childNode.instanceOf) {
        // Nested instance inside the master: resolve it recursively.
        const placed: HtmlCanvasNode = {
          ...childNode,
          id: nextId,
          parentId: nextParentId,
          locked: true,
        };
        result.push(...inlineMaster(placed, childNode.instanceOf, getMaster, usedIds, nextVisited));
        continue;
      }

      result.push({ ...childNode, id: nextId, parentId: nextParentId, locked: true });
      appendChildren(childNode.id, nextId);
    }
  };

  appendChildren(subject.id, instanceNode.id);
  return result;
}

/**
 * Removes every node that descends from an instance node, so only the bare instance
 * node (with `instanceOf`) survives. Run this on the save path to guarantee inlined
 * master content is never duplicated into the parent scene's storage.
 */
export function stripResolvedInstanceChildren(document: HtmlCanvasDocument): HtmlCanvasDocument {
  const instanceIds = new Set(
    document.nodes.filter((node) => node.instanceOf).map((node) => node.id),
  );
  if (instanceIds.size === 0) return document;

  const byParent = groupNodesByParent(document.nodes);
  const removed = new Set<string>();
  for (const instanceId of instanceIds) {
    for (const child of byParent.get(instanceId) ?? []) {
      removed.add(child.id);
      for (const id of collectDescendantIdsFrom(byParent, child.id)) removed.add(id);
    }
  }
  if (removed.size === 0) return document;

  return { ...document, nodes: document.nodes.filter((node) => !removed.has(node.id)) };
}

/**
 * Adopts the master subject's visuals (style, kind, tag, text, image, appearance)
 * onto the instance node, while keeping the instance's own identity and placement
 * (id, parent, order, bounds, visibility, and the `instanceOf` link). The instance
 * node is the read-only container; its children are inlined separately.
 */
function mergeSubjectIntoInstance(
  instanceNode: HtmlCanvasNode,
  subject: HtmlCanvasNode,
): HtmlCanvasNode {
  return {
    ...subject,
    // Keep the instance's own identity and placement; only the master subject's
    // visuals (kind, style, text, image, appearance) are adopted for display.
    id: instanceNode.id,
    parentId: instanceNode.parentId,
    order: instanceNode.order,
    name: instanceNode.name,
    cssId: instanceNode.cssId,
    className: instanceNode.className,
    tag: instanceNode.tag,
    bounds: { ...instanceNode.bounds },
    visible: instanceNode.visible,
    locked: instanceNode.locked,
    instanceOf: instanceNode.instanceOf,
  };
}
