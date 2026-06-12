import type { ProjectType } from "@/lib/data/types";

/**
 * Composes a project card thumbnail entirely from HTML/CSS and lays the existing
 * screen snapshot on top of a device mockup. The output is a self-contained SVG
 * data URL (same family as the screen snapshots produced by `sceneSnapshots.ts`)
 * so it drops straight into `ProjectRow.thumbnailDataUrl` and renders in an
 * `<img>` like any other thumbnail.
 *
 * Layout intent (see the project brief):
 *  - the project name sits large on the left,
 *  - a device mockup (iPhone / tablet / browser, chosen from the project type)
 *    sits on the right,
 *  - the snapshot fills the device screen but the device is deliberately pushed
 *    off the right edge and below the bottom so only a portion (~40%) shows.
 *
 * The structure is plain HTML inside `<foreignObject>` + a single editable
 * `<style>` block so the mockups stay easy to tweak. The snapshot is the only
 * pre-rendered asset; nothing else is rasterised here.
 */

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const SVG_DATA_URL_PREFIX = "data:image/svg+xml;utf8,";

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

  const titleMaxWidth = Math.max(360, Math.min(left - 120, 640));
  const eyebrow = TYPE_EYEBROW[input.type];
  const title = escapeXml(input.name.trim() || "Untitled project");
  // The snapshot is already a percent-encoded data URL: it has no raw <, > or "
  // characters, so it is safe to drop directly into the attribute below.
  const snapshotSrc = input.snapshotDataUrl;

  const deviceHtml = renderDevice(device.kind, snapshotSrc);

  const html = `<div xmlns="http://www.w3.org/1999/xhtml" class="root">
  <style>${STYLES}</style>
  <div class="glow"></div>
  <div class="title-wrap" style="max-width:${titleMaxWidth}px">
    <div class="eyebrow">${escapeXml(eyebrow)} · UI</div>
    <div class="title">${title}</div>
  </div>
  <div class="dev ${device.kind}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px">${deviceHtml}</div>
</div>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"><foreignObject x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">${html}</foreignObject></svg>`;

  return SVG_DATA_URL_PREFIX + encodeURIComponent(svg.replace(/\s+/g, " ").trim());
}

function renderDevice(kind: DeviceKind, snapshotSrc: string): string {
  const snap = `<img class="snap" src="${snapshotSrc}" />`;
  if (kind === "phone") {
    return `<div class="screen"><div class="island"></div>${snap}</div>`;
  }
  if (kind === "tablet") {
    return `<div class="cam"></div><div class="screen">${snap}</div>`;
  }
  return `<div class="bar"><span class="tl r"></span><span class="tl y"></span><span class="tl g"></span><span class="url"></span></div><div class="screen">${snap}</div>`;
}

const STYLES = `
.root{position:relative;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;overflow:hidden;
  background:linear-gradient(135deg,#1c1c22 0%,#111114 100%);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
.glow{position:absolute;right:-140px;top:-160px;width:760px;height:760px;border-radius:50%;
  background:radial-gradient(circle,rgba(91,108,255,0.22),rgba(91,108,255,0) 70%);}
.title-wrap{position:absolute;left:84px;top:50%;transform:translateY(-50%);z-index:3;}
.eyebrow{font-size:20px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#7c7c87;margin-bottom:22px;}
.title{font-size:72px;font-weight:700;line-height:1.04;letter-spacing:-1.5px;color:#f4f5f7;
  overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;}
.dev{position:absolute;box-shadow:0 50px 120px rgba(0,0,0,0.55),0 12px 36px rgba(0,0,0,0.4);}
.snap{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;background:#fff;}
.phone{background:#0a0a0c;border-radius:68px;padding:14px;}
.phone .screen{position:relative;width:100%;height:100%;border-radius:54px;overflow:hidden;background:#fff;}
.phone .island{position:absolute;top:18px;left:50%;transform:translateX(-50%);width:120px;height:30px;
  background:#0a0a0c;border-radius:18px;z-index:2;}
.tablet{background:#0a0a0c;border-radius:46px;padding:20px;}
.tablet .cam{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:9px;height:9px;
  border-radius:50%;background:#26262b;z-index:2;}
.tablet .screen{position:relative;width:100%;height:100%;border-radius:26px;overflow:hidden;background:#fff;}
.browser{background:#0a0a0c;border:1px solid #232327;border-radius:20px;overflow:hidden;
  display:flex;flex-direction:column;}
.browser .bar{height:52px;flex:none;display:flex;align-items:center;gap:9px;padding:0 20px;background:#161619;}
.browser .tl{width:14px;height:14px;border-radius:50%;}
.browser .tl.r{background:#ff5f57;}
.browser .tl.y{background:#febc2e;}
.browser .tl.g{background:#28c840;}
.browser .url{flex:1;height:28px;border-radius:14px;background:#0d0d0f;margin-left:14px;}
.browser .screen{flex:1;overflow:hidden;background:#fff;}
`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
