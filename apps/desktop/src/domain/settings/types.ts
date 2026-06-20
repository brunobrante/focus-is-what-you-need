import type {
  CanvasToolId,
  ElementStyles,
  InsertTool,
  ShellGridType,
} from "@/domain/canvas/types";

export type SettingsScope = "global" | "workspace" | "project";

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

/** How an element's intrinsic size reacts to the frame it is dropped into. */
export type ElementSizePolicy = "auto" | "fixed";

/** Whether an auto-computed font size snaps to the project's design system. */
export type FontSizeSnapPolicy = "off" | "designSystem";

export type CanvasElementDefault = {
  name: string;
  width: number;
  height: number;
  styles: ElementStyles;
  content?: string;
  /**
   * "auto" (default) scales the default width/height to the edited frame, so a
   * small frame yields smaller elements. "fixed" uses the literal width/height.
   */
  sizeMode?: ElementSizePolicy;
  /**
   * Text only. "auto" (default) scales fontSize to the edited frame the same way
   * as size; "fixed" uses the literal fontSize regardless of frame size.
   */
  fontSizeMode?: ElementSizePolicy;
  /**
   * Text only. When the font size is computed automatically, "designSystem"
   * snaps it to the nearest typography size allowed by the project's design
   * system; "off" (default) keeps the raw computed value.
   */
  fontSizeSnap?: FontSizeSnapPolicy;
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
  /**
   * Draw a ghost (soft shadow + faint surface + dashed outline) in place of an
   * invisible element while it is being dragged, so the user can see what they
   * are moving. Purely visual. Default on.
   */
  invisibleDragGhost: boolean;
};

export type CanvasSettings = {
  tools: CanvasToolsSettings;
  toolDefaults: CanvasToolDefaultsSettings;
  elementDefaults: CanvasElementDefaultsSettings;
  inputBindings: CanvasInputBindings;
  viewport: CanvasViewportSettings;
  shell: CanvasShellSettings;
};

export type SystemDesignSettings = {
  // When true, a new project inside a workspace inherits all of that
  // workspace's design tokens by default. When false, it starts with none
  // shared. The new-project flow can override this per project.
  shareWithProjectsByDefault: boolean;
};

// Optional on-device AI processing. A "feature" is a capability (e.g. Text
// Detector); a "model" is one downloadable implementation of it. The full
// feature↔model mapping lives in the code-defined catalog
// (`@/lib/models/modelCatalog`); settings persist only which models are
// downloaded and, per feature, whether it is enabled and which model is active.
// Models live on disk under $APP_DATA/models; nothing is bundled with the app.
export type ProcessingFeatureKey =
  | "removeBackground"
  | "upscale"
  | "autoDetect"
  | "textDetection"
  | "removeElement"
  | "colorDetector"
  | "fontDetection";

export type ProcessingFeatureSettings = {
  // A feature can only be enabled once at least one of its models is installed.
  enabled: boolean;
  // The catalog model id the feature runs. Null falls back to the first
  // installed model for the feature (see the catalog resolver).
  activeModelId: string | null;
};

export type ProcessingSettings = {
  // Catalog model ids that have been downloaded to disk.
  installedModelIds: string[];
  features: Record<ProcessingFeatureKey, ProcessingFeatureSettings>;
};

export type ProjectThumbnailSettings = {
  // When true, a project's card thumbnail is regenerated automatically from the
  // first screen's snapshot whenever that snapshot changes. A thumbnail is only
  // produced once a snapshot exists; with no snapshot nothing is generated.
  autoGenerate: boolean;
};

export type GlobalSettings = {
  schemaVersion: number;
  canvas: CanvasSettings;
  systemDesign: SystemDesignSettings;
  processing: ProcessingSettings;
  projectThumbnails: ProjectThumbnailSettings;
};

export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type SettingsRow = {
  id: string;
  scope: SettingsScope;
  /** Set for workspace-scoped rows; null otherwise. */
  workspaceId: string | null;
  /** Set for project-scoped rows; null otherwise. */
  projectId: string | null;
  schemaVersion: number;
  overrides: DeepPartial<GlobalSettings>;
  createdAt: number;
  updatedAt: number;
};
