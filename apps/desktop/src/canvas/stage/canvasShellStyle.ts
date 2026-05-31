import type { CSSProperties } from "react";
import { DEFAULT_SHELL_BACKGROUND } from "@/canvas/engine/actions";
import type { CanvasDocument, Tool } from "@/canvas/engine/types";

export function getShellPatternStyle(document: CanvasDocument): CSSProperties {
  return {
    backgroundColor: document.shellBackground ?? DEFAULT_SHELL_BACKGROUND,
  };
}

export const TOOLBAR_TOOL_MAP: Record<string, Tool> = {
  cursor: "select",
  wrapper: "wrapper",
  rectangle: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
  line: "line",
  arrow: "arrow",
  polygon: "polygon",
  star: "star",
};

const STAGE_BASE_SHADOW = "0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 46px rgba(0, 0, 0, 0.4)";

export function getStageBoxShadow(canvas: CanvasDocument["canvas"], renderScale = 1): string {
  const borderWidth = canvas.borderWidth ?? 0;
  if (borderWidth <= 0) return STAGE_BASE_SHADOW;
  return `inset 0 0 0 ${borderWidth * renderScale}px ${canvas.borderColor ?? "transparent"}, ${STAGE_BASE_SHADOW}`;
}
