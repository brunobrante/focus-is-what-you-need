import type { Point, Rect, ResizeHandle, SnapGuide } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";
import type { CanvasDropIntent } from "./canvasStageTypes";

export type ToolingRendererKind = "skia";

export type ToolingOutlineCommand = {
  rect: Rect | null;
  corners?: [Point, Point, Point, Point] | null;
  color: string;
  fill?: string;
};

export type ToolingBoxCommand = {
  rect: Rect;
  corners: [Point, Point, Point, Point];
  /** When set, only these handles are drawn/hit-tested. null / undefined = all 4 corners. */
  allowedHandles?: readonly ResizeHandle[] | null;
};

export type ToolingDropTargetCommand = {
  rect: Rect;
  borderRadius: number;
  displayZoom: number;
  intent: CanvasDropIntent;
};

export type ToolingParentDistanceCommand = {
  parentRect: Rect;
  childRect: Rect;
  distances: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type ToolingRenderFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  outlines: ToolingOutlineCommand[];
  resizeBox: ToolingBoxCommand | null;
  radiusHandlePositions: Point[] | null;
  guides: SnapGuide[];
  viewportTransform: ViewportTransform;
  marqueeRect: Rect | null;
  dropTarget: ToolingDropTargetCommand | null;
  parentDistances: ToolingParentDistanceCommand | null;
};

export type ToolingRendererAdapter = {
  mount(host: HTMLElement): void | Promise<void>;
  render(frame: ToolingRenderFrame): void;
  destroy(): void;
};
