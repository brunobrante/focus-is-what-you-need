import { newId, now } from "@/lib/storage/ids";
import type { WorkspaceRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.workspaces;

export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  return getTable<WorkspaceRow>(KEY);
}

export async function getWorkspace(id: string): Promise<WorkspaceRow | null> {
  const rows = await listWorkspaces();
  return rows.find((r) => r.id === id) ?? null;
}

export async function getDefaultWorkspace(): Promise<WorkspaceRow | null> {
  const rows = await listWorkspaces();
  return rows[0] ?? null;
}

export async function createWorkspace(input: {
  name: string;
  projectIds?: string[];
}): Promise<WorkspaceRow> {
  const rows = await listWorkspaces();
  const t = now();
  const created: WorkspaceRow = {
    id: newId(),
    name: input.name.trim(),
    projectIds: input.projectIds ?? [],
    createdAt: t,
    updatedAt: t,
  };
  await setTable<WorkspaceRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Pick<WorkspaceRow, "name" | "projectIds">>,
): Promise<WorkspaceRow | null> {
  const rows = await listWorkspaces();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: WorkspaceRow = {
    ...rows[idx]!,
    ...patch,
    updatedAt: now(),
  };
  const nextRows = [...rows];
  nextRows[idx] = next;
  await setTable<WorkspaceRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

export async function addProjectToWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<WorkspaceRow | null> {
  const rows = await listWorkspaces();
  const idx = rows.findIndex((r) => r.id === workspaceId);
  if (idx < 0) return null;
  const current = rows[idx]!;
  if (current.projectIds.includes(projectId)) return current;
  return updateWorkspace(workspaceId, {
    projectIds: [...current.projectIds, projectId],
  });
}

export async function removeProjectFromWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<WorkspaceRow | null> {
  const rows = await listWorkspaces();
  const idx = rows.findIndex((r) => r.id === workspaceId);
  if (idx < 0) return null;
  const current = rows[idx]!;
  return updateWorkspace(workspaceId, {
    projectIds: current.projectIds.filter((id) => id !== projectId),
  });
}

export async function bulkInsertWorkspaces(rows: WorkspaceRow[]): Promise<void> {
  await setTable<WorkspaceRow>(KEY, rows);
  notify(KEY);
}
