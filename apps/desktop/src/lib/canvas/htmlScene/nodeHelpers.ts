import type { CanvasInsertToolId } from "@/lib/canvas/tools";
import type { HtmlCanvasBounds, HtmlCanvasNode, HtmlCanvasNodeKind, HtmlCanvasTag } from "./types";
import {
  alignFromMock,
  clamp,
  defaultStyle,
  justifyFromMock,
  modeFromMock,
  normalizeStyle,
  objectFitFromMock,
  slugClass,
  slugId,
  textAlignFromMock,
  toNumber,
  weightFromMock,
} from "./styleUtils";

export function isCanvasTag(value: string): value is HtmlCanvasTag {
  return [
    "div", "section", "header", "footer", "main", "article", "nav",
    "button", "a", "img", "icon", "span", "p", "h1", "h2",
  ].includes(value);
}

export function kindFromType(type: string): HtmlCanvasNodeKind {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "icon") return "icon";
  if (type === "rectangle" || type === "ellipse" || type === "line") return "shape";
  if (type === "group" || type === "section") return "group";
  if (type === "component" || type === "instance") return "component";
  return "frame";
}

export function labelFromType(type: string): string {
  if (type === "text") return "Text";
  if (type === "rectangle" || type === "ellipse" || type === "line") return "Shape";
  if (type === "group") return "Group";
  if (type === "component") return "Component";
  return "Frame";
}

export function tagFromKind(kind: HtmlCanvasNodeKind, name: string): HtmlCanvasTag {
  const normalized = normalizeName(name);
  if (normalized.includes("header")) return "header";
  if (normalized.includes("footer") || normalized.includes("cart")) return "footer";
  if (normalized.includes("nav")) return "nav";
  if (kind === "image") return "img";
  if (kind === "icon") return "icon";
  if (kind === "text") return normalized.includes("title") ? "h2" : "p";
  if (kind === "component" && (normalized.includes("button") || normalized.includes("cta"))) return "button";
  if (kind === "frame") return "section";
  return "div";
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function normalizeNode(node: HtmlCanvasNode, fallbackOrder: number): HtmlCanvasNode {
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
    instanceOf: node.instanceOf ?? null,
  };
}

export function makeNode(input: {
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
      input.type === "ellipse" ? "ellipse"
      : input.type === "line" ? "line"
      : "rect",
    visible: true,
    locked: input.props.locked === true,
    instanceOf: null,
  };
}

export function makeCanvasWrapperNode(input: {
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
    bounds: { x: 0, y: 0, width: input.width, height: input.height },
    style: { ...defaultStyle(), background: "transparent", overflow: "visible" },
    text: null,
    imageUrl: null,
    appearance: "rect",
    visible: true,
    locked: false,
    instanceOf: null,
  };
}

export function boundsForTool(
  tool: CanvasInsertToolId,
  point: { x: number; y: number },
): HtmlCanvasBounds {
  const size = defaultSizeForTool(tool);
  return { x: Math.round(point.x), y: Math.round(point.y), width: size.width, height: size.height };
}

function defaultSizeForTool(tool: CanvasInsertToolId): { width: number; height: number } {
  if (tool === "wrapper") return { width: 200, height: 200 };
  if (tool === "rectangle") return { width: 168, height: 104 };
  if (tool === "ellipse") return { width: 132, height: 132 };
  if (tool === "line") return { width: 180, height: 0 };
  if (tool === "pen") return { width: 180, height: 72 };
  if (tool === "text") return { width: 220, height: 34 };
  if (tool === "svg") return { width: 140, height: 140 };
  return { width: 148, height: 44 };
}

export function nameForTool(tool: CanvasInsertToolId): string {
  if (tool === "wrapper") return "Wrapper";
  if (tool === "rectangle") return "Rectangle";
  if (tool === "ellipse") return "Ellipse";
  if (tool === "line") return "Line";
  if (tool === "pen") return "Pen Path";
  if (tool === "text") return "Text";
  if (tool === "svg") return "Icon";
  return "Action Button";
}

export function typeForTool(tool: CanvasInsertToolId): string {
  if (tool === "wrapper") return "frame";
  if (tool === "text") return "text";
  if (tool === "actions") return "component";
  if (tool === "svg") return "icon";
  return tool === "ellipse" ? "ellipse" : tool === "line" || tool === "pen" ? "line" : "rectangle";
}

export function propsForTool(tool: CanvasInsertToolId): Record<string, unknown> {
  if (tool === "wrapper") return { name: nameForTool(tool), overflow: "visible" };
  if (tool === "rectangle") return { name: nameForTool(tool), bg: "#FFFFFF", stroke: "#DDE4D8", strokeWidth: 1, rounded: 8 };
  if (tool === "ellipse") return { name: nameForTool(tool), bg: "#B9E769", stroke: "#0F2D2E", strokeWidth: 1, rounded: 999 };
  if (tool === "line") return { name: nameForTool(tool), bg: "#0F2D2E", stroke: "#0F2D2E", strokeWidth: 2 };
  if (tool === "pen") return { name: nameForTool(tool), bg: "#7C5CFF", stroke: "#7C5CFF", strokeWidth: 3 };
  if (tool === "text") return { name: nameForTool(tool), color: "#17211D", size: 24, weight: 700 };
  if (tool === "svg") return { name: nameForTool(tool), bg: "#eef2f7" };
  return { name: nameForTool(tool), bg: "#0F2D2E", color: "#F4F6F1", rounded: 22, flex: "row", justify: "center", items: "center", weight: 700 };
}

export function textForTool(tool: CanvasInsertToolId): string | null {
  if (tool === "text") return "New text";
  if (tool === "actions") return "Action";
  return null;
}
