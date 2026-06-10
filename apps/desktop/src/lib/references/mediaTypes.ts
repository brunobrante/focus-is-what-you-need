// Pure media-type helpers shared by the reference storage facade and the
// blob-store adapters. No I/O, no Tauri — safe to import anywhere.

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
