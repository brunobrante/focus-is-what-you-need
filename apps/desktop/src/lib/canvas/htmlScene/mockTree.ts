import type { HtmlCanvasBounds, HtmlCanvasDocument, HtmlCanvasNode } from "./types";
import { HTML_CANVAS_FORMAT, HTML_CANVAS_VERSION } from "./types";
import { makeNode, normalizeNode } from "./nodeHelpers";
import { toNumber, sum } from "./styleUtils";
import { normalizeHtmlCanvasDocument } from "./document";

type MockTreeNode = {
  type: string;
  props: Record<string, unknown>;
  children: Array<MockTreeNode | string>;
};

type LayoutCursor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function htmlCanvasDocumentFromMockTree(tree: MockTreeNode): HtmlCanvasDocument {
  const nodes: HtmlCanvasNode[] = [];
  const rootId = nextNodeId(tree, 0);
  walkMockTree({
    tree,
    parentId: null,
    order: 0,
    cursor: { x: 0, y: 0, width: readWidth(tree), height: readHeight(tree) },
    nodes,
  });
  const root = nodes.find((node) => node.id === rootId) ?? nodes[0]!;
  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId: root.id,
    viewport: { width: root.bounds.width, height: root.bounds.height },
    nodes,
    updatedAt: Date.now(),
  });
}

function walkMockTree(input: {
  tree: MockTreeNode;
  parentId: string | null;
  order: number;
  cursor: LayoutCursor;
  nodes: HtmlCanvasNode[];
}): void {
  const id = nextNodeId(input.tree, input.nodes.length);
  const name = String(input.tree.props.name ?? labelFromType(input.tree.type));
  const node = makeNode({
    id,
    parentId: input.parentId,
    name,
    type: input.tree.type,
    order: input.order,
    bounds: input.cursor,
    props: input.tree.props,
    text: textContent(input.tree),
  });
  input.nodes.push(node);

  const children = input.tree.children.filter(isMockTreeNode);
  const childCursors = layoutChildren(input.tree, input.cursor, children);
  children.forEach((child, index) => {
    walkMockTree({ tree: child, parentId: id, order: index, cursor: childCursors[index]!, nodes: input.nodes });
  });
}

function layoutChildren(
  parent: MockTreeNode,
  parentBounds: HtmlCanvasBounds,
  children: MockTreeNode[],
): LayoutCursor[] {
  const flex = String(parent.props.flex ?? "col");
  const isRow = flex === "row";
  const configuredGap = toNumber(parent.props.gap, 0);
  const paddingX = toNumber(parent.props.px ?? parent.props.p, 0);
  const paddingY = toNumber(parent.props.py ?? parent.props.p, 0);
  const justify = String(parent.props.justify ?? "start");
  const items = String(parent.props.items ?? "start");
  const widths = children.map(readWidth);
  const heights = children.map(readHeight);
  const contentW = Math.max(0, parentBounds.width - paddingX * 2);
  const contentH = Math.max(0, parentBounds.height - paddingY * 2);
  const totalPrimary =
    (isRow ? sum(widths) : sum(heights)) + Math.max(0, children.length - 1) * configuredGap;
  const availablePrimary = isRow ? contentW : contentH;
  const gap =
    justify === "between" && children.length > 1
      ? Math.max(configuredGap, (availablePrimary - (isRow ? sum(widths) : sum(heights))) / (children.length - 1))
      : configuredGap;
  const startPrimary =
    justify === "center" ? Math.max(0, (availablePrimary - totalPrimary) / 2)
    : justify === "end" ? Math.max(0, availablePrimary - totalPrimary)
    : 0;
  let primary = startPrimary;

  return children.map((child, index) => {
    const width = widths[index]!;
    const height = heights[index]!;
    const crossAvailable = isRow ? contentH : contentW;
    const crossSize = isRow ? height : width;
    const cross =
      items === "center" ? Math.max(0, (crossAvailable - crossSize) / 2)
      : items === "end" ? Math.max(0, crossAvailable - crossSize)
      : 0;
    const x = paddingX + (isRow ? primary : cross) + toNumber(child.props.x, 0);
    const y = paddingY + (isRow ? cross : primary) + toNumber(child.props.y, 0);
    primary += (isRow ? width : height) + gap;
    return { x: Math.round(x), y: Math.round(y), width, height };
  });
}

function readWidth(tree: MockTreeNode): number {
  const explicit = tree.props.w ?? tree.props.width;
  if (explicit !== undefined) return Math.max(1, Math.round(toNumber(explicit, tree.type === "text" ? 120 : 80)));
  if (tree.type === "text") return Math.max(1, Math.round(toNumber(tree.props.w, 120)));
  const children = tree.children.filter(isMockTreeNode);
  if (children.length === 0) return 80;
  const isRow = String(tree.props.flex ?? "col") === "row";
  const gap = toNumber(tree.props.gap, 0);
  const paddingX = toNumber(tree.props.px ?? tree.props.p, 0);
  const childWidths = children.map(readWidth);
  const width = isRow
    ? sum(childWidths) + Math.max(0, children.length - 1) * gap
    : Math.max(...childWidths);
  return Math.max(1, Math.round(width + paddingX * 2));
}

function readHeight(tree: MockTreeNode): number {
  const explicit = tree.props.h ?? tree.props.height;
  if (explicit !== undefined) return Math.max(1, Math.round(toNumber(explicit, tree.type === "text" ? 24 : 80)));
  if (tree.type === "text") return Math.max(1, Math.round(toNumber(tree.props.h, 24)));
  const children = tree.children.filter(isMockTreeNode);
  if (children.length === 0) return 80;
  const isRow = String(tree.props.flex ?? "col") === "row";
  const gap = toNumber(tree.props.gap, 0);
  const paddingY = toNumber(tree.props.py ?? tree.props.p, 0);
  const childHeights = children.map(readHeight);
  const height = isRow
    ? Math.max(...childHeights)
    : sum(childHeights) + Math.max(0, children.length - 1) * gap;
  return Math.max(1, Math.round(height + paddingY * 2));
}

function nextNodeId(tree: MockTreeNode, index: number): string {
  const name = String(tree.props.name ?? `${tree.type}-${index}`);
  const slug = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "node"}-${index}`;
}

function textContent(tree: MockTreeNode): string | null {
  const text = tree.children.filter((child) => typeof child === "string").join("");
  return text || null;
}

function isMockTreeNode(value: MockTreeNode | string): value is MockTreeNode {
  return typeof value !== "string";
}

function labelFromType(type: string): string {
  if (type === "text") return "Text";
  if (type === "rectangle" || type === "ellipse" || type === "line") return "Shape";
  if (type === "group") return "Group";
  if (type === "component") return "Component";
  return "Frame";
}
