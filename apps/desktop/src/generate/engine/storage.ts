import type { SavedComponent, ToolReference } from "./types";
import { extFromName, loadReferenceFile } from "@/lib/tauri/referenceStorage";
import {
  listReferenceLibraryGroups,
  listReferenceLibraryMeta,
} from "@/lib/storage/repos/referenceLibrary.repo";
import { inferType, blobToObjectUrl } from "./image";

export { listReferenceLibraryGroups, listReferenceLibraryMeta };

export const COMPONENT_STORAGE_PREFIX = "workspace.tools.components.";
export const COMPONENT_DRAFT_STORAGE_PREFIX = "workspace.tools.componentsDraft.";
export const PRIMARY_COMPONENT_STORAGE_PREFIX = "workspace.tools.primary.";
export const CROPS_OVERLAY_COLOR_STORAGE_KEY = "workspace.tools.cropsOverlayColor";
export const CROPS_OVERLAY_ALPHA_STORAGE_KEY = "workspace.tools.cropsOverlayAlpha";
const CROPS_OVERLAY_DEFAULT_COLOR = "#FFFFFF";
const CROPS_OVERLAY_DEFAULT_ALPHA = 0.22;

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

export function writeDraftComponents(key: string, items: SavedComponent[]) {
  if (typeof window === "undefined") return;
  writeSavedComponents(key, items);
  try {
    window.localStorage.setItem(draftMarkerKey(key), "1");
  } catch {
    // ignore storage errors
  }
}

export function hasDraftComponents(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(draftMarkerKey(key)) === "1";
  } catch {
    return false;
  }
}

export function removeSavedComponents(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(draftMarkerKey(key));
  } catch {
    // ignore storage errors
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

export function readCropsOverlayAlpha(): number {
  if (typeof window === "undefined") return CROPS_OVERLAY_DEFAULT_ALPHA;
  try {
    const stored = window.localStorage.getItem(CROPS_OVERLAY_ALPHA_STORAGE_KEY);
    if (stored != null) {
      const value = Number(stored);
      if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
    }
  } catch {
    // ignore
  }
  return CROPS_OVERLAY_DEFAULT_ALPHA;
}

export async function readDiskReference(id: string): Promise<ToolReference | null> {
  const metas = await listReferenceLibraryMeta().catch(() => []);
  const meta = metas.find((entry) => entry.id === id);
  if (!meta || meta.mediaKind !== "image") return null;
  const ext = meta.ext || extFromName(meta.name);
  const blob = await loadReferenceFile(meta.id, ext).catch(() => null);
  if (!blob) return null;
  const url = blobToObjectUrl(blob);
  return {
    id: meta.id,
    name: meta.name,
    type: meta.type || inferType(meta.name),
    w: Number(meta.w || 0),
    h: Number(meta.h || 0),
    url,
  };
}

function draftMarkerKey(key: string) {
  return `${COMPONENT_DRAFT_STORAGE_PREFIX}${key}`;
}
