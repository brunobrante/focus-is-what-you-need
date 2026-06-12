import type { ProjectType } from "@/lib/data/types";

/**
 * Composes a project card thumbnail and lays the existing screen snapshot on top
 * of a device mockup. The output is a self-contained SVG data URL (same family
 * as the screen snapshots produced by `sceneSnapshots.ts`) so it drops straight
 * into `ProjectRow.thumbnailDataUrl` and renders in an `<img>` like any other
 * thumbnail.
 *
 * Layout intent (see the project brief):
 *  - the project name sits large on the left,
 *  - a device mockup (iPhone / tablet / browser, chosen from the project type)
 *    sits on the right,
 *  - the snapshot fills the device screen but the device is deliberately pushed
 *    off the right edge and below the bottom so only a portion (~40%) shows.
 *
 * IMPORTANT: this is built as **native SVG**, not HTML inside `<foreignObject>`.
 * macOS WKWebView (the Tauri runtime) does not paint `foreignObject` content when
 * the SVG is loaded via `<img>`, so an HTML/CSS composition renders as a black
 * rectangle there. Native SVG primitives (and the inlined snapshot, which is
 * itself a plain `<svg>`) render reliably in that context. The device mockup is
 * still easy to edit — the geometry lives in `renderDevice`.
 */

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const SVG_DATA_URL_PREFIX = "data:image/svg+xml;utf8,";
const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type DeviceKind = "phone" | "tablet" | "browser";

type DeviceLayout = {
  kind: DeviceKind;
  /** screen height / width — used to derive height from width */
  aspect: number;
  width: number;
  /** top offset as a fraction of the canvas height */
  topFraction: number;
  /** fraction of the device width that bleeds past the right edge */
  rightOverhangFraction: number;
};

const DEVICE_BY_TYPE: Record<ProjectType, DeviceLayout> = {
  mobile: { kind: "phone", aspect: 844 / 390, width: 480, topFraction: 0.24, rightOverhangFraction: 0.42 },
  tablet: { kind: "tablet", aspect: 1180 / 820, width: 660, topFraction: 0.2, rightOverhangFraction: 0.4 },
  desktop: { kind: "browser", aspect: 10 / 16, width: 940, topFraction: 0.3, rightOverhangFraction: 0.4 },
};

const TYPE_EYEBROW: Record<ProjectType, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
};

const TITLE_FONT_SIZE = 72;
const TITLE_X = 84;

export function renderProjectThumbnailDataUrl(input: {
  name: string;
  type: ProjectType;
  snapshotDataUrl: string;
}): string {
  const device = DEVICE_BY_TYPE[input.type];
  const width = device.width;
  const height = Math.round(width * device.aspect);
  const top = Math.round(CANVAS_HEIGHT * device.topFraction);
  const left = Math.round(CANVAS_WIDTH - width * (1 - device.rightOverhangFraction));

  const deviceMarkup = renderDevice(device.kind, left, top, width, height, input.snapshotDataUrl);

  // Title — SVG text does not wrap, so split into lines by an estimated glyph
  // width and clamp to 4 lines, then vertically centre the block.
  const titleMaxWidth = Math.max(360, Math.min(left - 130, 600));
  const maxChars = Math.max(6, Math.floor(titleMaxWidth / (TITLE_FONT_SIZE * 0.56)));
  const lines = wrapText(input.name.trim() || "Untitled project", maxChars, 4);
  const lineHeight = Math.round(TITLE_FONT_SIZE * 1.06);
  const blockHeight = lines.length * lineHeight;
  const titleTop = CANVAS_HEIGHT / 2 - blockHeight / 2;
  const firstBaseline = Math.round(titleTop + TITLE_FONT_SIZE * 0.78);
  const eyebrowBaseline = Math.round(titleTop - 26);

  const titleSpans = lines
    .map((line, i) => `<tspan x="${TITLE_X}" y="${firstBaseline + i * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const eyebrow = escapeXml(`${TYPE_EYEBROW[input.type].toUpperCase()} · UI`);
  const fontFamily = escapeAttr(FONT_FAMILY);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">` +
    `<defs>` +
    `<linearGradient id="pt_bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1c22"/><stop offset="1" stop-color="#111114"/></linearGradient>` +
    `<radialGradient id="pt_glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#5b6cff" stop-opacity="0.22"/><stop offset="1" stop-color="#5b6cff" stop-opacity="0"/></radialGradient>` +
    `<filter id="pt_shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="40" stdDeviation="48" flood-color="#000000" flood-opacity="0.5"/></filter>` +
    `</defs>` +
    `<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="url(#pt_bg)"/>` +
    `<rect x="${CANVAS_WIDTH - 820}" y="-220" width="900" height="900" fill="url(#pt_glow)"/>` +
    `<text x="${TITLE_X}" y="${eyebrowBaseline}" fill="#7c7c87" font-family="${fontFamily}" font-size="20" font-weight="600" letter-spacing="3">${eyebrow}</text>` +
    `<text fill="#f4f5f7" font-family="${fontFamily}" font-size="${TITLE_FONT_SIZE}" font-weight="700" letter-spacing="-1.5">${titleSpans}</text>` +
    deviceMarkup +
    `</svg>`;

  return SVG_DATA_URL_PREFIX + encodeURIComponent(svg.replace(/\s+/g, " ").trim());
}

function renderDevice(
  kind: DeviceKind,
  left: number,
  top: number,
  width: number,
  height: number,
  snapshotDataUrl: string,
): string {
  if (kind === "phone") {
    const pad = 14;
    const bezelR = 68;
    const screenR = 54;
    const sx = left + pad;
    const sy = top + pad;
    const sw = width - pad * 2;
    const sh = height - pad * 2;
    const islandW = 120;
    const islandH = 30;
    return (
      `<g filter="url(#pt_shadow)">` +
      `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${bezelR}" fill="#0a0a0c"/>` +
      `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${screenR}" fill="#ffffff"/>` +
      clipRect("pt_screen", sx, sy, sw, sh, screenR) +
      snapshotLayer(snapshotDataUrl, sx, sy, sw, sh, "pt_screen") +
      `<rect x="${left + (width - islandW) / 2}" y="${sy + 8}" width="${islandW}" height="${islandH}" rx="${islandH / 2}" fill="#0a0a0c"/>` +
      `</g>`
    );
  }

  if (kind === "tablet") {
    const pad = 20;
    const bezelR = 46;
    const screenR = 26;
    const sx = left + pad;
    const sy = top + pad;
    const sw = width - pad * 2;
    const sh = height - pad * 2;
    return (
      `<g filter="url(#pt_shadow)">` +
      `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${bezelR}" fill="#0a0a0c"/>` +
      `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${screenR}" fill="#ffffff"/>` +
      clipRect("pt_screen", sx, sy, sw, sh, screenR) +
      snapshotLayer(snapshotDataUrl, sx, sy, sw, sh, "pt_screen") +
      `<circle cx="${left + width / 2}" cy="${top + 10}" r="4.5" fill="#26262b"/>` +
      `</g>`
    );
  }

  // browser
  const bezelR = 20;
  const barH = 52;
  const bodyY = top + barH;
  const bodyH = height - barH;
  const dotY = top + barH / 2;
  const urlX = left + 92;
  return (
    `<g filter="url(#pt_shadow)">` +
    clipRect("pt_window", left, top, width, height, bezelR) +
    `<g clip-path="url(#pt_window)">` +
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#0a0a0c"/>` +
    `<rect x="${left}" y="${top}" width="${width}" height="${barH}" fill="#161619"/>` +
    `<rect x="${left}" y="${bodyY}" width="${width}" height="${bodyH}" fill="#ffffff"/>` +
    snapshotLayer(snapshotDataUrl, left, bodyY, width, bodyH, "pt_window") +
    `<circle cx="${left + 28}" cy="${dotY}" r="7" fill="#ff5f57"/>` +
    `<circle cx="${left + 50}" cy="${dotY}" r="7" fill="#febc2e"/>` +
    `<circle cx="${left + 72}" cy="${dotY}" r="7" fill="#28c840"/>` +
    `<rect x="${urlX}" y="${dotY - 14}" width="${width - (urlX - left) - 28}" height="28" rx="14" fill="#0d0d0f"/>` +
    `</g>` +
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${bezelR}" fill="none" stroke="#232327" stroke-width="1"/>` +
    `</g>`
  );
}

function clipRect(id: string, x: number, y: number, w: number, h: number, rx: number): string {
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>`;
}

/**
 * The snapshot covers the screen rectangle, top-aligned. When it is an SVG data
 * URL (the usual case) it is inlined as a nested `<svg>` — the most robust path
 * in WKWebView. Anything else (e.g. a raster snapshot) falls back to `<image>`.
 */
function snapshotLayer(
  snapshotDataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
  clipId: string,
): string {
  const inlined = inlineSnapshotSvg(snapshotDataUrl, x, y, w, h);
  const content =
    inlined ??
    `<image href="${snapshotDataUrl}" xlink:href="${snapshotDataUrl}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMin slice"/>`;
  return `<g clip-path="url(#${clipId})">${content}</g>`;
}

function inlineSnapshotSvg(
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
): string | null {
  if (!dataUrl.startsWith("data:image/svg+xml")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;

  let svg: string;
  try {
    svg = decodeURIComponent(dataUrl.slice(comma + 1));
  } catch {
    return null;
  }

  const open = svg.match(/^\s*<svg\b([^>]*)>/i);
  if (!open) return null;

  let attrs = open[1] ?? "";
  const viewBox = attrs.match(/viewBox\s*=\s*"([^"]*)"/i)?.[1] ?? deriveViewBox(attrs);
  attrs = attrs.replace(/\b(?:x|y|width|height|viewBox|preserveAspectRatio)\s*=\s*"[^"]*"/gi, "").trim();

  const newOpen = `<svg ${attrs} viewBox="${viewBox}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMin slice">`;
  return svg.replace(/^\s*<svg\b[^>]*>/i, newOpen);
}

function deriveViewBox(attrs: string): string {
  const w = attrs.match(/\bwidth\s*=\s*"([^"]*)"/i)?.[1];
  const h = attrs.match(/\bheight\s*=\s*"([^"]*)"/i)?.[1];
  return w && h ? `0 0 ${w} ${h}` : "0 0 100 100";
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const pushWord = (word: string) => {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  };

  for (let word of words) {
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    pushWord(word);
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push(text);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] = `${last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last}…`;
    return kept;
  }
  return lines;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
