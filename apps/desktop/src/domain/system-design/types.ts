// System-design token types. These are domain concepts (design tokens and the
// per-owner design row), so they live in `domain/` rather than in the storage
// schema. `@/lib/storage/schema` re-exports them, so storage call sites are
// unchanged. See ORG-14.

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
