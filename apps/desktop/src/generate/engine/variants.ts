import { randomSuffix } from "@/lib/storage/ids";
import type { CutVariant, CutVariantTool, SavedComponent } from "./types";

// Human-readable labels for each non-crop edit tool, shown in the variants panel.
export const VARIANT_TOOL_LABELS: Record<CutVariantTool, string> = {
  original: "Original",
  birefnet: "Background removed",
  realEsrgan: "Upscaled",
  lama: "Element removed",
};

// Stable id for the implicit "original" variant of a cut. Combined with the cut
// id it yields a stable on-disk file name, so re-reads never duplicate it.
export const ORIGINAL_VARIANT_ID = "v-original";

export function newVariantId(): string {
  return `v-${randomSuffix()}`;
}

// Returns the cut's variants, synthesising a single "original" entry from the
// cut's own `dataUrl` when the cut predates the variant model (legacy rows).
export function cutVariants(component: SavedComponent): CutVariant[] {
  if (component.variants && component.variants.length > 0) return component.variants;
  return [
    {
      id: ORIGINAL_VARIANT_ID,
      tool: "original",
      dataUrl: component.dataUrl,
      createdAt: component.createdAt,
    },
  ];
}

// The id of the "main" variant: the explicit `activeVariantId` when valid, else
// the original (or the first variant as a last resort).
export function resolveActiveVariantId(component: SavedComponent): string {
  const variants = cutVariants(component);
  const active = component.activeVariantId;
  if (active && variants.some((variant) => variant.id === active)) return active;
  return (variants.find((variant) => variant.tool === "original") ?? variants[0]).id;
}

// Re-syncs `dataUrl`/`activeVariantId`/`variants` so the cut renders the active
// variant everywhere. The single source of truth for the mirroring invariant.
function withVariants(
  component: SavedComponent,
  variants: CutVariant[],
  activeId: string,
): SavedComponent {
  const active = variants.find((variant) => variant.id === activeId) ?? variants[0];
  return {
    ...component,
    variants,
    activeVariantId: active.id,
    dataUrl: active.dataUrl,
    type: component.type || "PNG",
  };
}

// Appends a new variant produced by a non-crop tool and makes it the main one.
export function addVariant(
  component: SavedComponent,
  input: { tool: CutVariantTool; dataUrl: string; createdAt: string },
): SavedComponent {
  const variants = cutVariants(component);
  const variant: CutVariant = {
    id: newVariantId(),
    tool: input.tool,
    dataUrl: input.dataUrl,
    createdAt: input.createdAt,
  };
  return withVariants(component, [...variants, variant], variant.id);
}

// Switches which variant is the main one. No-op if the id is unknown.
export function setActiveVariant(component: SavedComponent, variantId: string): SavedComponent {
  const variants = cutVariants(component);
  if (!variants.some((variant) => variant.id === variantId)) return component;
  return withVariants(component, variants, variantId);
}

// Deletes a non-original variant. Removing the active one falls back to original.
export function removeVariant(component: SavedComponent, variantId: string): SavedComponent {
  const variants = cutVariants(component);
  const target = variants.find((variant) => variant.id === variantId);
  if (!target || target.tool === "original") return component;
  const next = variants.filter((variant) => variant.id !== variantId);
  const fallback = (next.find((variant) => variant.tool === "original") ?? next[0]).id;
  const activeId = component.activeVariantId === variantId ? fallback : resolveActiveVariantId(component);
  return withVariants(component, next, activeId);
}

// Replaces the "original" variant's image (used when a cut's crop geometry is
// re-edited). AI variants are preserved; the cut re-syncs to its active variant.
export function setOriginalVariantImage(component: SavedComponent, dataUrl: string): SavedComponent {
  const variants = cutVariants(component).map((variant) =>
    variant.tool === "original" ? { ...variant, dataUrl } : variant,
  );
  return withVariants(component, variants, resolveActiveVariantId(component));
}
