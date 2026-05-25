import type {
  ComponentKind,
  ComponentVariant,
  ProjectType,
  ScreenVariant,
} from "@/lib/data/types";

export const SCHEMA_VERSION = 14;

export type Meta = {
  schemaVersion: number;
  seededAt: number | null;
};

export type ProjectRow = {
  id: string;
  name: string;
  type: ProjectType;
  source?: "mock" | "local";
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
  createdAt: number;
  updatedAt: number;
};

export type ComponentRow = {
  id: string;
  projectId: string;
  // Root project-level components may keep both fields null.
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

export type VariantRow = {
  id: string;
  componentId: string;
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
export type SceneOwnerType = "screen" | "variant";

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

// v1 legacy shapes — referenced only by the migration. After migrateV1toV2
// runs once, these are gone from the store and not used anywhere else.
export type V1ComponentRow = {
  id: string;
  projectId: string;
  screenId: string | null;
  title: string;
  kind: ComponentKind;
  variant: ComponentVariant;
  createdAt: number;
  updatedAt: number;
};

export type V1SceneOwnerType = "screen" | "component";

export type V1SceneRow = {
  id: string;
  ownerType: V1SceneOwnerType;
  ownerId: string;
  graphJSON: string;
  sceneVersion: number;
  updatedAt: number;
};

export type V1ThumbnailRow = {
  id: string;
  ownerType: V1SceneOwnerType;
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
// ScreenVersion — parallel alternatives of a screen (not change history)
// ---------------------------------------------------------------------------

export type ScreenVersionRow = {
  id: string;
  screenId: string;
  label: string;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// ComponentPlacement — the graph edge: N screens → 1 component
// ---------------------------------------------------------------------------

export type NodeOverride = Record<string, Partial<Record<string, unknown>>>;

export type ComponentPlacementRow = {
  id: string;
  screenVersionId: string;
  componentId: string;
  versionId: string;
  slot: string;
  order: number;
  overrides: NodeOverride;
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
  componentRef?: {
    componentId: string;
    versionId: string;
    overrides: NodeOverride;
  };
  referencedBy: string[];
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
