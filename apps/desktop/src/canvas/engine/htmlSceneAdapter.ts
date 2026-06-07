import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  getHtmlCanvasChildren,
  htmlCanvasDocumentFromJSON,
  normalizeHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
  type HtmlCanvasNodeKind,
  type HtmlCanvasStyle,
  type HtmlCanvasTag,
} from "@/lib/canvas/htmlScene";
import { DEFAULT_SHELL_BACKGROUND } from "./actions";
import type {
  CanvasDocument,
  ElementNode,
  ElementStyles,
  ElementType,
} from "./types";

type HtmlSceneAdapterOptions = {
  promoteSubjectRoot?: boolean;
};

export function canvasDocumentFromHtmlGraphJSON(
  graphJSON: string | null | undefined,
  options: HtmlSceneAdapterOptions = {},
): CanvasDocument | null {
  const htmlDocument = htmlCanvasDocumentFromJSON(graphJSON ?? null);
  if (!htmlDocument) return null;
  return canvasDocumentFromHtmlDocument(htmlDocument, options);
}

export function canvasDocumentFromHtmlDocument(
  htmlDocument: HtmlCanvasDocument,
  options: HtmlSceneAdapterOptions = {},
): CanvasDocument {
  const document = normalizeHtmlCanvasDocument(htmlDocument);
  const root = document.nodes.find((node) => node.id === document.rootId);
  const promotedSubject = options.promoteSubjectRoot
    ? getSubjectWrapperChild(document, root)
    : null;
  const canvasRoot = promotedSubject ?? root;
  const elements: Record<string, ElementNode> = {};
  const sourceNodes = document.nodes.filter(
    (node) => node.id !== document.rootId && node.id !== promotedSubject?.id,
  );
  const orderById = new Map(document.nodes.map((node) => [node.id, node.order]));

  for (const node of sourceNodes) {
    const parentId = htmlParentIdForCanvasElement(node, document.rootId, promotedSubject?.id);
    elements[node.id] = {
      id: node.id,
      type: elementTypeFromHtmlNode(node),
      parentId,
      children: [],
      name: node.name,
      x: node.bounds.x,
      y: node.bounds.y,
      width: node.bounds.width,
      height: node.bounds.height,
      rotation: node.style.rotation,
      styles: stylesFromHtmlNode(node),
      content: node.text ?? undefined,
      src: node.imageUrl ?? undefined,
      locked: node.locked,
      visible: node.visible,
    };
  }

  for (const node of Object.values(elements)) {
    if (node.parentId && elements[node.parentId]) {
      elements[node.parentId].children.push(node.id);
    }
  }

  for (const node of Object.values(elements)) {
    node.children.sort((a, b) => (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0));
  }

  const rootIds = sourceNodes
    .filter((node) =>
      promotedSubject
        ? node.parentId === promotedSubject.id
        : !node.parentId || node.parentId === document.rootId,
    )
    .sort((a, b) => a.order - b.order)
    .map((node) => node.id)
    .filter((id) => Boolean(elements[id]));

  return {
    canvas: {
      width: canvasRoot?.bounds.width ?? document.viewport.width,
      height: canvasRoot?.bounds.height ?? document.viewport.height,
      background: canvasRoot?.style.background === "transparent"
        ? ""
        : canvasRoot?.style.background ?? "#F7F7F2",
      rotation: canvasRoot?.style.rotation,
      borderRadius: canvasRoot?.style.borderRadius,
      borderWidth: canvasRoot?.style.borderWidth,
      borderColor: canvasRoot?.style.borderColor,
      opacity: canvasRoot?.style.opacity,
      padding: promotedSubject
        ? undefined
        : root
          ? Math.max(root.style.paddingX, root.style.paddingY)
          : undefined,
    },
    shellBackground: DEFAULT_SHELL_BACKGROUND,
    rootIds,
    elements,
  };
}

export function htmlGraphJSONFromCanvasDocument(
  document: CanvasDocument,
  previousGraphJSON: string | null | undefined,
  fallbackName = "Canvas",
): string {
  return serializeHtmlCanvasDocument(
    htmlCanvasDocumentFromCanvasDocument(document, previousGraphJSON, fallbackName),
  );
}

export function htmlCanvasDocumentFromCanvasDocument(
  document: CanvasDocument,
  previousGraphJSON: string | null | undefined,
  fallbackName = "Canvas",
): HtmlCanvasDocument {
  const previous = htmlCanvasDocumentFromJSON(previousGraphJSON ?? null);
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const previousRoot = previous ? previousNodes.get(previous.rootId) : null;
  const previousSubject = previous ? getSubjectWrapperChild(previous, previousRoot) : null;
  if (previous && previousRoot && previousSubject && !document.elements[previousSubject.id]) {
    return htmlCanvasDocumentFromPromotedSubject(
      document,
      previous,
      previousRoot,
      previousSubject,
      previousNodes,
      fallbackName,
    );
  }

  const rootId = previous?.rootId ?? "node-root";
  const nodes: HtmlCanvasNode[] = [
    htmlRootNodeFromCanvas(document, rootId, previousRoot, fallbackName),
  ];

  const pushChildren = (ids: string[], parentId: string) => {
    ids.forEach((id, order) => {
      const element = document.elements[id];
      if (!element) return;
      nodes.push(htmlNodeFromElement(element, parentId, order, previousNodes.get(id)));
      pushChildren(element.children, element.id);
    });
  };

  pushChildren(document.rootIds, rootId);

  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    nodes,
    updatedAt: Date.now(),
  });
}

function htmlCanvasDocumentFromPromotedSubject(
  document: CanvasDocument,
  previous: HtmlCanvasDocument,
  previousRoot: HtmlCanvasNode,
  previousSubject: HtmlCanvasNode,
  previousNodes: Map<string, HtmlCanvasNode>,
  fallbackName: string,
): HtmlCanvasDocument {
  const rootId = previous.rootId;
  const subjectId = previousSubject.id;
  const nodes: HtmlCanvasNode[] = [
    htmlSubjectWrapperNodeFromCanvas(document, previousRoot, fallbackName),
    htmlSubjectNodeFromCanvas(document, subjectId, previousSubject, fallbackName),
  ];

  const pushChildren = (ids: string[], parentId: string) => {
    ids.forEach((id, order) => {
      const element = document.elements[id];
      if (!element) return;
      nodes.push(htmlNodeFromElement(element, parentId, order, previousNodes.get(id)));
      pushChildren(element.children, element.id);
    });
  };

  pushChildren(document.rootIds, subjectId);

  return normalizeHtmlCanvasDocument({
    format: HTML_CANVAS_FORMAT,
    version: HTML_CANVAS_VERSION,
    rootId,
    viewport: {
      width: document.canvas.width,
      height: document.canvas.height,
    },
    nodes,
    updatedAt: Date.now(),
  });
}

function htmlSubjectWrapperNodeFromCanvas(
  document: CanvasDocument,
  previous: HtmlCanvasNode,
  fallbackName: string,
): HtmlCanvasNode {
  return {
    ...previous,
    name: previous.name || `${fallbackName} Canvas`,
    bounds: {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    },
    style: mergeStyle(previous.style, {
      background: "transparent",
      borderRadius: 0,
      borderWidth: 0,
      borderColor: "transparent",
      borderStyle: "none",
      opacity: 1,
      rotation: 0,
      paddingX: 0,
      paddingY: 0,
      overflow: "visible",
    }),
    locked: false,
  };
}

function htmlSubjectNodeFromCanvas(
  document: CanvasDocument,
  subjectId: string,
  previous: HtmlCanvasNode,
  fallbackName: string,
): HtmlCanvasNode {
  const style = mergeStyle(previous.style, {
    background: document.canvas.background || "transparent",
    borderRadius: document.canvas.borderRadius ?? previous.style.borderRadius ?? 0,
    borderWidth: document.canvas.borderWidth ?? previous.style.borderWidth ?? 0,
    borderColor: document.canvas.borderColor ?? previous.style.borderColor ?? "transparent",
    borderStyle: document.canvas.borderWidth ? "solid" : previous.style.borderStyle ?? "none",
    opacity: document.canvas.opacity ?? previous.style.opacity ?? 1,
    rotation: document.canvas.rotation ?? previous.style.rotation ?? 0,
    overflow: previous.style.overflow ?? "hidden",
  });

  return {
    ...previous,
    id: subjectId,
    parentId: previous.parentId,
    name: previous.name || fallbackName,
    order: 0,
    bounds: {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    },
    style,
    locked: previous.locked !== false,
  };
}

function htmlRootNodeFromCanvas(
  document: CanvasDocument,
  rootId: string,
  previous: HtmlCanvasNode | null | undefined,
  fallbackName: string,
): HtmlCanvasNode {
  const style = mergeStyle(previous?.style, {
    background: document.canvas.background || "transparent",
    borderRadius: document.canvas.borderRadius ?? previous?.style.borderRadius ?? 0,
    borderWidth: document.canvas.borderWidth ?? previous?.style.borderWidth ?? 0,
    borderColor: document.canvas.borderColor ?? previous?.style.borderColor ?? "transparent",
    borderStyle: document.canvas.borderWidth ? "solid" : previous?.style.borderStyle ?? "none",
    opacity: document.canvas.opacity ?? previous?.style.opacity ?? 1,
    rotation: document.canvas.rotation ?? previous?.style.rotation ?? 0,
    paddingX: document.canvas.padding ?? previous?.style.paddingX ?? 0,
    paddingY: document.canvas.padding ?? previous?.style.paddingY ?? 0,
    overflow: previous?.style.overflow ?? "hidden",
  });

  return {
    id: rootId,
    parentId: null,
    name: previous?.name || fallbackName,
    kind: "frame",
    tag: previous?.tag ?? "section",
    cssId: previous?.cssId || slugId(fallbackName),
    className: previous?.className || slugClass(fallbackName),
    order: 0,
    bounds: {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height,
    },
    style,
    text: null,
    imageUrl: null,
    appearance: "rect",
    visible: true,
    locked: false,
  };
}

function htmlNodeFromElement(
  element: ElementNode,
  parentId: string,
  order: number,
  previous: HtmlCanvasNode | undefined,
): HtmlCanvasNode {
  const kind = htmlKindFromElement(element);
  const tag = previous?.tag ?? htmlTagFromElement(element, kind);
  return {
    id: element.id,
    parentId,
    name: element.name,
    kind,
    tag,
    cssId: previous?.cssId || slugId(element.name),
    className: previous?.className || slugClass(element.name),
    order,
    bounds: {
      x: element.x,
      y: element.y,
      width: Math.max(1, element.width),
      height: Math.max(1, element.height),
    },
    style: mergeStyle(previous?.style, styleFromElement(element, previous?.style)),
    text: element.type === "text" ? element.content ?? null : previous?.text ?? null,
    imageUrl: element.type === "image" ? element.src ?? null : previous?.imageUrl ?? null,
    appearance: previous?.appearance ?? "rect",
    visible: element.visible !== false,
    locked: element.locked === true,
  };
}

function getSubjectWrapperChild(
  document: HtmlCanvasDocument,
  root: HtmlCanvasNode | null | undefined,
): HtmlCanvasNode | null {
  if (!root || !root.name.endsWith(" Canvas")) return null;
  const children = getHtmlCanvasChildren(document, root.id);
  if (children.length !== 1) return null;
  const child = children[0]!;
  const fillsRoot =
    child.bounds.x === 0 &&
    child.bounds.y === 0 &&
    Math.round(child.bounds.width) === Math.round(root.bounds.width) &&
    Math.round(child.bounds.height) === Math.round(root.bounds.height);
  return fillsRoot ? child : null;
}

function htmlParentIdForCanvasElement(
  node: HtmlCanvasNode,
  htmlRootId: string,
  promotedSubjectId: string | null | undefined,
): string | null {
  if (!node.parentId || node.parentId === htmlRootId) return null;
  if (promotedSubjectId && node.parentId === promotedSubjectId) return null;
  return node.parentId;
}

function elementTypeFromHtmlNode(node: HtmlCanvasNode): ElementType {
  if (node.kind === "text" || ["p", "h1", "h2", "span"].includes(node.tag)) return "text";
  if (node.kind === "image" || node.tag === "img") return "image";
  if (node.kind === "icon" || node.tag === "icon") return "icon";
  return "rect";
}

function stylesFromHtmlNode(node: HtmlCanvasNode): ElementStyles {
  const style = node.style;
  return {
    background:
      node.kind === "text" || style.background === "transparent"
        ? undefined
        : style.background,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: String(style.fontWeight),
    textAlign: style.textAlign,
    borderRadius: node.appearance === "ellipse" && style.borderRadius === 0
      ? 999
      : style.borderRadius,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    opacity: style.opacity,
    display: style.display === "flex" ? "flex" : "block",
    justifyContent: justifyContentFromHtml(style.justify),
    alignItems: alignItemsFromHtml(style.align),
    gap: style.gap,
    padding: Math.max(style.paddingX, style.paddingY),
    overflow: style.overflow,
    objectFit: style.objectFit,
  };
}

function styleFromElement(
  element: ElementNode,
  previousStyle: HtmlCanvasStyle | undefined,
): Partial<HtmlCanvasStyle> {
  const styles = element.styles;
  const borderWidth = styles.borderWidth ?? previousStyle?.borderWidth ?? 0;
  return {
    background:
      element.type === "text"
        ? "transparent"
        : styles.background ?? previousStyle?.background ?? "transparent",
    color: styles.color ?? previousStyle?.color ?? "#17211D",
    opacity: styles.opacity ?? previousStyle?.opacity ?? 1,
    borderColor: styles.borderColor ?? previousStyle?.borderColor ?? "transparent",
    borderWidth,
    borderStyle: borderWidth > 0 ? "solid" : "none",
    borderRadius: styles.borderRadius ?? previousStyle?.borderRadius ?? 0,
    display: styles.display === "flex" ? "flex" : "block",
    align: alignFromElement(styles.alignItems ?? previousStyle?.align),
    justify: justifyFromElement(styles.justifyContent ?? previousStyle?.justify),
    gap: styles.gap ?? previousStyle?.gap ?? 0,
    paddingX: styles.padding ?? previousStyle?.paddingX ?? 0,
    paddingY: styles.padding ?? previousStyle?.paddingY ?? 0,
    rotation: element.rotation ?? previousStyle?.rotation ?? 0,
    fontFamily: styles.fontFamily ?? previousStyle?.fontFamily ?? "Inter",
    fontSize: styles.fontSize ?? previousStyle?.fontSize ?? 14,
    fontWeight: Number(styles.fontWeight ?? previousStyle?.fontWeight ?? 400),
    textAlign: styles.textAlign ?? previousStyle?.textAlign ?? "left",
    objectFit: styles.objectFit ?? previousStyle?.objectFit ?? "cover",
    overflow: styles.overflow ?? previousStyle?.overflow ?? "visible",
  };
}

function htmlKindFromElement(element: ElementNode): HtmlCanvasNodeKind {
  if (element.type === "text") return "text";
  if (element.type === "image") return "image";
  if (element.type === "icon") return "icon";
  return element.children.length > 0 ? "component" : "shape";
}

function htmlTagFromElement(
  element: ElementNode,
  kind: HtmlCanvasNodeKind,
): HtmlCanvasTag {
  const normalized = normalizeName(element.name);
  if (normalized.includes("header")) return "header";
  if (normalized.includes("footer") || normalized.includes("cart")) return "footer";
  if (normalized.includes("nav")) return "nav";
  if (kind === "image") return "img";
  if (kind === "icon") return "icon";
  if (kind === "text") return normalized.includes("title") ? "h2" : "p";
  if (normalized.includes("button") || normalized.includes("cta")) return "button";
  return element.parentId ? "div" : "section";
}

function mergeStyle(
  previous: HtmlCanvasStyle | undefined,
  patch: Partial<HtmlCanvasStyle>,
): HtmlCanvasStyle {
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
    ...previous,
    ...patch,
  };
}

function justifyContentFromHtml(value: HtmlCanvasStyle["justify"]): string {
  if (value === "center") return "center";
  if (value === "end") return "flex-end";
  if (value === "between") return "space-between";
  return "flex-start";
}

function alignItemsFromHtml(value: HtmlCanvasStyle["align"]): string {
  if (value === "center") return "center";
  if (value === "end") return "flex-end";
  if (value === "stretch") return "stretch";
  return "flex-start";
}

function justifyFromElement(value: string | HtmlCanvasStyle["justify"] | undefined): HtmlCanvasStyle["justify"] {
  if (value === "center") return "center";
  if (value === "flex-end" || value === "end") return "end";
  if (value === "space-between" || value === "between") return "between";
  return "start";
}

function alignFromElement(value: string | HtmlCanvasStyle["align"] | undefined): HtmlCanvasStyle["align"] {
  if (value === "center") return "center";
  if (value === "flex-end" || value === "end") return "end";
  if (value === "stretch") return "stretch";
  return "start";
}

function slugId(value: string): string {
  const slug = slugClass(value);
  return slug || "node";
}

function slugClass(value: string): string {
  return normalizeName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Returns the absolute position of a node within the scene graph, accounting
 * for all ancestor offsets up to (but not including) the root node.
 * Used to find where a component sits inside its parent screen scene.
 */
export function getNodeAbsoluteBoundsInGraph(
  graphJSON: string | null | undefined,
  nodeId: string | null | undefined,
): { x: number; y: number; width: number; height: number } | null {
  if (!graphJSON || !nodeId) return null;
  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;

  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const target = nodeMap.get(nodeId);
  if (!target) return null;

  let x = target.bounds.x;
  let y = target.bounds.y;
  let current: typeof target = target;

  while (current.parentId && current.parentId !== doc.rootId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += parent.bounds.x;
    y += parent.bounds.y;
    current = parent;
  }

  return { x, y, width: target.bounds.width, height: target.bounds.height };
}

/**
 * Returns the background color that the shell should inherit when a component
 * is opened in the canvas with "inherit parent background" enabled.
 *
 * The graphJSON node tree is structured as:
 *   rootId (transparent outer wrapper)
 *     └── subjectId (actual frame node — carries the frame's style.background)
 *           ├── sourceNodeId  ← this component's element in the parent scene
 *           └── …siblings
 *
 * We walk one level up from sourceNodeId to its immediate parent node and
 * return that node's style.background. This is the fill of the frame (or
 * nested container) that directly surrounds the component, which is exactly
 * what should be visible in the shell.
 *
 * Returns null if no opaque background is found; caller falls back to default.
 */
export function getInheritedShellBackgroundFromGraph(
  graphJSON: string | null | undefined,
  sourceNodeId: string | null | undefined,
): string | null {
  if (!graphJSON || !sourceNodeId) return null;

  const doc = htmlCanvasDocumentFromJSON(graphJSON);
  if (!doc) return null;

  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const sourceNode = nodeMap.get(sourceNodeId);
  if (!sourceNode?.parentId) return null;

  const parentNode = nodeMap.get(sourceNode.parentId);
  const bg = parentNode?.style.background;
  return bg && bg !== "transparent" ? bg : null;
}
