import type { SavedComponent, ToolReference } from "./types";
import {
  extFromName,
  loadReferenceFile,
  readRefsMeta,
} from "@/lib/tauri/referenceStorage";
import { inferType, blobToDataUrl } from "./image";

export { readReferenceGroups, readRefsMeta } from "@/lib/tauri/referenceStorage";

export const COMPONENT_STORAGE_PREFIX = "workspace.tools.components.";
export const PRIMARY_COMPONENT_STORAGE_PREFIX = "workspace.tools.primary.";
export const CROPS_OVERLAY_COLOR_STORAGE_KEY = "workspace.tools.cropsOverlayColor";
const CROPS_OVERLAY_DEFAULT_COLOR = "#FFFFFF";

export function readPrimaryComponentId(componentKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${PRIMARY_COMPONENT_STORAGE_PREFIX}${componentKey}`);
  } catch {
    return null;
  }
}

export function writePrimaryComponentId(componentKey: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PRIMARY_COMPONENT_STORAGE_PREFIX}${componentKey}`, id);
  } catch {
    // ignore quota errors
  }
}

export function readSavedComponents(key: string): SavedComponent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedComponent) : [];
  } catch {
    return [];
  }
}

export function writeSavedComponents(key: string, items: SavedComponent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function isSavedComponent(value: unknown): value is SavedComponent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedComponent>;
  return Boolean(item.id && item.name && item.box && item.dataUrl);
}

export function readCropsOverlayColor(): string {
  if (typeof window === "undefined") return CROPS_OVERLAY_DEFAULT_COLOR;
  try {
    const stored = window.localStorage.getItem(CROPS_OVERLAY_COLOR_STORAGE_KEY);
    if (stored && /^#[0-9a-fA-F]{6}$/.test(stored)) return stored;
  } catch {
    // ignore
  }
  return CROPS_OVERLAY_DEFAULT_COLOR;
}

export async function readDiskReference(id: string): Promise<ToolReference | null> {
  const metas = await readRefsMeta().catch(() => []);
  const meta = metas.find((entry) => entry.id === id);
  if (!meta || meta.mediaKind !== "image") return null;
  const ext = meta.ext || extFromName(meta.name);
  const blob = await loadReferenceFile(meta.id, ext).catch(() => null);
  if (!blob) return null;
  const url = await blobToDataUrl(blob);
  return {
    id: meta.id,
    name: meta.name,
    type: meta.type || inferType(meta.name),
    w: Number(meta.w || 0),
    h: Number(meta.h || 0),
    url,
  };
}
