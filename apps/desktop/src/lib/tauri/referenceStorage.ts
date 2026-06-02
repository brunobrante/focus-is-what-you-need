import { invoke } from "@tauri-apps/api/core";
import {
  stackSummaryFromData,
  type ReferenceStackData,
  type ReferenceStackSummary,
} from "@/lib/references/stackTypes";
import {
  normalizeReferenceGroups,
  referenceGroupArchiveFromResult,
  type ReferenceGroup,
  type ReferenceGroupArchive,
  type ReferenceGroupArchiveResult,
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
    const b64 = await invoke<string>("read_reference_stack_file", { id, fileName });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

export async function writeReferenceStackData(id: string, data: ReferenceStackData): Promise<void> {
  await invoke("write_reference_stack_data", { id, content: JSON.stringify(data, null, 2) });
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
    const metas = parsed.filter(
      (x): x is StoredRefMeta =>
        Boolean(x && typeof x === "object" && "id" in x && "mediaKind" in x),
    );
    return Promise.all(metas.map(refreshReferenceStackSummary));
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

export async function syncReferenceGroupArchive(input: {
  id: string;
  name: string;
  referenceIds: string[];
}): Promise<ReferenceGroupArchive> {
  const result = await invoke<ReferenceGroupArchiveResult>("sync_reference_group_archive", {
    group: {
      group_id: input.id,
      group_name: input.name,
      reference_ids: input.referenceIds,
    },
  });
  return referenceGroupArchiveFromResult(result);
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
  const components = input.components
    .filter((component) => component && typeof component === "object")
    .map((component) => {
      const item = component as ReferenceStackData["components"][number];
      return {
        id: String(item.id || ""),
        name: String(item.name || "Component"),
        type: String(item.type || "PNG"),
        box: {
          x: Number(item.box?.x ?? 0),
          y: Number(item.box?.y ?? 0),
          w: Number(item.box?.w ?? 0),
          h: Number(item.box?.h ?? 0),
          r: item.box?.r === undefined ? undefined : Number(item.box.r),
        },
        file: item.file ? String(item.file) : null,
        parentId: item.parentId ? String(item.parentId) : null,
        createdAt: String(item.createdAt || new Date(0).toISOString()),
      };
    })
    .filter((component) => component.id && component.box.w >= 0 && component.box.h >= 0);

  const rootComponentId = String(input.rootComponentId || components[0]?.id || `root-${fallbackReferenceId}`);
  return {
    version: 1,
    referenceId: String(input.referenceId || fallbackReferenceId),
    mediaKind,
    original: {
      name: String(original?.name || ""),
      type: String(original?.type || "IMG"),
      ext: String(original?.ext || "bin"),
      w: Number(original?.w ?? 0),
      h: Number(original?.h ?? 0),
    },
    rootComponentId,
    primaryComponentId: String(input.primaryComponentId || rootComponentId),
    components,
    updatedAt: String(input.updatedAt || new Date(0).toISOString()),
  };
}

export type { ReferenceStackData, ReferenceStackSummary, ReferenceGroup };
