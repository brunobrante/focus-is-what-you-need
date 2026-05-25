export type Tool = "select" | "rectangle" | "ellipse" | "text" | "hand";

export interface CanvasObject {
  id: string;
  type: Tool;
  x: number;
  y: number;
  width: number;
  height: number;
}
