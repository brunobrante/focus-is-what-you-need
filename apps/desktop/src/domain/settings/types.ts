import type { CanvasToolId } from "@/canvas/tools";
import type {
  ElementStyles,
  InsertTool,
  ShellGridType,
} from "@/canvas/engine/types";

export type SettingsScope = "global" | "project";

export type CanvasKeyCommandId =
  | "canvas.history.undo"
  | "canvas.history.redo"
  | "canvas.clipboard.copy"
  | "canvas.clipboard.paste"
  | "canvas.selection.duplicate"
  | "canvas.selection.delete"
  | "canvas.selection.cancel"
  | "canvas.component.openSelection"
  | "canvas.component.backToParent"
  | "canvas.overlay.toggleScreen"
  | "canvas.viewport.zoomIn"
  | "canvas.viewport.zoomOut"
  | "canvas.viewport.zoomReset"
  | "canvas.viewport.pan"
  | "canvas.tool.cursor"
  | "canvas.tool.hand"
  | "canvas.tool.scale"
  | "canvas.tool.wrapper"
  | "canvas.tool.rectangle"
  | "canvas.tool.ellipse"
  | "canvas.tool.line"
  | "canvas.tool.arrow"
  | "canvas.tool.polygon"
  | "canvas.tool.star"
  | "canvas.tool.pen"
  | "canvas.tool.pencil"
  | "canvas.tool.text"
  | "canvas.tool.image"
  | "canvas.tool.svg"
  | "canvas.tool.actions";

export type CanvasModifierCommandId =
  | "canvas.drag.reparent"
  | "canvas.selection.contextToolbar"
  | "canvas.overlay.parentDistances"
  | "canvas.resize.fromCenter"
  | "canvas.transform.constrainAspect"
  | "canvas.rotate.snap";

export type CanvasCommandId = CanvasKeyCommandId | CanvasModifierCommandId;

export type KeyBinding = {
  key?: string;
  code?: string;
  mod?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ModifierBinding = "mod" | "meta" | "ctrl" | "alt" | "shift";

export type CanvasInputBindings = {
  keyCommands: Record<CanvasKeyCommandId, KeyBinding[]>;
  modifierCommands: Record<CanvasModifierCommandId, ModifierBinding>;
};

export type ToolbarButtonLayoutItem = {
  kind: "button";
  tool: CanvasToolId;
};

export type ToolbarDropdownLayoutItem = {
  kind: "dropdown";
  tools: CanvasToolId[];
  badge?: string;
};

export type ToolbarLayoutItem = ToolbarButtonLayoutItem | ToolbarDropdownLayoutItem;
export type ToolbarLayoutGroup = ToolbarLayoutItem[];

export type CanvasToolsSettings = {
  defaultTool: CanvasToolId;
  toolbar: {
    groups: ToolbarLayoutGroup[];
  };
};

export type CanvasToolDefaultsSettings = {
  shapeRenderModes: Partial<Record<CanvasToolId, "svg" | "div">>;
};

export type CanvasElementDefault = {
  name: string;
  width: number;
  height: number;
  styles: ElementStyles;
  content?: string;
};

export type CanvasElementDefaultsSettings = {
  referenceSize: number;
  minScale: number;
  maxScale: number;
  tools: Record<InsertTool, CanvasElementDefault>;
};

export type CanvasViewportSettings = {
  zoomStep: number;
  wheelZoomSensitivity: number;
};

export type CanvasShellSettings = {
  background: string;
  inheritParentBackground: boolean;
  grid: { enabled: boolean; type: ShellGridType };
  tree: {
    autoRevealSelection: boolean;
  };
};

export type CanvasSettings = {
  tools: CanvasToolsSettings;
  toolDefaults: CanvasToolDefaultsSettings;
  elementDefaults: CanvasElementDefaultsSettings;
  inputBindings: CanvasInputBindings;
  viewport: CanvasViewportSettings;
  shell: CanvasShellSettings;
};

export type GlobalSettings = {
  schemaVersion: number;
  canvas: CanvasSettings;
};

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type SettingsRow = {
  id: string;
  scope: SettingsScope;
  projectId: string | null;
  schemaVersion: number;
  overrides: DeepPartial<GlobalSettings>;
  createdAt: number;
  updatedAt: number;
};
