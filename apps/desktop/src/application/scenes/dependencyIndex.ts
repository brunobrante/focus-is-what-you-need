import type { ComponentRow, SceneOwnerType, VariantRow } from "@/lib/storage/schema";
import { parentVariantIdOf, screenIdOfComponent } from "@/application/graph/componentOwnership";

export type ParentSceneOwner = {
  ownerType: SceneOwnerType;
  ownerId: string;
};

export type SceneDependencyIndex = {
  componentById: Map<string, ComponentRow>;
  variantById: Map<string, VariantRow>;
  componentByVariantId: Map<string, ComponentRow>;
  getComponentForVariant(variantId: string): ComponentRow | null;
  getParentOwnerForVariant(variantId: string): ParentSceneOwner | null;
  getVariantDepth(variantId: string): number;
};

export function createSceneDependencyIndex(input: {
  components: ComponentRow[];
  variants: VariantRow[];
}): SceneDependencyIndex {
  const componentById = new Map(input.components.map((component) => [component.id, component]));
  const variantById = new Map(input.variants.map((variant) => [variant.id, variant]));
  const componentByVariantId = new Map<string, ComponentRow>();
  const depthByVariantId = new Map<string, number>();

  // Each screen's main (lowest-order) variant — the scene that embeds the screen's
  // top-level components. Top-level components propagate into this variant's scene.
  const mainVariantByScreenId = new Map<string, string>();
  for (const variant of input.variants) {
    if (variant.ownerKind !== "screen") continue;
    const current = mainVariantByScreenId.get(variant.ownerId);
    if (!current) {
      mainVariantByScreenId.set(variant.ownerId, variant.id);
      continue;
    }
    const currentOrder = variantById.get(current)?.order ?? 0;
    if (variant.order < currentOrder) mainVariantByScreenId.set(variant.ownerId, variant.id);
  }

  for (const variant of input.variants) {
    if (variant.ownerKind !== "component") continue;
    const component = componentById.get(variant.ownerId);
    if (component) componentByVariantId.set(variant.id, component);
  }

  const getComponentForVariant = (variantId: string): ComponentRow | null =>
    componentByVariantId.get(variantId) ?? null;

  const getParentOwnerForVariant = (variantId: string): ParentSceneOwner | null => {
    const variant = variantById.get(variantId);
    // A screen-owned variant is a root: propagation stops there.
    if (!variant || variant.ownerKind === "screen") return null;

    const component = getComponentForVariant(variantId);
    if (!component) return null;
    const parentVariantId = parentVariantIdOf(component.id) ?? component.parentVariantId;
    const screenId = screenIdOfComponent(component.id) ?? component.screenId;
    if (parentVariantId) {
      return { ownerType: "variant", ownerId: parentVariantId };
    }
    if (screenId) {
      // Top-level screen component → its embedding scene is the screen's main variant.
      const mainVariantId = mainVariantByScreenId.get(screenId);
      if (mainVariantId) return { ownerType: "variant", ownerId: mainVariantId };
    }
    return null;
  };

  // Returns the depth plus whether the walk passed through a cycle. A depth
  // computed along a cyclic path is wrong (the cycle short-circuits to 0), so it
  // must NOT be memoized — otherwise an ancestor caches a too-small depth (SAVE-9).
  const computeDepth = (
    variantId: string,
    seen: Set<string>,
  ): { depth: number; cyclic: boolean } => {
    const cached = depthByVariantId.get(variantId);
    if (cached !== undefined) return { depth: cached, cyclic: false };
    if (seen.has(variantId)) return { depth: 0, cyclic: true };
    seen.add(variantId);

    const parent = getParentOwnerForVariant(variantId);
    if (parent?.ownerType !== "variant") {
      depthByVariantId.set(variantId, 0);
      return { depth: 0, cyclic: false };
    }

    const sub = computeDepth(parent.ownerId, seen);
    const depth = 1 + sub.depth;
    if (!sub.cyclic) depthByVariantId.set(variantId, depth);
    return { depth, cyclic: sub.cyclic };
  };

  const getVariantDepth = (variantId: string): number =>
    computeDepth(variantId, new Set<string>()).depth;

  return {
    componentById,
    variantById,
    componentByVariantId,
    getComponentForVariant,
    getParentOwnerForVariant,
    getVariantDepth,
  };
}
