import type { CSSProperties } from "react";
import { DEFAULT_SHELL_BACKGROUND, DEFAULT_SHELL_PATTERN } from "@/lib/editor/actions";
import type { CanvasDocument, Tool } from "@/lib/editor/types";

export function getShellPatternStyle(document: CanvasDocument): CSSProperties {
  const pattern = document.shellPattern ?? DEFAULT_SHELL_PATTERN;
  const backgroundColor = document.shellBackground ?? DEFAULT_SHELL_BACKGROUND;
  const lineColor = "rgba(255, 255, 255, 0.11)";
  const dotColor = "rgba(255, 255, 255, 0.18)";

  if (pattern === "grid") {
    return {
      backgroundColor,
      backgroundImage: `linear-gradient(${lineColor} 1px, transparent 1px), linear-gradient(90deg, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: "24px 24px",
      backgroundPosition: "0 0",
    };
  }

  return {
    backgroundColor,
    backgroundImage: `radial-gradient(${dotColor} 1px, transparent 1px)`,
    backgroundSize: "18px 18px",
    backgroundPosition: "0 0",
  };
}

export const TOOLBAR_TOOL_MAP: Record<string, Tool> = {
  cursor: "select",
  wrapper: "wrapper",
  rectangle: "rect",
  ellipse: "ellipse",
  text: "text",
  image: "image",
};

const STAGE_BASE_SHADOW = "0 0 0 1px rgba(255, 255, 255, 0.06), 0 18px 46px rgba(0, 0, 0, 0.4)";

export function getStageBoxShadow(canvas: CanvasDocument["canvas"], renderScale = 1): string {
  const borderWidth = canvas.borderWidth ?? 0;
  if (borderWidth <= 0) return STAGE_BASE_SHADOW;
  return `inset 0 0 0 ${borderWidth * renderScale}px ${canvas.borderColor ?? "transparent"}, ${STAGE_BASE_SHADOW}`;
}
