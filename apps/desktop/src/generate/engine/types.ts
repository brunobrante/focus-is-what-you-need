export type CropBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
};

export type ToolReference = {
  id: string;
  name: string;
  type: string;
  w: number;
  h: number;
  url: string;
};

export type ToolReferenceGroupContext = {
  id: string;
  name: string;
  references: ToolReferenceGroupItem[];
};

export type ToolReferenceGroupItem = {
  id: string;
  name: string;
  type: string;
  w: number;
  h: number;
  ext?: string;
  url?: string;
};

export type ComponentKind = "root" | "cut";

export type SavedComponent = {
  id: string;
  name: string;
  box: CropBox;
  dataUrl: string;
  type: string;
  createdAt: string;
  parentId?: string | null;
  // A root is a top-level node (`parentId === null`). One reference may own many
  // roots; each root is the source of its own independent stack.
  kind?: ComponentKind;
  // Owning root id. For a root this equals its own id. Denormalized so cuts can be
  // grouped by stack in O(1) without walking the ancestor chain.
  rootId?: string | null;
  // The implicit full-image root created for every reference (back-compat).
  isDefaultRoot?: boolean;
};

export type PendingConfirmation = { type: "reset" };

export type ComponentTreeNode = {
  component: SavedComponent;
  children: ComponentTreeNode[];
  depth: number;
};

export type ViewMode = "original" | "stack" | "component";

export type ActiveSubject =
  | {
      kind: "original" | "stack";
      id: string;
      name: string;
      type: string;
      url: string;
      w: number;
      h: number;
      originBox: CropBox;
      rootId?: string | null;
    }
  | {
      kind: "component";
      id: string;
      name: string;
      type: string;
      url: string;
      w: number;
      h: number;
      originBox: CropBox;
      component: SavedComponent;
      rootId?: string | null;
    };

export type DrawingPath = { points: Array<{ x: number; y: number }> };

// A crop region proposed by Florence-2 auto-detect, staged for review before it
// becomes a real cut. The box lives in the same content/display coordinate space
// as `selection`, so it reuses every existing crop geometry helper. This is a
// transient view-time staging value, not a persisted entity — an approved
// proposal is committed through the exact same path as a hand-drawn crop.
export type ProposedRegion = {
  id: string;
  label: string;
  box: CropBox;
  confidence: number;
};

export const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export const CORNER_HANDLES = ["nw", "ne", "se", "sw"] as const;
export const RADIUS_HANDLES = ["nw", "ne", "se", "sw"] as const;
export const HANDLE_HIT_AREA = 28;
export const HANDLE_DOT_SIZE = 8;
export const RADIUS_DOT_SIZE = 10;
export const RADIUS_HANDLE_MIN_INSET = 12;

export type ResizeHandle = (typeof RESIZE_HANDLES)[number];
export type RadiusHandle = (typeof RADIUS_HANDLES)[number];

export type SelectionInteraction =
  | { type: "draw"; pointerId: number; startPoint: { x: number; y: number } }
  | { type: "free-draw"; pointerId: number }
  | {
      type: "move";
      pointerId: number;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "resize";
      pointerId: number;
      handle: ResizeHandle;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "radius";
      pointerId: number;
      handle: RadiusHandle;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "pan";
      pointerId: number;
      startClient: { x: number; y: number };
      startPan: { x: number; y: number };
    }
  | {
      type: "proposal-move";
      pointerId: number;
      id: string;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    }
  | {
      type: "proposal-resize";
      pointerId: number;
      id: string;
      handle: ResizeHandle;
      startPoint: { x: number; y: number };
      startBox: CropBox;
    };

export type SelectionHit =
  | { kind: "radius"; handle: RadiusHandle }
  | { kind: "resize"; handle: ResizeHandle }
  | { kind: "move" }
  | null;

export type ProposalHit =
  | { kind: "discard"; id: string; box: CropBox }
  | { kind: "resize"; id: string; box: CropBox; handle: ResizeHandle }
  | { kind: "move"; id: string; box: CropBox }
  | null;

export type PaintOverlayArgs = {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  toolZoom: number;
  selection: CropBox | null;
  selectionLocked: boolean;
  isHoveringSelection: boolean;
  drawingPath: DrawingPath | null;
  /** Freehand brush width (screen px) for the in-progress drawing stroke. */
  brushSize: number;
  viewMode: ViewMode;
  components: SavedComponent[];
  stackedComponents: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  editingComponentId: string | null;
  selectionMatchesExistingCut: boolean;
  selectionCrop: CropBox | null;
  /** Florence-2 proposals staged for review, drawn as dashed editable boxes. */
  proposedRegions: ProposedRegion[];
};

export type PaintCropsArgs = {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  toolZoom: number;
  components: SavedComponent[];
  stackedComponents: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  editingComponentId: string | null;
  showCropsOverlay: boolean;
  viewMode: ViewMode;
  overlayFill: string;
  overlayStroke: string;
  componentImageCache: Map<string, HTMLImageElement>;
};
