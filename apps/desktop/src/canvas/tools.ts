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
  | "text"
  | "image"
  | "svg"
  | "actions";

export type CanvasInsertToolId = Exclude<CanvasToolId, "cursor" | "hand" | "scale">;

const INSERT_TOOLS: CanvasToolId[] = [
  "wrapper",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "polygon",
  "star",
  "pen",
  "text",
  "image",
  "svg",
  "actions",
];

export function isInsertCanvasTool(tool: CanvasToolId): tool is CanvasInsertToolId {
  return INSERT_TOOLS.includes(tool);
}
