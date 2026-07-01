import type { NavigateFunction } from "react-router-dom";
import type { IconToken } from "@/lib/storage/schema";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import { createComponent, getComponent } from "@/lib/storage/repos/components.repo";
import { upsertScene } from "@/lib/storage/repos/scenes.repo";
import {
  createBlankHtmlCanvasDocument,
  serializeHtmlCanvasDocument,
} from "@/lib/canvas/htmlScene";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { parseSvg } from "@/canvas/engine/vector/svgImport";
import { insertSvgDocument } from "@/canvas/engine/mutations/vectorOps";
import { sanitizeSvg } from "@/canvas/engine/vector/sanitizeSvg";
import { getSystemDesign, saveSystemDesign } from "@/lib/storage/repos/systemDesigns.repo";

// Reserved `ComponentRow.category` marking the ownerless draft components that
// back icon tokens, so they can be filtered out of the Home "Drafts" list. See
// `listDrafts` in components.repo.ts.
export const ICON_BACKING_CATEGORY = "system-icon";

const DEFAULT_ICON_SIZE = { width: 24, height: 24 };

/**
 * A blank icon artboard graph with a **transparent** background — icons must not
 * bake a white rect when serialized back (the SVG renderer emits `fill="none"`
 * for a `"transparent"` frame). `createBlankHtmlCanvasDocument` hardcodes white,
 * so override the root frame's fill.
 */
function blankIconGraph(name: string, size: { width: number; height: number }): string {
  const doc = createBlankHtmlCanvasDocument({ name, width: size.width, height: size.height });
  const root = doc.nodes[0];
  if (root) {
    // The renderer emits `fill="none"` only for a "transparent" background; the
    // read-path (`normalizeNode`) preserves `style.background`, so this survives.
    root.style = { ...root.style, background: "transparent" };
  }
  return serializeHtmlCanvasDocument(doc);
}

/**
 * Seed a freshly created backing variant's scene: a transparent artboard, plus
 * the icon's existing vector art inserted when it already has an `svg` (so
 * opening it on the canvas shows the current icon rather than a blank frame).
 * Always overwrites the white blank scene `createComponent` seeds.
 */
async function seedBackingScene(
  variantId: string,
  name: string,
  size: { width: number; height: number },
  svg: string | undefined,
): Promise<void> {
  const blankGraph = blankIconGraph(name, size);
  let graphJSON = blankGraph;

  const imported = svg ? parseSvg(svg) : null;
  if (imported) {
    const doc = canvasDocumentFromHtmlGraphJSON(blankGraph, { promoteSubjectRoot: true });
    if (doc) {
      const { document } = insertSvgDocument(doc, imported, 0, 0);
      graphJSON = htmlGraphJSONFromCanvasDocument(document, blankGraph, name);
    }
  }

  await upsertScene(
    { ownerType: "variant", ownerId: variantId, graphJSON },
    { propagate: false },
  );
}

/**
 * Open an icon token's editable art on the canvas. The art lives in an ownerless
 * *draft* component (a real component + Default variant owning a real scene) —
 * the same pattern as `useNewDraft` — so the icon opens in the normal canvas by
 * variant, with no special editor mode. The backing component is created lazily
 * and linked back onto the token; the token's cached `svg` is refreshed by the
 * canvas save-back keyed on the `icon`/`systemDesign` query params.
 */
export async function openIconInCanvas({
  token,
  controller,
  navigate,
}: {
  token: IconToken;
  controller: SystemDesignController;
  navigate: NavigateFunction;
}): Promise<void> {
  const designId = controller.design?.id;
  if (!designId) return;

  const size = token.viewBox ?? DEFAULT_ICON_SIZE;

  if (token.backingComponentId) {
    // Existing backing: resolve its active variant via the component row.
    const existing = await getComponent(token.backingComponentId);
    if (existing) {
      navigate(iconCanvasUrl(existing.activeVariantId, token.id, designId));
      return;
    }
    // The backing was deleted out from under us — recreate below.
  }

  const { component, defaultVariant } = await createComponent({
    parent: { kind: "draft" },
    // A unique, stable name avoids the draft sibling name-collision throw and is
    // never user-visible (backings are hidden from the Drafts list).
    name: `icon:${token.id}`,
    category: ICON_BACKING_CATEGORY,
    draftKind: "component",
    draftType: "desktop",
    width: size.width,
    height: size.height,
  });
  const variantId = defaultVariant.id;
  await seedBackingScene(variantId, token.name, size, token.svg);

  const linked: IconToken = { ...token, backingComponentId: component.id };
  controller.upsertToken("icons", linked);
  navigate(iconCanvasUrl(variantId, token.id, designId));
}

/**
 * Normalize a canvas-exported `<svg>` (from `svgForElement`) into bare token
 * markup: strips the XML prolog via re-parse and reads back the `viewBox`.
 */
function normalizeExportedIconSvg(
  raw: string,
): { svg: string; viewBox?: { width: number; height: number } } | null {
  const el = sanitizeSvg(raw);
  if (!el) return null;
  let viewBox: { width: number; height: number } | undefined;
  const vb = el.getAttribute("viewBox");
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every((n) => Number.isFinite(n))) {
      viewBox = { width: p[2]!, height: p[3]! };
    }
  }
  return { svg: el.outerHTML, viewBox };
}

/**
 * Save-back: refresh an icon token's cached `svg` from a serialized canvas scene.
 * Reads the design, patches only the matching icon (preserving name/backing/
 * linkable), and writes through `saveSystemDesign` — which splits to per-`TokenRow`
 * `putRecord`s (the approved persistence path; never the port directly).
 */
export async function writeIconSvgBack(
  designId: string,
  tokenId: string,
  exportedSvg: string,
): Promise<void> {
  const normalized = normalizeExportedIconSvg(exportedSvg);
  if (!normalized || !normalized.svg.trim()) return;

  const design = await getSystemDesign(designId);
  if (!design) return;
  const icons = design.tokens.icons;
  const idx = icons.findIndex((t) => t.id === tokenId);
  if (idx < 0) return;

  const current = icons[idx]!;
  const nextIcon: IconToken = {
    ...current,
    svg: normalized.svg,
    viewBox: normalized.viewBox ?? current.viewBox,
  };
  // Skip a write when nothing changed (avoids a save-loop echo).
  if (nextIcon.svg === current.svg) return;

  const nextIcons = icons.map((t, i) => (i === idx ? nextIcon : t));
  saveSystemDesign({ ...design, tokens: { ...design.tokens, icons: nextIcons } });
}

function iconCanvasUrl(variantId: string, tokenId: string, designId: string): string {
  const p = new URLSearchParams({
    variant: variantId,
    type: "desktop",
    icon: tokenId,
    systemDesign: designId,
  });
  return `/canvas?${p.toString()}`;
}
