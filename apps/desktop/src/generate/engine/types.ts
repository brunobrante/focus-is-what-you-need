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
  references: ToolReference[];
};

export type SavedComponent = {
  id: string;
  name: string;
  box: CropBox;
  dataUrl: string;
  type: string;
  createdAt: string;
  parentId?: string | null;
};

export type PendingConfirmation =
  | { type: "primary"; componentId: string }
  | { type: "reset" };

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
    };

export type DrawingPath = { points: Array<{ x: number; y: number }> };

export const RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export const RADIUS_HANDLES = ["nw", "ne", "se", "sw"] as const;
export const HANDLE_HIT_AREA = 28;
export const HANDLE_DOT_SIZE = 8;
export const RADIUS_DOT_SIZE = 6;
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
  drawingPath: DrawingPath | null;
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
  componentImageCache: Map<string, HTMLImageElement>;
};

export type PaintCropsArgs = {
  canvas: HTMLCanvasElement;
  img: HTMLImageElement | null;
  toolZoom: number;
  components: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  editingComponentId: string | null;
  showCropsOverlay: boolean;
  viewMode: ViewMode;
  overlayFill: string;
};
