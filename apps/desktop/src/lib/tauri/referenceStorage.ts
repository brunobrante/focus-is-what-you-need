import {
  stackSummaryFromData,
  type ReferenceStackData,
  type ReferenceStackRoot,
  type ReferenceStackSummary,
} from "@/lib/references/stackTypes";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import { blobToExt } from "@/lib/references/mediaTypes";
import {
  getReferenceBlobStore,
  type ExtractedFrame,
  type StackBatchFile,
} from "@/lib/references/blobStore";

// Matches StoredMeta from References.tsx (Omit<ReferenceItem, "url">),
// with ext required so we know which filename to look up.
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

// Pure media-type helpers now live in `lib/references/mediaTypes`. Re-exported
// here so existing importers keep working.
export { blobToExt, extFromName, mimeFromExt } from "@/lib/references/mediaTypes";
export type { ExtractedFrame, StackBatchFile } from "@/lib/references/blobStore";

// Saves blob to the active blob store, returns the file extension used.
export async function saveReferenceFile(id: string, blob: Blob): Promise<string> {
  const ext = blobToExt(blob);
  await getReferenceBlobStore().writeOriginal(id, ext, blob);
  return ext;
}

export async function loadReferenceFile(id: string, ext: string): Promise<Blob | null> {
  return getReferenceBlobStore().readOriginal(id, ext);
}

export async function removeReferenceFile(id: string): Promise<void> {
  await getReferenceBlobStore().deleteOriginal(id);
}

export async function saveReferenceStackFile(
  id: string,
  fileName: string,
  blob: Blob,
): Promise<void> {
  await getReferenceBlobStore().writeStackFile(id, fileName, blob);
}

export async function loadReferenceStackFile(
  id: string,
  fileName: string,
  mimeType = "image/png",
): Promise<Blob | null> {
  return getReferenceBlobStore().readStackFile(id, fileName, mimeType);
}

export async function writeReferenceStackData(id: string, data: ReferenceStackData): Promise<void> {
  await getReferenceBlobStore().writeStackData(id, JSON.stringify(data, null, 2));
}

// Writes every crop PNG + data.json in a single batch (one IDB transaction on
// web, one IPC call on desktop).
export async function writeReferenceStackBatch(
  id: string,
  files: StackBatchFile[],
  data: ReferenceStackData,
): Promise<void> {
  await getReferenceBlobStore().writeStackBatch(id, files, JSON.stringify(data, null, 2));
}

/* ---------- Video frames (ffmpeg, desktop only) ---------- */

export async function ffmpegAvailable(): Promise<boolean> {
  return getReferenceBlobStore().ffmpegAvailable();
}

export async function extractVideoFrames(
  id: string,
  ext: string,
  options?: { fps?: number; maxFrames?: number; maxWidth?: number },
): Promise<ExtractedFrame[]> {
  return getReferenceBlobStore().extractVideoFrames(id, ext, options);
}

export async function extractVideoFrameFull(
  id: string,
  ext: string,
  timestampMs: number,
): Promise<Blob | null> {
  return getReferenceBlobStore().extractVideoFrameFull(id, ext, timestampMs);
}

export async function loadReferenceFrame(id: string, fileName: string): Promise<Blob | null> {
  return getReferenceBlobStore().readFrame(id, fileName);
}

export async function deleteReferenceFrames(id: string): Promise<void> {
  await getReferenceBlobStore().deleteFrames(id);
}

export async function readReferenceStackData(id: string): Promise<ReferenceStackData | null> {
  try {
    const raw = await getReferenceBlobStore().readStackData(id);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeReferenceStackData(parsed, id);
  } catch {
    return null;
  }
}

export async function removeReferenceStack(id: string): Promise<void> {
  await getReferenceBlobStore().deleteStack(id);
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
