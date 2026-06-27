import { TABLES, getRecordById } from "@/lib/storage/store";
import { ownerOf, setOwner } from "@/lib/storage/repos/edges.repo";
import type { ComponentScope } from "@/lib/storage/defaults";
import type { EntityRef } from "@/domain/graph/edges";
import type { VariantRow } from "@/lib/storage/schema";

/**
 * Edge-authoritative component scope (Architecture.md, Storage ownership).
 * Replaces the field-based `componentScope`: scope is derived from the single
 * incoming `owns` edge, with **no** `screenId` / `parentVariantId` source of
 * truth. A component with no owner edge is a Draft.
 *
 *   workspace owns  → "workspace"
 *   project owns    → "project"
 *   variant owns    → resolve the variant's ownerKind: "screen" → screen-level,
 *                     "component" → nested
 *   (no owner edge) → "draft"
 */
export type ScopeOrDraft = ComponentScope | "draft";

export async function componentScopeFromEdges(
  componentId: string,
): Promise<ScopeOrDraft> {
  const owner = await ownerOf({ type: "component", id: componentId });
  if (!owner) return "draft";
  switch (owner.type) {
    case "workspace":
      return "workspace";
    case "project":
      return "project";
    case "variant": {
      const variant = await getRecordById<VariantRow>(TABLES.variants, owner.id);
      return variant?.ownerKind === "screen" ? "screen" : "nested";
    }
    default:
      // Any other owner type is unexpected for a component; treat as project-global.
      return "project";
  }
}

/**
 * The component-ownership write primitive every path goes through (uniform
 * `*owns* component` rule). Maps the intended owner to the single `owns` edge:
 *
 *   - workspace-global → `workspace owns component`
 *   - project-global   → `project owns component`
 *   - screen top-level / nested / version-owned → `variant owns component`
 *     (all the SAME edge — the screenId/parentVariantId asymmetry is gone)
 *   - Draft            → no owner edge (`owner: null`)
 */
export async function setComponentOwner(
  componentId: string,
  owner: EntityRef | null,
): Promise<void> {
  await setOwner(owner, { type: "component", id: componentId });
}

/** The current owner ref of a component (null = Draft). */
export async function componentOwner(
  componentId: string,
): Promise<EntityRef | null> {
  return ownerOf({ type: "component", id: componentId });
}
