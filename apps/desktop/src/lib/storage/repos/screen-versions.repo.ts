import { newId, now } from "@/lib/storage/ids";
import type { ScreenVersionRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.screenVersions;

export async function listScreenVersions(): Promise<ScreenVersionRow[]> {
  return getTable<ScreenVersionRow>(KEY);
}

export async function listVersionsByScreen(
  screenId: string,
): Promise<ScreenVersionRow[]> {
  const rows = await listScreenVersions();
  return rows
    .filter((r) => r.screenId === screenId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getScreenVersion(
  id: string,
): Promise<ScreenVersionRow | null> {
  const rows = await listScreenVersions();
  return rows.find((r) => r.id === id) ?? null;
}

export async function getDefaultScreenVersion(
  screenId: string,
): Promise<ScreenVersionRow | null> {
  const versions = await listVersionsByScreen(screenId);
  return versions[0] ?? null;
}

export async function createScreenVersion(input: {
  screenId: string;
  label: string;
}): Promise<ScreenVersionRow> {
  const rows = await listScreenVersions();
  const created: ScreenVersionRow = {
    id: newId(),
    screenId: input.screenId,
    label: input.label.trim(),
    createdAt: now(),
  };
  await setTable<ScreenVersionRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

export async function deleteScreenVersion(id: string): Promise<void> {
  const rows = await listScreenVersions();
  await setTable<ScreenVersionRow>(
    KEY,
    rows.filter((r) => r.id !== id),
  );
  notify(KEY);
}

export async function deleteVersionsByScreen(screenId: string): Promise<void> {
  const rows = await listScreenVersions();
  await setTable<ScreenVersionRow>(
    KEY,
    rows.filter((r) => r.screenId !== screenId),
  );
  notify(KEY);
}

export async function bulkInsertScreenVersions(
  rows: ScreenVersionRow[],
): Promise<void> {
  await setTable<ScreenVersionRow>(KEY, rows);
  notify(KEY);
}
