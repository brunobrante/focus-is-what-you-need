// Per-element export panel model. The Export panel exports a selected element
// (or screen) to image / SVG / HTML — distinct from the project-level `.figx`
// file (which is export-only per Product.md). See docs/inspector-export.md.

/** Output formats shipped in the webview-complete v1.
 *  PNG/JPEG/WebP are rasterized from the element's authored SVG; SVG is emitted
 *  directly; HTML is authored from the element's style objects. (PDF + native
 *  high-fidelity WKWebView raster + AVIF are a documented native follow-up.) */
export type ExportFormat = "png" | "jpeg" | "webp" | "svg" | "html";

/** How HTML export is packaged. `standalone` = one self-contained `.html`
 *  (styles + data-URL assets inlined). `bundle` = a `.zip` of `index.html` +
 *  `styles.css`. */
export type HtmlExportMode = "standalone" | "bundle";

/** Background treatment for raster export. `transparent` keeps the content's own
 *  alpha; `color` composites over a chosen color; `flatten` is `color` with the
 *  default white (also forced for JPEG, which has no alpha). */
export type ExportBackgroundMode = "transparent" | "color" | "flatten";

export type ExportBackground = {
  mode: ExportBackgroundMode;
  /** sRGB hex used when mode is `color` (and the flatten default). */
  color: string;
};

/** One row in the per-element export list (Figma/paper model). */
export type ExportEntry = {
  id: string;
  /** Resolution multiplier — clean supersample of the node's true size (Law 4). */
  scale: number;
  format: ExportFormat;
  /** Optional filename suffix, e.g. "@2x" → "{name}@2x.{ext}". */
  suffix: string;
};

/** A produced file ready to be written to disk. */
export type ExportFile = {
  name: string;
  bytes: Uint8Array;
};

export const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  svg: "svg",
  html: "html",
};

export const FORMAT_MIME: Record<"png" | "jpeg" | "webp", string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const DEFAULT_BACKGROUND: ExportBackground = { mode: "transparent", color: "#FFFFFF" };

export function defaultExportEntry(id: string): ExportEntry {
  return { id, scale: 1, format: "png", suffix: "" };
}

/** True for the canvas-rasterized image formats (vs the authored SVG/HTML). */
export function isRasterFormat(format: ExportFormat): format is "png" | "jpeg" | "webp" {
  return format === "png" || format === "jpeg" || format === "webp";
}
