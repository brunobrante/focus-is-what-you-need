import { blobToDataUrl } from "@/lib/image/dataUrl";
import type { CropBox } from "./types";

export { blobToDataUrl };
export { inferType } from "@/lib/references/mediaTypes";

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Could not encode canvas"));
    }, type);
  });
}

export async function canvasToDataUrl(canvas: HTMLCanvasElement, type = "image/png"): Promise<string> {
  return blobToDataUrl(await canvasToBlob(canvas, type));
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function waitForImage(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    // An already-settled image: resolve if it decoded, reject if it's broken.
    // A broken image with `complete === true` && `naturalWidth === 0` would never
    // fire `load`, so without this the caller's `await` hangs forever.
    if (img.complete) {
      if (img.naturalWidth) resolve();
      else reject(new Error("Image failed to load"));
      return;
    }
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
  });
}

export function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error("Could not measure image"));
    img.src = src;
  });
}

// Copies a subject-pixel crop region of `img` to a PNG data URL, snapping to
// whole image pixels (no sub-pixel edge sliver) and clipping to the box's
// corner radius when set. Falls back to `fallbackUrl` if rasterizing fails.
// Shared by the manual crop save and the auto-detect batch save, which both
// rasterize a `CropBox` the same way.
export async function rasterizeCropBox(
  img: HTMLImageElement | null,
  subjectBox: CropBox,
  fallbackUrl: string,
): Promise<string> {
  if (!img) return fallbackUrl;
  try {
    await waitForImage(img);
    const sx0 = Math.round(subjectBox.x);
    const sy0 = Math.round(subjectBox.y);
    const sw = Math.max(1, Math.round(subjectBox.w));
    const sh = Math.max(1, Math.round(subjectBox.h));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const radius = Math.min(subjectBox.r ?? 0, sw / 2, sh / 2);
    ctx.imageSmoothingEnabled = false;
    if (radius > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, sw, sh, radius);
      ctx.clip();
    }
    ctx.drawImage(img, sx0, sy0, sw, sh, 0, 0, sw, sh);
    if (radius > 0) ctx.restore();
    return await canvasToDataUrl(canvas, "image/png");
  } catch {
    return fallbackUrl;
  }
}

export function shortComponentName(id: string) {
  return id.replace(/^c-/, "").slice(0, 4);
}

export function safeStackFileName(componentId: string): string {
  const base = componentId
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || `component-${Date.now()}`}.png`;
}
