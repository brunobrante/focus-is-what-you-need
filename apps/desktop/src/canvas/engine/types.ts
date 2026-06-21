// `Tool`, `InsertTool`, `ShellGridType` and `ElementStyles` are shared with the
// domain layer (settings), so they're defined in `@/domain/canvas/types` and
// re-exported here — canvas call sites keep importing them from this module.
import type { Tool, InsertTool, ShellGridType, ElementStyles } from "@/domain/canvas/types";
export type { Tool, InsertTool, ShellGridType, ElementStyles };
import type { Box, Vec2 } from "@/domain/canvas/geometry";

export type ElementType = "rect" | "ellipse" | "text" | "image" | "icon" | "line" | "arrow" | "polygon" | "star";

/** Selection-style tools: they pick/move existing elements rather than insert. */
export function isSelectionTool(tool: Tool): boolean {
  return tool === "select" || tool === "scale";
}

/** Tools that create a new element when the pointer is pressed on the canvas. */
export function isInsertTool(tool: Tool): tool is InsertTool {
  return tool !== "select" && tool !== "hand" && tool !== "scale";
}

export type ViewportMode = "frame" | "draft";

export type ElementSizingMode = "fixed" | "fit";

export type ElementSizing = {
  width?: ElementSizingMode;
  height?: ElementSizingMode;
};

/**
 * Link from an instance element to the master component it mirrors. Mirrors
 * HtmlCanvasInstanceRef on the storage node; carried verbatim through the adapter.
 */
export type ElementInstanceRef = {
  componentId: string;
  variantId: string;
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
  sizing?: ElementSizing;
  content?: string;
  src?: string;
  locked?: boolean;
  visible?: boolean;
  // Non-null only on linked instance elements (see ElementInstanceRef).
  instanceOf?: ElementInstanceRef | null;
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
  shellGrid?: { enabled: boolean; type: ShellGridType };
  rootIds: string[];
  elements: Record<string, ElementNode>;
};

// Canonical box/vector vocabulary lives in the domain; the canvas re-uses it so
// every surface shares one shape (see domain/canvas/geometry Box doc comment).
export type Rect = Box;

export type Point = Vec2;

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

// Per-ancestor config for the "parent frames" overlay (a visual guide drawn
// behind the edited component, like a grid). A frame inherits only size +
// background color + radius from its parent; opacity is always user-set and the
// border is never drawn. Keyed in `AncestorOverlayState.items` by ancestor id.
export type AncestorOverlayItem = {
  inheritColor: boolean; // true → use the parent frame's background color value
  color: string;         // custom color used when inheritColor is false
  opacity: number;       // 0..1, user-set (never inherited)
  keepRadius: boolean;   // true → use the parent frame's radius, false → square
};

export type AncestorOverlayState = {
  enabled: boolean;
  items: Record<string, AncestorOverlayItem>;
};

export const DEFAULT_ANCESTOR_OVERLAY_ITEM: AncestorOverlayItem = {
  inheritColor: true,
  color: "#FFFFFF",
  opacity: 0.35,
  keepRadius: true,
};

export type EditorState = {
  document: CanvasDocument;
  viewportMode: ViewportMode;
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
  // True while a transient pan gesture (middle-mouse / space-drag) is in flight.
  // Drives the toolbar's "hand" affordance without changing the persistent tool.
  panning: boolean;
  past: CanvasDocument[];
  future: CanvasDocument[];
  // Set only by the transient action that carried it (drag/resize/rotate/radius
  // frames report exactly which ids they touched). When present, the stage uses
  // it instead of the per-frame deep diff; otherwise it falls back to the diff.
  // Cleared on the next non-transient action.
  transientChangedIds?: readonly string[] | null;
  // One-shot camera focus request: a node id the stage should pan/zoom to so it
  // sits centered, without moving the node. The stage consumes it and clears it
  // back to null. Transient — never persisted.
  focusNodeId?: string | null;
  // Current viewport geometry, mirrored from the stage so the reducer can anchor
  // zoom changes (buttons / keyboard / toolbar) on the viewport center the same
  // way the wheel anchors on the cursor. `viewportSize` is the container size in
  // CSS pixels; `navigableBounds` is the pan/zoom region (component plus device
  // overlay) or null when there is no overlay. Transient — never persisted.
  viewportSize: Size;
  navigableBounds: Rect | null;
  // Transient (session-only) config for the parent-frames overlay. Reset whenever
  // a new subject mounts a fresh editor, so it never persists to the document.
  ancestorOverlay: AncestorOverlayState;
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

// ─── Snapping ─────────────────────────────────────────────────────────────────

export type SnapCandidate = { value: number; from: number; to: number };
export type SnapCandidateSet = {
  vertical: SnapCandidate[];
  horizontal: SnapCandidate[];
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
  // Lazily-populated per-drag caches. Sibling snap targets and parent bounds are
  // constant for the lifetime of a drag (only the dragged box moves), so they are
  // computed once on the first move frame and reused, instead of every ~60Hz frame.
  snapCandidates?: SnapCandidateSet;
  parentBoundsById?: Record<string, Rect>;
};

export type ResizeInteraction = BaseInteraction & {
  type: "resize";
  handle: ResizeHandle;
  startRects: Record<string, Rect>;
  // When the Scale tool is active: resize uniformly (proportionally) and apply the
  // same scale factor to every descendant of the resized element(s).
  scaleMode?: boolean;
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
  // When the grab starts on a pair of stacked handles (radius at the maximum), the
  // first drag toward one corner commits to it for the rest of the gesture, so the
  // drag can no longer cross the lock into the other corner of the pair.
  committedCorner?: RadiusCorner;
  beforeDocument: CanvasDocument;
  selectedIds: string[];
  moved: boolean;
  lastDocument: CanvasDocument;
  lastGuides: SnapGuide[];
};

/**
 * Design-system typography inputs used when creating elements: allowed font
 * sizes for "designSystem" snapping and a fallback default font family.
 */
export type ElementFontTokens = {
  allowedFontSizes?: number[];
  defaultFontFamily?: string;
};

export type DrawInteraction = {
  type: "draw";
  pointerId: number;
  startPoint: Point;
  tool: InsertTool;
  elementId: string;
  elementSizeScale?: number;
  fontTokens?: ElementFontTokens;
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
  viewportMode: ViewportMode;
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
