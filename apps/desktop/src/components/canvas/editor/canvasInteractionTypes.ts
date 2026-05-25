import type { CanvasDocument, Point, Rect, ResizeHandle, SnapGuide, Tool } from "@/lib/editor/types";
import type { ViewportMatrix } from "@/lib/editor/viewport";
import type { RadiusCorner } from "./canvasToolingHitTest";

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
export type ResizeInteraction = BaseInteraction & { type: "resize"; handle: ResizeHandle; startRects: Record<string, Rect> };
export type RotateInteraction = BaseInteraction & { type: "rotate"; center: Point; startAngle: number; startRotations: Record<string, number> };
export type RadiusInteraction = { type: "radius"; pointerId: number; startPoint: Point; elementId: string; corner: RadiusCorner; beforeDocument: CanvasDocument; selectedIds: string[]; moved: boolean; lastDocument: CanvasDocument; lastGuides: SnapGuide[] };
export type DrawInteraction = { type: "draw"; pointerId: number; startPoint: Point; tool: Exclude<Tool, "select">; elementId: string; beforeDocument: CanvasDocument; lastDocument: CanvasDocument; moved: boolean };
export type MarqueeInteraction = { type: "marquee"; pointerId: number; startPoint: Point; currentPoint: Point; moved: boolean };
export type PanInteraction = { type: "pan"; pointerId: number; startScreenPoint: Point; startOffsetX: number; startOffsetY: number; zoom: number; moved: boolean };
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
export type CanvasRotateInteraction = { type: "canvas-rotate"; pointerId: number; startPoint: Point; center: Point; startAngle: number; startRotation: number; beforeDocument: CanvasDocument; moved: boolean; lastDocument: CanvasDocument };
export type Interaction = DragInteraction | ResizeInteraction | RotateInteraction | RadiusInteraction | DrawInteraction | MarqueeInteraction | PanInteraction | CanvasResizeInteraction | CanvasRotateInteraction;
