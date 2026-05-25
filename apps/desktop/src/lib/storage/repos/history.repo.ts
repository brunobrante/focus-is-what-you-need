import { newId, now } from "@/lib/storage/ids";
import type {
  HistoryEntryRow,
  HistoryTargetType,
  Patch,
} from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.history;

export async function listHistory(): Promise<HistoryEntryRow[]> {
  return getTable<HistoryEntryRow>(KEY);
}

export async function listHistoryByTarget(
  targetId: string,
): Promise<HistoryEntryRow[]> {
  const rows = await listHistory();
  return rows
    .filter((r) => r.targetId === targetId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function listHistoryByType(
  targetType: HistoryTargetType,
): Promise<HistoryEntryRow[]> {
  const rows = await listHistory();
  return rows
    .filter((r) => r.targetType === targetType)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function getHistoryEntry(
  id: string,
): Promise<HistoryEntryRow | null> {
  const rows = await listHistory();
  return rows.find((r) => r.id === id) ?? null;
}

export async function recordHistoryEntry(input: {
  targetId: string;
  targetType: HistoryTargetType;
  message: string;
  author?: string;
  snapshot?: string | null;
  diff?: Patch[];
}): Promise<HistoryEntryRow> {
  const rows = await listHistory();
  const created: HistoryEntryRow = {
    id: newId(),
    targetId: input.targetId,
    targetType: input.targetType,
    timestamp: now(),
    message: input.message.trim(),
    author: input.author,
    snapshot: input.snapshot ?? null,
    diff: input.diff ?? [],
  };
  await setTable<HistoryEntryRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

export async function deleteHistoryByTarget(targetId: string): Promise<void> {
  const rows = await listHistory();
  await setTable<HistoryEntryRow>(
    KEY,
    rows.filter((r) => r.targetId !== targetId),
  );
  notify(KEY);
}

export async function bulkInsertHistory(
  rows: HistoryEntryRow[],
): Promise<void> {
  await setTable<HistoryEntryRow>(KEY, rows);
  notify(KEY);
}
