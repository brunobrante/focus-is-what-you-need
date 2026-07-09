import type { ResolvedSystemDesign } from "@/domain/system-design/resolve";
import type {
  ColorToken,
  GradientToken,
  RadiusToken,
  SpacingToken,
  SystemDesignCategory,
  TypeStyleToken,
} from "@/domain/system-design/types";

// A style value bound to a System Design token. The ref string is
// "<category>:<tokenId>", e.g. "colors:c-primary". The token id is stable (a
// linked token keeps the workspace master's id), so the ref survives linking.

const CATEGORIES: ReadonlySet<string> = new Set<SystemDesignCategory>([
  "colors",
  "gradients",
  "typography",
  "icons",
  "spacing",
  "radius",
  "images",
]);

/** Build a token ref string for a category + token id. */
export function tokenRef(category: SystemDesignCategory, tokenId: string): string {
  return `${category}:${tokenId}`;
}

/** Parse a token ref string into its category + token id, or null if malformed. */
export function parseTokenRef(
  ref: string,
): { category: SystemDesignCategory; tokenId: string } | null {
  const idx = ref.indexOf(":");
  if (idx <= 0) return null;
  const category = ref.slice(0, idx);
  const tokenId = ref.slice(idx + 1);
  if (!tokenId || !CATEGORIES.has(category)) return null;
  return { category: category as SystemDesignCategory, tokenId };
}

/**
 * Resolve a token ref to a concrete CSS value against the project's resolved
 * system design. Because `resolved` already reflects a linked token's live master
 * value (and a detached token's local value), bound elements update automatically
 * when the master changes. Returns null when the ref is malformed, the token is
 * gone, or the category has no single CSS value (e.g. typography/icons/images).
 */
export function resolveTokenRef(
  ref: string,
  resolved: ResolvedSystemDesign,
): string | null {
  const parsed = parseTokenRef(ref);
  if (!parsed) return null;
  const entry = resolved[parsed.category].tokens.find(
    (sourced) => sourced.token.id === parsed.tokenId,
  );
  if (!entry) return null;
  const token = entry.token;

  switch (parsed.category) {
    case "colors":
      return (token as ColorToken).value;
    case "gradients": {
      const g = token as GradientToken;
      return `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;
    }
    case "spacing":
      return `${(token as SpacingToken).value}px`;
    case "radius":
      return `${(token as RadiusToken).value}px`;
    default:
      // typography / icons / images have no single CSS string value here.
      return null;
  }
}

/**
 * Resolve a typography ref to its live TypeStyleToken (family/weight/size) —
 * the multi-value counterpart of resolveTokenRef for `typeStyleRef` (G14).
 */
export function resolveTypeStyleTokenRef(
  ref: string,
  resolved: ResolvedSystemDesign,
): TypeStyleToken | null {
  const parsed = parseTokenRef(ref);
  if (!parsed || parsed.category !== "typography") return null;
  const entry = resolved.typography.tokens.find(
    (sourced) => sourced.token.id === parsed.tokenId,
  );
  return entry ? (entry.token as TypeStyleToken) : null;
}
