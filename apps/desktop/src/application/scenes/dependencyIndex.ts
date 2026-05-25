import type { ComponentRow, SceneOwnerType, VariantRow } from "@/lib/storage/schema";

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

  for (const variant of input.variants) {
    const component = componentById.get(variant.componentId);
    if (component) componentByVariantId.set(variant.id, component);
  }

  const getComponentForVariant = (variantId: string): ComponentRow | null =>
    componentByVariantId.get(variantId) ?? null;

  const getParentOwnerForVariant = (variantId: string): ParentSceneOwner | null => {
    const component = getComponentForVariant(variantId);
    if (!component) return null;
    if (component.parentVariantId) {
      return { ownerType: "variant", ownerId: component.parentVariantId };
    }
    if (component.screenId) {
      return { ownerType: "screen", ownerId: component.screenId };
    }
    return null;
  };

  const getVariantDepth = (variantId: string, seen = new Set<string>()): number => {
    const cached = depthByVariantId.get(variantId);
    if (cached !== undefined) return cached;
    if (seen.has(variantId)) return 0;
    seen.add(variantId);

    const parent = getParentOwnerForVariant(variantId);
    const depth =
      parent?.ownerType === "variant"
        ? 1 + getVariantDepth(parent.ownerId, seen)
        : 0;
    depthByVariantId.set(variantId, depth);
    return depth;
  };

  return {
    componentById,
    variantById,
    componentByVariantId,
    getComponentForVariant,
    getParentOwnerForVariant,
    getVariantDepth,
  };
}
