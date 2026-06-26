import type { CanvasDocument, ElementNode, ElementType } from "@/canvas/engine/types";
import type { Node, NodeType } from "./treeTypes";

export function stringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
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
      // A linked instance renders as a single leaf (children hidden) with link/detach
      // affordances; detaching flips `instanceOf` to null, which changes the rendered
      // tree even when name/children/locked are untouched. Without this the tree's
      // re-render guard treats a detach as a no-op and the change never shows.
      Boolean(ea.instanceOf) !== Boolean(eb.instanceOf) ||
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

export function ancestorIdsForNodeIds(root: Node, nodeIds: readonly string[]): Set<string> {
  const targets = new Set(nodeIds);
  const ancestors = new Set<string>();

  const walk = (node: Node): boolean => {
    let containsTarget = targets.has(node.id);
    for (const child of node.children ?? []) {
      if (walk(child)) {
        containsTarget = true;
        if (node.id !== root.id) ancestors.add(node.id);
      }
    }
    return containsTarget;
  };

  walk(root);
  return ancestors;
}

export function nodeTypeLabel(node: Node): string {
  switch (node.type) {
    case "text":    return "text";
    case "image":   return "img";
    case "icon":    return "icon";
    case "ellipse": return "ellipse";
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

/** Every node id (excluding the root) that has children — i.e. is collapsible/expandable. */
export function collectOpenableIds(root: Node): Set<string> {
  const set = new Set<string>();
  const walk = (node: Node) => {
    if ((node.children ?? []).length === 0) return;
    set.add(node.id);
    node.children!.forEach(walk);
  };
  (root.children ?? []).forEach(walk);
  return set;
}

/**
 * Open every collapsible node down to (but not including) `maxDepth` nesting levels.
 * `maxDepth = 2` opens the top-level components and their direct children — i.e.
 * "expand to the second component level".
 */
export function openToDepth(root: Node, maxDepth: number): Set<string> {
  const set = new Set<string>();
  const walk = (node: Node, depth: number) => {
    if ((node.children ?? []).length === 0) return;
    if (depth < maxDepth) set.add(node.id);
    node.children!.forEach((c) => walk(c, depth + 1));
  };
  (root.children ?? []).forEach((c) => walk(c, 0));
  return set;
}

/** Filter option values used by the layers footer; matched against a node's type. */
export const LAYER_FILTER_KINDS: { value: string; label: string }[] = [
  { value: "component", label: "Component" },
  { value: "div", label: "Div" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "icon", label: "Icon" },
  { value: "shape", label: "Shape" },
];

export function nodeMatchesKind(type: NodeType, kind: string): boolean {
  switch (kind) {
    case "component":
      return type === "component" || type === "frame";
    case "div":
      return type === "rect";
    case "text":
      return type === "text";
    case "image":
      return type === "image";
    case "icon":
      return type === "icon";
    case "shape":
      return (
        type === "ellipse" ||
        type === "line" ||
        type === "arrow" ||
        type === "polygon" ||
        type === "star" ||
        type === "pen"
      );
    default:
      return false;
  }
}

export type LayerFilter = {
  query: string;
  kinds: ReadonlySet<string>;
};

export function isLayerFilterActive(filter: LayerFilter): boolean {
  return filter.query.trim().length > 0 || filter.kinds.size > 0;
}

function nodeMatchesFilter(node: Node, query: string, kinds: ReadonlySet<string>): boolean {
  const textOk = query.length === 0 || node.name.toLowerCase().includes(query);
  const kindOk =
    kinds.size === 0 || [...kinds].some((kind) => nodeMatchesKind(node.type, kind));
  return textOk && kindOk;
}

/**
 * Flatten the tree to a flat list of every node that matches the filter, in
 * depth-first order. The hierarchy is intentionally discarded — a match never keeps
 * its parent or children, so filtering by e.g. "image" yields just the images as
 * sibling leaf rows. Returns a synthetic root whose children are the flat matches.
 */
export function filterTree(
  root: Node,
  filter: LayerFilter,
): { root: Node; matchCount: number } {
  const query = filter.query.trim().toLowerCase();
  const matches: Node[] = [];

  const walk = (node: Node) => {
    if (nodeMatchesFilter(node, query, filter.kinds)) {
      // Strip children so the match renders as a standalone leaf row (no nesting).
      matches.push({ ...node, children: [] });
    }
    for (const child of node.children ?? []) walk(child);
  };

  for (const child of root.children ?? []) walk(child);
  return { root: { ...root, children: matches }, matchCount: matches.length };
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
  if (type === "icon") return "icon";
  if (type === "ellipse") return "ellipse";
  if (type === "line") return "line";
  if (type === "arrow") return "arrow";
  if (type === "polygon") return "polygon";
  if (type === "star") return "star";
  if (type === "path") return "path";
  if (type === "svg") return "svg";
  return hasChildren ? "component" : "rect";
}

export function treeFromCanvasDocument(
  document: import("@/canvas/engine/types").CanvasDocument | null | undefined,
  name = "Canvas",
  // By default an SVG is a sealed component (its child paths are hidden). When the
  // global canvas setting opts in, its vector children are expanded like a normal
  // component (see Versioning §8.2).
  revealSealedSvg = false,
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

  const build = (node: ElementNode): Node => {
    const linked = Boolean(node.instanceOf);
    // A sealed SVG renders as one leaf row; its internal path children are hidden
    // unless the reveal setting is on. (Linked instances are always sealed.)
    const sealed = linked || (node.type === "svg" && !revealSealedSvg);
    return {
      id: node.id,
      name: node.name,
      type: nodeTypeFromElement(node.type, node.children.length > 0),
      visible: node.visible,
      locked: node.locked,
      linked,
      instanceVariantId: node.instanceOf?.variantId,
      // A linked instance / sealed SVG shows as a single row — its content is not
      // expanded into the layers tree.
      children: sealed
        ? []
        : node.children
            .map((childId) => document.elements[childId])
            .filter((child): child is ElementNode => Boolean(child))
            .map(build),
    };
  };

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
