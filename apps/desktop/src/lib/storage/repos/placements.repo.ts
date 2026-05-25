import { newId, now } from "@/lib/storage/ids";
import type { ComponentPlacementRow, NodeOverride } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.placements;

export async function listPlacements(): Promise<ComponentPlacementRow[]> {
  return getTable<ComponentPlacementRow>(KEY);
}

export async function listPlacementsByScreenVersion(
  screenVersionId: string,
): Promise<ComponentPlacementRow[]> {
  const rows = await listPlacements();
  return rows
    .filter((r) => r.screenVersionId === screenVersionId)
    .sort((a, b) => a.order - b.order);
}

export async function listPlacementsByComponent(
  componentId: string,
): Promise<ComponentPlacementRow[]> {
  const rows = await listPlacements();
  return rows.filter((r) => r.componentId === componentId);
}

export async function getPlacement(
  id: string,
): Promise<ComponentPlacementRow | null> {
  const rows = await listPlacements();
  return rows.find((r) => r.id === id) ?? null;
}

export async function createPlacement(input: {
  screenVersionId: string;
  componentId: string;
  versionId: string;
  slot: string;
  order?: number;
  overrides?: NodeOverride;
}): Promise<ComponentPlacementRow> {
  const rows = await listPlacements();
  const siblings = rows.filter(
    (r) => r.screenVersionId === input.screenVersionId,
  );
  const order =
    input.order ??
    siblings.reduce((max, r) => (r.order > max ? r.order : max), -1) + 1;

  const created: ComponentPlacementRow = {
    id: newId(),
    screenVersionId: input.screenVersionId,
    componentId: input.componentId,
    versionId: input.versionId,
    slot: input.slot.trim(),
    order,
    overrides: input.overrides ?? {},
  };
  await setTable<ComponentPlacementRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

export async function updatePlacementOverrides(
  id: string,
  overrides: NodeOverride,
): Promise<ComponentPlacementRow | null> {
  const rows = await listPlacements();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: ComponentPlacementRow = { ...rows[idx]!, overrides };
  const nextRows = [...rows];
  nextRows[idx] = next;
  await setTable<ComponentPlacementRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

export async function deletePlacement(id: string): Promise<void> {
  const rows = await listPlacements();
  await setTable<ComponentPlacementRow>(
    KEY,
    rows.filter((r) => r.id !== id),
  );
  notify(KEY);
}

export async function deletePlacementsByScreenVersion(
  screenVersionId: string,
): Promise<void> {
  const rows = await listPlacements();
  await setTable<ComponentPlacementRow>(
    KEY,
    rows.filter((r) => r.screenVersionId !== screenVersionId),
  );
  notify(KEY);
}

export async function deletePlacementsByComponent(
  componentId: string,
): Promise<void> {
  const rows = await listPlacements();
  await setTable<ComponentPlacementRow>(
    KEY,
    rows.filter((r) => r.componentId !== componentId),
  );
  notify(KEY);
}

export async function bulkInsertPlacements(
  rows: ComponentPlacementRow[],
): Promise<void> {
  await setTable<ComponentPlacementRow>(KEY, rows);
  notify(KEY);
}
