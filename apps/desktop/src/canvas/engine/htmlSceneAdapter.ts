import {
  HTML_CANVAS_FORMAT,
  HTML_CANVAS_VERSION,
  buildMasterResolver,
  getHtmlCanvasChildren,
  htmlCanvasDocumentFromJSON,
  normalizeHtmlCanvasDocument,
  resolveInstances,
  serializeHtmlCanvasDocument,
  stripResolvedInstanceChildren,
  type HtmlCanvasDocument,
  type HtmlCanvasNode,
  type HtmlCanvasNodeKind,
  type HtmlCanvasStyle,
  type HtmlCanvasTag,
  type MasterResolver,
} from "@/lib/canvas/htmlScene";
import { DEFAULT_SHELL_BACKGROUND } from "./actions";
import type {
  CanvasDocument,
  ElementNode,
  ElementStyles,
  ElementType,
} from "./types";

export { buildMasterResolver };

type HtmlSceneAdapterOptions = {
  promoteSubjectRoot?: boolean;
  // When provided, linked instance nodes are expanded read-only at load time.
  resolveMaster?: MasterResolver;
};

export function canvasDocumentFromHtmlGraphJSON(
  graphJSON: string | null | undefined,
  options: HtmlSceneAdapterOptions = {},
): CanvasDocument | null {
  const htmlDocument = htmlCanvasDocumentFromJSON(graphJSON ?? null);
  if (!htmlDocument) return null;
  return canvasDocumentFromHtmlDocument(htmlDocument, options);
}

/**
 * Re-resolve linked instances inside a LIVE engine document. Instance content is
 * normally inlined only at load time (`resolveInstances` in
 * `canvasDocumentFromHtmlGraphJSON`); a node inserted into the in-memory document at
 * runtime (e.g. the toolbar "Add components" picker) stays bare and renders empty
 * until a remount. Round-tripping through the adapter reproduces the load path so a
 * freshly placed instance shows its master content immediately. The engine-only
 * `shellBackground` is carried over since the graph form does not hold it.
 */
export function withResolvedInstances(
  document: CanvasDocument,
  previousGraphJSON: string | null | undefined,
  fallbackName: string,
  resolveMaster: MasterResolver,
): CanvasDocument {
  const json = htmlGraphJSONFromCanvasDocument(document, previousGraphJSON, fallbackName);
  const resolved = canvasDocumentFromHtmlGraphJSON(json, {
    promoteSubjectRoot: true,
    resolveMaster,
  });
  if (!resolved) return document;
  return { ...resolved, shellBackground: document.shellBackground };
}

/**
 * Re-inline linked instances in a document that is ALREADY resolved, picking up
 * the master's current content. Unlike `withResolvedInstances`, this first strips
 * the previously-inlined instance children (`stripResolvedInstanceChildren`) so
 * re-resolving cannot duplicate them — instance ids are deterministic, so a stale
 * inlined subtree would otherwise collide and be appended twice. Used by the live
 * refresh that runs when a master scene changes while a canvas is open.
 */
export function reresolveInstances(
  document: CanvasDocument,
  resolveMaster: MasterResolver,
  fallbackName: string,
): CanvasDocument {
  const json = htmlGraphJSONFromCanvasDocument(document, null, fallbackName);
  const htmlDocument = htmlCanvasDocumentFromJSON(json);
  if (!htmlDocument) return document;
  const bare = stripResolvedInstanceChildren(htmlDocument);
  const resolved = canvasDocumentFromHtmlDocument(bare, {
    promoteSubjectRoot: true,
    resolveMaster,
  });
  return { ...resolved, shellBackground: document.shellBackground };
}

export function canvasDocumentFromHtmlDocument(
  htmlDocument: HtmlCanvasDocument,
  options: HtmlSceneAdapterOptions = {},
): CanvasDocument {
  const normalized = normalizeHtmlCanvasDocument(htmlDocument);
  const document = options.resolveMaster
    ? resolveInstances(normalized, options.resolveMaster)
    : normalized;
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
      instanceOf: node.instanceOf ?? null,
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
      // A linked instance stores no children — its master subtree is inlined only
      // for display (see resolveInstances) and must never be persisted back.
      if (!element.instanceOf) pushChildren(element.children, element.id);
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
      if (!element.instanceOf) pushChildren(element.children, element.id);
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
    instanceOf: null,
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
    // The engine element's `instanceOf` is authoritative (it is always set on load
    // via `node.instanceOf ?? null`). Never fall back to the previously-stored link:
    // detaching sets it to null, and a `?? previous?.instanceOf` fallback would
    // resurrect the link on save — re-linking a node whose master subtree was just
    // persisted as own content, corrupting the scene on the next resolve.
    instanceOf: element.instanceOf ?? null,
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
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    verticalAlign: style.verticalAlign,
    textTransform: style.textTransform,
    lineThrough: style.lineThrough,
    textBoxTrim: style.textBoxTrim,
    borderRadius: node.appearance === "ellipse" && style.borderRadius === 0
      ? 999
      : style.borderRadius,
    blendMode: style.blendMode,
    isolation: style.isolation,
    cornerRadii: style.cornerRadii,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    borderStyle: style.borderStyle === "none" ? undefined : style.borderStyle,
    borderAlign: style.borderAlign,
    textStrokeWidth: style.textStrokeWidth,
    textStrokeColor: style.textStrokeColor,
    textStrokeColorRef: style.textStrokeColorRef,
    textStrokePaintOrder: style.textStrokePaintOrder,
    underline: style.underline,
    underlineStyle: style.underlineStyle,
    underlineColor: style.underlineColor,
    underlineColorRef: style.underlineColorRef,
    underlineThickness: style.underlineThickness,
    underlineOffset: style.underlineOffset,
    backgroundRef: style.backgroundRef,
    colorRef: style.colorRef,
    borderColorRef: style.borderColorRef,
    opacity: style.opacity,
    display: style.display === "flex" ? "flex" : "block",
    justifyContent: justifyContentFromHtml(style.justify),
    alignItems: alignItemsFromHtml(style.align),
    gap: style.gap,
    padding: Math.max(style.paddingX, style.paddingY),
    overflow: style.overflow,
    objectFit: style.objectFit,
    effects: style.effects,
    fills: style.fills,
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
    // Token bindings come straight from engine state (the source of truth) — no
    // fallback to previousStyle, so clearing a binding (unbind) persists instead
    // of resurrecting the old ref.
    backgroundRef: styles.backgroundRef,
    colorRef: styles.colorRef,
    borderColorRef: styles.borderColorRef,
    // Like the *Ref bindings: read straight from engine state (no previousStyle
    // fallback) so removing every effect persists instead of resurrecting them.
    effects: styles.effects,
    // Same: the typed Fill stack is read straight from engine state so clearing
    // it back to a simple `background` persists (no previousStyle fallback).
    fills: styles.fills,
    opacity: styles.opacity ?? previousStyle?.opacity ?? 1,
    borderColor: styles.borderColor ?? previousStyle?.borderColor ?? "transparent",
    borderWidth,
    borderStyle: borderWidth > 0 ? styles.borderStyle ?? "solid" : "none",
    // Border/Stroke fields read straight from engine state (no previousStyle
    // fallback) so clearing one persists instead of resurrecting the old value.
    borderAlign: styles.borderAlign,
    textStrokeWidth: styles.textStrokeWidth,
    textStrokeColor: styles.textStrokeColor,
    textStrokeColorRef: styles.textStrokeColorRef,
    textStrokePaintOrder: styles.textStrokePaintOrder,
    underline: styles.underline,
    underlineStyle: styles.underlineStyle,
    underlineColor: styles.underlineColor,
    underlineColorRef: styles.underlineColorRef,
    underlineThickness: styles.underlineThickness,
    underlineOffset: styles.underlineOffset,
    borderRadius: styles.borderRadius ?? previousStyle?.borderRadius ?? 0,
    // Appearance fields read straight from engine state (no previousStyle
    // fallback) so clearing one persists instead of resurrecting the old value.
    blendMode: styles.blendMode,
    isolation: styles.isolation,
    cornerRadii: styles.cornerRadii,
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
    // Typography fields read straight from engine state (no previousStyle
    // fallback) so clearing one persists instead of resurrecting the old value.
    fontStyle: styles.fontStyle,
    lineHeight: styles.lineHeight,
    letterSpacing: styles.letterSpacing,
    verticalAlign: styles.verticalAlign,
    textTransform: styles.textTransform,
    lineThrough: styles.lineThrough,
    textBoxTrim: styles.textBoxTrim,
    objectFit: styles.objectFit ?? previousStyle?.objectFit ?? "cover",
    overflow: styles.overflow ?? previousStyle?.overflow ?? "visible",
  };
}

function htmlKindFromElement(element: ElementNode): HtmlCanvasNodeKind {
  // A linked instance is always a component node, even though it stores no children.
  if (element.instanceOf) return "component";
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
