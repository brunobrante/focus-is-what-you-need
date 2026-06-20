import {
  saveReferenceFile,
  removeReferenceFile,
  extFromName,
} from "@/lib/tauri/referenceStorage";
import {
  dropReferenceUrl,
  primeReferenceUrl,
} from "@/lib/references/referenceUrlCache";
import type { MediaKind, ReferenceItem } from "../types";
import { inferType, newId } from "./utils";

export function referenceCardThumbnailUrl(
  item: ReferenceItem,
  stackThumbnailUrl?: string | null,
): string {
  if (item.stack?.enabled && stackThumbnailUrl) return stackThumbnailUrl;
  return item.url;
}

export function releaseReferenceItemUrls(item: ReferenceItem): void {
  dropReferenceUrl(item.id);
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export async function fileToReference(file: File): Promise<ReferenceItem | null> {
  const id = newId();
  const blob: Blob = file;
  const contentHash = await hashBlob(blob).catch(() => undefined);

  let ext: string;
  try {
    ext = await saveReferenceFile(id, blob);
  } catch (err) {
    console.error("[references] saveReferenceFile failed:", err);
    return null;
  }

  const url = URL.createObjectURL(blob);
  // Register the in-memory blob URL so the grid shows this item instantly,
  // without a redundant read back from disk.
  primeReferenceUrl(id, url);
  const mediaKind: MediaKind = isVideoFile(file) ? "video" : "image";

  let w = 0;
  let h = 0;
  let duration: number | undefined;

  if (mediaKind === "image") {
    const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
    w = dims.w;
    h = dims.h;
  } else {
    const dims = await measureVideo(url).catch(() => ({ w: 0, h: 0, duration: 0 }));
    w = dims.w;
    h = dims.h;
    duration = dims.duration;
  }

  return {
    id,
    name: file.name,
    mediaKind,
    type: inferType(file.name),
    w,
    h,
    size: Math.max(1, Math.round(file.size / 1024)),
    duration,
    contentHash,
    ext,
    tags: [mediaKind],
    added: new Date().toISOString(),
    url,
  };
}

export async function hashBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is not available");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function findDuplicateReference(
  item: ReferenceItem,
  candidates: ReferenceItem[],
): ReferenceItem | null {
  const byHash = item.contentHash
    ? candidates.find((c) => c.id !== item.id && c.contentHash === item.contentHash)
    : null;
  if (byHash) return byHash;
  return (
    candidates.find(
      (c) =>
        c.id !== item.id &&
        c.mediaKind === item.mediaKind &&
        c.name === item.name &&
        c.size === item.size &&
        c.w === item.w &&
        c.h === item.h,
    ) ?? null
  );
}

export function discardReferenceItem(item: ReferenceItem): void {
  releaseReferenceItemUrls(item);
  void removeReferenceFile(item.id);
}

export { extFromName, inferType };

export function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const release = () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
    img.onload = () => {
      const size = { w: img.naturalWidth || 0, h: img.naturalHeight || 0 };
      release();
      resolve(size);
    };
    img.onerror = () => {
      release();
      reject(new Error("Cannot measure image"));
    };
    img.src = src;
  });
}

export function measureVideo(src: string): Promise<{ w: number; h: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Release the element on settle so it doesn't hold a decode alive (notably
    // during a multi-file import that measures many videos in sequence).
    const release = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
    video.onloadedmetadata = () => {
      const result = {
        w: video.videoWidth || 0,
        h: video.videoHeight || 0,
        duration: isFinite(video.duration) ? video.duration : 0,
      };
      release();
      resolve(result);
    };
    video.onerror = () => {
      release();
      reject(new Error("Cannot measure video"));
    };
    video.src = src;
  });
}
