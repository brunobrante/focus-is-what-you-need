import type {
  SystemDesignCategory,
  SystemDesignRow,
} from "@/domain/system-design/types";
import { SYSTEM_DESIGN_CATEGORIES } from "@/domain/system-design/defaults";

// Where a resolved token comes from, for rendering an origin badge:
// - "project": a local token this design owns and can edit.
// - "linked":  a linked instance of a workspace token (live, not editable here).
export type TokenSource = "project" | "linked";

/** A token plus where it came from, for rendering an origin badge. */
export type SourcedToken<T extends { id: string } = { id: string }> = {
  token: T;
  source: TokenSource;
};

/**
 * One category after resolving. `tokens` are this design's tokens — local ones
 * and linked instances together, in order. `availableShared` are the workspace's
 * linkable tokens this project has NOT linked yet, offered by the link picker.
 */
export type ResolvedCategory = {
  tokens: SourcedToken[];
  hasWorkspace: boolean;
  availableShared: { id: string }[];
};

export type ResolvedSystemDesign = Record<SystemDesignCategory, ResolvedCategory>;

/**
 * Resolve a design against its (optional) parent workspace design. A token that
 * carries `instanceOf` is a linked instance: its display fields are refreshed
 * live from the master in the parent (falling back to its stored snapshot if the
 * master is gone). Plain tokens are local. Workspace linkable tokens that have
 * not been linked are exposed as `availableShared` for the picker.
 */
export function resolveSystemDesign(
  design: SystemDesignRow,
  parent: SystemDesignRow | null,
): ResolvedSystemDesign {
  const hasWorkspace = Boolean(parent);
  const out = {} as ResolvedSystemDesign;

  for (const category of SYSTEM_DESIGN_CATEGORIES) {
    const own = design.tokens[category] as ({
      id: string;
      linkable?: boolean;
      instanceOf?: { systemDesignId: string; tokenId: string } | null;
    } & Record<string, unknown>)[];
    const parentTokens = (parent?.tokens[category] ?? []) as ({
      id: string;
      linkable?: boolean;
    } & Record<string, unknown>)[];
    const parentById = new Map(parentTokens.map((t) => [t.id, t]));

    const linkedIds = new Set<string>();
    const tokens: SourcedToken[] = own.map((token) => {
      if (token.instanceOf) {
        linkedIds.add(token.instanceOf.tokenId);
        const master = parentById.get(token.instanceOf.tokenId);
        // Live values from the master; keep our id + link marker for actions.
        const resolved = master
          ? { ...master, id: token.id, instanceOf: token.instanceOf }
          : token;
        return { token: resolved as { id: string }, source: "linked" as const };
      }
      return { token, source: "project" as const };
    });

    out[category] = {
      tokens,
      hasWorkspace,
      availableShared: parentTokens.filter(
        (t) => t.linkable === true && !linkedIds.has(t.id),
      ),
    };
  }

  return out;
}
