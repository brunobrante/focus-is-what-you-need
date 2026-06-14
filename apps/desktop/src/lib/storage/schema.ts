import type {
  ComponentKind,
  ComponentVariant,
  ProjectType,
  ScreenVariant,
} from "@/lib/data/types";
import type { ReferenceStackSummary } from "@/lib/references/stackTypes";

export const SCHEMA_VERSION = 17;

export type Meta = {
  schemaVersion: number;
  seededAt: number | null;
};

export type ProjectRow = {
  id: string;
  name: string;
  type: ProjectType;
  source?: "mock" | "local";
  icon: string | null;
  thumbnailDataUrl: string | null;
  description: string | null;
  previewScreenId: string | null;
  designSystem: ProjectDesignSystem;
  createdAt: number;
  updatedAt: number;
};

export type ScreenRow = {
  id: string;
  projectId: string;
  title: string;
  variant: ScreenVariant;
  order: number;
  // A screen is a master that owns a chain of variants (its versions), exactly like a
  // component. `activeVariantId` points at the variant currently being shown/edited;
  // that variant owns the editable scene. The screen's "main" variant (order 0) is the
  // scene that embeds its top-level components.
  activeVariantId: string;
  createdAt: number;
  updatedAt: number;
};

export type ComponentRow = {
  id: string;
  // Scope owners. A component belongs to exactly one of:
  //   - a workspace (workspaceId set, projectId null)        → workspace-global
  //   - a project   (projectId set, screenId/parent null)    → project-global
  //   - a screen     (screenId set)                           → screen-level
  //   - a variant    (parentVariantId set)                    → nested child
  // Derive the discriminator with `componentScope(row)` in defaults.ts.
  // Optional so existing rows / literals stay valid; normalizeComponentRow
  // backfills it to null.
  workspaceId?: string | null;
  projectId: string | null;
  screenId: string | null;
  parentVariantId: string | null;
  name: string;
  kind: ComponentKind | null;
  category: string | null;
  description: string | null;
  assignedScreenIds: string[];
  // Canvas node id this component was derived from. Used to distinguish
  // sibling canvas nodes that share the same display name.
  sourceNodeId?: string | null;
  activeVariantId: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

// A variant belongs to exactly one master — a screen or a component.
export type VariantOwnerKind = "screen" | "component";

export type VariantRow = {
  id: string;
  // The master that owns this variant. For "component" the ownerId is a ComponentRow id;
  // for "screen" it is a ScreenRow id. `order <= 0` is the original ("main"); `order > 0`
  // is "V{order}".
  ownerKind: VariantOwnerKind;
  ownerId: string;
  name: string;
  order: number;
  // null for empty/default variants.
  // Non-null only for migrated legacy components that still need the old
  // one-time canvas seed path.
  seedKey: ComponentVariant | null;
  createdAt: number;
  updatedAt: number;
};

export type OwnerType = "project" | "screen" | "component";
// Scenes (and thumbnails) are always owned by a variant — a screen's scene lives on its
// active variant, a component's on its active variant. There is no separate "screen"
// scene owner anymore.
export type SceneOwnerType = "variant";

export type ReferenceAttachment = {
  projectId: string;
  screenId: string | null;
  componentId: string | null;
};

export type ReferenceRow = {
  id: string;
  title: string;
  source: string;
  origin: "gallery" | "upload" | "url";
  visibility: "external" | "local";
  bg: string;
  accent: string;
  kind: "hero" | "cards" | "form" | "dash" | "type";
  description: string;
  metadata: string[];
  thumbnailUrl: string | null;
  stack?: ReferenceStackSummary;
  // When this card represents a specific node inside a stack rather than the
  // whole image: the library image it derives from, the node (root or cut) id,
  // and the node's display name. Absent/null `stackNodeId` = the whole original.
  sourceReferenceId?: string;
  stackNodeId?: string | null;
  stackNodeName?: string;
  projectIds: string[];
  attachments: ReferenceAttachment[];
  // Legacy fields kept for backward compatibility with older persisted rows.
  projectId?: string;
  ownerType?: OwnerType;
  ownerId?: string;
  createdAt: number;
};

export type ProjectSystemColor = {
  id: string;
  name: string;
  value: string;
};

export type ProjectSystemFont = {
  id: string;
  name: string;
  family: string;
  role: string;
  preview: string;
};

export type ProjectSystemIcon = {
  id: string;
  name: string;
  glyph: string;
  family: string;
};

export type ProjectSystemImage = {
  id: string;
  name: string;
  previewUrl: string;
  format: string;
};

export type ProjectDesignSystem = {
  colors: ProjectSystemColor[];
  fonts: ProjectSystemFont[];
  icons: ProjectSystemIcon[];
  images: ProjectSystemImage[];
};

export type SceneRow = {
  id: string;
  ownerType: SceneOwnerType;
  ownerId: string;
  graphJSON: string;
  sceneVersion: number;
  updatedAt: number;
};

export type ThumbnailRow = {
  id: string;
  ownerType: SceneOwnerType;
  ownerId: string;
  dataUrl: string;
  capturedAt: number;
};

// ---------------------------------------------------------------------------
// Workspace — groups projects, top level of the hierarchy
// ---------------------------------------------------------------------------

export type WorkspaceRow = {
  id: string;
  name: string;
  projectIds: string[];
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// SystemDesign — persisted, independent design system owned by a workspace or
// project. Each owner has exactly one design, created lazily. A project design
// can inherit individual token categories from its workspace's design, so a
// project can share "colors and text" from the company system while keeping
// other categories custom — or own everything when it has no workspace.
// ---------------------------------------------------------------------------

export type ColorToken = { id: string; name: string; value: string };
export type GradientToken = {
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
};
export type TypeStyleToken = {
  id: string;
  name: string;
  family: string;
  weight: string;
  size: string;
  sample: string;
};
export type IconToken = { id: string; name: string; glyph: string };
export type SpacingToken = { id: string; name: string; value: number };
export type RadiusToken = { id: string; name: string; value: number };
export type ImageToken = {
  id: string;
  name: string;
  previewUrl: string;
  format: string;
};

// The seven token categories a system design owns. Inheritance is decided
// per-category, which is what lets a project share only some of them.
export type SystemDesignCategory =
  | "colors"
  | "gradients"
  | "typography"
  | "icons"
  | "spacing"
  | "radius"
  | "images";

export type SystemDesignTokens = {
  colors: ColorToken[];
  gradients: GradientToken[];
  typography: TypeStyleToken[];
  icons: IconToken[];
  spacing: SpacingToken[];
  radius: RadiusToken[];
  images: ImageToken[];
};

// Per-category set of workspace token ids that a project has removed from its
// view. A project's effective tokens are the workspace tokens MINUS these,
// plus the project's own tokens. Empty for workspace designs.
export type SystemDesignExclusions = Record<SystemDesignCategory, string[]>;

export type SystemDesignOwnerScope = "workspace" | "project";

export type SystemDesignRow = {
  id: string;
  name: string;
  ownerScope: SystemDesignOwnerScope;
  ownerId: string;
  // The workspace design this project design inherits from (project scope
  // only). Null for workspace designs and for projects without a workspace.
  inheritsFromId: string | null;
  // Workspace tokens this project has explicitly removed (project scope only).
  // Deletions persist here so a removed shared token stays removed; it can be
  // re-added from the workspace picker in the add-token modal.
  excludedShared: SystemDesignExclusions;
  // The project's (or workspace's) own tokens, shown alongside any inherited
  // workspace tokens.
  tokens: SystemDesignTokens;
  createdAt: number;
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// HistoryEntry — git-like change tracking (separate from versions)
// ---------------------------------------------------------------------------

export type HistoryTargetType = "component" | "screen";

export type Patch = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

export type HistoryEntryRow = {
  id: string;
  targetId: string;
  targetType: HistoryTargetType;
  timestamp: number;
  message: string;
  author?: string;
  snapshot: string | null;
  diff: Patch[];
};

// ---------------------------------------------------------------------------
// CSS utility types — used in canvas node props
// ---------------------------------------------------------------------------

export type CSSValue = string;
export type CSSColor = string;

export type CSSSpacing = {
  top: CSSValue;
  right: CSSValue;
  bottom: CSSValue;
  left: CSSValue;
};

export type CSSFlexAlign =
  | "flex-start"
  | "flex-end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch";

// ---------------------------------------------------------------------------
// ReferencePointer — inline prop reference to a design token/variable
// ---------------------------------------------------------------------------

export type ReferencePointer = {
  $$ref: string;
};

// ---------------------------------------------------------------------------
// Token-based SystemDesign — spec-aligned alternative to ProjectDesignSystem
// (ProjectDesignSystem is preserved for backward compat)
// ---------------------------------------------------------------------------

export type Token = {
  id: string;
  name: string;
  value: string;
  description?: string;
};

export type Asset = {
  id: string;
  name: string;
  url: string;
  type: "image" | "icon";
};

export type SystemDesign = {
  colors: Token[];
  typography: Token[];
  spacing: Token[];
  borderRadius: Token[];
  shadows: Token[];
  icons: Asset[];
  images: Asset[];
};

// ---------------------------------------------------------------------------
// Canvas node types: div | text | img  (CanvasNode to avoid DOM Node clash)
// ---------------------------------------------------------------------------

export type DivProps = {
  width: CSSValue | ReferencePointer;
  height: CSSValue | ReferencePointer;
  minWidth?: CSSValue | ReferencePointer;
  maxWidth?: CSSValue | ReferencePointer;
  minHeight?: CSSValue | ReferencePointer;
  maxHeight?: CSSValue | ReferencePointer;
  padding: CSSSpacing | ReferencePointer;
  margin: CSSSpacing | ReferencePointer;
  display: "flex" | "grid" | "block" | "inline-flex" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  justifyContent?: CSSFlexAlign;
  alignItems?: CSSFlexAlign;
  alignContent?: CSSFlexAlign;
  gap?: CSSValue | ReferencePointer;
  flex?: string;
  backgroundColor?: CSSColor | ReferencePointer;
  backgroundImage?: string | ReferencePointer;
  backgroundSize?: "cover" | "contain" | "auto" | string;
  backgroundPosition?: string;
  opacity?: number;
  borderRadius?: CSSValue | CSSSpacing | ReferencePointer;
  border?: string | ReferencePointer;
  borderTop?: string | ReferencePointer;
  borderRight?: string | ReferencePointer;
  borderBottom?: string | ReferencePointer;
  borderLeft?: string | ReferencePointer;
  boxShadow?: string | ReferencePointer;
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  overflowX?: "visible" | "hidden" | "scroll" | "auto";
  overflowY?: "visible" | "hidden" | "scroll" | "auto";
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  top?: CSSValue;
  right?: CSSValue;
  bottom?: CSSValue;
  left?: CSSValue;
  zIndex?: number;
  cursor?: string;
  pointerEvents?: "none" | "auto";
};

export type TextProps = {
  content: string | ReferencePointer;
  fontFamily?: string | ReferencePointer;
  fontSize: CSSValue | ReferencePointer;
  fontWeight:
    | 100
    | 200
    | 300
    | 400
    | 500
    | 600
    | 700
    | 800
    | 900
    | ReferencePointer;
  fontStyle?: "normal" | "italic";
  lineHeight?: CSSValue | ReferencePointer;
  letterSpacing?: CSSValue | ReferencePointer;
  textAlign?: "left" | "center" | "right" | "justify";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap";
  color: CSSColor | ReferencePointer;
  overflow?: "visible" | "hidden";
  textOverflow?: "clip" | "ellipsis";
  padding?: CSSSpacing | ReferencePointer;
  margin?: CSSSpacing | ReferencePointer;
  position?: "static" | "relative" | "absolute";
  top?: CSSValue;
  right?: CSSValue;
  bottom?: CSSValue;
  left?: CSSValue;
};

export type ImgProps = {
  src: string | ReferencePointer;
  alt: string | ReferencePointer;
  width: CSSValue | ReferencePointer;
  height: CSSValue | ReferencePointer;
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  objectPosition?: string;
  opacity?: number;
  borderRadius?: CSSValue | CSSSpacing | ReferencePointer;
  boxShadow?: string | ReferencePointer;
  border?: string | ReferencePointer;
  position?: "static" | "relative" | "absolute";
  top?: CSSValue;
  right?: CSSValue;
  bottom?: CSSValue;
  left?: CSSValue;
};

export type BaseNodeDef = {
  id: string;
  name: string;
  children: CanvasNode[];
};

export type DivNode = BaseNodeDef & { type: "div"; props: DivProps };
export type TextNode = BaseNodeDef & {
  type: "text";
  props: TextProps;
  children: [];
};
export type ImgNode = BaseNodeDef & {
  type: "img";
  props: ImgProps;
  children: [];
};
export type CanvasNode = DivNode | TextNode | ImgNode;
