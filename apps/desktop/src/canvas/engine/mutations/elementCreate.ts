import type { ElementNode, ElementType, Tool } from "../types";
import { clamp, roundPixel } from "../geometry";
import { createId } from "./coreUtils";

const ELEMENT_DEFAULT_REFERENCE = 390;
const ELEMENT_DEFAULT_MIN_SCALE = 0.1;
const ELEMENT_DEFAULT_MAX_SCALE = 2.5;

function scaleDefault(
  canvasSize: { width: number; height: number } | undefined,
  base: number,
  min: number,
  max: number,
): number {
  if (!canvasSize) return base;
  const dim = Math.min(canvasSize.width, canvasSize.height);
  const scale = clamp(dim / ELEMENT_DEFAULT_REFERENCE, ELEMENT_DEFAULT_MIN_SCALE, ELEMENT_DEFAULT_MAX_SCALE);
  return roundPixel(clamp(base * scale, min, max));
}

export function createElementForTool(
  tool: Exclude<Tool, "select">,
  x: number,
  y: number,
  canvasSize?: { width: number; height: number },
): ElementNode {
  const id = createId(tool);
  const base = { id, parentId: null, children: [], x: 0, y: 0, rotation: 0, visible: true, locked: false };
  const sd = (b: number, min: number, max: number) => scaleDefault(canvasSize, b, min, max);
  const defaults: Record<Exclude<Tool, "select">, Omit<ElementNode, keyof typeof base>> = {
    wrapper: { type: "rect", name: "Wrapper", width: sd(200, 40, 700), height: sd(200, 40, 600), styles: { opacity: 1 } },
    ellipse: { type: "ellipse", name: "Ellipse", width: sd(120, 16, 400), height: sd(120, 16, 400), styles: { background: "#dbeafe", opacity: 1 } },
    rect: { type: "rect", name: "Rectangle", width: sd(168, 20, 500), height: sd(104, 12, 350), styles: { background: "#dbeafe", opacity: 1 } },
    text: { type: "text", name: "Text", width: sd(190, 60, 500), height: sd(48, 18, 120), styles: { color: "#182033", fontSize: sd(24, 8, 72), fontWeight: "700", opacity: 1 }, content: "Text layer" },
    image: { type: "image", name: "Image Placeholder", width: sd(220, 30, 500), height: sd(140, 20, 350), styles: { background: "#eef2f7", opacity: 1 } },
    icon: { type: "icon", name: "Icon", width: sd(140, 20, 350), height: sd(140, 20, 350), styles: { background: "#eef2f7", opacity: 1 } },
    line: { type: "line", name: "Line", width: sd(120, 20, 400), height: 2, styles: { background: "#182033", opacity: 1 } },
    arrow: { type: "arrow", name: "Arrow", width: sd(120, 20, 400), height: sd(40, 16, 80), styles: { background: "#182033", opacity: 1 } },
    polygon: { type: "polygon", name: "Polygon", width: sd(120, 16, 400), height: sd(120, 16, 400), styles: { background: "#dbeafe", opacity: 1 } },
    star: { type: "star", name: "Star", width: sd(120, 16, 400), height: sd(120, 16, 400), styles: { background: "#dbeafe", borderRadius: 22.49, opacity: 1 } },
  };
  const node = { ...base, ...defaults[tool] } as ElementNode;
  node.x = roundPixel(x - node.width / 2);
  node.y = roundPixel(y - node.height / 2);
  return node;
}

export function elementTypeLabel(type: ElementType): string {
  if (type === "rect") return "Rectangle";
  if (type === "ellipse") return "Ellipse";
  if (type === "image") return "Image";
  if (type === "icon") return "Icon";
  if (type === "line") return "Line";
  if (type === "arrow") return "Arrow";
  if (type === "polygon") return "Polygon";
  if (type === "star") return "Star";
  return "Text";
}
