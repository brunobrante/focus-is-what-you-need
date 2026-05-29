export type CanvasToolId =
  | "cursor"
  | "hand"
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

export type CanvasInsertToolId = Exclude<CanvasToolId, "cursor" | "hand">;

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
