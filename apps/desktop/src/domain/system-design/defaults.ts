import type {
  ColorToken,
  GradientToken,
  IconToken,
  RadiusToken,
  SpacingToken,
  SystemDesignCategory,
  SystemDesignTokens,
  TypeStyleToken,
} from "@/domain/system-design/types";

// ─── Category metadata ──────────────────────────────────────────────────────
// Single source of truth for the order and labelling of the token categories,
// reused by the tab bar, the resolver, and the inheritance switches.

export const SYSTEM_DESIGN_CATEGORIES: SystemDesignCategory[] = [
  "colors",
  "gradients",
  "typography",
  "icons",
  "spacing",
  "radius",
  "images",
];

export const CATEGORY_LABEL: Record<SystemDesignCategory, string> = {
  colors: "Colors",
  gradients: "Gradients",
  typography: "Typography",
  icons: "Icons",
  spacing: "Spacing",
  radius: "Radius",
  images: "Images",
};

// ─── Linking helpers ────────────────────────────────────────────────────────

/** Ids of every workspace token that is linkable (offered to projects). */
export function linkableTokenIds(tokens: SystemDesignTokens): string[] {
  return SYSTEM_DESIGN_CATEGORIES.flatMap((category) =>
    (tokens[category] as { id: string; linkable?: boolean }[])
      .filter((t) => t.linkable === true)
      .map((t) => t.id),
  );
}

/**
 * Build a linked instance of one master token: a copy of the master's fields
 * (keeping its id, so `$$ref` pointers stay valid) tagged with `instanceOf` so
 * the resolver refreshes it live from the master. `linkable` is dropped — a
 * linked instance is not itself re-shareable.
 */
function linkToken<T extends { id: string; linkable?: boolean }>(
  master: T,
  workspaceDesignId: string,
): T {
  const { linkable: _linkable, ...rest } = master;
  return {
    ...(rest as T),
    instanceOf: { systemDesignId: workspaceDesignId, tokenId: master.id },
  };
}

/**
 * Produce a token set holding linked instances of the chosen workspace tokens.
 * Used when a project is created (or lazily opened) to seed the tokens it links
 * from its workspace.
 */
export function buildLinkedTokens(
  workspaceDesignId: string,
  parentTokens: SystemDesignTokens,
  tokenIds: ReadonlySet<string>,
): SystemDesignTokens {
  const out = emptySystemDesignTokens();
  for (const category of SYSTEM_DESIGN_CATEGORIES) {
    out[category] = (parentTokens[category] as { id: string }[])
      .filter((t) => tokenIds.has(t.id))
      .map((t) => linkToken(t as never, workspaceDesignId)) as never;
  }
  return out;
}

// ─── Seed tokens ────────────────────────────────────────────────────────────

const SEED_COLORS: ColorToken[] = [
  { id: "c-primary", name: "Primary", value: "#5B6CFF" },
  { id: "c-primary-dark", name: "Primary Dark", value: "#2A2F4A" },
  { id: "c-accent", name: "Accent", value: "#FF6B6B" },
  { id: "c-success", name: "Success", value: "#4CAF82" },
  { id: "c-warning", name: "Warning", value: "#F5A623" },
  { id: "c-surface", name: "Surface", value: "#1A1A1A" },
  { id: "c-border", name: "Border", value: "#2E2E2E" },
  { id: "c-text", name: "Text", value: "#EFEFEF" },
];

const SEED_GRADIENTS: GradientToken[] = [
  { id: "g-hero", name: "Hero", from: "#5B6CFF", to: "#FF6B6B", angle: 135 },
];

const SEED_TYPOGRAPHY: TypeStyleToken[] = [
  { id: "t-display", name: "Display", family: "Inter", weight: "700", size: "40px", sample: "The quick brown fox" },
  { id: "t-h1", name: "Heading 1", family: "Inter", weight: "600", size: "28px", sample: "The quick brown fox" },
  { id: "t-h2", name: "Heading 2", family: "Inter", weight: "600", size: "22px", sample: "The quick brown fox" },
  { id: "t-body", name: "Body", family: "Inter", weight: "400", size: "14px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t-caption", name: "Caption", family: "Inter", weight: "400", size: "11px", sample: "The quick brown fox jumps over the lazy dog." },
  { id: "t-label", name: "Label", family: "Inter", weight: "500", size: "12px", sample: "Button label · Tag · Badge" },
  { id: "t-mono", name: "Mono", family: "JetBrains Mono", weight: "400", size: "13px", sample: "const value = 0x5EA2FF" },
];

const SEED_ICONS: IconToken[] = [
  { id: "i-bell", name: "Bell", glyph: "🔔" },
  { id: "i-star", name: "Star", glyph: "⭐" },
  { id: "i-heart", name: "Heart", glyph: "❤️" },
  { id: "i-check", name: "Check", glyph: "✅" },
];

const SEED_SPACING: SpacingToken[] = [
  { id: "s-xs", name: "xs", value: 4 },
  { id: "s-sm", name: "sm", value: 8 },
  { id: "s-md", name: "md", value: 12 },
  { id: "s-base", name: "base", value: 16 },
  { id: "s-lg", name: "lg", value: 20 },
  { id: "s-xl", name: "xl", value: 24 },
  { id: "s-2xl", name: "2xl", value: 32 },
  { id: "s-3xl", name: "3xl", value: 40 },
  { id: "s-4xl", name: "4xl", value: 48 },
  { id: "s-5xl", name: "5xl", value: 64 },
];

const SEED_RADIUS: RadiusToken[] = [
  { id: "r-none", name: "none", value: 0 },
  { id: "r-sm", name: "sm", value: 4 },
  { id: "r-md", name: "md", value: 8 },
  { id: "r-lg", name: "lg", value: 12 },
  { id: "r-xl", name: "xl", value: 16 },
  { id: "r-2xl", name: "2xl", value: 20 },
  { id: "r-full", name: "full", value: 9999 },
];

/**
 * The token set a brand-new system design starts with. Returns deep copies so
 * two designs never alias the same token objects. Seed tokens are `linkable` by
 * default — like a project/workspace-global component, a workspace token is
 * shareable into projects out of the box.
 */
export function createDefaultSystemDesignTokens(): SystemDesignTokens {
  return {
    colors: SEED_COLORS.map((t) => ({ ...t, linkable: true })),
    gradients: SEED_GRADIENTS.map((t) => ({ ...t, linkable: true })),
    typography: SEED_TYPOGRAPHY.map((t) => ({ ...t, linkable: true })),
    icons: SEED_ICONS.map((t) => ({ ...t, linkable: true })),
    spacing: SEED_SPACING.map((t) => ({ ...t, linkable: true })),
    radius: SEED_RADIUS.map((t) => ({ ...t, linkable: true })),
    images: [],
  };
}

/** An empty token set — every category present but with no tokens. */
export function emptySystemDesignTokens(): SystemDesignTokens {
  return {
    colors: [],
    gradients: [],
    typography: [],
    icons: [],
    spacing: [],
    radius: [],
    images: [],
  };
}
