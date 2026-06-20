// `CanvasToolId` is shared with the domain layer (settings), so it's defined in
// `@/domain/canvas/types` and re-exported here.
import type { CanvasToolId } from "@/domain/canvas/types";
export type { CanvasToolId };

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
  "pencil",
  "text",
  "image",
  "svg",
  "actions",
];

export function isInsertCanvasTool(tool: CanvasToolId): tool is CanvasInsertToolId {
  return INSERT_TOOLS.includes(tool);
}
