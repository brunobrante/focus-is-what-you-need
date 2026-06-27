import type { HtmlCanvasDocument, HtmlCanvasNode } from "./types";
import { getHtmlCanvasChildren, getHtmlCanvasNode, normalizeHtmlCanvasDocument } from "./document";
import { escapeAttr, escapeXml } from "./styleUtils";

export function svgForHtmlCanvasDocument(document: HtmlCanvasDocument): string {
  const normalized = normalizeHtmlCanvasDocument(document);
  const root = getHtmlCanvasNode(normalized, normalized.rootId);
  if (!root) return "";
  const body = renderSvgNode(normalized, root, 0, 0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${root.bounds.width}" height="${root.bounds.height}" viewBox="0 0 ${root.bounds.width} ${root.bounds.height}" fill="none">`,
    body,
    "</svg>",
  ].join("");
}

function renderSvgNode(
  document: HtmlCanvasDocument,
  node: HtmlCanvasNode,
  parentX: number,
  parentY: number,
): string {
  if (!node.visible) return "";
  const x = parentX + node.bounds.x;
  const y = parentY + node.bounds.y;
  const children = getHtmlCanvasChildren(document, node.id)
    .map((child) => renderSvgNode(document, child, x, y))
    .join("");
  const fill =
    node.kind === "text" || node.style.background === "transparent"
      ? "none"
      : escapeAttr(node.style.background);
  const stroke =
    node.style.borderStyle === "none" || node.style.borderWidth <= 0
      ? ""
      : ` stroke="${escapeAttr(node.style.borderColor)}" stroke-width="${node.style.borderWidth}"`;
  const opacity = node.style.opacity < 1 ? ` opacity="${node.style.opacity}"` : "";

  if (node.kind === "icon") {
    const cx = x + node.bounds.width / 2;
    const cy = y + node.bounds.height / 2;
    const outerRadius = Math.min(node.bounds.width, node.bounds.height) * 0.28;
    const points: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * (Math.PI / 5);
      const radius = i % 2 === 0 ? outerRadius : outerRadius * 0.48;
      points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
    }
    return [
      `<rect x="${x}" y="${y}" width="${node.bounds.width}" height="${node.bounds.height}" rx="${node.style.borderRadius}" fill="${fill}"${stroke}${opacity}/>`,
      `<polygon points="${points.join(" ")}" fill="${escapeAttr(node.style.color)}"${opacity}/>`,
      children,
    ].join("");
  }

  if (node.kind === "text") {
    const text = escapeXml(node.text ?? node.name);
    return [
      `<text x="${x}" y="${y + node.style.fontSize}" fill="${escapeAttr(node.style.color)}" font-family="${escapeAttr(node.style.fontFamily)}" font-size="${node.style.fontSize}" font-weight="${node.style.fontWeight}"${opacity}>${text}</text>`,
      children,
    ].join("");
  }

  if (node.appearance === "ellipse") {
    return [
      `<ellipse cx="${x + node.bounds.width / 2}" cy="${y + node.bounds.height / 2}" rx="${node.bounds.width / 2}" ry="${node.bounds.height / 2}" fill="${fill}"${stroke}${opacity}/>`,
      children,
    ].join("");
  }

  if (node.appearance === "line") {
    return [
      `<line x1="${x}" y1="${y}" x2="${x + node.bounds.width}" y2="${y + node.bounds.height}" stroke="${escapeAttr(node.style.borderColor === "transparent" ? node.style.background : node.style.borderColor)}" stroke-width="${Math.max(1, node.style.borderWidth || 2)}"${opacity}/>`,
      children,
    ].join("");
  }

  return [
    `<rect x="${x}" y="${y}" width="${node.bounds.width}" height="${node.bounds.height}" rx="${node.style.borderRadius}" fill="${fill}"${stroke}${opacity}/>`,
    children,
  ].join("");
}
