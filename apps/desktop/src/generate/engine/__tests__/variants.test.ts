import { expect, test } from "bun:test";
import type { SavedComponent } from "../types";
import {
  addVariant,
  cutVariants,
  ORIGINAL_VARIANT_ID,
  removeVariant,
  resolveActiveVariantId,
  setActiveVariant,
  setOriginalVariantImage,
} from "../variants";

function cut(): SavedComponent {
  return {
    id: "cut-1",
    name: "cut-1",
    box: { x: 0, y: 0, w: 100, h: 50 },
    dataUrl: "data:image/png;base64,ORIGINAL",
    type: "PNG",
    createdAt: "2026-01-01T00:00:00.000Z",
    parentId: "root",
  };
}

test("a legacy cut reads back as a single original variant", () => {
  const variants = cutVariants(cut());
  expect(variants).toHaveLength(1);
  expect(variants[0]).toMatchObject({ id: ORIGINAL_VARIANT_ID, tool: "original", dataUrl: "data:image/png;base64,ORIGINAL" });
  expect(resolveActiveVariantId(cut())).toBe(ORIGINAL_VARIANT_ID);
});

test("addVariant keeps the original, appends, and makes the new one main", () => {
  const next = addVariant(cut(), {
    tool: "birefnet",
    dataUrl: "data:image/png;base64,NOBG",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  expect(next.variants).toHaveLength(2);
  expect(next.variants?.[0].tool).toBe("original");
  expect(next.variants?.[1].tool).toBe("birefnet");
  // The cut mirrors the active (new) variant.
  expect(next.activeVariantId).toBe(next.variants?.[1].id);
  expect(next.dataUrl).toBe("data:image/png;base64,NOBG");
});

test("setActiveVariant switches the main and re-syncs dataUrl back to original", () => {
  const edited = addVariant(cut(), {
    tool: "realEsrgan",
    dataUrl: "data:image/png;base64,UPSCALED",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  const back = setActiveVariant(edited, ORIGINAL_VARIANT_ID);
  expect(back.activeVariantId).toBe(ORIGINAL_VARIANT_ID);
  expect(back.dataUrl).toBe("data:image/png;base64,ORIGINAL");
});

test("removeVariant never drops the original and falls back when removing the main", () => {
  const edited = addVariant(cut(), {
    tool: "lama",
    dataUrl: "data:image/png;base64,INPAINTED",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  const aiId = edited.variants?.[1].id ?? "";
  // Removing the original is a no-op.
  expect(removeVariant(edited, ORIGINAL_VARIANT_ID)).toBe(edited);
  // Removing the active AI variant falls back to original.
  const pruned = removeVariant(edited, aiId);
  expect(pruned.variants).toHaveLength(1);
  expect(pruned.activeVariantId).toBe(ORIGINAL_VARIANT_ID);
  expect(pruned.dataUrl).toBe("data:image/png;base64,ORIGINAL");
});

test("setOriginalVariantImage replaces the crop but preserves AI variants", () => {
  const edited = addVariant(cut(), {
    tool: "birefnet",
    dataUrl: "data:image/png;base64,NOBG",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  // Re-cropping while an AI variant is main: original image updates, main stays AI.
  const recropped = setOriginalVariantImage(edited, "data:image/png;base64,RECROP");
  const original = recropped.variants?.find((v) => v.tool === "original");
  expect(original?.dataUrl).toBe("data:image/png;base64,RECROP");
  expect(recropped.variants).toHaveLength(2);
  expect(recropped.dataUrl).toBe("data:image/png;base64,NOBG");
});
