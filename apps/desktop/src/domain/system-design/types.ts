// System-design token types. These are domain concepts (design tokens and the
// per-owner design row), so they live in `domain/` rather than in the storage
// schema. `@/lib/storage/schema` re-exports them, so storage call sites are
// unchanged. See ORG-14.

// A pointer from a linked-instance token back to its master token in another
// (workspace) design. Mirrors a component's `instanceOf`: the token's display
// values are resolved live from the master; only the link is stored locally.
export type TokenInstanceRef = { systemDesignId: string; tokenId: string };

// Fields every token can carry, shared by all categories — the linkable model.
// `linkable` marks a (workspace) token as shareable into projects; `instanceOf`
// marks a token as a linked instance of a master token. A linked token keeps a
// snapshot of the master's fields (so it renders even if the master is gone) but
// the resolver overrides them live while the master exists.
export type LinkableTokenFields = {
  linkable?: boolean;
  instanceOf?: TokenInstanceRef | null;
};

export type ColorToken = LinkableTokenFields & {
  id: string;
  name: string;
  value: string;
};
export type GradientToken = LinkableTokenFields & {
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
};
export type TypeStyleToken = LinkableTokenFields & {
  id: string;
  name: string;
  family: string;
  weight: string;
  size: string;
  sample: string;
};
export type IconToken = LinkableTokenFields & {
  id: string;
  name: string;
  glyph: string;
};
export type SpacingToken = LinkableTokenFields & {
  id: string;
  name: string;
  value: number;
};
export type RadiusToken = LinkableTokenFields & {
  id: string;
  name: string;
  value: number;
};
export type ImageToken = LinkableTokenFields & {
  id: string;
  name: string;
  previewUrl: string;
  format: string;
};

// The seven token categories a system design owns. Sharing is decided per token
// via the linkable model (a project links individual workspace tokens), not
// per-category inheritance.
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

export type SystemDesignOwnerScope = "workspace" | "project";

export type SystemDesignRow = {
  id: string;
  name: string;
  ownerScope: SystemDesignOwnerScope;
  ownerId: string;
  // The workspace design a project links tokens from (project scope only). Null
  // for workspace designs and for projects without a workspace.
  inheritsFromId: string | null;
  // This design's tokens. For a project, this holds both its own local tokens
  // and the linked instances of workspace tokens it has chosen to link (each
  // carrying `instanceOf`).
  //
  // NOTE (Architecture.md, Storage ownership): `tokens` is an *assembled* in-memory view
  // only — it is NOT persisted on the design row. Each token is stored as its own
  // `TokenRow` in the `tokens` table; the systemDesigns repo splits this field out
  // on write (`reconcileTokenRows`) and rebuilds it on read. Edits still go
  // through the design controller, which produces a whole `SystemDesignRow`; the
  // repo turns that into per-row token writes. Mirrors how flip 1 kept a
  // denormalized field while the normalized store became authoritative.
  tokens: SystemDesignTokens;
  createdAt: number;
  updatedAt: number;
};

// Any of the seven concrete token shapes — the payload a `TokenRow` carries.
export type AnySystemDesignToken =
  | ColorToken
  | GradientToken
  | TypeStyleToken
  | IconToken
  | SpacingToken
  | RadiusToken
  | ImageToken;

/**
 * One persisted design token (Architecture.md, Storage ownership). Tokens used to live
 * nested in `SystemDesignRow.tokens`; each is now its own row so it carries the
 * store envelope (`rev`/`deletedAt`, stamped by the record store — not declared
 * here) and is individually addressable.
 *
 * The row's `id` is a short client-gen row id. The token's *stable ref key* —
 * the one `$$ref` bindings and linked-instance resolution use, and that a linked
 * instance deliberately shares with its master — lives in `token.id`, which is
 * only unique within a `(systemDesignId, category)`. (The doc sketches a
 * flattened `value: unknown`; the app's tokens are richly typed per category, so
 * the typed payload is nested under `token` instead.)
 */
export type TokenRow = {
  id: string;
  systemDesignId: string;
  category: SystemDesignCategory;
  order: number;
  token: AnySystemDesignToken;
  createdAt: number;
  updatedAt: number;
};
