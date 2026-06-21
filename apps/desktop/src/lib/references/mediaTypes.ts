// Pure media-type helpers shared by the reference storage facade and the
// blob-store adapters. No I/O, no Tauri — safe to import anywhere.

import type { RefType } from "./referenceItemTypes";

export function blobToExt(blob: Blob): string {
  const t = blob.type;
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("svg")) return "svg";
  if (t.includes("gif")) return "gif";
  if (t.includes("mp4")) return "mp4";
  if (t.includes("mov") || t.includes("quicktime")) return "mov";
  if (t.includes("webm")) return "webm";
  if (t.includes("avi")) return "avi";
  if (t.includes("mkv")) return "mkv";
  return "bin";
}

export function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "bin";
}

// Single source of truth for filename → reference type. The builder (image-only)
// and the references library both route through this; it returns the full RefType
// (videos/figx included) and falls back to "IMG" for anything unrecognized.
export function inferType(name: string): RefType {
  switch (extFromName(name)) {
    case "jpg":
    case "jpeg":
      return "JPG";
    case "png":
      return "PNG";
    case "webp":
      return "WEBP";
    case "svg":
      return "SVG";
    case "gif":
      return "GIF";
    case "mp4":
      return "MP4";
    case "mov":
      return "MOV";
    case "webm":
      return "WEBM";
    case "avi":
      return "AVI";
    case "mkv":
      return "MKV";
    case "figx":
      return "FIGX";
    default:
      return "IMG";
  }
}

export function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  return map[ext] ?? "application/octet-stream";
}
