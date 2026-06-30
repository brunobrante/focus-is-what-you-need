import { USER_MAX_ZOOM, USER_MIN_ZOOM } from "@/domain/zoom";

export type SidebarTab = "components" | "config";
export type EditorTool = "move" | "crop" | "draw" | "pen";

// Which sides "Add padding" grows the crop on. For the pen the growth is always
// uniform (it has no axis-aligned sides), so only "all" is meaningful there.
export type PaddingSides =
  | "all"
  | "horizontal"
  | "vertical"
  | "top"
  | "right"
  | "bottom"
  | "left";

// The rectangle crop's per-side padding (subject px) relative to its base box.
export type PaddingSide = "top" | "right" | "bottom" | "left";
export type PaddingValues = Record<PaddingSide, number>;

export type { ViewMode } from "./engine/types";
export type {
  CropBox,
  ToolReference,
  ToolReferenceGroupContext,
  ToolReferenceGroupItem,
  NewScreenSource,
  CutVariant,
  CutVariantTool,
  SavedComponent,
  PendingConfirmation,
  ComponentTreeNode,
  ActiveSubject,
  DrawingPath,
  SelectionInteraction,
  SelectionHit,
  PaintOverlayArgs,
  PaintCropsArgs,
  ResizeHandle,
  RadiusHandle,
} from "./engine/types";
export {
  RESIZE_HANDLES,
  RADIUS_HANDLES,
  HANDLE_HIT_AREA,
  HANDLE_DOT_SIZE,
  RADIUS_DOT_SIZE,
  RADIUS_HANDLE_MIN_INSET,
} from "./engine/types";

export type ComponentState = {
  key: string;
  items: import("./engine/types").SavedComponent[];
};

export {
  COMPONENT_STORAGE_PREFIX,
  PRIMARY_COMPONENT_STORAGE_PREFIX,
  CROPS_OVERLAY_COLOR_STORAGE_KEY,
  CROPS_OVERLAY_ALPHA_STORAGE_KEY,
} from "./engine/storage";

export const SELECTION_MIN_SIZE = 8;
export const MIN_TOOL_ZOOM = USER_MIN_ZOOM;
export const MAX_TOOL_ZOOM = USER_MAX_ZOOM;
export const CUT_MATCH_IOU_THRESHOLD = 0.88;
export const HIERARCHY_MIN_AREA_DELTA = 16;
export const CROPS_OVERLAY_ALPHA = 0.22;
export const CROPS_OVERLAY_DEFAULT_COLOR = "#FFFFFF";
export const CROPS_OVERLAY_PRESETS = [
  "#FFFFFF",
  "#4C8DFF",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
] as const;
