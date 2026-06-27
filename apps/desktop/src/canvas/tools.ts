// `CanvasToolId`/`CanvasInsertToolId` are shared with the domain layer (settings +
// the pure htmlScene helpers), so they are defined in `@/domain/canvas/types` and
// re-exported here.
import type { CanvasToolId, CanvasInsertToolId } from "@/domain/canvas/types";
export type { CanvasToolId, CanvasInsertToolId };

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
