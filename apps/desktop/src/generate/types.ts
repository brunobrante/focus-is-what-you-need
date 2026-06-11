export type SidebarTab = "components" | "config";
export type EditorTool = "move" | "crop" | "draw";

export type { ViewMode } from "./engine/types";
export type {
  CropBox,
  ToolReference,
  ToolReferenceGroupContext,
  ToolReferenceGroupItem,
  SavedComponent,
  PendingConfirmation,
  ComponentTreeNode,
  ActiveSubject,
  DrawingPath,
  ProposedRegion,
  SelectionInteraction,
  SelectionHit,
  ProposalHit,
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
export const MIN_TOOL_ZOOM = 1;
export const MAX_TOOL_ZOOM = 25;
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
