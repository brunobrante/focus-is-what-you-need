import type { CanvasDocument } from "@/canvas/engine/types";
import { svgForHtmlCanvasDocument } from "@/lib/canvas/htmlScene";
import { htmlSubtreeForElement } from "./subtree";

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>\n';

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
