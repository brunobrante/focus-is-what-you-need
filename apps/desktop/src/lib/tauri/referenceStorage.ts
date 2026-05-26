import { invoke } from "@tauri-apps/api/core";

// Matches StoredMeta from References.tsx (Omit<ReferenceItem, "url">),
// with ext required so we know which filename to look up on disk.
export type StoredRefMeta = {
  id: string;
  name: string;
  mediaKind: "image" | "video" | "figx";
  type: string;
  w: number;
  h: number;
  size: number;
  duration?: number;
  description?: string;
  sourceUrl?: string;
  contentHash?: string;
  tags: string[];
  added: string;
  ext: string;
};

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Saves blob to disk, returns the file extension used.
export async function saveReferenceFile(id: string, blob: Blob): Promise<string> {
  const ext = blobToExt(blob);
  const dataB64 = await blobToBase64(blob);
  await invoke("write_reference_file", { id, ext, dataB64 });
  return ext;
}

export async function loadReferenceFile(id: string, ext: string): Promise<Blob | null> {
  try {
    const b64 = await invoke<string>("read_reference_file", { id, ext });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mimeFromExt(ext) });
  } catch {
    return null;
  }
}

export async function removeReferenceFile(id: string): Promise<void> {
  await invoke("delete_reference_file", { id }).catch(() => {});
}

export async function readRefsMeta(): Promise<StoredRefMeta[]> {
  try {
    const raw = await invoke<string>("read_references_meta");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredRefMeta =>
        Boolean(x && typeof x === "object" && "id" in x && "mediaKind" in x),
    );
  } catch {
    return [];
  }
}

export async function writeRefsMeta(items: StoredRefMeta[]): Promise<void> {
  await invoke("write_references_meta", { content: JSON.stringify(items) });
}
