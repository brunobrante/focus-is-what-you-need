import type { ElementType, ResizeHandle, Tool } from "./types";

export type ElementCapabilities = {
  /** Shows corner-radius handle on canvas + radius input in inspector */
  radius: boolean;
  /** Resize always locks to the original aspect ratio (e.g. circle stays circle) */
  lockAspectRatio: boolean;
  /** Which resize handles appear on the canvas selection box */
  resizeHandles: readonly ResizeHandle[] | "all";
  /** How the element behaves while the user draws it on canvas */
  drawMode: "free" | "proportional" | "horizontal";
};

export type ElementDefinition = {
  type: ElementType;
  capabilities: ElementCapabilities;
};

const DEFINITIONS: Record<ElementType, ElementDefinition> = {
  rect: {
    type: "rect",
    capabilities: { radius: true, lockAspectRatio: false, resizeHandles: "all", drawMode: "free" },
  },
  ellipse: {
    type: "ellipse",
    capabilities: { radius: false, lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional" },
  },
  text: {
    type: "text",
    capabilities: { radius: false, lockAspectRatio: false, resizeHandles: "all", drawMode: "free" },
  },
  image: {
    type: "image",
    capabilities: { radius: true, lockAspectRatio: false, resizeHandles: "all", drawMode: "free" },
  },
  line: {
    type: "line",
    capabilities: { radius: false, lockAspectRatio: false, resizeHandles: ["e", "w"], drawMode: "horizontal" },
  },
  arrow: {
    type: "arrow",
    capabilities: { radius: false, lockAspectRatio: false, resizeHandles: ["e", "w"], drawMode: "horizontal" },
  },
  polygon: {
    type: "polygon",
    capabilities: { radius: false, lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional" },
  },
  star: {
    type: "star",
    capabilities: { radius: true, lockAspectRatio: true, resizeHandles: "all", drawMode: "proportional" },
  },
};

const TOOL_TO_ELEMENT_TYPE: Partial<Record<Exclude<Tool, "select">, ElementType>> = {
  rect: "rect",
  wrapper: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
  line: "line",
  arrow: "arrow",
  polygon: "polygon",
  star: "star",
};

export function getElementDefinition(type: ElementType): ElementDefinition {
  return DEFINITIONS[type];
}

export function getToolElementDefinition(tool: Exclude<Tool, "select">): ElementDefinition | undefined {
  const type = TOOL_TO_ELEMENT_TYPE[tool];
  return type !== undefined ? DEFINITIONS[type] : undefined;
}
