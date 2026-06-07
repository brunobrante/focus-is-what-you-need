import type { ElementType, InsertTool, ResizeHandle } from "./types";

export type DimensionRange = {
  min: number;
  /** undefined = no upper limit */
  max?: number;
};

export type ElementConstraints = {
  width: DimensionRange;
  height: DimensionRange;
  /** Only set when radiusRole !== "none". For "corner" type the max is dynamic
   *  (min(w,h)/2) so only min is declared here. For "ratio" type (star) both
   *  min and max are static percentages (0-50 range). */
  radius?: DimensionRange;
};

export type ElementCapabilities = {
  /** Shows corner-radius handle on canvas + radius input in inspector */
  radius: boolean;
  /**
   * What role borderRadius plays for this element:
   *  "corner"  — CSS border-radius in px; should be clamped to min(w,h)/2 on resize
   *  "ratio"   — inner-radius as a 0-50 percentage (star); must NOT be clamped as pixels
   *  "none"    — element has no editable radius
   */
  radiusRole: "corner" | "ratio" | "none";
  /** Resize always locks to the original aspect ratio (e.g. circle stays circle) */
  lockAspectRatio: boolean;
  /** Which resize handles appear on the canvas selection box */
  resizeHandles: readonly ResizeHandle[] | "all";
  /** How the element behaves while the user draws it on canvas */
  drawMode: "free" | "proportional" | "horizontal";
  /** Min/max bounds enforced during resize, draw, and inspector input */
  constraints: ElementConstraints;
};

export type ElementDefinition = {
  type: ElementType;
  capabilities: ElementCapabilities;
};

const DEFINITIONS: Record<ElementType, ElementDefinition> = {
  rect: {
    type: "rect",
    capabilities: {
      radius: true, radiusRole: "corner", lockAspectRatio: false, resizeHandles: "all", drawMode: "free",
      constraints: { width: { min: 1 }, height: { min: 1 }, radius: { min: 0 } },
    },
  },
  ellipse: {
    type: "ellipse",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional",
      constraints: { width: { min: 4 }, height: { min: 4 } },
    },
  },
  text: {
    type: "text",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: false, resizeHandles: "all", drawMode: "free",
      constraints: { width: { min: 20 }, height: { min: 12 } },
    },
  },
  image: {
    type: "image",
    capabilities: {
      radius: true, radiusRole: "corner", lockAspectRatio: false, resizeHandles: "all", drawMode: "free",
      constraints: { width: { min: 8 }, height: { min: 8 }, radius: { min: 0 } },
    },
  },
  icon: {
    type: "icon",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional",
      constraints: { width: { min: 8 }, height: { min: 8 } },
    },
  },
  line: {
    type: "line",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: false, resizeHandles: ["e", "w"], drawMode: "horizontal",
      constraints: { width: { min: 1 }, height: { min: 1, max: 20 } },
    },
  },
  arrow: {
    type: "arrow",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: false, resizeHandles: ["e", "w"], drawMode: "horizontal",
      constraints: { width: { min: 8 }, height: { min: 8 } },
    },
  },
  polygon: {
    type: "polygon",
    capabilities: {
      radius: false, radiusRole: "none", lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional",
      constraints: { width: { min: 8 }, height: { min: 8 } },
    },
  },
  star: {
    type: "star",
    capabilities: {
      radius: true, radiusRole: "ratio", lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional",
      constraints: { width: { min: 8 }, height: { min: 8 }, radius: { min: 1, max: 49 } },
    },
  },
};

const TOOL_TO_ELEMENT_TYPE: Partial<Record<InsertTool, ElementType>> = {
  rect: "rect",
  wrapper: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
  icon: "icon",
  line: "line",
  arrow: "arrow",
  polygon: "polygon",
  star: "star",
};

export function getElementDefinition(type: ElementType): ElementDefinition {
  return DEFINITIONS[type];
}

export function getToolElementDefinition(tool: InsertTool): ElementDefinition | undefined {
  const type = TOOL_TO_ELEMENT_TYPE[tool];
  return type !== undefined ? DEFINITIONS[type] : undefined;
}
