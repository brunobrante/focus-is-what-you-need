import type { ElementNode, ElementType } from "@/canvas/engine/types";
import type { Node, NodeType } from "./treeTypes";

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
  return hasChildren ? "component" : "frame";
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
