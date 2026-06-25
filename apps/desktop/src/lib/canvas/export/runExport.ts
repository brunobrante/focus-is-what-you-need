import type { CanvasDocument } from "@/canvas/engine/types";
import { slugClass } from "@/lib/canvas/htmlScene/styleUtils";
import { saveExportArchive, saveExportFile } from "@/lib/tauri/exportFiles";
import { buildHtmlExport } from "./htmlExport";
import { svgForElement } from "./svgExport";
import { rasterFromSvg } from "./rasterExport";
import { FORMAT_EXTENSION, FORMAT_MIME, isRasterFormat } from "./types";
import type { ExportBackground, ExportEntry, ExportFile, HtmlExportMode } from "./types";

// Orchestrates a per-element export: runs every entry, then writes the result —
// a single file when there is exactly one, or a `.zip` when several entries (or
// an HTML bundle) are produced. Scale only affects raster entries; SVG/HTML are
// resolution-independent.

const encoder = new TextEncoder();

function effectiveSuffix(entry: ExportEntry): string {
  const explicit = entry.suffix.trim();
  if (explicit) return explicit;
  return entry.scale !== 1 ? `@${entry.scale}x` : "";
}

export type RunExportResult = {
  /** Absolute path written, or null if the user cancelled the save dialog. */
  savedPath: string | null;
  fileCount: number;
};

export async function runElementExport(input: {
  document: CanvasDocument;
  nodeId: string;
  entries: ExportEntry[];
  background: ExportBackground;
  htmlMode: HtmlExportMode;
}): Promise<RunExportResult> {
  const node = input.document.elements[input.nodeId];
  if (!node) throw new Error("Element not found");

  const base = slugClass(node.name) || node.type || "element";
  const files: ExportFile[] = [];

  for (const entry of input.entries) {
    const stem = `${base}${effectiveSuffix(entry)}`;

    if (entry.format === "svg") {
      const svg = svgForElement(input.document, input.nodeId, node.name);
      if (!svg) throw new Error("Nothing to export as SVG");
      files.push({ name: `${stem}.svg`, bytes: encoder.encode(svg) });
      continue;
    }

    if (entry.format === "html") {
      const result = buildHtmlExport(input.document, input.nodeId, input.htmlMode);
      if (!result) throw new Error("Nothing to export as HTML");
      if (result.bundle) {
        for (const file of result.files) {
          files.push({ name: `${stem}/${file.name}`, bytes: encoder.encode(file.text) });
        }
      } else {
        files.push({ name: `${stem}.html`, bytes: encoder.encode(result.files[0]!.text) });
      }
      continue;
    }

    if (isRasterFormat(entry.format)) {
      const svg = svgForElement(input.document, input.nodeId, node.name);
      if (!svg) throw new Error("Nothing to export as an image");
      const bytes = await rasterFromSvg({
        svg,
        width: node.width,
        height: node.height,
        scale: entry.scale,
        mime: FORMAT_MIME[entry.format],
        background: input.background,
      });
      files.push({ name: `${stem}.${FORMAT_EXTENSION[entry.format]}`, bytes });
    }
  }

  if (files.length === 0) return { savedPath: null, fileCount: 0 };

  // One plain file → save-as that file; otherwise zip the batch (multiple
  // entries, or a folder-shaped HTML bundle).
  if (files.length === 1 && !files[0]!.name.includes("/")) {
    const savedPath = await saveExportFile(files[0]!.name, files[0]!.bytes);
    return { savedPath, fileCount: 1 };
  }

  const savedPath = await saveExportArchive(`${base}.zip`, files);
  return { savedPath, fileCount: files.length };
}
