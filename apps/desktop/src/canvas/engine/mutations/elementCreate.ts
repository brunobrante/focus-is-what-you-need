import type { ElementNode, ElementType, InsertTool } from "../types";
import { clamp, roundPixel } from "../geometry";
import { createId } from "./coreUtils";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

const TOOL_TYPES: Record<InsertTool, ElementType> = {
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
  InsertTool,
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

type ElementCreationOptions = {
  sizeScale?: number;
  /**
   * Allowed typography sizes (px) from the project's design system. When a text
   * element has `fontSizeSnap: "designSystem"`, its auto-computed font size is
   * snapped to the nearest value here.
   */
  allowedFontSizes?: number[];
  /** Design-system default font family, used only when the config sets none. */
  defaultFontFamily?: string;
};

/** Nearest value in `allowed` to `value`; returns `value` when `allowed` is empty. */
export function snapToNearest(value: number, allowed: number[]): number {
  if (allowed.length === 0) return value;
  let best = allowed[0];
  let bestDelta = Math.abs(value - best);
  for (const candidate of allowed) {
    const delta = Math.abs(value - candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function scaleDefault(
  canvasSize: { width: number; height: number } | undefined,
  settings: GlobalSettings,
  base: number,
  min: number,
  max: number,
  options: ElementCreationOptions = {},
): number {
  if (options.sizeScale !== undefined) {
    const scale = Math.max(0.0001, options.sizeScale);
    return roundPixel(clamp(base * scale, min * scale, max * scale));
  }
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
  tool: InsertTool,
  x: number,
  y: number,
  canvasSize?: { width: number; height: number },
  settings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS,
  options: ElementCreationOptions = {},
): ElementNode {
  const id = createId(tool);
  const base = { id, parentId: null, children: [], x: 0, y: 0, rotation: 0, visible: true, locked: false };
  const ranges = DEFAULT_SIZE_RANGES[tool];
  const configured = settings.canvas.elementDefaults.tools[tool];
  const isDraft = options.sizeScale !== undefined;
  const sizeMode = configured.sizeMode ?? "auto";
  const fontSizeMode = configured.fontSizeMode ?? "auto";

  // "fixed" uses the literal value; "auto" adapts to the edited frame. Draft mode
  // (sizeScale set) always goes through scaleDefault to compensate for the draft
  // viewport scale, regardless of mode.
  const sized = (b: number, min: number, max: number, mode: "auto" | "fixed") =>
    !isDraft && mode === "fixed"
      ? roundPixel(clamp(b, min, max))
      : scaleDefault(canvasSize, settings, b, min, max, options);

  const styles = { ...configured.styles };
  if (typeof styles.fontSize === "number" && ranges.fontSize) {
    let fontSize = sized(styles.fontSize, ranges.fontSize[0], ranges.fontSize[1], fontSizeMode);
    if (
      !isDraft &&
      fontSizeMode === "auto" &&
      configured.fontSizeSnap === "designSystem" &&
      options.allowedFontSizes &&
      options.allowedFontSizes.length > 0
    ) {
      fontSize = snapToNearest(fontSize, options.allowedFontSizes);
    }
    styles.fontSize = fontSize;
  }
  if (tool === "text" && !styles.fontFamily && options.defaultFontFamily) {
    styles.fontFamily = options.defaultFontFamily;
  }
  const node = {
    ...base,
    type: TOOL_TYPES[tool],
    name: configured.name,
    width: sized(configured.width, ranges.width[0], ranges.width[1], sizeMode),
    height: sized(configured.height, ranges.height[0], ranges.height[1], sizeMode),
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
