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
  /** Resize-handle stroke color. Defaults to the blue selection color when unset;
   *  set to the purple instance color when the selection is an external component. */
  color?: string;
};

/**
 * A drag ghost for an element that paints nothing on screen (e.g. an empty
 * wrapper). Drawn as a soft shadow + faint surface so the user can see what
 * they are moving. Rect/corners are in viewport space.
 */
export type ToolingGhostCommand = {
  rect: Rect;
  corners?: [Point, Point, Point, Point] | null;
  /** Element corner radius in canvas px; scaled by displayZoom at paint time. */
  borderRadius: number;
  displayZoom: number;
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

/** Free-form measured segments (selection ↔ hovered element, G12). Points are
 *  in CANVAS space — the renderer projects them like the parent distances. */
export type ToolingMeasureSegmentCommand = {
  from: Point;
  to: Point;
  value: number;
  orientation: "horizontal" | "vertical";
};

/**
 * The "width × height" tag drawn beside a selection. Coordinates are in overlay
 * space (0,0 = tooling host top-left). `centerX` is the horizontal anchor — the
 * pill is centered on it (matching the DOM `translateX(-50%)`); `top` is the
 * pill's top edge.
 */
export type ToolingSizeLabelCommand = {
  text: string;
  centerX: number;
  top: number;
  /** Pill background — blue for content, purple for instance selections. */
  color: string;
};

/**
 * The corner-radius value tag shown beside the dragged radius ball. Coordinates
 * are in overlay space. `x` is the horizontal anchor and `centerY` the vertical
 * center; `align` decides whether the pill sits to the right of `x` ("start") or
 * to its left ("end"), matching the DOM `translate(0|-100%, -50%)`.
 */
export type ToolingRadiusLabelCommand = {
  text: string;
  x: number;
  centerY: number;
  align: "start" | "end";
};

/**
 * Anchor + handle affordances drawn while a path is in edit mode. All points are
 * in viewport/overlay space. `segments` are the sampled polylines connecting the
 * anchors (the path skeleton, drawn under everything); anchors are squares
 * (filled when selected); handles are a line anchor→knob with a round knob;
 * `closeTarget` highlights the first anchor when the pen can close the subpath.
 */
export type ToolingPathEditAnchor = {
  point: Point;
  inHandle: Point | null;
  outHandle: Point | null;
  selected: boolean;
};
export type ToolingPathEditCommand = {
  anchors: ToolingPathEditAnchor[];
  segments: Point[][];
  closeTarget: Point | null;
};

export type ToolingRenderFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  outlines: ToolingOutlineCommand[];
  ghosts: ToolingGhostCommand[];
  resizeBox: ToolingBoxCommand | null;
  radiusHandlePositions: Point[] | null;
  guides: SnapGuide[];
  viewportTransform: ViewportTransform;
  marqueeRect: Rect | null;
  // Live vector-edit lasso region, in CANVAS space (converted at draw time).
  lasso: Point[] | null;
  dropTarget: ToolingDropTargetCommand | null;
  parentDistances: ToolingParentDistanceCommand | null;
  measureSegments: ToolingMeasureSegmentCommand[] | null;
  sizeLabel: ToolingSizeLabelCommand | null;
  radiusLabel: ToolingRadiusLabelCommand | null;
  pathEdit: ToolingPathEditCommand | null;
};

export type ToolingRendererAdapter = {
  mount(host: HTMLElement): void | Promise<void>;
  render(frame: ToolingRenderFrame): void;
  destroy(): void;
};
