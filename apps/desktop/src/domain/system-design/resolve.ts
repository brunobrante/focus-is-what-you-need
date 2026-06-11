import type {
  SystemDesignCategory,
  SystemDesignRow,
} from "@/lib/storage/schema";
import { SYSTEM_DESIGN_CATEGORIES } from "@/domain/system-design/defaults";

export type TokenSource = "workspace" | "project";

/** A token plus where it came from, for rendering an origin badge. */
export type SourcedToken<T extends { id: string } = { id: string }> = {
  token: T;
  source: TokenSource;
};

/**
 * One category after merging. `tokens` are the workspace tokens (minus the ones
 * this project excluded) followed by the project's own tokens. `availableShared`
 * are the workspace tokens the project removed — offered for re-adding.
 */
export type ResolvedCategory = {
  tokens: SourcedToken[];
  hasWorkspace: boolean;
  availableShared: { id: string }[];
};

export type ResolvedSystemDesign = Record<SystemDesignCategory, ResolvedCategory>;

/**
 * Merge a design with its (optional) parent workspace design into a single
 * unified token list per category. Workspace tokens and project tokens live
 * together; excluded workspace tokens drop out and become re-addable.
 */
export function resolveSystemDesign(
  design: SystemDesignRow,
  parent: SystemDesignRow | null,
): ResolvedSystemDesign {
  const hasWorkspace = Boolean(parent);
  const out = {} as ResolvedSystemDesign;

  for (const category of SYSTEM_DESIGN_CATEGORIES) {
    const excluded = new Set(design.excludedShared?.[category] ?? []);
    const parentTokens = parent ? parent.tokens[category] : [];
    const own = design.tokens[category];

    const shared: SourcedToken[] = parentTokens
      .filter((t) => !excluded.has(t.id))
      .map((token) => ({ token, source: "workspace" as const }));
    const local: SourcedToken[] = own.map((token) => ({
      token,
      source: "project" as const,
    }));

    out[category] = {
      tokens: [...shared, ...local],
      hasWorkspace,
      availableShared: parentTokens.filter((t) => excluded.has(t.id)),
    };
  }

  return out;
}
