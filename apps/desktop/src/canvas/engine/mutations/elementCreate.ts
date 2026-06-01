import type { ElementNode, ElementType, Tool } from "../types";
import { clamp, roundPixel } from "../geometry";
import { createId } from "./coreUtils";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

const TOOL_TYPES: Record<Exclude<Tool, "select">, ElementType> = {
  wrapper: "rect",
  rect: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
  icon: "icon",
  line: "line",
  arrow: "arrow",
  polygon: "polygon",
  star: "star",
};

const DEFAULT_SIZE_RANGES: Record<
  Exclude<Tool, "select">,
  { width: [number, number]; height: [number, number]; fontSize?: [number, number] }
> = {
  wrapper: { width: [40, 700], height: [40, 600] },
  rect: { width: [20, 500], height: [12, 350] },
  ellipse: { width: [16, 400], height: [16, 400] },
  text: { width: [60, 500], height: [18, 120], fontSize: [8, 72] },
  image: { width: [30, 500], height: [20, 350] },
  icon: { width: [20, 350], height: [20, 350] },
  line: { width: [20, 400], height: [2, 2] },
  arrow: { width: [20, 400], height: [16, 80] },
  polygon: { width: [16, 400], height: [16, 400] },
  star: { width: [16, 400], height: [16, 400] },
};

function scaleDefault(
  canvasSize: { width: number; height: number } | undefined,
  settings: GlobalSettings,
  base: number,
  min: number,
  max: number,
): number {
  if (!canvasSize) return base;
  const dim = Math.min(canvasSize.width, canvasSize.height);
  const elementDefaults = settings.canvas.elementDefaults;
  const scale = clamp(
    dim / elementDefaults.referenceSize,
    elementDefaults.minScale,
    elementDefaults.maxScale,
  );
  return roundPixel(clamp(base * scale, min, max));
}

export function createElementForTool(
  tool: Exclude<Tool, "select">,
  x: number,
  y: number,
  canvasSize?: { width: number; height: number },
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
): ElementNode {
  const id = createId(tool);
  const base = { id, parentId: null, children: [], x: 0, y: 0, rotation: 0, visible: true, locked: false };
  const ranges = DEFAULT_SIZE_RANGES[tool];
  const configured = settings.canvas.elementDefaults.tools[tool];
  const sd = (b: number, min: number, max: number) => scaleDefault(canvasSize, settings, b, min, max);
  const styles = { ...configured.styles };
  if (typeof styles.fontSize === "number" && ranges.fontSize) {
    styles.fontSize = sd(styles.fontSize, ranges.fontSize[0], ranges.fontSize[1]);
  }
  const node = {
    ...base,
    type: TOOL_TYPES[tool],
    name: configured.name,
    width: sd(configured.width, ranges.width[0], ranges.width[1]),
    height: sd(configured.height, ranges.height[0], ranges.height[1]),
    styles,
    ...(configured.content !== undefined ? { content: configured.content } : {}),
  } as ElementNode;
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
