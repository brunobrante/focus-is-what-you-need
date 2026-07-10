import type { CSSProperties } from "react";
import type { CanvasDocument, ElementNode } from "@/canvas/engine/types";
import { escapeAttr, escapeXml, slugClass } from "@/domain/canvas/htmlScene/styleUtils";
import { compileShapeStroke } from "@/domain/canvas/border";
import { runsForContent } from "@/domain/canvas/textRuns";
import { compileRunStyles } from "@/domain/canvas/typography";
import {
  shapeClipPath,
  shapeOutline,
  shapeOutlinePathData,
  splitClipShapeStyles,
} from "@/domain/canvas/shapeGeometry";
import { composeElementCss } from "./elementCss";
import { cssPropsToString, cssPropsToInline } from "./cssSerialize";
import { svgForElement } from "./svgExport";
import type { HtmlExportMode } from "./types";

// HTML export — the DOM-native differentiator. The element is stored as style
// objects, so the emitter is fully controlled (no scraping the live DOM): it
// reuses the very same domain `compile*` functions the canvas renderer uses
// (via composeElementCss) to author real, standalone HTML/CSS.
//
// `standalone` → one self-contained `.html` (embedded <style>, data-URL assets).
// `bundle` → `index.html` + external `styles.css` (orchestrator zips them).

const RESET = "*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }";

export type HtmlExportResult = {
  bundle: boolean;
  files: Array<{ name: string; text: string }>;
};

type EmitContext = {
  document: CanvasDocument;
  rules: string[];
  seq: number;
};

/**
 * A clip-path shape's border, as inline SVG markup — the exporter's twin of
 * `ClipShapeStroke` in the canvas renderer, driven by the same compiled model so the
 * exported polygon carries the same stroke it was drawn with.
 */
function clipShapeStrokeMarkup(node: ElementNode): string {
  const stroke = compileShapeStroke(node.styles);
  const outline = shapeOutline(node.type, node.styles.borderRadius);
  if (!stroke || !outline) return "";

  const width = Math.max(node.width, 1);
  const height = Math.max(node.height, 1);
  const d = shapeOutlinePathData(outline, width, height);
  const pad = stroke.strokeWidth;
  const uid = slugClass(node.id) || "shape";

  const dash = stroke.strokeDasharray ? ` stroke-dasharray="${escapeAttr(stroke.strokeDasharray)}"` : "";
  const cap = stroke.strokeLinecap ? ` stroke-linecap="${stroke.strokeLinecap}"` : "";

  let defs = "";
  let clipAttr = "";
  if (stroke.align === "inside") {
    defs = `<defs><clipPath id="cp-${uid}"><path d="${d}"/></clipPath></defs>`;
    clipAttr = ` clip-path="url(#cp-${uid})"`;
  } else if (stroke.align === "outside") {
    const region = `x="${-pad}" y="${-pad}" width="${width + pad * 2}" height="${height + pad * 2}"`;
    defs =
      `<defs><mask id="mk-${uid}" maskUnits="userSpaceOnUse" ${region}>` +
      `<rect ${region} fill="#fff"/><path d="${d}" fill="#000"/></mask></defs>`;
    clipAttr = ` mask="url(#mk-${uid})"`;
  }

  return (
    `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" aria-hidden="true" ` +
    `style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none">${defs}` +
    `<path d="${d}" fill="none" stroke="${escapeAttr(stroke.stroke)}" ` +
    `stroke-width="${stroke.strokeWidth}"${dash}${cap}${clipAttr}/></svg>`
  );
}

/**
 * A text element's body. Uniform paragraphs stay a bare escaped string; styled
 * runs (G10) become inline-styled `<span>`s, mirroring the canvas renderer —
 * including the block wrapper a vertical-aligned (flex) box needs so the spans
 * do not each become their own flex line.
 */
function textMarkup(node: ElementNode): string {
  const content = node.content ?? "";
  if (!node.runs || node.runs.length === 0) return escapeXml(content);
  const spans = runsForContent(content, node.runs)
    .map((run) => {
      const text = escapeXml(run.text);
      if (!run.styles) return `<span>${text}</span>`;
      return `<span style="${escapeAttr(cssPropsToInline(compileRunStyles(run.styles)))}">${text}</span>`;
    })
    .join("");
  return node.styles.verticalAlign ? `<span style="display: block">${spans}</span>` : spans;
}

function emitNode(ctx: EmitContext, node: ElementNode, isRoot: boolean): string {
  if (node.visible === false) return "";
  const { style, fill } = composeElementCss(node, { isRoot });
  const className = `el-${slugClass(node.name) || node.type}-${ctx.seq++}`;

  // polygon/star/arrow: the clipped fill and the SVG stroke must be separate boxes,
  // or the clip would cut a Center/Outside stroke in half (same split as the canvas).
  const shapeClip = shapeClipPath(node.type, node.styles.borderRadius);
  if (shapeClip) {
    const { outer, fill: fillStyle } = splitClipShapeStyles(style, shapeClip);
    ctx.rules.push(`.${className} {\n${cssPropsToString(outer, "  ")}\n}`);
    const fillDiv = `<div style="${cssPropsToInline(fillStyle)}"></div>`;
    return `<div class="${className}">${fillDiv}${clipShapeStrokeMarkup(node)}</div>`;
  }

  ctx.rules.push(`.${className} {\n${cssPropsToString(style, "  ")}\n}`);

  let inner = "";
  if (node.type === "text") {
    inner = textMarkup(node);
  } else if (node.type === "image") {
    const render = fill?.imageRender;
    const src = render && (render.mode === "img" || render.mode === "video") ? render.src : node.src;
    if (src) {
      const tag = render?.mode === "video" ? "video" : "img";
      const mediaStyle: CSSProperties = {
        width: "100%",
        height: "100%",
        objectFit: (render?.objectFit ?? node.styles.objectFit) as CSSProperties["objectFit"],
        objectPosition: render?.objectPosition,
      };
      const attrs =
        tag === "video"
          ? " autoplay loop muted playsinline"
          : ` alt="${escapeAttr(node.name)}"`;
      inner = `<${tag} src="${escapeAttr(src)}"${attrs} style="${cssPropsToInline(mediaStyle)}"></${tag}>`;
    }
  } else if (node.type === "path" || node.type === "svg" || node.type === "icon") {
    // Vector content rendered as inline, true-vector SVG (no foreignObject).
    const svg = svgForElement(ctx.document, node.id, node.name);
    if (svg) inner = svg.replace(/^<\?xml[^>]*\?>\s*/, "");
  } else {
    inner = node.children
      .map((id) => {
        const child = ctx.document.elements[id];
        return child ? emitNode(ctx, child, false) : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return `<div class="${className}">${inner}</div>`;
}

function standaloneHtml(name: string, body: string, styleText: string, width: number, height: number): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeXml(name)}</title>`,
    "<style>",
    styleText,
    "</style>",
    "</head>",
    "<body>",
    `<div class="export-stage" style="position: relative; width: ${width}px; height: ${height}px;">`,
    body,
    "</div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function bundleHtml(name: string, body: string, width: number, height: number): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeXml(name)}</title>`,
    '<link rel="stylesheet" href="styles.css">',
    "</head>",
    "<body>",
    `<div class="export-stage" style="position: relative; width: ${width}px; height: ${height}px;">`,
    body,
    "</div>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** Author the HTML/CSS for one element's subtree. Returns null if the element
 *  is not found. */
export function buildHtmlExport(
  document: CanvasDocument,
  nodeId: string,
  mode: HtmlExportMode,
): HtmlExportResult | null {
  const root = document.elements[nodeId];
  if (!root) return null;

  const ctx: EmitContext = { document, rules: [], seq: 0 };
  const body = emitNode(ctx, root, true);
  const styleText = [RESET, ...ctx.rules].join("\n\n");
  const name = root.name || "Element";

  if (mode === "bundle") {
    return {
      bundle: true,
      files: [
        { name: "index.html", text: bundleHtml(name, body, root.width, root.height) },
        { name: "styles.css", text: `${styleText}\n` },
      ],
    };
  }

  return {
    bundle: false,
    files: [{ name: "index.html", text: standaloneHtml(name, body, styleText, root.width, root.height) }],
  };
}
