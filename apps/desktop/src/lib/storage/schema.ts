import type {
  ComponentKind,
  ComponentVariant,
  ProjectType,
  ScreenVariant,
} from "@/lib/data/types";
import type { ReferenceStackSummary } from "@/lib/references/stackTypes";

// v18: scene/thumbnail rows are keyed deterministically by `ownerType:ownerId`
// (was a random id) for O(1) owner lookups. Local-only app → bump reseeds; no
// migration (see "Data Lifecycle & Migrations" in CLAUDE.md).
// v19: dropped the in-hot-path legacy coercions in `constrainAll` (old
// "#e9edf3" shell background + removed "container" element type). Reseed clears
// any stale rows carrying those shapes.
// v20: unified the linkable model across System Design tokens and References.
// Tokens carry `linkable`/`instanceOf` and projects hold linked instances
// instead of per-category inheritance (`excludedShared` removed); references
// carry `linkable`/`detachedFrom`. Reseed clears the old inheritance shapes.
// v21: Drafts — loose, project-less components born from Home. A draft is a
// ComponentRow with every scope owner null, tagged with `draftKind`
// ("screen" | "component") and a `draftType` device for sizing/canvas. Reseed
// is harmless; no existing rows carry these fields.
// v22: Architecture.md storage graph. Every row carries the {rev, deletedAt}
// envelope (stamped by the record store); ids are short (~12-char, not UUID); new
// derived/graph tables land — `graph_edges` (ownership/containment/version/scene +
// reference attachment, derived from the row fields by reconcileAllGraphEdges on
// boot), `instance_usage` (derived from scene graphJSON on save), and `asset_blobs`
// (binaries out of the records hot path). Nuke-and-reseed produces every row fresh
// with a short id + envelope; the edge graph is reconciled right after seeding.
export const SCHEMA_VERSION = 29;

export type Meta = {
  schemaVersion: number;
  seededAt: number | null;
};

/**
 * The collaboration-ready row envelope (Architecture.md D1/D6). Every
 * persisted row carries `{ id, createdAt, updatedAt, deletedAt, rev }` — nothing
 * more. `rev` is the optimistic-write guard and `deletedAt` the tombstone; both
 * are **stamped by the record store** on write (repos don't set them), so the
 * row types below need only declare them as optional. The remaining sync
 * identity (clientId / mutationId / transport) lives in the future frame-commit
 * envelope at the SyncAdapter layer, never on rows.
 */
export type RowEnvelope = {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  rev?: number;
};

export type ProjectRow = {
  id: string;
  name: string;
  type: ProjectType;
  source?: "mock" | "local";
  icon: string | null;
  // Project card thumbnail lives in the asset store (flip 3b), keyed by this
  // blobKey, not inline — so a bulk projects read stays lean. Resolve through the
  // batching `assetDataUrlLoader`; the key is stable per project (overwrite in place).
  thumbnailBlobKey: string | null;
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
  // Denormalized home pointers — NOT the ownership source of truth. Precise
  // ownership (workspace-global / project-global / screen-top-level / nested /
  // version-owned / draft) is the single incoming `owns` graph edge, resolved by
  // `componentScopeOf` (Architecture.md, Storage ownership). workspaceId/projectId are
  // kept only as a fast "which workspace/project does this live in" lookup for
  // routing and listing; screenId/parentVariantId are gone (the edge subsumes them).
  workspaceId?: string | null;
  projectId: string | null;
  name: string;
  kind: ComponentKind | null;
  category: string | null;
  description: string | null;
  assignedScreenIds: string[];
  // Canvas node id this component was derived from. Used to distinguish
  // sibling canvas nodes that share the same display name.
  sourceNodeId?: string | null;
  // Whether this component may be picked from the toolbar to insert a linked
  // instance. Auto-true for project/workspace-global components and for child
  // components captured as linked instances by a linked-version. Optional so
  // existing rows / literals stay valid; normalizeComponentRow backfills it
  // from the component's scope.
  linkable?: boolean;
  // Draft marker. Set only on loose, project-less components created from Home
  // (every scope owner is null). `draftKind` records whether the user meant a
  // top-level Screen (the "top component" per the product law) or a free-size
  // Component; `draftType` is the device used for sizing and the canvas `type`
  // param (screens pick a device; components default to "desktop"). Null/absent
  // on every non-draft component. Optional so existing rows/literals stay valid.
  // (Draft *icons* are not components — they are loose `IconRow`s.)
  draftKind?: "screen" | "component" | null;
  draftType?: ProjectType | null;
  activeVariantId: string;
  order: number;
  createdAt: number;
  updatedAt: number;
};

// An icon master — a first-class editable subject, parallel to ScreenRow and
// ComponentRow (see EntityType "icon"). It owns exactly one art variant (via
// `activeVariantId`) whose scene holds the icon's editable vector art. `svg` is
// the serialized render cache refreshed by the canvas save-back — the source used
// wherever the icon is drawn without a token (e.g. a draft icon). An icon in a
// System Design is referenced by an `IconToken` (which carries its own `svg`
// cache + linkable state); a loose icon (no owner edge) is a Draft. Ownership is
// the single incoming `owns` edge (workspace/project), exactly like a component —
// or absent for a draft.
export type IconRow = {
  id: string;
  name: string;
  svg: string | null;
  viewBox: { width: number; height: number } | null;
  // Denormalized home pointer for fast "which workspace/project" lookups (routing
  // and draft filtering), mirroring ComponentRow. Null on a draft icon.
  workspaceId?: string | null;
  projectId?: string | null;
  activeVariantId: string;
  createdAt: number;
  updatedAt: number;
};

// A variant belongs to exactly one master — a screen, a component, or an icon.
// Icons own a single art variant (no version chain); the version machinery
// (promote/duplicate) never runs for them.
export type VariantOwnerKind = "screen" | "component" | "icon";

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

// A single checklist task in the canvas actions panel.
export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
};

// A checklist is owned by a single canvas subject — a screen or a component
// (the master, not a variant, so the list survives version changes). The row
// `id` is the composite owner key `"<ownerKind>:<ownerId>"`.
export type ChecklistRow = {
  id: string;
  ownerKind: VariantOwnerKind;
  ownerId: string;
  items: ChecklistItem[];
  createdAt: number;
  updatedAt: number;
};

export type OwnerType = "workspace" | "project" | "screen" | "component";
// Scenes (and thumbnails) are always owned by a variant — a screen's scene lives on its
// active variant, a component's on its active variant. There is no separate "screen"
// scene owner anymore.
export type SceneOwnerType = "variant";

export type ReferenceAttachment = {
  // The scope this reference is linked to. Exactly one anchor is set:
  //   - workspace-level: workspaceId set, projectId null — added to the workspace
  //     itself (shown on the workspace references page), not to any project.
  //   - project/screen/component: projectId set (+ optional screenId/componentId).
  workspaceId?: string | null;
  projectId: string | null;
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
  // Linkable model (mirrors components/tokens): `linkable` marks a reference as
  // shareable into other locations — a non-linkable reference is a local copy
  // that cannot be attached elsewhere. `detachedFrom` records the master a local
  // copy was detached from. Default linkable = true (the library is shareable).
  linkable?: boolean;
  detachedFrom?: string | null;
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
  // The snapshot `data:` URL lives in the asset store (flip 3), keyed by this
  // blobKey, instead of inline in row JSON — so a bulk thumbnails read stays lean.
  // Resolve it through the batching `assetDataUrlLoader`. The key is stable per
  // owner (== the record id) so a regenerated snapshot overwrites in place.
  dataBlobKey: string;
  capturedAt: number;
};

// ---------------------------------------------------------------------------
// Workspace — groups projects, top level of the hierarchy
// ---------------------------------------------------------------------------

export type WorkspaceRow = {
  id: string;
  name: string;
  /** Optional free-text purpose, set in the creation wizard; editable later. */
  description?: string | null;
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

// The system-design token types are domain concepts; they live in
// `@/domain/system-design/types` and are re-exported here so storage call sites
// keep importing them from the schema. See ORG-14.
import type {
  ColorToken,
  GradientToken,
  TypeStyleToken,
  IconToken,
  SpacingToken,
  RadiusToken,
  ImageToken,
  AnySystemDesignToken,
  SystemDesignCategory,
  SystemDesignTokens,
  SystemDesignOwnerScope,
  SystemDesignRow,
  TokenRow,
} from "@/domain/system-design/types";
export type {
  ColorToken,
  GradientToken,
  TypeStyleToken,
  IconToken,
  SpacingToken,
  RadiusToken,
  ImageToken,
  AnySystemDesignToken,
  SystemDesignCategory,
  SystemDesignTokens,
  SystemDesignOwnerScope,
  SystemDesignRow,
  TokenRow,
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
