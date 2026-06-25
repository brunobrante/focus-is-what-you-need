import type { CanvasDocument, ElementNode, ElementStyles } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function classNameFor(id: string): string {
  return `el-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function stylesToCss(styles: ElementStyles): string[] {
  const rules: string[] = [];
  if (styles.background) {
    rules.push(`  background: ${styles.background};`);
  }
  if (styles.color) {
    rules.push(`  color: ${styles.color};`);
  }
  if (styles.fontSize) {
    rules.push(`  font-size: ${styles.fontSize}px;`);
  }
  if (styles.fontWeight) {
    rules.push(`  font-weight: ${styles.fontWeight};`);
  }
  if (styles.cornerRadii) {
    const [tl, tr, br, bl] = styles.cornerRadii.map((c) => c ?? styles.borderRadius ?? 0);
    rules.push(`  border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`);
  } else if (styles.borderRadius !== undefined) {
    rules.push(`  border-radius: ${styles.borderRadius}px;`);
  }
  if (styles.borderWidth !== undefined) {
    rules.push(`  border-width: ${styles.borderWidth}px;`);
    rules.push("  border-style: solid;");
  }
  if (styles.borderColor) {
    rules.push(`  border-color: ${styles.borderColor};`);
  }
  if (styles.opacity !== undefined) {
    rules.push(`  opacity: ${styles.opacity};`);
  }
  if (styles.blendMode && styles.blendMode !== "normal") {
    rules.push(`  mix-blend-mode: ${styles.blendMode};`);
  }
  if (styles.isolation === "isolate") {
    rules.push("  isolation: isolate;");
  }
  if (styles.display) {
    rules.push(`  display: ${styles.display};`);
  }
  if (styles.justifyContent) {
    rules.push(`  justify-content: ${styles.justifyContent};`);
  }
  if (styles.alignItems) {
    rules.push(`  align-items: ${styles.alignItems};`);
  }
  if (styles.gap !== undefined) {
    rules.push(`  gap: ${styles.gap}px;`);
  }
  if (styles.padding !== undefined) {
    rules.push(`  padding: ${styles.padding}px;`);
  }
  return rules;
}

function renderNodeHtml(document: CanvasDocument, node: ElementNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const className = classNameFor(node.id);
  const children = node.children
    .map((childId) => document.elements[childId])
    .filter((child): child is ElementNode => Boolean(child) && child.visible !== false)
    .map((child) => renderNodeHtml(document, child, depth + 1))
    .join("\n");

  if (node.type === "text") {
    return `${indent}<div class="${className}">${escapeHtml(node.content ?? "")}</div>`;
  }

  if (node.type === "image" && node.src) {
    return `${indent}<img class="${className}" src="${escapeHtml(node.src)}" alt="${escapeHtml(node.name)}" />`;
  }

  if (!children) {
    return `${indent}<div class="${className}"></div>`;
  }

  return `${indent}<div class="${className}">\n${children}\n${indent}</div>`;
}

function renderNodeCss(node: ElementNode): string {
  const rules = [
    `.${classNameFor(node.id)} {`,
    "  position: absolute;",
    `  left: ${node.x}px;`,
    `  top: ${node.y}px;`,
    `  width: ${node.width}px;`,
    `  height: ${node.height}px;`,
    "  box-sizing: border-box;",
    "  transform-origin: center center;",
    `  transform: rotate(${node.rotation}deg);`,
    ...stylesToCss(node.styles),
    "}"
  ];

  return rules.join("\n");
}

export function exportHtmlCss(document: CanvasDocument): { html: string; css: string } {
  const html = [
    `<div class="canvas-export">`,
    ...document.rootIds
      .map((id) => document.elements[id])
      .filter((node): node is ElementNode => Boolean(node) && node.visible !== false)
      .map((node) => renderNodeHtml(document, node, 1)),
    `</div>`
  ].join("\n");

  const css = [
    ".canvas-export {",
    "  position: relative;",
    `  width: ${document.canvas.width}px;`,
    `  height: ${document.canvas.height}px;`,
    `  background: ${document.canvas.background};`,
    "  overflow: hidden;",
    "}",
    "",
    ...Object.values(document.elements)
      .filter((node) => node.visible !== false)
      .map(renderNodeCss)
      .join("\n\n")
      .split("\n")
  ].join("\n");

  return { html, css };
}
