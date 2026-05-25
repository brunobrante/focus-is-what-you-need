export type ElementType = "rect" | "ellipse" | "text" | "image";

export type Tool = "select" | "rect" | "ellipse" | "text" | "image" | "wrapper";

export type ShellPattern = "dots" | "grid";

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

export type ElementNode = {
  id: string;
  type: ElementType;
  parentId: string | null;
  children: string[];
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  styles: ElementStyles;
  content?: string;
  src?: string;
  locked?: boolean;
  visible?: boolean;
};

export type CanvasProperties = {
  width: number;
  height: number;
  background: string;
  rotation?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  padding?: number;
};

export type CanvasDocument = {
  canvas: CanvasProperties;
  shellBackground?: string;
  shellPattern?: ShellPattern;
  rootIds: string[];
  elements: Record<string, ElementNode>;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type ResizeHandle =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export type SnapGuide = {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
  from: number;
  to: number;
};

export type EditorState = {
  document: CanvasDocument;
  selectedIds: string[];
  isolatedParentId: string | null;
  hoveredId: string | null;
  editingTextId: string | null;
  canvasStageActive: boolean;
  tool: Tool;
  zoom: number;
  offsetX: number;
  offsetY: number;
  guides: SnapGuide[];
  exportOpen: boolean;
  past: CanvasDocument[];
  future: CanvasDocument[];
};
