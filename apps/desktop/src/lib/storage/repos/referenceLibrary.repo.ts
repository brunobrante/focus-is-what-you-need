import {
  readRefsMeta,
  readReferenceGroups,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";
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
 * Storage repo for the standalone reference library (the References tab).
 *
 * Only the catalog metadata lives here — one record per reference / per group in
 * the SQLite `records` table, persisted as per-row deltas through the save
 * queue. Binary files (originals, video frames, stack crops) stay on disk and
 * are read on demand through Tauri; this repo never touches them.
 *
 * This replaces the old model where the whole catalog was a single `meta.json` /
 * `groups.json` blob rewritten in full on every edit.
 */

const META_KEY = TABLES.referenceLibrary;
const GROUPS_KEY = TABLES.referenceLibraryGroups;
const MIGRATION_FLAG = "reference_library_records_migrated_v1";

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

/**
 * Loads the reference catalog from the records table, migrating the legacy
 * `meta.json` / `groups.json` blobs into per-row records on first run.
 */
export async function loadReferenceLibrary(): Promise<{
  metas: StoredRefMeta[];
  groups: ReferenceGroup[];
}> {
  await migrateLegacyBlobsIfNeeded();
  const [metas, groups] = await Promise.all([
    listReferenceLibraryMeta(),
    listReferenceLibraryGroups(),
  ]);
  return { metas, groups };
}

function migrationDone(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MIGRATION_FLAG) === "1";
  } catch {
    return false;
  }
}

function markMigrationDone(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // localStorage may be unavailable; the empty-table guard below keeps the
    // migration safe to retry on the next boot.
  }
}

async function migrateLegacyBlobsIfNeeded(): Promise<void> {
  if (migrationDone()) return;

  // Only seed when the records table is still empty, so a user who legitimately
  // emptied their library is never re-populated from a stale legacy blob.
  const existingMeta = await listReferenceLibraryMeta();
  if (existingMeta.length === 0) {
    const legacyMeta = await readRefsMeta().catch(() => [] as StoredRefMeta[]);
    if (legacyMeta.length > 0) {
      await replaceReferenceLibraryMeta(legacyMeta);
    }
  }

  const existingGroups = await listReferenceLibraryGroups();
  if (existingGroups.length === 0) {
    const legacyGroups = await readReferenceGroups().catch(() => [] as ReferenceGroup[]);
    if (legacyGroups.length > 0) {
      await replaceReferenceLibraryGroups(legacyGroups);
    }
  }

  markMigrationDone();
}
