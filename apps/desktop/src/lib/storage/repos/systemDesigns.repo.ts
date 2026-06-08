import { newId, now } from "@/lib/storage/ids";
import type {
  SystemDesignIcon,
  SystemDesignLibrary,
  SystemDesignOwnerScope,
  SystemDesignRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.systemDesigns;

export async function listSystemDesigns(): Promise<SystemDesignRow[]> {
  return listTable<SystemDesignRow>(KEY);
}

export async function listSystemDesignsByOwner(
  ownerScope: SystemDesignOwnerScope,
  ownerId: string,
): Promise<SystemDesignRow[]> {
  const rows = await listSystemDesigns();
  return rows
    .filter((row) => row.ownerScope === ownerScope && row.ownerId === ownerId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getSystemDesign(id: string): Promise<SystemDesignRow | null> {
  const rows = await listSystemDesigns();
  return rows.find((row) => row.id === id) ?? null;
}

export async function createSystemDesign(input: {
  name: string;
  ownerScope: SystemDesignOwnerScope;
  ownerId: string;
  shared?: boolean;
}): Promise<SystemDesignRow> {
  const rows = await listSystemDesigns();
  const t = now();
  const created: SystemDesignRow = {
    id: newId(),
    name: input.name.trim() || "Untitled system",
    ownerScope: input.ownerScope,
    ownerId: input.ownerId,
    shared: input.shared ?? false,
    libraries: [],
    icons: [],
    createdAt: t,
    updatedAt: t,
  };
  await replaceTable<SystemDesignRow>(KEY, [...rows, created]);
  notify(KEY);
  return created;
}

async function patchSystemDesign(
  id: string,
  patch: (current: SystemDesignRow) => SystemDesignRow,
): Promise<SystemDesignRow | null> {
  const rows = await listSystemDesigns();
  const idx = rows.findIndex((row) => row.id === id);
  if (idx < 0) return null;
  const next = { ...patch(rows[idx]!), updatedAt: now() };
  const nextRows = [...rows];
  nextRows[idx] = next;
  await replaceTable<SystemDesignRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

export async function renameSystemDesign(
  id: string,
  name: string,
): Promise<SystemDesignRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return getSystemDesign(id);
  return patchSystemDesign(id, (current) => ({ ...current, name: trimmed }));
}

export async function setSystemDesignShared(
  id: string,
  shared: boolean,
): Promise<SystemDesignRow | null> {
  return patchSystemDesign(id, (current) => ({ ...current, shared }));
}

export async function deleteSystemDesign(id: string): Promise<void> {
  const rows = await listSystemDesigns();
  const nextRows = rows.filter((row) => row.id !== id);
  if (nextRows.length === rows.length) return;
  await replaceTable<SystemDesignRow>(KEY, nextRows);
  notify(KEY);
}

export async function addSystemDesignLibrary(
  id: string,
  name: string,
): Promise<SystemDesignRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return getSystemDesign(id);
  const library: SystemDesignLibrary = { id: newId(), name: trimmed };
  return patchSystemDesign(id, (current) => ({
    ...current,
    libraries: [...current.libraries, library],
  }));
}

export async function removeSystemDesignLibrary(
  id: string,
  libraryId: string,
): Promise<SystemDesignRow | null> {
  return patchSystemDesign(id, (current) => ({
    ...current,
    libraries: current.libraries.filter((library) => library.id !== libraryId),
  }));
}

export async function addSystemDesignIcon(
  id: string,
  name: string,
): Promise<SystemDesignRow | null> {
  const trimmed = name.trim();
  if (!trimmed) return getSystemDesign(id);
  const icon: SystemDesignIcon = { id: newId(), name: trimmed };
  return patchSystemDesign(id, (current) => ({
    ...current,
    icons: [...current.icons, icon],
  }));
}

export async function removeSystemDesignIcon(
  id: string,
  iconId: string,
): Promise<SystemDesignRow | null> {
  return patchSystemDesign(id, (current) => ({
    ...current,
    icons: current.icons.filter((icon) => icon.id !== iconId),
  }));
}

export async function bulkInsertSystemDesigns(rows: SystemDesignRow[]): Promise<void> {
  await replaceTable<SystemDesignRow>(KEY, rows);
  notify(KEY);
}
