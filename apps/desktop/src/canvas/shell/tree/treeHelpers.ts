import type { CanvasDocument, ElementNode, ElementType } from "@/canvas/engine/types";
import type { Node, NodeType } from "./treeTypes";

function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Equality over the *tree-relevant* shape of a document — root order plus each
 * element's id, type, name, visibility, lock state, and child order. Deliberately
 * ignores geometry (x/y/w/h/rotation), styles, and text content, none of which the
 * layers tree renders.
 *
 * Used as the `isEqual` for the Tree's bridge subscription so the panel keeps a
 * stable document reference (and skips rebuilding the tree + re-rendering every row)
 * across the ~60Hz transient document updates produced by a drag/resize/rotate.
 */
export function documentTreeShapeEqual(
  a: CanvasDocument | null,
  b: CanvasDocument | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (!stringArraysEqual(a.rootIds, b.rootIds)) return false;

  const aIds = Object.keys(a.elements);
  if (aIds.length !== Object.keys(b.elements).length) return false;
  for (const id of aIds) {
    const ea = a.elements[id];
    const eb = b.elements[id];
    if (!eb) return false;
    if (
      ea.name !== eb.name ||
      ea.type !== eb.type ||
      ea.visible !== eb.visible ||
      ea.locked !== eb.locked ||
      !stringArraysEqual(ea.children, eb.children)
    ) {
      return false;
    }
  }
  return true;
}

export function initiallyOpen(node: Node, depth = 0, set: Set<string> = new Set()): Set<string> {
  if (depth <= 1 && (node.type === "frame" || node.type === "component")) {
    set.add(node.id);
  }
  (node.children || []).forEach((c) => initiallyOpen(c, depth + 1, set));
  return set;
}

export function findNode(node: Node, id: string): Node | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function nodeTypeLabel(node: Node): string {
  switch (node.type) {
    case "text":    return "text";
    case "image":   return "img";
    case "ellipse": return "elipse";
    case "line":    return "line";
    case "pen":     return "pen";
    default:        return "div";
  }
}

export function countNodes(node: Node | undefined): number {
  if (!node) return 0;
  let n = 0;
  const walk = (x: Node) => {
    n++;
    (x.children || []).forEach(walk);
  };
  (node.children || []).forEach(walk);
  return n;
}

export function structureKey(node: Node): string {
  return `${node.id}(${(node.children ?? []).map(structureKey).join(",")})`;
}

export function visibleNodeIds(root: Node, openSet: Set<string>): string[] {
  const ids: string[] = [];
  const walk = (node: Node) => {
    ids.push(node.id);
    if (!openSet.has(node.id)) return;
    for (const child of node.children ?? []) walk(child);
  };
  for (const child of root.children ?? []) walk(child);
  return ids;
}

export function nodeTypeFromElement(type: ElementType, hasChildren: boolean): NodeType {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "ellipse") return "ellipse";
  if (type === "line") return "line";
  if (type === "arrow") return "arrow";
  if (type === "polygon") return "polygon";
  if (type === "star") return "star";
  return hasChildren ? "component" : "rect";
}

export function treeFromCanvasDocument(
  document: import("@/canvas/engine/types").CanvasDocument | null | undefined,
  name = "Canvas",
): { root: Node } {
  if (!document) {
    return {
      root: {
        id: "__canvas__",
        name,
        type: "frame",
        visible: true,
        locked: false,
        children: [],
      },
    };
  }

  const build = (node: ElementNode): Node => ({
    id: node.id,
    name: node.name,
    type: nodeTypeFromElement(node.type, node.children.length > 0),
    visible: node.visible,
    locked: node.locked,
    children: node.children
      .map((childId) => document.elements[childId])
      .filter((child): child is ElementNode => Boolean(child))
      .map(build),
  });

  return {
    root: {
      id: "__canvas__",
      name,
      type: "frame",
      visible: true,
      locked: false,
      children: document.rootIds
        .map((id) => document.elements[id])
        .filter((node): node is ElementNode => Boolean(node))
        .map(build),
    },
  };
}
