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

export type Size = {
  width: number;
  height: number;
};

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type RadiusCorner = "nw" | "ne" | "se" | "sw";

export type SnapGuide = {
  id: string;
  orientation: "vertical" | "horizontal";
  position: number;
  from: number;
  to: number;
};

export type ViewportMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type EditorState = {
  document: CanvasDocument;
  selectedIds: string[];
  isolatedParentId: string | null;
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

// ─── Text editing types ───────────────────────────────────────────────────────

export type TextEditState = {
  nodeId: string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  anchorIndex: number;
};

export type TextEditSession = {
  nodeId: string;
  beforeDocument: CanvasDocument;
};

export type TextDragState = {
  pointerId: number;
  nodeId: string;
  anchorIndex: number;
};

export type ViewportClientRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

// ─── Interaction types ────────────────────────────────────────────────────────

export type BaseInteraction = {
  pointerId: number;
  startPoint: Point;
  beforeDocument: CanvasDocument;
  selectedIds: string[];
  transformIds: string[];
  startBox: Rect;
  commonParentId: string | null | undefined;
  parentBounds: Rect;
  moved: boolean;
  lastDocument: CanvasDocument;
  lastGuides: SnapGuide[];
};

export type DragInteraction = BaseInteraction & {
  type: "drag";
  clickedId: string | null;
  wasAlreadySelected: boolean;
  currentDelta: Point;
  startScreenPoint: Point;
  startWorldToScreenMatrix: ViewportMatrix;
};

export type ResizeInteraction = BaseInteraction & {
  type: "resize";
  handle: ResizeHandle;
  startRects: Record<string, Rect>;
};

export type RotateInteraction = BaseInteraction & {
  type: "rotate";
  center: Point;
  startAngle: number;
  startRotations: Record<string, number>;
};

export type RadiusInteraction = {
  type: "radius";
  pointerId: number;
  startPoint: Point;
  elementId: string;
  corner: RadiusCorner;
  beforeDocument: CanvasDocument;
  selectedIds: string[];
  moved: boolean;
  lastDocument: CanvasDocument;
  lastGuides: SnapGuide[];
};

export type DrawInteraction = {
  type: "draw";
  pointerId: number;
  startPoint: Point;
  tool: Exclude<Tool, "select">;
  elementId: string;
  beforeDocument: CanvasDocument;
  lastDocument: CanvasDocument;
  moved: boolean;
};

export type MarqueeInteraction = {
  type: "marquee";
  pointerId: number;
  startPoint: Point;
  currentPoint: Point;
  moved: boolean;
};

export type PanInteraction = {
  type: "pan";
  pointerId: number;
  startScreenPoint: Point;
  startOffsetX: number;
  startOffsetY: number;
  zoom: number;
  moved: boolean;
};

export type CanvasResizeInteraction = {
  type: "canvas-resize";
  pointerId: number;
  handle: ResizeHandle;
  startPoint: Point;
  startScreenPoint: Point;
  startWidth: number;
  startHeight: number;
  startOffsetX: number;
  startOffsetY: number;
  zoom: number;
  displayZoom: number;
  beforeDocument: CanvasDocument;
  moved: boolean;
  lastDocument: CanvasDocument;
};

export type CanvasRotateInteraction = {
  type: "canvas-rotate";
  pointerId: number;
  startPoint: Point;
  center: Point;
  startAngle: number;
  startRotation: number;
  beforeDocument: CanvasDocument;
  moved: boolean;
  lastDocument: CanvasDocument;
};

export type Interaction =
  | DragInteraction
  | ResizeInteraction
  | RotateInteraction
  | RadiusInteraction
  | DrawInteraction
  | MarqueeInteraction
  | PanInteraction
  | CanvasResizeInteraction
  | CanvasRotateInteraction;
