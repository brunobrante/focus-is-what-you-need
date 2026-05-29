import type { Point, Rect, SnapGuide } from "@/canvas/engine/types";
import type { ViewportTransform } from "@/canvas/engine/viewport";

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
};

export type ToolingDropTargetCommand = {
  rect: Rect;
  borderRadius: number;
  displayZoom: number;
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
};

export type ToolingRendererAdapter = {
  mount(host: HTMLElement): void | Promise<void>;
  render(frame: ToolingRenderFrame): void;
  destroy(): void;
};
