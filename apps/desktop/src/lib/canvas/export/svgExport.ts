import type { CanvasDocument } from "@/canvas/engine/types";
import { svgForHtmlCanvasDocument } from "@/lib/canvas/htmlScene";
import { htmlCanvasDocumentFromCanvasDocument } from "@/canvas/engine/htmlSceneAdapter";
import { htmlSubtreeForElement } from "./subtree";

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>\n';

/**
 * Emit the icon markup for a whole icon scene: the artboard's content (its
 * top-level vector nodes) wrapped in one `<svg viewBox>`, WITHOUT the transparent
 * artboard frame itself. An icon's paths are direct children of its artboard (no
 * sealed `svg` container), so the whole document — not a single node — is the icon.
 * Returns null when there is nothing renderable.
 */
export function svgForIconDocument(
  document: CanvasDocument,
  fallbackName = "Icon",
): string | null {
  const html = htmlCanvasDocumentFromCanvasDocument(document, null, fallbackName);
  const svg = svgForHtmlCanvasDocument(html, { skipRootShape: true });
  return svg ? XML_PROLOG + svg : null;
}

/**
 * Emit a standalone SVG for an element's subtree. Vector-native content
 * (shapes/text) round-trips to true SVG primitives via the htmlScene SVG
 * renderer (the same path the canvas thumbnails use). Returns null if the
 * element is not found or has no renderable content.
 */
export function svgForElement(
  document: CanvasDocument,
  nodeId: string,
  fallbackName = "Element",
): string | null {
  const subtree = htmlSubtreeForElement(document, nodeId, fallbackName);
  if (!subtree) return null;
  const svg = svgForHtmlCanvasDocument(subtree);
  return svg ? XML_PROLOG + svg : null;
}
