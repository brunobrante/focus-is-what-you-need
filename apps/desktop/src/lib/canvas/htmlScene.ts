import type { ProjectType } from "@/lib/data/types";
import type { CanvasInsertToolId } from "@/lib/canvas/tools";

export const HTML_CANVAS_FORMAT = "html-css-canvas";
export const HTML_CANVAS_VERSION = 1;

export type HtmlCanvasNodeKind =
  | "frame"
  | "group"
  | "text"
  | "shape"
  | "image"
  | "component";

export type HtmlCanvasTag =
  | "div"
  | "section"
  | "header"
  | "footer"
  | "main"
  | "article"
  | "nav"
  | "button"
  | "a"
  | "img"
  | "span"
  | "p"
  | "h1"
  | "h2";

export type HtmlCanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HtmlCanvasStyle = {
  background: string;
  color: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted" | "none";
  borderRadius: number;
  shadow: string;
  display: "block" | "flex" | "grid";
  flexDirection: "row" | "column";
  align: "start" | "center" | "end" | "stretch";
  justify: "start" | "center" | "end" | "between";
  gap: number;
  paddingX: number;
  paddingY: number;
  marginX: number;
  marginY: number;
  widthMode: "fixed" | "fill" | "hug";
  heightMode: "fixed" | "fill" | "hug";
  rotation: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  objectFit: "fill" | "contain" | "cover" | "none" | "scale-down";
  overflow: "visible" | "hidden";
};

export type HtmlCanvasNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: HtmlCanvasNodeKind;
  tag: HtmlCanvasTag;
  cssId: string;
  className: string;
  order: number;
  bounds: HtmlCanvasBounds;
  style: HtmlCanvasStyle;
  text: string | null;
  imageUrl: string | null;
  appearance: "rect" | "ellipse" | "line";
  visible: boolean;
  locked: boolean;
};

export type HtmlCanvasDocument = {
  format: typeof HTML_CANVAS_FORMAT;
  version: typeof HTML_CANVAS_VERSION;
  rootId: string;
  viewport: {
    width: number;
    height: number;
  };
  nodes: HtmlCanvasNode[];
  updatedAt: number;
};

export type SubjectRootOptions = {
  wrapperName?: string;
  subjectLocked?: boolean;
};

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

export function createDefaultHtmlCanvasDocument(input: {
  name: string;
  projectType: ProjectType;
  targetKind: "screen" | "variant";
}): HtmlCanvasDocument {
  const size =
    input.targetKind === "screen"
      ? deviceSizeFor(input.projectType)
      : componentSizeFor(input.projectType);
  const rootId = "node-root";
  const rootPaddingX = input.projectType === "desktop" ? 64 : 24;
  const rootPaddingY = input.projectType === "desktop" ? 48 : 36;
  const root = makeNode({
    id: rootId,
    parentId: null,
    name: input.name || "Frame",
    type: "frame",
    order: 0,
    bounds: { x: 0, y: 0, width: size.width, height: size.height },
    props: {
      name: input.name || "Frame",
      bg: "#F7F7F2",
      rounded: 0,
      overflow: "hidden",
      px: rootPaddingX,
      py: rootPaddingY,
    },
  });
  const title = makeNode({
    id: "node-title",
    parentId: rootId,
    name: "Title",
    type: "text",
    order: 0,
    bounds: {
      x: rootPaddingX,
      y: rootPaddingY,
      width: size.width - rootPaddingX * 2,
      height: 42,
    },
    props: {
      name: "Title",
      color: "#17211D",
      size: input.projectType === "desktop" ? 28 : 22,
      weight: 800,
    },
    text: input.name || "Untitled",
  });
  const panel = makeNode({
    id: "node-panel",
    parentId: rootId,
    name: "Content Block",
    type: "frame",
    order: 1,
    bounds: {
      x: rootPaddingX,
      y: rootPaddingY + 64,
      width: size.width - rootPaddingX * 2,
      height: Math.min(220, size.height - rootPaddingY * 2 - 132),
    },
    props: {
      name: "Content Block",
      bg: "#FFFFFF",
      rounded: 24,
      stroke: "#DDE4D8",
      px: 24,
      py: 24,
    },
  });
  const cta = makeNode({
    id: "node-action",
    parentId: panel.id,
    name: "Primary CTA",
    type: "frame",
    order: 0,
    bounds: { x: 24, y: 24, width: 148, height: 44 },
    props: {
      name: "Primary CTA",
      bg: "#0F2D2E",
      color: "#F4F6F1",
      rounded: 22,
      flex: "row",
      justify: "center",
      items: "center",
      weight: 700,
    },
    text: "Editar",
  });

  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: size,
    nodes: [root, title, panel, cta],
    updatedAt: Date.now(),
  });
}

export function htmlCanvasDocumentFromMockTree(
  tree: MockTreeNode,
): HtmlCanvasDocument {
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

export function ensureHtmlCanvasSubjectRoot(
  document: HtmlCanvasDocument,
  options: SubjectRootOptions = {},
): HtmlCanvasDocument {
  const normalized = normalizeHtmlCanvasDocument(document);
  const root = getHtmlCanvasNode(normalized, normalized.rootId);
  if (!root) return normalized;

  const locked = options.subjectLocked ?? true;
  const children = getHtmlCanvasChildren(normalized, root.id);
  if (isSubjectWrapperRoot(root, children)) {
    const subject = children[0]!;
    return normalizeHtmlCanvasDocument({
      ...normalized,
      nodes: normalized.nodes.map((node) =>
        node.id === subject.id ? { ...node, locked } : node,
      ),
    });
  }

  const wrapperId = uniqueNodeId(normalized, `canvas-root-${root.id}`);
  const wrapper = makeCanvasWrapperNode({
    id: wrapperId,
    name: options.wrapperName ?? `${root.name} Canvas`,
    width: root.bounds.width,
    height: root.bounds.height,
  });

  return normalizeHtmlCanvasDocument({
    ...normalized,
    rootId: wrapperId,
    viewport: {
      width: root.bounds.width,
      height: root.bounds.height,
    },
    nodes: [
      wrapper,
      ...normalized.nodes.map((node) =>
        node.id === root.id
          ? {
              ...node,
              parentId: wrapperId,
              order: 0,
              bounds: {
                ...node.bounds,
                x: 0,
                y: 0,
              },
              locked,
            }
          : node,
      ),
    ],
  });
}

export function ensureHtmlCanvasSubjectRootJSON(
  graphJSON: string | null | undefined,
  options: SubjectRootOptions = {},
): string | null {
  const document = htmlCanvasDocumentFromJSON(graphJSON ?? null);
  if (!document) return null;
  return serializeHtmlCanvasDocument(
    ensureHtmlCanvasSubjectRoot(document, options),
  );
}

export function htmlCanvasDocumentFromJSON(json: string | null): HtmlCanvasDocument | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<HtmlCanvasDocument>;
    if (
      value.format !== HTML_CANVAS_FORMAT ||
      value.version !== HTML_CANVAS_VERSION ||
      typeof value.rootId !== "string" ||
      !Array.isArray(value.nodes)
    ) {
      return null;
    }
    return normalizeHtmlCanvasDocument(value as HtmlCanvasDocument);
  } catch {
    return null;
  }
}

export function serializeHtmlCanvasDocument(document: HtmlCanvasDocument): string {
  return JSON.stringify(normalizeHtmlCanvasDocument(document));
}

export function normalizeHtmlCanvasDocument(
  document: HtmlCanvasDocument,
): HtmlCanvasDocument {
  const nodes = document.nodes.map((node, index) => normalizeNode(node, index));
  const root = nodes.find((node) => node.id === document.rootId) ?? nodes[0];
  const rootId = root?.id ?? "node-root";
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: root
      ? { width: root.bounds.width, height: root.bounds.height }
      : document.viewport,
    nodes,
    updatedAt: document.updatedAt || Date.now(),
  };
}

export function getHtmlCanvasNode(
  document: HtmlCanvasDocument | null,
  nodeId: string | null | undefined,
): HtmlCanvasNode | null {
  if (!document || !nodeId) return null;
  return document.nodes.find((node) => node.id === nodeId) ?? null;
}

export function getHtmlCanvasChildren(
  document: HtmlCanvasDocument,
  parentId: string,
): HtmlCanvasNode[] {
  return document.nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

export function updateHtmlCanvasNode(
  document: HtmlCanvasDocument,
  nodeId: string,
  patch: Partial<Omit<HtmlCanvasNode, "id" | "style" | "bounds">>,
): HtmlCanvasDocument {
  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId ? normalizeNode({ ...node, ...patch }, node.order) : node,
    ),
  });
}

export function updateHtmlCanvasNodeBounds(
  document: HtmlCanvasDocument,
  nodeId: string,
  bounds: Partial<HtmlCanvasBounds>,
): HtmlCanvasDocument {
  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId
        ? normalizeNode({ ...node, bounds: { ...node.bounds, ...bounds } }, node.order)
        : node,
    ),
  });
}

export function updateHtmlCanvasNodeStyle(
  document: HtmlCanvasDocument,
  nodeId: string,
  style: Partial<HtmlCanvasStyle>,
): HtmlCanvasDocument {
  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) =>
      node.id === nodeId
        ? normalizeNode({ ...node, style: { ...node.style, ...style } }, node.order)
        : node,
    ),
  });
}

export function deleteHtmlCanvasNodeTree(
  document: HtmlCanvasDocument,
  nodeId: string,
): HtmlCanvasDocument {
  if (nodeId === document.rootId) return document;
  const ids = collectNodeTreeIds(document, nodeId);
  if (ids.size === 0) return document;
  return touchDocument({
    ...document,
    nodes: document.nodes.filter((node) => !ids.has(node.id)),
  });
}

export function duplicateHtmlCanvasNodeTree(
  document: HtmlCanvasDocument,
  nodeId: string,
): { document: HtmlCanvasDocument; node: HtmlCanvasNode | null } {
  if (nodeId === document.rootId) return { document, node: null };
  const rootNode = getHtmlCanvasNode(document, nodeId);
  if (!rootNode) return { document, node: null };
  const ids = collectNodeTreeIds(document, nodeId);
  const idMap = new Map<string, string>();
  for (const id of ids) {
    idMap.set(id, `node-copy-${Date.now().toString(36)}-${idMap.size}`);
  }
  const siblings = getHtmlCanvasChildren(document, rootNode.parentId ?? document.rootId);
  const copies = document.nodes
    .filter((node) => ids.has(node.id))
    .map((node) => {
      const copyId = idMap.get(node.id)!;
      const parentId =
        node.parentId && idMap.has(node.parentId)
          ? idMap.get(node.parentId)!
          : node.parentId;
      const isTopCopy = node.id === nodeId;
      return normalizeNode(
        {
          ...node,
          id: copyId,
          parentId,
          name: isTopCopy ? `${node.name} Copy` : node.name,
          cssId: isTopCopy ? `${node.cssId}-copy` : node.cssId,
          className: node.className,
          order: isTopCopy ? siblings.length : node.order,
          bounds: isTopCopy
            ? {
                ...node.bounds,
                x: node.bounds.x + 16,
                y: node.bounds.y + 16,
              }
            : node.bounds,
        },
        node.order,
      );
    });

  const next = touchDocument({
    ...document,
    nodes: [...document.nodes, ...copies],
  });
  return {
    document: next,
    node: copies.find((copy) => copy.id === idMap.get(nodeId)) ?? null,
  };
}

export type HtmlCanvasLayerMove =
  | "front"
  | "back"
  | "forward"
  | "backward";

export function moveHtmlCanvasNodeLayer(
  document: HtmlCanvasDocument,
  nodeId: string,
  move: HtmlCanvasLayerMove,
): HtmlCanvasDocument {
  if (nodeId === document.rootId) return document;
  const node = getHtmlCanvasNode(document, nodeId);
  if (!node) return document;

  const siblings = getHtmlCanvasChildren(document, node.parentId ?? document.rootId);
  const from = siblings.findIndex((sibling) => sibling.id === nodeId);
  if (from < 0) return document;

  const to =
    move === "front"
      ? siblings.length - 1
      : move === "back"
        ? 0
        : move === "forward"
          ? Math.min(siblings.length - 1, from + 1)
          : Math.max(0, from - 1);
  if (from === to) return document;

  return reorderSiblings(document, siblings, from, to);
}

export function reorderHtmlCanvasNode(
  document: HtmlCanvasDocument,
  activeNodeId: string,
  overNodeId: string,
): HtmlCanvasDocument {
  if (activeNodeId === overNodeId || activeNodeId === document.rootId) {
    return document;
  }
  const active = getHtmlCanvasNode(document, activeNodeId);
  const over = getHtmlCanvasNode(document, overNodeId);
  if (!active || !over) return document;

  const activeParentId = active.parentId ?? document.rootId;
  const overParentId = over.parentId ?? document.rootId;
  if (activeParentId !== overParentId) return document;

  const siblings = getHtmlCanvasChildren(document, activeParentId);
  const from = siblings.findIndex((sibling) => sibling.id === activeNodeId);
  const to = siblings.findIndex((sibling) => sibling.id === overNodeId);
  if (from < 0 || to < 0 || from === to) return document;

  return reorderSiblings(document, siblings, from, to);
}

export function groupHtmlCanvasNodes(
  document: HtmlCanvasDocument,
  nodeIds: string[],
): { document: HtmlCanvasDocument; node: HtmlCanvasNode | null } {
  const nodes = nodeIds
    .map((id) => getHtmlCanvasNode(document, id))
    .filter((node): node is HtmlCanvasNode => Boolean(node && node.id !== document.rootId));
  if (nodes.length < 2) return { document, node: null };

  const sharedParentId = nodes[0]!.parentId;
  if (!nodes.every((n) => n.parentId === sharedParentId)) return { document, node: null };

  const minX = Math.min(...nodes.map((n) => n.bounds.x));
  const minY = Math.min(...nodes.map((n) => n.bounds.y));
  const maxX = Math.max(...nodes.map((n) => n.bounds.x + n.bounds.width));
  const maxY = Math.max(...nodes.map((n) => n.bounds.y + n.bounds.height));

  const parentId = sharedParentId ?? document.rootId;
  const siblings = getHtmlCanvasChildren(document, parentId);
  const groupId = `node-group-${Date.now().toString(36)}-${document.nodes.length}`;
  const group = normalizeNode(
    makeNode({
      id: groupId,
      parentId,
      name: "Group",
      type: "group",
      order: siblings.length,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      props: { name: "Group", bg: "transparent" },
    }),
    siblings.length,
  );

  const movedIds = new Set(nodes.map((n) => n.id));
  let order = 0;
  const reparented = document.nodes.map((node) => {
    if (!movedIds.has(node.id)) return node;
    return normalizeNode(
      {
        ...node,
        parentId: groupId,
        bounds: {
          ...node.bounds,
          x: node.bounds.x - minX,
          y: node.bounds.y - minY,
        },
        order: order++,
      },
      node.order,
    );
  });

  const next = touchDocument({
    ...document,
    nodes: [...reparented, group],
  });
  return { document: next, node: group };
}

export function ungroupHtmlCanvasNode(
  document: HtmlCanvasDocument,
  nodeId: string,
): { document: HtmlCanvasDocument; childIds: string[] } {
  if (nodeId === document.rootId) return { document, childIds: [] };
  const group = getHtmlCanvasNode(document, nodeId);
  if (!group) return { document, childIds: [] };
  const children = getHtmlCanvasChildren(document, nodeId);
  if (children.length === 0) return { document, childIds: [] };

  const newParentId = group.parentId ?? document.rootId;
  const siblings = getHtmlCanvasChildren(document, newParentId).filter((n) => n.id !== nodeId);
  let order = siblings.length;
  const childIds = children.map((c) => c.id);

  const next = document.nodes
    .filter((n) => n.id !== nodeId)
    .map((node) => {
      if (node.parentId !== nodeId) return node;
      return normalizeNode(
        {
          ...node,
          parentId: newParentId,
          bounds: {
            ...node.bounds,
            x: node.bounds.x + group.bounds.x,
            y: node.bounds.y + group.bounds.y,
          },
          order: order++,
        },
        node.order,
      );
    });

  return { document: touchDocument({ ...document, nodes: next }), childIds };
}

export function insertHtmlCanvasNode(input: {
  document: HtmlCanvasDocument;
  tool: CanvasInsertToolId;
  point: { x: number; y: number };
  bounds?: Partial<HtmlCanvasBounds>;
}): { document: HtmlCanvasDocument; node: HtmlCanvasNode } {
  const document = normalizeHtmlCanvasDocument(input.document);
  const root = getHtmlCanvasNode(document, document.rootId);
  const siblings = getHtmlCanvasChildren(document, document.rootId);
  const id = `node-${input.tool}-${Date.now().toString(36)}-${document.nodes.length}`;
  const baseBounds = boundsForTool(input.tool, input.point);
  const bounds = {
    ...baseBounds,
    ...input.bounds,
  };
  const node = normalizeNode(
    makeNode({
      id,
      parentId: root?.id ?? document.rootId,
      name: nameForTool(input.tool),
      type: typeForTool(input.tool),
      order: siblings.length,
      bounds,
      props: propsForTool(input.tool),
      text: textForTool(input.tool),
    }),
    siblings.length,
  );
  const next = touchDocument({
    ...document,
    nodes: [...document.nodes, node],
  });
  return { document: next, node };
}

export function insertHtmlCanvasImageNode(input: {
  document: HtmlCanvasDocument;
  point: { x: number; y: number };
  imageUrl: string;
  name?: string;
  bounds?: Partial<HtmlCanvasBounds>;
}): { document: HtmlCanvasDocument; node: HtmlCanvasNode } {
  const document = normalizeHtmlCanvasDocument(input.document);
  const root = getHtmlCanvasNode(document, document.rootId);
  const siblings = getHtmlCanvasChildren(document, document.rootId);
  const id = `node-image-${Date.now().toString(36)}-${document.nodes.length}`;
  const node = normalizeNode(
    makeNode({
      id,
      parentId: root?.id ?? document.rootId,
      name: input.name ?? "Image",
      type: "image",
      order: siblings.length,
      bounds: {
        x: Math.round(input.point.x),
        y: Math.round(input.point.y),
        width: 240,
        height: 180,
        ...input.bounds,
      },
      props: {
        name: input.name ?? "Image",
        src: input.imageUrl,
        bg: "#E8ECE7",
        rounded: 8,
        overflow: "hidden",
      },
    }),
    siblings.length,
  );
  const next = touchDocument({
    ...document,
    nodes: [...document.nodes, node],
  });
  return { document: next, node };
}

function reorderSiblings(
  document: HtmlCanvasDocument,
  siblings: HtmlCanvasNode[],
  from: number,
  to: number,
): HtmlCanvasDocument {
  const nextSiblings = [...siblings];
  const [moving] = nextSiblings.splice(from, 1);
  if (!moving) return document;
  nextSiblings.splice(to, 0, moving);
  const orderById = new Map(nextSiblings.map((node, index) => [node.id, index]));

  return touchDocument({
    ...document,
    nodes: document.nodes.map((node) => {
      const nextOrder = orderById.get(node.id);
      return nextOrder === undefined ? node : { ...node, order: nextOrder };
    }),
  });
}

function collectNodeTreeIds(document: HtmlCanvasDocument, nodeId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (ids.has(current)) continue;
    const node = getHtmlCanvasNode(document, current);
    if (!node) continue;
    ids.add(current);
    for (const child of getHtmlCanvasChildren(document, current)) {
      queue.push(child.id);
    }
  }
  return ids;
}

export function svgForHtmlCanvasDocument(document: HtmlCanvasDocument): string {
  const normalized = normalizeHtmlCanvasDocument(document);
  const root = getHtmlCanvasNode(normalized, normalized.rootId);
  if (!root) return "";
  const body = renderSvgNode(normalized, root, 0, 0);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${root.bounds.width}" height="${root.bounds.height}" viewBox="0 0 ${root.bounds.width} ${root.bounds.height}" fill="none">`,
    body,
    "</svg>",
  ].join("");
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
    walkMockTree({
      tree: child,
      parentId: id,
      order: index,
      cursor: childCursors[index]!,
      nodes: input.nodes,
    });
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
    (isRow ? sum(widths) : sum(heights)) +
    Math.max(0, children.length - 1) * configuredGap;
  const availablePrimary = isRow ? contentW : contentH;
  const gap =
    justify === "between" && children.length > 1
      ? Math.max(
          configuredGap,
          (availablePrimary - (isRow ? sum(widths) : sum(heights))) /
            (children.length - 1),
        )
      : configuredGap;
  const startPrimary =
    justify === "center"
      ? Math.max(0, (availablePrimary - totalPrimary) / 2)
      : justify === "end"
        ? Math.max(0, availablePrimary - totalPrimary)
        : 0;
  let primary = startPrimary;

  return children.map((child, index) => {
    const width = widths[index]!;
    const height = heights[index]!;
    const crossAvailable = isRow ? contentH : contentW;
    const crossSize = isRow ? height : width;
    const cross =
      items === "center"
        ? Math.max(0, (crossAvailable - crossSize) / 2)
        : items === "end"
          ? Math.max(0, crossAvailable - crossSize)
          : 0;
    const x = paddingX + (isRow ? primary : cross) + toNumber(child.props.x, 0);
    const y = paddingY + (isRow ? cross : primary) + toNumber(child.props.y, 0);
    primary += (isRow ? width : height) + gap;
    return { x: Math.round(x), y: Math.round(y), width, height };
  });
}

function makeNode(input: {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  order: number;
  bounds: HtmlCanvasBounds;
  props: Record<string, unknown>;
  text?: string | null;
}): HtmlCanvasNode {
  const kind = kindFromType(input.type);
  const name = input.name || labelFromType(input.type);
  const background = String(input.props.bg ?? input.props.fill ?? "transparent");
  const color = String(input.props.color ?? "#17211D");
  const stroke = input.props.stroke ? String(input.props.stroke) : "transparent";
  return {
    id: input.id,
    parentId: input.parentId,
    name,
    kind,
    tag: tagFromKind(kind, name),
    cssId: slugId(name),
    className: slugClass(name),
    order: input.order,
    bounds: {
      x: Math.round(input.bounds.x),
      y: Math.round(input.bounds.y),
      width: Math.max(1, Math.round(input.bounds.width)),
      height: Math.max(1, Math.round(input.bounds.height)),
    },
    style: {
      ...defaultStyle(),
      background: kind === "text" ? "transparent" : background,
      color,
      opacity: toNumber(input.props.opacity, 1),
      borderColor: stroke,
      borderWidth: input.props.stroke ? toNumber(input.props.strokeWidth, 1) : 0,
      borderStyle: input.props.stroke ? "solid" : "none",
      borderRadius: toNumber(input.props.rounded ?? input.props.cornerRadius, 0),
      shadow: String(input.props.shadow ?? "none"),
      display: input.props.grid ? "grid" : input.props.flex ? "flex" : "block",
      flexDirection: input.props.flex === "row" ? "row" : "column",
      align: alignFromMock(input.props.items),
      justify: justifyFromMock(input.props.justify),
      gap: toNumber(input.props.gap, 0),
      paddingX: toNumber(input.props.px ?? input.props.p, 0),
      paddingY: toNumber(input.props.py ?? input.props.p, 0),
      marginX: toNumber(input.props.mx ?? input.props.m, 0),
      marginY: toNumber(input.props.my ?? input.props.m, 0),
      widthMode: modeFromMock(input.props.widthMode),
      heightMode: modeFromMock(input.props.heightMode),
      rotation: toNumber(input.props.rotation, 0),
      fontFamily: String(input.props.font ?? input.props.fontFamily ?? "Inter"),
      fontSize: toNumber(input.props.size ?? input.props.fontSize, 14),
      fontWeight: weightFromMock(input.props.weight ?? input.props.fontWeight),
      textAlign: textAlignFromMock(input.props.alignText ?? input.props.textAlign),
      objectFit: objectFitFromMock(input.props.objectFit),
      overflow: input.props.overflow === "hidden" ? "hidden" : "visible",
    },
    text: input.text ?? null,
    imageUrl: typeof input.props.src === "string" ? input.props.src : null,
    appearance:
      input.type === "ellipse"
        ? "ellipse"
        : input.type === "line"
          ? "line"
          : "rect",
    visible: true,
    locked: input.props.locked === true,
  };
}

function boundsForTool(
  tool: CanvasInsertToolId,
  point: { x: number; y: number },
): HtmlCanvasBounds {
  const size = defaultSizeForTool(tool);
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
    width: size.width,
    height: size.height,
  };
}

function defaultSizeForTool(tool: CanvasInsertToolId): { width: number; height: number } {
  if (tool === "wrapper") return { width: 200, height: 200 };
  if (tool === "rectangle") return { width: 168, height: 104 };
  if (tool === "ellipse") return { width: 132, height: 132 };
  if (tool === "line") return { width: 180, height: 0 };
  if (tool === "pen") return { width: 180, height: 72 };
  if (tool === "text") return { width: 220, height: 34 };
  return { width: 148, height: 44 };
}

function nameForTool(tool: CanvasInsertToolId): string {
  if (tool === "wrapper") return "Wrapper";
  if (tool === "rectangle") return "Rectangle";
  if (tool === "ellipse") return "Ellipse";
  if (tool === "line") return "Line";
  if (tool === "pen") return "Pen Path";
  if (tool === "text") return "Text";
  return "Action Button";
}

function typeForTool(tool: CanvasInsertToolId): string {
  if (tool === "wrapper") return "frame";
  if (tool === "text") return "text";
  if (tool === "actions") return "component";
  return tool === "ellipse" ? "ellipse" : tool === "line" || tool === "pen" ? "line" : "rectangle";
}

function propsForTool(tool: CanvasInsertToolId): Record<string, unknown> {
  if (tool === "wrapper") {
    return {
      name: nameForTool(tool),
      overflow: "visible",
    };
  }
  if (tool === "rectangle") {
    return {
      name: nameForTool(tool),
      bg: "#FFFFFF",
      stroke: "#DDE4D8",
      strokeWidth: 1,
      rounded: 8,
    };
  }
  if (tool === "ellipse") {
    return {
      name: nameForTool(tool),
      bg: "#B9E769",
      stroke: "#0F2D2E",
      strokeWidth: 1,
      rounded: 999,
    };
  }
  if (tool === "line") {
    return {
      name: nameForTool(tool),
      bg: "#0F2D2E",
      stroke: "#0F2D2E",
      strokeWidth: 2,
    };
  }
  if (tool === "pen") {
    return {
      name: nameForTool(tool),
      bg: "#7C5CFF",
      stroke: "#7C5CFF",
      strokeWidth: 3,
    };
  }
  if (tool === "text") {
    return {
      name: nameForTool(tool),
      color: "#17211D",
      size: 24,
      weight: 700,
    };
  }
  return {
    name: nameForTool(tool),
    bg: "#0F2D2E",
    color: "#F4F6F1",
    rounded: 22,
    flex: "row",
    justify: "center",
    items: "center",
    weight: 700,
  };
}

function textForTool(tool: CanvasInsertToolId): string | null {
  if (tool === "text") return "Novo texto";
  if (tool === "actions") return "Ação";
  return null;
}

function renderSvgNode(
  document: HtmlCanvasDocument,
  node: HtmlCanvasNode,
  parentX: number,
  parentY: number,
): string {
  if (!node.visible) return "";

  const x = parentX + node.bounds.x;
  const y = parentY + node.bounds.y;
  const children = getHtmlCanvasChildren(document, node.id)
    .map((child) => renderSvgNode(document, child, x, y))
    .join("");
  const fill =
    node.kind === "text" || node.style.background === "transparent"
      ? "none"
      : escapeAttr(node.style.background);
  const stroke =
    node.style.borderStyle === "none" || node.style.borderWidth <= 0
      ? ""
      : ` stroke="${escapeAttr(node.style.borderColor)}" stroke-width="${node.style.borderWidth}"`;
  const opacity = node.style.opacity < 1 ? ` opacity="${node.style.opacity}"` : "";

  if (node.kind === "text") {
    const text = escapeXml(node.text ?? node.name);
    return [
      `<text x="${x}" y="${y + node.style.fontSize}" fill="${escapeAttr(node.style.color)}" font-family="${escapeAttr(node.style.fontFamily)}" font-size="${node.style.fontSize}" font-weight="${node.style.fontWeight}"${opacity}>${text}</text>`,
      children,
    ].join("");
  }

  if (node.appearance === "ellipse") {
    return [
      `<ellipse cx="${x + node.bounds.width / 2}" cy="${y + node.bounds.height / 2}" rx="${node.bounds.width / 2}" ry="${node.bounds.height / 2}" fill="${fill}"${stroke}${opacity}/>`,
      children,
    ].join("");
  }

  if (node.appearance === "line") {
    return [
      `<line x1="${x}" y1="${y}" x2="${x + node.bounds.width}" y2="${y + node.bounds.height}" stroke="${escapeAttr(node.style.borderColor === "transparent" ? node.style.background : node.style.borderColor)}" stroke-width="${Math.max(1, node.style.borderWidth || 2)}"${opacity}/>`,
      children,
    ].join("");
  }

  return [
    `<rect x="${x}" y="${y}" width="${node.bounds.width}" height="${node.bounds.height}" rx="${node.style.borderRadius}" fill="${fill}"${stroke}${opacity}/>`,
    children,
  ].join("");
}

function normalizeNode(node: HtmlCanvasNode, fallbackOrder: number): HtmlCanvasNode {
  return {
    ...node,
    tag: isCanvasTag(node.tag) ? node.tag : tagFromKind(node.kind, node.name),
    cssId: node.cssId || slugId(node.name),
    className: node.className || slugClass(node.name),
    order: Number.isFinite(node.order) ? node.order : fallbackOrder,
    bounds: {
      x: clamp(node.bounds.x, -10000, 10000),
      y: clamp(node.bounds.y, -10000, 10000),
      width: clamp(node.bounds.width, 1, 10000),
      height: clamp(node.bounds.height, 1, 10000),
    },
    style: normalizeStyle(node.style),
    text: node.text ?? null,
    imageUrl: node.imageUrl ?? null,
    appearance: node.appearance ?? "rect",
    visible: node.visible ?? true,
    locked: node.locked ?? false,
  };
}

function normalizeStyle(style: Partial<HtmlCanvasStyle>): HtmlCanvasStyle {
  const next = { ...defaultStyle(), ...style };
  return {
    ...next,
    opacity: clamp(next.opacity, 0, 1),
    borderWidth: clamp(next.borderWidth, 0, 80),
    borderRadius: clamp(next.borderRadius, 0, 999),
    gap: clamp(next.gap, 0, 999),
    paddingX: clamp(next.paddingX, 0, 999),
    paddingY: clamp(next.paddingY, 0, 999),
    marginX: clamp(next.marginX, -999, 999),
    marginY: clamp(next.marginY, -999, 999),
    rotation: normalizeRotation(next.rotation),
    fontSize: clamp(next.fontSize, 1, 300),
    fontWeight: clamp(next.fontWeight, 100, 1000),
  };
}

function touchDocument(document: HtmlCanvasDocument): HtmlCanvasDocument {
  return normalizeHtmlCanvasDocument({ ...document, updatedAt: Date.now() });
}

function defaultStyle(): HtmlCanvasStyle {
  return {
    background: "transparent",
    color: "#17211D",
    opacity: 1,
    borderColor: "transparent",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: 0,
    shadow: "none",
    display: "block",
    flexDirection: "column",
    align: "start",
    justify: "start",
    gap: 0,
    paddingX: 0,
    paddingY: 0,
    marginX: 0,
    marginY: 0,
    widthMode: "fixed",
    heightMode: "fixed",
    rotation: 0,
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 400,
    textAlign: "left",
    objectFit: "cover",
    overflow: "visible",
  };
}

function nextNodeId(tree: MockTreeNode, index: number): string {
  const name = String(tree.props.name ?? `${tree.type}-${index}`);
  return `${slugId(name)}-${index}`;
}

function readWidth(tree: MockTreeNode): number {
  const explicit = tree.props.w ?? tree.props.width;
  if (explicit !== undefined) {
    return Math.max(1, Math.round(toNumber(explicit, tree.type === "text" ? 120 : 80)));
  }
  if (tree.type === "text") {
    return Math.max(1, Math.round(toNumber(tree.props.w, 120)));
  }

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
  if (explicit !== undefined) {
    return Math.max(1, Math.round(toNumber(explicit, tree.type === "text" ? 24 : 80)));
  }
  if (tree.type === "text") {
    return Math.max(1, Math.round(toNumber(tree.props.h, 24)));
  }

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

function isSubjectWrapperRoot(
  root: HtmlCanvasNode,
  children: HtmlCanvasNode[],
): boolean {
  if (!root.name.endsWith(" Canvas") || children.length !== 1) return false;
  const child = children[0]!;
  return (
    child.bounds.x === 0 &&
    child.bounds.y === 0 &&
    child.bounds.width === root.bounds.width &&
    child.bounds.height === root.bounds.height
  );
}

function makeCanvasWrapperNode(input: {
  id: string;
  name: string;
  width: number;
  height: number;
}): HtmlCanvasNode {
  return {
    id: input.id,
    parentId: null,
    name: input.name,
    kind: "frame",
    tag: "section",
    cssId: slugId(input.name),
    className: slugClass(input.name),
    order: 0,
    bounds: {
      x: 0,
      y: 0,
      width: input.width,
      height: input.height,
    },
    style: {
      ...defaultStyle(),
      background: "transparent",
      overflow: "visible",
    },
    text: null,
    imageUrl: null,
    appearance: "rect",
    visible: true,
    locked: false,
  };
}

function uniqueNodeId(document: HtmlCanvasDocument, preferred: string): string {
  const ids = new Set(document.nodes.map((node) => node.id));
  if (!ids.has(preferred)) return preferred;

  let index = 1;
  while (ids.has(`${preferred}-${index}`)) {
    index += 1;
  }
  return `${preferred}-${index}`;
}

function textContent(tree: MockTreeNode): string | null {
  const text = tree.children.filter((child) => typeof child === "string").join("");
  return text || null;
}

function isMockTreeNode(value: MockTreeNode | string): value is MockTreeNode {
  return typeof value !== "string";
}

function kindFromType(type: string): HtmlCanvasNodeKind {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "rectangle" || type === "ellipse" || type === "line") return "shape";
  if (type === "group" || type === "section") return "group";
  if (type === "component" || type === "instance") return "component";
  return "frame";
}

function labelFromType(type: string): string {
  if (type === "text") return "Text";
  if (type === "rectangle" || type === "ellipse" || type === "line") return "Shape";
  if (type === "group") return "Group";
  if (type === "component") return "Component";
  return "Frame";
}

function tagFromKind(kind: HtmlCanvasNodeKind, name: string): HtmlCanvasTag {
  const normalized = normalizeName(name);
  if (normalized.includes("header")) return "header";
  if (normalized.includes("footer") || normalized.includes("cart")) return "footer";
  if (normalized.includes("nav")) return "nav";
  if (kind === "image") return "img";
  if (kind === "text") return normalized.includes("title") ? "h2" : "p";
  if (kind === "component" && (normalized.includes("button") || normalized.includes("cta"))) {
    return "button";
  }
  if (kind === "frame") return "section";
  return "div";
}

function deviceSizeFor(projectType: ProjectType): { width: number; height: number } {
  if (projectType === "desktop") return { width: 1440, height: 900 };
  if (projectType === "tablet") return { width: 820, height: 1180 };
  return { width: 390, height: 844 };
}

function componentSizeFor(projectType: ProjectType): { width: number; height: number } {
  if (projectType === "desktop") return { width: 720, height: 360 };
  if (projectType === "tablet") return { width: 520, height: 320 };
  return { width: 342, height: 220 };
}

function alignFromMock(value: unknown): HtmlCanvasStyle["align"] {
  if (value === "center") return "center";
  if (value === "end") return "end";
  if (value === "stretch") return "stretch";
  return "start";
}

function justifyFromMock(value: unknown): HtmlCanvasStyle["justify"] {
  if (value === "center") return "center";
  if (value === "end") return "end";
  if (value === "between") return "between";
  return "start";
}

function modeFromMock(value: unknown): HtmlCanvasStyle["widthMode"] {
  if (value === "fill") return "fill";
  if (value === "hug" || value === "auto") return "hug";
  return "fixed";
}

function textAlignFromMock(value: unknown): HtmlCanvasStyle["textAlign"] {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  return "left";
}

function objectFitFromMock(value: unknown): HtmlCanvasStyle["objectFit"] {
  if (value === "fill") return "fill";
  if (value === "contain") return "contain";
  if (value === "none") return "none";
  if (value === "scale-down") return "scale-down";
  return "cover";
}

function weightFromMock(value: unknown): number {
  if (value === "bold") return 700;
  if (value === "medium") return 500;
  if (value === "normal") return 400;
  return toNumber(value, 400);
}

function slugId(value: string): string {
  const slug = slugClass(value);
  return slug || "node";
}

function slugClass(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isCanvasTag(value: string): value is HtmlCanvasTag {
  return [
    "div",
    "section",
    "header",
    "footer",
    "main",
    "article",
    "nav",
    "button",
    "a",
    "img",
    "span",
    "p",
    "h1",
    "h2",
  ].includes(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function escapeAttr(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
