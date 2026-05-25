import type { ComponentVariant } from "@/lib/data/types";
import { newId, now } from "@/lib/storage/ids";
import type { VariantRow } from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.variants;

export async function listVariants(): Promise<VariantRow[]> {
  return getTable<VariantRow>(KEY);
}

export async function listVariantsByComponent(
  componentId: string,
): Promise<VariantRow[]> {
  const rows = await listVariants();
  return rows
    .filter((r) => r.componentId === componentId)
    .sort((a, b) => a.order - b.order);
}

export async function getVariant(id: string): Promise<VariantRow | null> {
  const rows = await listVariants();
  return rows.find((r) => r.id === id) ?? null;
}

export async function findVariantByName(
  componentId: string,
  name: string,
): Promise<VariantRow | null> {
  const rows = await listVariantsByComponent(componentId);
  return (
    rows.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null
  );
}

export async function listVariantsByIds(
  ids: string[],
): Promise<VariantRow[]> {
  if (ids.length === 0) return [];
  const set = new Set(ids);
  const rows = await listVariants();
  return rows.filter((r) => set.has(r.id));
}

export async function createVariant(input: {
  componentId: string;
  name: string;
  seedKey?: ComponentVariant | null;
}): Promise<VariantRow> {
  const rows = await listVariants();
  const siblings = rows.filter((r) => r.componentId === input.componentId);
  const order =
    siblings.reduce((max, r) => (r.order > max ? r.order : max), -1) + 1;
  const t = now();
  const created: VariantRow = {
    id: newId(),
    componentId: input.componentId,
    name: input.name,
    order,
    seedKey: input.seedKey ?? null,
    createdAt: t,
    updatedAt: t,
  };
  await setTable<VariantRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}
