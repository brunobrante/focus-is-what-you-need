import type { ProjectType } from "@/domain/canvas/projectType";
import type { CanvasInsertToolId } from "@/domain/canvas/types";
import type {
  HtmlCanvasDocument,
  HtmlCanvasNode,
  HtmlCanvasStyle,
  SubjectRootOptions,
} from "./types";
import { HTML_CANVAS_FORMAT, HTML_CANVAS_VERSION } from "./types";
import {
  boundsForTool,
  makeCanvasWrapperNode,
  makeNode,
  nameForTool,
  normalizeNode,
  propsForTool,
  textForTool,
  typeForTool,
} from "./nodeHelpers";
import { defaultStyle, slugClass, slugId } from "./styleUtils";

export function normalizeHtmlCanvasDocument(document: HtmlCanvasDocument): HtmlCanvasDocument {
  const nodes = document.nodes.map((node, index) => normalizeNode(node, index));
  const root = nodes.find((node) => node.id === document.rootId) ?? nodes[0];
  const rootId = root?.id ?? "node-root";
  return {
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: root ? { width: root.bounds.width, height: root.bounds.height } : document.viewport,
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

export function getHtmlCanvasChildren(document: HtmlCanvasDocument, parentId: string): HtmlCanvasNode[] {
  return document.nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

function touchDocument(document: HtmlCanvasDocument): HtmlCanvasDocument {
  return normalizeHtmlCanvasDocument({ ...document, updatedAt: Date.now() });
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

// ---------------------------------------------------------------------------
// Canonical compaction (D10): the `graphJSON` blob is the hottest data in the
// app. We persist only what differs from the type defaults — `normalizeNode` /
// `normalizeStyle` re-derive everything omitted on parse, so this is the EXACT
// inverse of normalization. Serialization stays canonical/deterministic (stable
// key order, consistent omission) so the string-equality save-skip still holds.
// ---------------------------------------------------------------------------

/** Round a coordinate to 2 decimals — kills float noise and bytes (D10). */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Drop style props equal to their default; keep custom + non-default extras
 *  (token refs, effects, fills…). `normalizeStyle` refills the omitted defaults. */
function compactStyle(style: HtmlCanvasStyle): Record<string, unknown> | undefined {
  const def = defaultStyle() as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (key in def && def[key] === value) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Compact one already-normalized node: omit fields `normalizeNode` re-derives
 *  (cssId/className from name, null text/imageUrl, default visible/locked/
 *  appearance/instanceOf), round bounds. Key order is fixed → deterministic. */
function compactNode(node: HtmlCanvasNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    kind: node.kind,
    tag: node.tag,
    order: node.order,
    bounds: {
      x: roundCoord(node.bounds.x),
      y: roundCoord(node.bounds.y),
      width: roundCoord(node.bounds.width),
      height: roundCoord(node.bounds.height),
    },
  };
  if (node.cssId !== slugId(node.name)) out.cssId = node.cssId;
  if (node.className !== slugClass(node.name)) out.className = node.className;
  if (node.text != null) out.text = node.text;
  if (node.textRuns) out.textRuns = node.textRuns;
  if (node.imageUrl != null) out.imageUrl = node.imageUrl;
  if (node.appearance !== "rect") out.appearance = node.appearance;
  if (node.visible !== true) out.visible = node.visible;
  if (node.locked !== false) out.locked = node.locked;
  if (node.instanceOf != null) out.instanceOf = node.instanceOf;
  // Vector payload (path/svg nodes). `normalizeNode` preserves them via spread, so
  // emitting them here is the only thing needed to persist a vector round-trip.
  if (node.viewBox) out.viewBox = node.viewBox;
  if (node.vectorPath) out.vectorPath = node.vectorPath;
  const style = compactStyle(node.style);
  if (style) out.style = style;
  return out;
}

/** The serialization-shape (default-omitted) of a normalized document. */
export function compactHtmlCanvasDocument(
  document: HtmlCanvasDocument,
): Record<string, unknown> {
  return {
    format: document.format,
    version: document.version,
    rootId: document.rootId,
    viewport: document.viewport,
    nodes: document.nodes.map(compactNode),
    updatedAt: document.updatedAt,
  };
}

export function serializeHtmlCanvasDocument(document: HtmlCanvasDocument): string {
  // Normalize to the canonical full form first, then compact — so the omitted
  // fields are exactly the ones parse re-derives.
  return JSON.stringify(compactHtmlCanvasDocument(normalizeHtmlCanvasDocument(document)));
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
  bounds: Partial<import("./types").HtmlCanvasBounds>,
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
  style: Partial<import("./types").HtmlCanvasStyle>,
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

export function deleteHtmlCanvasNodeTree(document: HtmlCanvasDocument, nodeId: string): HtmlCanvasDocument {
  if (nodeId === document.rootId) return document;
  const ids = collectNodeTreeIds(document, nodeId);
  if (ids.size === 0) return document;
  return touchDocument({ ...document, nodes: document.nodes.filter((node) => !ids.has(node.id)) });
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
  for (const id of ids) idMap.set(id, `node-copy-${Date.now().toString(36)}-${idMap.size}`);
  const siblings = getHtmlCanvasChildren(document, rootNode.parentId ?? document.rootId);
  const copies = document.nodes
    .filter((node) => ids.has(node.id))
    .map((node) => {
      const copyId = idMap.get(node.id)!;
      const parentId = node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId)! : node.parentId;
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
          bounds: isTopCopy ? { ...node.bounds, x: node.bounds.x + 16, y: node.bounds.y + 16 } : node.bounds,
        },
        node.order,
      );
    });
  const next = touchDocument({ ...document, nodes: [...document.nodes, ...copies] });
  return { document: next, node: copies.find((copy) => copy.id === idMap.get(nodeId)) ?? null };
}

export function moveHtmlCanvasNodeLayer(
  document: HtmlCanvasDocument,
  nodeId: string,
  move: import("./types").HtmlCanvasLayerMove,
): HtmlCanvasDocument {
  if (nodeId === document.rootId) return document;
  const node = getHtmlCanvasNode(document, nodeId);
  if (!node) return document;
  const siblings = getHtmlCanvasChildren(document, node.parentId ?? document.rootId);
  const from = siblings.findIndex((sibling) => sibling.id === nodeId);
  if (from < 0) return document;
  const to =
    move === "front" ? siblings.length - 1
    : move === "back" ? 0
    : move === "forward" ? Math.min(siblings.length - 1, from + 1)
    : Math.max(0, from - 1);
  if (from === to) return document;
  return reorderSiblings(document, siblings, from, to);
}

export function reorderHtmlCanvasNode(
  document: HtmlCanvasDocument,
  activeNodeId: string,
  overNodeId: string,
): HtmlCanvasDocument {
  if (activeNodeId === overNodeId || activeNodeId === document.rootId) return document;
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
      id: groupId, parentId, name: "Group", type: "group", order: siblings.length,
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
      { ...node, parentId: groupId, bounds: { ...node.bounds, x: node.bounds.x - minX, y: node.bounds.y - minY }, order: order++ },
      node.order,
    );
  });
  const next = touchDocument({ ...document, nodes: [...reparented, group] });
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
        { ...node, parentId: newParentId, bounds: { ...node.bounds, x: node.bounds.x + group.bounds.x, y: node.bounds.y + group.bounds.y }, order: order++ },
        node.order,
      );
    });
  return { document: touchDocument({ ...document, nodes: next }), childIds };
}

export function insertHtmlCanvasNode(input: {
  document: HtmlCanvasDocument;
  tool: CanvasInsertToolId;
  point: { x: number; y: number };
  bounds?: Partial<import("./types").HtmlCanvasBounds>;
}): { document: HtmlCanvasDocument; node: HtmlCanvasNode } {
  const document = normalizeHtmlCanvasDocument(input.document);
  const root = getHtmlCanvasNode(document, document.rootId);
  const siblings = getHtmlCanvasChildren(document, document.rootId);
  const id = `node-${input.tool}-${Date.now().toString(36)}-${document.nodes.length}`;
  const baseBounds = boundsForTool(input.tool, input.point);
  const bounds = { ...baseBounds, ...input.bounds };
  const node = normalizeNode(
    makeNode({
      id, parentId: root?.id ?? document.rootId, name: nameForTool(input.tool),
      type: typeForTool(input.tool), order: siblings.length, bounds,
      props: propsForTool(input.tool), text: textForTool(input.tool),
    }),
    siblings.length,
  );
  const next = touchDocument({ ...document, nodes: [...document.nodes, node] });
  return { document: next, node };
}

export function insertHtmlCanvasImageNode(input: {
  document: HtmlCanvasDocument;
  point: { x: number; y: number };
  imageUrl: string;
  name?: string;
  bounds?: Partial<import("./types").HtmlCanvasBounds>;
}): { document: HtmlCanvasDocument; node: HtmlCanvasNode } {
  const document = normalizeHtmlCanvasDocument(input.document);
  const root = getHtmlCanvasNode(document, document.rootId);
  const siblings = getHtmlCanvasChildren(document, document.rootId);
  const id = `node-image-${Date.now().toString(36)}-${document.nodes.length}`;
  const node = normalizeNode(
    makeNode({
      id, parentId: root?.id ?? document.rootId, name: input.name ?? "Image",
      type: "image", order: siblings.length,
      bounds: { x: Math.round(input.point.x), y: Math.round(input.point.y), width: 240, height: 180, ...input.bounds },
      props: { name: input.name ?? "Image", src: input.imageUrl, bg: "#E8ECE7", rounded: 8, overflow: "hidden" },
    }),
    siblings.length,
  );
  const next = touchDocument({ ...document, nodes: [...document.nodes, node] });
  return { document: next, node };
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
      nodes: normalized.nodes.map((node) => node.id === subject.id ? { ...node, locked } : node),
    });
  }
  const wrapperId = uniqueNodeId(normalized, `canvas-root-${root.id}`);
  const wrapper = makeCanvasWrapperNode({ id: wrapperId, name: options.wrapperName ?? `${root.name} Canvas`, width: root.bounds.width, height: root.bounds.height });
  return normalizeHtmlCanvasDocument({
    ...normalized,
    rootId: wrapperId,
    viewport: { width: root.bounds.width, height: root.bounds.height },
    nodes: [
      wrapper,
      ...normalized.nodes.map((node) =>
        node.id === root.id
          ? { ...node, parentId: wrapperId, order: 0, bounds: { ...node.bounds, x: 0, y: 0 }, locked }
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
  return serializeHtmlCanvasDocument(ensureHtmlCanvasSubjectRoot(document, options));
}

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
    id: rootId, parentId: null, name: input.name || "Frame", type: "frame", order: 0,
    bounds: { x: 0, y: 0, width: size.width, height: size.height },
    props: { name: input.name || "Frame", bg: "#F7F7F2", rounded: 0, overflow: "hidden", px: rootPaddingX, py: rootPaddingY },
  });
  const title = makeNode({
    id: "node-title", parentId: rootId, name: "Title", type: "text", order: 0,
    bounds: { x: rootPaddingX, y: rootPaddingY, width: size.width - rootPaddingX * 2, height: 42 },
    props: { name: "Title", color: "#17211D", size: input.projectType === "desktop" ? 28 : 22, weight: 800 },
    text: input.name || "Untitled",
  });
  const panel = makeNode({
    id: "node-panel", parentId: rootId, name: "Content Block", type: "frame", order: 1,
    bounds: {
      x: rootPaddingX, y: rootPaddingY + 64,
      width: size.width - rootPaddingX * 2,
      height: Math.min(220, size.height - rootPaddingY * 2 - 132),
    },
    props: { name: "Content Block", bg: "#FFFFFF", rounded: 24, stroke: "#DDE4D8", px: 24, py: 24 },
  });
  const cta = makeNode({
    id: "node-action", parentId: panel.id, name: "Primary CTA", type: "frame", order: 0,
    bounds: { x: 24, y: 24, width: 148, height: 44 },
    props: { name: "Primary CTA", bg: "#0F2D2E", color: "#F4F6F1", rounded: 22, flex: "row", justify: "center", items: "center", weight: 700 },
    text: "Edit",
  });
  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT, version: HTML_CANVAS_VERSION, rootId,
    viewport: size, nodes: [root, title, panel, cta], updatedAt: Date.now(),
  });
}

/**
 * A blank component document: a single root frame at an explicit width/height and
 * no boilerplate children. Used when the user creates a component with a chosen
 * size (W×H), so it opens at exactly that frame size instead of a project default.
 */
export function createBlankHtmlCanvasDocument(input: {
  name: string;
  width: number;
  height: number;
}): HtmlCanvasDocument {
  const rootId = "node-root";
  const size = { width: Math.round(input.width), height: Math.round(input.height) };
  const root = makeNode({
    id: rootId, parentId: null, name: input.name || "Frame", type: "frame", order: 0,
    bounds: { x: 0, y: 0, width: size.width, height: size.height },
    props: { name: input.name || "Frame", bg: "#FFFFFF", rounded: 0, overflow: "hidden" },
  });
  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT, version: HTML_CANVAS_VERSION, rootId,
    viewport: size, nodes: [root], updatedAt: Date.now(),
  });
}

function isSubjectWrapperRoot(root: HtmlCanvasNode, children: HtmlCanvasNode[]): boolean {
  if (!root.name.endsWith(" Canvas") || children.length !== 1) return false;
  const child = children[0]!;
  return child.bounds.x === 0 && child.bounds.y === 0 && child.bounds.width === root.bounds.width && child.bounds.height === root.bounds.height;
}

function uniqueNodeId(document: HtmlCanvasDocument, preferred: string): string {
  const ids = new Set(document.nodes.map((node) => node.id));
  if (!ids.has(preferred)) return preferred;
  let index = 1;
  while (ids.has(`${preferred}-${index}`)) index += 1;
  return `${preferred}-${index}`;
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
    for (const child of getHtmlCanvasChildren(document, current)) queue.push(child.id);
  }
  return ids;
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
