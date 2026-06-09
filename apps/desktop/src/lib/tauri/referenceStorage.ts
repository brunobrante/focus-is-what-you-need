import { invoke } from "@tauri-apps/api/core";
import {
  stackSummaryFromData,
  type ReferenceStackData,
  type ReferenceStackRoot,
  type ReferenceStackSummary,
} from "@/lib/references/stackTypes";
import {
  normalizeReferenceGroups,
  type ReferenceGroup,
} from "@/lib/references/groupTypes";

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
  groupId?: string | null;
  stack?: ReferenceStackSummary;
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
    // Command returns raw bytes (ArrayBuffer) — no base64, no main-thread atob().
    const buffer = await invoke<ArrayBuffer>("read_reference_file", { id, ext });
    return new Blob([buffer], { type: mimeFromExt(ext) });
  } catch {
    return null;
  }
}

export async function removeReferenceFile(id: string): Promise<void> {
  await invoke("delete_reference_file", { id }).catch(() => {});
}

export async function saveReferenceStackFile(
  id: string,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const dataB64 = await blobToBase64(blob);
  await invoke("write_reference_stack_file", { id, fileName, dataB64 });
}

export async function loadReferenceStackFile(
  id: string,
  fileName: string,
  mimeType = "image/png",
): Promise<Blob | null> {
  try {
    const buffer = await invoke<ArrayBuffer>("read_reference_stack_file", { id, fileName });
    return new Blob([buffer], { type: mimeType });
  } catch {
    return null;
  }
}

export async function writeReferenceStackData(id: string, data: ReferenceStackData): Promise<void> {
  await invoke("write_reference_stack_data", { id, content: JSON.stringify(data, null, 2) });
}

export type StackBatchFile = { fileName: string; dataB64: string };

// Writes every crop PNG + data.json in a single IPC call (replaces the per-file loop).
export async function writeReferenceStackBatch(
  id: string,
  files: StackBatchFile[],
  data: ReferenceStackData,
): Promise<void> {
  await invoke("write_reference_stack_batch", {
    id,
    files: files.map((file) => ({ file_name: file.fileName, data_b64: file.dataB64 })),
    dataJson: JSON.stringify(data, null, 2),
  });
}

/* ---------- Video frames (ffmpeg sidecar) ---------- */

export type ExtractedFrame = {
  file: string;
  index: number;
  timestamp_ms: number;
  w: number;
  h: number;
};

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("ffmpeg_available");
  } catch {
    return false;
  }
}

export async function extractVideoFrames(
  id: string,
  ext: string,
  options?: { fps?: number; maxFrames?: number; maxWidth?: number },
): Promise<ExtractedFrame[]> {
  return invoke<ExtractedFrame[]>("extract_video_frames", {
    id,
    ext,
    fps: options?.fps ?? 1.5,
    maxFrames: options?.maxFrames ?? 240,
    maxWidth: options?.maxWidth ?? 480,
  });
}

export async function extractVideoFrameFull(
  id: string,
  ext: string,
  timestampMs: number,
): Promise<Blob | null> {
  try {
    const buffer = await invoke<ArrayBuffer>("extract_video_frame_full", { id, ext, timestampMs });
    return new Blob([buffer], { type: "image/png" });
  } catch {
    return null;
  }
}

export async function loadReferenceFrame(id: string, fileName: string): Promise<Blob | null> {
  try {
    const buffer = await invoke<ArrayBuffer>("read_reference_frame", { id, fileName });
    return new Blob([buffer], { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export async function deleteReferenceFrames(id: string): Promise<void> {
  await invoke("delete_reference_frames", { id }).catch(() => {});
}

export async function readReferenceStackData(id: string): Promise<ReferenceStackData | null> {
  try {
    const raw = await invoke<string>("read_reference_stack_data", { id });
    const parsed: unknown = JSON.parse(raw);
    return normalizeReferenceStackData(parsed, id);
  } catch {
    return null;
  }
}

export async function removeReferenceStack(id: string): Promise<void> {
  await invoke("delete_reference_stack", { id }).catch(() => {});
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

export async function readReferenceGroups(): Promise<ReferenceGroup[]> {
  try {
    const raw = await invoke<string>("read_reference_groups");
    const parsed: unknown = JSON.parse(raw);
    return normalizeReferenceGroups(parsed);
  } catch {
    return [];
  }
}

export async function writeReferenceGroups(groups: ReferenceGroup[]): Promise<void> {
  await invoke("write_reference_groups", { content: JSON.stringify(groups, null, 2) });
}

export async function refreshReferenceStackSummary(meta: StoredRefMeta): Promise<StoredRefMeta> {
  const data = await readReferenceStackData(meta.id);
  const stack = stackSummaryFromData(data);
  if (!stack) return { ...meta, stack: undefined };
  return { ...meta, stack };
}

function normalizeReferenceStackData(value: unknown, fallbackReferenceId: string): ReferenceStackData | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ReferenceStackData>;
  if (!Array.isArray(input.components)) return null;
  const mediaKind = input.mediaKind === "video" || input.mediaKind === "figx" ? input.mediaKind : "image";
  const original = input.original && typeof input.original === "object"
    ? input.original
    : null;
  const normalizeBox = (box: { x?: unknown; y?: unknown; w?: unknown; h?: unknown; r?: unknown } | undefined) => ({
    x: Number(box?.x ?? 0),
    y: Number(box?.y ?? 0),
    w: Number(box?.w ?? 0),
    h: Number(box?.h ?? 0),
    r: box?.r === undefined ? undefined : Number(box.r),
  });

  const components = input.components
    .filter((component) => component && typeof component === "object")
    .map((component) => {
      const item = component as ReferenceStackData["components"][number];
      return {
        id: String(item.id || ""),
        name: String(item.name || "Component"),
        type: String(item.type || "PNG"),
        box: normalizeBox(item.box),
        file: item.file ? String(item.file) : null,
        parentId: item.parentId ? String(item.parentId) : null,
        rootId: item.rootId ? String(item.rootId) : null,
        createdAt: String(item.createdAt || new Date(0).toISOString()),
      };
    })
    .filter((component) => component.id && component.box.w >= 0 && component.box.h >= 0);

  const rootComponentId = String(input.rootComponentId || components[0]?.id || `root-${fallbackReferenceId}`);

  // v2: a `roots` array. v1: synthesize one default full-image root from
  // rootComponentId so older stacks still load (without the destructive primary scope).
  const roots: ReferenceStackRoot[] | undefined = Array.isArray(input.roots)
    ? input.roots
        .filter((root) => root && typeof root === "object")
        .map((root) => {
          const entry = root as ReferenceStackRoot;
          return {
            id: String(entry.id || ""),
            name: String(entry.name || "Frame"),
            box: normalizeBox(entry.box),
            file: entry.file ? String(entry.file) : null,
            isDefault: Boolean(entry.isDefault),
            createdAt: String(entry.createdAt || new Date(0).toISOString()),
            sourceFrame: entry.sourceFrame ? String(entry.sourceFrame) : null,
          };
        })
        .filter((root) => root.id)
    : undefined;

  const version: ReferenceStackData["version"] = roots && roots.length > 0 ? 2 : 1;

  return {
    version,
    referenceId: String(input.referenceId || fallbackReferenceId),
    mediaKind,
    original: {
      name: String(original?.name || ""),
      type: String(original?.type || "IMG"),
      ext: String(original?.ext || "bin"),
      w: Number(original?.w ?? 0),
      h: Number(original?.h ?? 0),
    },
    ...(roots ? { roots } : {}),
    rootComponentId,
    primaryComponentId: String(input.primaryComponentId || rootComponentId),
    components,
    updatedAt: String(input.updatedAt || new Date(0).toISOString()),
  };
}

export type { ReferenceStackData, ReferenceStackSummary, ReferenceGroup };
