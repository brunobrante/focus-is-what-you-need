import type { NavigateFunction } from "react-router-dom";
import type { IconToken, SystemDesignRow } from "@/lib/storage/schema";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import type { EntityRef } from "@/domain/graph/edges";
import {
  createIcon,
  getIcon,
  updateIconArt,
  transparentIconArtboardGraphJSON,
} from "@/lib/storage/repos/icons.repo";
import {
  canvasDocumentFromHtmlGraphJSON,
  htmlGraphJSONFromCanvasDocument,
} from "@/canvas/engine/htmlSceneAdapter";
import { parseSvg } from "@/canvas/engine/vector/svgImport";
import { insertSvgPathsAsRoot } from "@/canvas/engine/mutations/vectorOps";
import { sanitizeSvg } from "@/canvas/engine/vector/sanitizeSvg";
import { getSystemDesign, saveSystemDesign } from "@/lib/storage/repos/systemDesigns.repo";

const DEFAULT_ICON_SIZE = { width: 24, height: 24 };

/**
 * Build the seed scene graph for a fresh icon master: a transparent artboard,
 * plus the icon's existing vector art inserted when it already has an `svg` (so
 * opening it on the canvas shows the current icon rather than a blank frame).
 */
export function buildIconSceneGraphJSON(
  name: string,
  size: { width: number; height: number },
  svg: string | null | undefined,
): string {
  const blankGraph = transparentIconArtboardGraphJSON(name, size);
  const imported = svg ? parseSvg(svg) : null;
  if (!imported) return blankGraph;
  const doc = canvasDocumentFromHtmlGraphJSON(blankGraph, { promoteSubjectRoot: true });
  if (!doc) return blankGraph;
  // The artboard IS the icon's SVG: the paths are its direct children (no sealed
  // container), so the tree shows the paths and the whole artboard is the icon.
  const { document } = insertSvgPathsAsRoot(doc, imported);
  return htmlGraphJSONFromCanvasDocument(document, blankGraph, name);
}

/** The workspace/project owner a design's icon master is scoped under (same
 *  standard scope logic as a component created in that scope). */
function designScopeOwner(design: SystemDesignRow): {
  owner: EntityRef;
  workspaceId: string | null;
  projectId: string | null;
} {
  return design.ownerScope === "workspace"
    ? { owner: { type: "workspace", id: design.ownerId }, workspaceId: design.ownerId, projectId: null }
    : { owner: { type: "project", id: design.ownerId }, workspaceId: null, projectId: design.ownerId };
}

/**
 * Open an icon token's editable art on the canvas. The art lives in an `IconRow`
 * master (a first-class subject, like a screen/component — never a component) that
 * owns a variant+scene; the master is **owned by the design's scope owner**
 * (workspace/project), exactly like a component created in that scope. The token
 * references the master by `iconId`; the token's cached `svg` is refreshed by the
 * canvas save-back. The icon opens in the normal canvas by variant — no special
 * editor mode. Deleting the token (or its design) cascade-deletes the master
 * (see `deleteIcon`).
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
  const design = controller.design;
  if (!design) return;
  const designId = design.id;

  const size = token.viewBox ?? DEFAULT_ICON_SIZE;

  if (token.iconId) {
    const existing = await getIcon(token.iconId);
    if (existing) {
      navigate(iconCanvasUrl(existing.activeVariantId, designId));
      return;
    }
    // The master was deleted out from under us — recreate below.
  }

  const scope = designScopeOwner(design);
  const { icon } = await createIcon({
    owner: scope.owner,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    name: token.name,
    size,
    svg: token.svg ?? null,
    viewBox: token.viewBox ?? null,
    // Seed the artboard with the icon's current art when it already has one; a
    // token with no svg falls through to createIcon's blank transparent artboard.
    sceneGraphJSON: token.svg ? buildIconSceneGraphJSON(token.name, size, token.svg) : undefined,
  });

  const linked: IconToken = { ...token, iconId: icon.id };
  controller.upsertToken("icons", linked);
  navigate(iconCanvasUrl(icon.activeVariantId, designId));
}

/**
 * Normalize a canvas-exported `<svg>` (from `svgForElement`) into bare markup:
 * strips the XML prolog via re-parse and reads back the `viewBox`.
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
 * Save-back: refresh an icon **master**'s cached `svg` from a serialized canvas
 * scene, and — when the master belongs to a System Design (`designId` given) —
 * mirror it onto the design's icon token that references this master (`iconId`),
 * so the Icons tab and every linked instance re-render. Writes through
 * `saveSystemDesign` (per-`TokenRow` `putRecord`, the approved path).
 */
export async function writeIconArtBack(
  iconMasterId: string,
  exportedSvg: string,
  designId?: string,
): Promise<void> {
  const normalized = normalizeExportedIconSvg(exportedSvg);
  if (!normalized || !normalized.svg.trim()) return;

  await updateIconArt(iconMasterId, {
    svg: normalized.svg,
    viewBox: normalized.viewBox ?? null,
  });

  if (!designId) return;
  const design = await getSystemDesign(designId);
  if (!design) return;
  const icons = design.tokens.icons;
  const idx = icons.findIndex((t) => t.iconId === iconMasterId);
  if (idx < 0) return;

  const current = icons[idx]!;
  // Skip a write when nothing changed (avoids a save-loop echo).
  if (current.svg === normalized.svg) return;
  const nextIcon: IconToken = {
    ...current,
    svg: normalized.svg,
    viewBox: normalized.viewBox ?? current.viewBox,
  };
  const nextIcons = icons.map((t, i) => (i === idx ? nextIcon : t));
  saveSystemDesign({ ...design, tokens: { ...design.tokens, icons: nextIcons } });
}

function iconCanvasUrl(variantId: string, designId: string): string {
  const p = new URLSearchParams({
    variant: variantId,
    type: "desktop",
    systemDesign: designId,
  });
  return `/canvas?${p.toString()}`;
}
