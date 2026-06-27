import { peekOwnerOf } from "@/application/graph/edgeIndex";
import { TABLES, peekTable } from "@/lib/storage/store";
import type { ComponentRow, VariantRow } from "@/lib/storage/schema";
import type { ComponentScope } from "@/lib/storage/defaults";

/**
 * Sync, edge-authoritative replacements for the legacy `ComponentRow.screenId` /
 * `ComponentRow.parentVariantId` reads (save-architecture-v3 flip 1). They resolve
 * a component's owner from the in-memory `graph_edges` adjacency index
 * (`peekOwnerOf`) — O(1), no I/O, hydrated at boot — and classify it the same way
 * the two fields encoded it:
 *
 *   - owned by a screen's MAIN variant  → screen-top-level  → `screenIdOf` = screen
 *   - owned by any other variant        → nested / version  → `parentVariantIdOf` = variant
 *   - owned by project/workspace / none → global / draft    → both null
 *
 * Callers in hot render loops should build the variant map once and pass it so the
 * lookup stays O(1) per component; one-off callers can omit it (self-fetched from
 * the cache). The fields stay written as a mirror, so a caller may `?? row.field`
 * for cold-index safety during the transition.
 */
type VariantLookup = ReadonlyMap<string, VariantRow>;

export function buildVariantLookup(): VariantLookup {
  return new Map(peekTable<VariantRow>(TABLES.variants).map((v) => [v.id, v]));
}

function ownerVariant(componentId: string, variants: VariantLookup): VariantRow | null {
  const owner = peekOwnerOf("component", componentId);
  if (!owner || owner.type !== "variant") return null;
  return variants.get(owner.id) ?? null;
}

/** A screen's MAIN variant (order <= 0) — the owner of its top-level components. */
const isScreenMainVariant = (v: VariantRow): boolean =>
  v.ownerKind === "screen" && v.order <= 0;

/** Edge-derived equivalent of `ComponentRow.screenId` (null when not screen-top-level). */
export function screenIdOfComponent(
  componentId: string,
  variants?: VariantLookup,
): string | null {
  const v = ownerVariant(componentId, variants ?? buildVariantLookup());
  return v && isScreenMainVariant(v) ? v.ownerId : null;
}

/** Edge-derived equivalent of `ComponentRow.parentVariantId` (null for screen-top-level / global / draft). */
export function parentVariantIdOf(
  componentId: string,
  variants?: VariantLookup,
): string | null {
  const v = ownerVariant(componentId, variants ?? buildVariantLookup());
  if (!v || isScreenMainVariant(v)) return null;
  return v.id;
}

/**
 * Edge-authoritative component scope (replaces the field-based `componentScope`):
 * classify a component from its single incoming `owns` edge —
 *   workspace → "workspace"; project → "project"; screen-main variant → "screen";
 *   any other variant → "nested"; no owner edge → orphan, treated as "project".
 * Falls back to the (still-written) owner fields when the edge index is cold.
 */
export function componentScopeOf(
  row: Pick<ComponentRow, "id" | "workspaceId" | "projectId" | "screenId" | "parentVariantId">,
  variants?: VariantLookup,
): ComponentScope {
  const owner = peekOwnerOf("component", row.id);
  if (owner) {
    if (owner.type === "workspace") return "workspace";
    if (owner.type === "project") return "project";
    if (owner.type === "variant") {
      const v = (variants ?? buildVariantLookup()).get(owner.id);
      return v?.ownerKind === "screen" ? "screen" : "nested";
    }
  }
  // Cold index or no owner edge — fall back to the owner fields (removed once the
  // fields are dropped). Orphan rows classify as project-global, as before.
  if (row.parentVariantId) return "nested";
  if (row.screenId) return "screen";
  if (row.projectId) return "project";
  if (row.workspaceId) return "workspace";
  return "project";
}
