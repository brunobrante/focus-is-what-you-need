import { useCallback } from "react";
import type { SavedComponent, CutVariantTool } from "../types";
import {
  addVariant,
  setActiveVariant as setActiveVariantOn,
  removeVariant as removeVariantFrom,
} from "../engine/variants";

export function useCutVariants({
  updateComponents,
}: {
  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
}) {
  const addCutVariant = useCallback(
    (cutId: string, input: { tool: CutVariantTool; dataUrl: string }) => {
      const createdAt = new Date().toISOString();
      updateComponents((current) =>
        current.map((c) =>
          c.id === cutId && c.parentId != null
            ? addVariant(c, { ...input, createdAt })
            : c,
        ),
      );
    },
    [updateComponents],
  );

  const setCutVariant = useCallback(
    (cutId: string, variantId: string) => {
      updateComponents((current) =>
        current.map((c) => (c.id === cutId ? setActiveVariantOn(c, variantId) : c)),
      );
    },
    [updateComponents],
  );

  const removeCutVariant = useCallback(
    (cutId: string, variantId: string) => {
      updateComponents((current) =>
        current.map((c) => (c.id === cutId ? removeVariantFrom(c, variantId) : c)),
      );
    },
    [updateComponents],
  );

  return { addCutVariant, setCutVariant, removeCutVariant };
}
