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

// A source "original" a new screen can be copied from in the Builder. Usually a
// reference's full image; the new root is seeded from this url and dimensions.
export type NewScreenSource = {
  url: string;
  w: number;
  h: number;
  type: string;
  name?: string;
};

export type ComponentKind = "root" | "cut";

// A non-crop image edit applied to a cut. "original" is the plain crop; every
// other tool produces an alternative image while keeping the original around.
export type CutVariantTool = "original" | "birefnet" | "realEsrgan" | "lama";

// One alternative image for a cut, produced by a non-crop AI tool. A cut owns a
// list of these; exactly one (`activeVariantId`) is the "main" and its `dataUrl`
// is mirrored onto the cut's own `dataUrl` so the rest of the app renders it
// without knowing about variants.
export type CutVariant = {
  id: string;
  tool: CutVariantTool;
  dataUrl: string;
  createdAt: string;
};

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
  // The "main" screen of the reference: the one shown on the front of the card.
  // At most one root carries this; it is persisted as the stack's primary id.
  isPrimaryRoot?: boolean;
  // Non-crop edit history for a cut. Absent => a legacy single-variant cut whose
  // only image is `dataUrl`. When present, `dataUrl` mirrors the active variant.
  variants?: CutVariant[];
  // Which variant is the "main". Defaults to the "original" variant when unset.
  activeVariantId?: string;
};

export type PendingConfirmation =
  | { type: "reset" }
  | { type: "delete-root"; rootId: string; name: string; cutCount: number };

export type ComponentTreeNode = {
  component: SavedComponent;
  children: ComponentTreeNode[];
  depth: number;
};

export type ViewMode = "original" | "stack" | "component" | "gallery";

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
      // When the grab starts on a pair of stacked handles (radius at the maximum),
      // the first drag toward one corner commits to it for the rest of the gesture,
      // so the drag can no longer cross the lock into the other corner of the pair.
      committedCorner?: RadiusHandle;
    }
  | {
      type: "pan";
      pointerId: number;
      startClient: { x: number; y: number };
      startPan: { x: number; y: number };
    };

export type SelectionHit =
  | { kind: "radius"; handle: RadiusHandle }
  | { kind: "resize"; handle: ResizeHandle }
  | { kind: "move" }
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
