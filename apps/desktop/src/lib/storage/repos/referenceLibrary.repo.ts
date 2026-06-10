import type { StoredRefMeta } from "@/lib/tauri/referenceStorage";
import {
  normalizeReferenceGroups,
  type ReferenceGroup,
} from "@/lib/references/groupTypes";
import {
  TABLES,
  listTable,
  putRecord,
  removeRecords,
  replaceTable,
} from "@/lib/storage/store";

/**
 * Storage repo for the standalone reference library (the References tab and the
 * Builder both read/write the catalog through here).
 *
 * Only the catalog metadata lives here — one record per reference / per group in
 * the SQLite `records` table, persisted as per-row deltas through the save
 * queue. Binary files (originals, video frames, stack crops) stay on disk and
 * are read on demand through Tauri; this repo never touches them.
 */

const META_KEY = TABLES.referenceLibrary;
const GROUPS_KEY = TABLES.referenceLibraryGroups;

export async function listReferenceLibraryMeta(): Promise<StoredRefMeta[]> {
  return listTable<StoredRefMeta>(META_KEY);
}

export function putReferenceLibraryMeta(meta: StoredRefMeta): void {
  putRecord(META_KEY, meta);
}

export function removeReferenceLibraryMeta(id: string): void {
  removeRecords(META_KEY, [id]);
}

export async function replaceReferenceLibraryMeta(metas: StoredRefMeta[]): Promise<void> {
  await replaceTable<StoredRefMeta>(META_KEY, metas);
}

export async function listReferenceLibraryGroups(): Promise<ReferenceGroup[]> {
  const rows = await listTable<ReferenceGroup>(GROUPS_KEY);
  return normalizeReferenceGroups(rows);
}

export async function replaceReferenceLibraryGroups(groups: ReferenceGroup[]): Promise<void> {
  await replaceTable<ReferenceGroup>(GROUPS_KEY, groups);
}

/** Loads the reference catalog (metadata + groups) from the records table. */
export async function loadReferenceLibrary(): Promise<{
  metas: StoredRefMeta[];
  groups: ReferenceGroup[];
}> {
  const [metas, groups] = await Promise.all([
    listReferenceLibraryMeta(),
    listReferenceLibraryGroups(),
  ]);
  return { metas, groups };
}
