// Canvas value types shared between the domain layer (settings) and the canvas
// engine. They live in `domain/` so domain code doesn't have to reach up into
// `@/canvas/*` (a layering violation — see ORG-14). The canvas engine re-exports
// these from `@/canvas/engine/types` and `@/canvas/tools`, so existing canvas
// call sites are unchanged.

export type Tool =
  | "select"
  | "hand"
  | "scale"
  | "rect"
  | "ellipse"
  | "text"
  | "image"
  | "icon"
  | "wrapper"
  | "line"
  | "arrow"
  | "polygon"
  | "star";

/**
 * Tools that insert a new element on the canvas. Excludes the non-inserting
 * "select", "scale" (a selection variant that resizes proportionally), and
 * "hand" (pan) tools.
 */
export type InsertTool = Exclude<Tool, "select" | "hand" | "scale">;

export type ShellGridType = "dots" | "squares";

export type ElementStyles = {
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: "left" | "center" | "right";
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  display?: "block" | "flex";
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
  padding?: number;
  overflow?: "visible" | "hidden";
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
};

export type CanvasToolId =
  | "cursor"
  | "hand"
  | "scale"
  | "wrapper"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "image"
  | "svg"
  | "actions";
