import type { ElementType, Tool } from "./types";

export type ElementCapabilities = {
  /** Shows corner-radius handle on canvas + radius input in inspector */
  radius: boolean;
  /** Resize always locks to the original aspect ratio (e.g. circle stays circle) */
  lockAspectRatio: boolean;
};

export type ElementDefinition = {
  type: ElementType;
  capabilities: ElementCapabilities;
};

const DEFINITIONS: Record<ElementType, ElementDefinition> = {
  rect: {
    type: "rect",
    capabilities: { radius: true, lockAspectRatio: false },
  },
  ellipse: {
    type: "ellipse",
    capabilities: { radius: false, lockAspectRatio: true },
  },
  text: {
    type: "text",
    capabilities: { radius: false, lockAspectRatio: false },
  },
  image: {
    type: "image",
    capabilities: { radius: true, lockAspectRatio: false },
  },
};

const TOOL_TO_ELEMENT_TYPE: Partial<Record<Exclude<Tool, "select">, ElementType>> = {
  rect: "rect",
  wrapper: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
};

export function getElementDefinition(type: ElementType): ElementDefinition {
  return DEFINITIONS[type];
}

export function getToolElementDefinition(tool: Exclude<Tool, "select">): ElementDefinition | undefined {
  const type = TOOL_TO_ELEMENT_TYPE[tool];
  return type !== undefined ? DEFINITIONS[type] : undefined;
}
