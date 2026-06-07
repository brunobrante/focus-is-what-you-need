import type { FilterKind, RefType } from "../types";

export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

export const masonryItemStyle = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
  WebkitColumnBreakInside: "avoid",
} as const;

export function requestIdle(callback: () => void): number {
  if (typeof window === "undefined") return 0;
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  return w.requestIdleCallback ? w.requestIdleCallback(callback) : window.setTimeout(callback, 1);
}

export function cancelIdle(id: number): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { cancelIdleCallback?: (id: number) => void };
  if (w.cancelIdleCallback) w.cancelIdleCallback(id);
  else window.clearTimeout(id);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `r-${crypto.randomUUID()}`;
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function typeOptionsForKind(kind: FilterKind): Array<{ value: string; label: string }> {
  switch (kind) {
    case "image":
      return [
        { value: "all", label: "All formats" },
        { value: "PNG", label: "PNG" },
        { value: "JPG", label: "JPG" },
        { value: "WEBP", label: "WebP" },
        { value: "SVG", label: "SVG" },
        { value: "GIF", label: "GIF" },
      ];
    case "video":
      return [
        { value: "all", label: "All formats" },
        { value: "MP4", label: "MP4" },
        { value: "MOV", label: "MOV" },
        { value: "WEBM", label: "WebM" },
        { value: "MKV", label: "MKV" },
      ];
    case "figx":
      return [{ value: "all", label: "All formats" }];
    default:
      return [
        { value: "all", label: "All formats" },
        { value: "PNG", label: "PNG" },
        { value: "JPG", label: "JPG" },
        { value: "WEBP", label: "WebP" },
        { value: "SVG", label: "SVG" },
        { value: "GIF", label: "GIF" },
        { value: "MP4", label: "MP4" },
        { value: "MOV", label: "MOV" },
        { value: "WEBM", label: "WebM" },
        { value: "MKV", label: "MKV" },
      ];
  }
}

export function inferType(name: string): RefType {
  const ext = (name.split(".").pop() || "").toLowerCase();
  switch (ext) {
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

export function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem.toString().padStart(2, "0")}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
