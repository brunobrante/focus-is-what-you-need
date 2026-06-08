import type { ComponentVariant } from "@/lib/data/types";
import { newId, now } from "@/lib/storage/ids";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type { VariantRow } from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.variants;

export async function listVariants(): Promise<VariantRow[]> {
  return listTable<VariantRow>(KEY);
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
  await replaceTable<VariantRow>(KEY, [created, ...rows]);
  notify(KEY);
  return created;
}

/**
 * Create a new variant that is a copy of an existing one — the "save current as
 * a new version" flow. The source variant's scene graph is duplicated verbatim
 * into the new variant's own scene. Node ids are scene-scoped, so a verbatim
 * copy is safe for a sibling variant (no parent placement to reconcile). Child
 * component rows nested under the source variant are NOT deep-cloned (follow-up).
 */
export async function duplicateVariant(input: {
  componentId: string;
  sourceVariantId: string;
  name: string;
}): Promise<VariantRow> {
  const created = await createVariant({
    componentId: input.componentId,
    name: input.name,
  });
  const sourceScene = await getSceneByOwner("variant", input.sourceVariantId);
  if (sourceScene) {
    await upsertScene(
      {
        ownerType: "variant",
        ownerId: created.id,
        graphJSON: sourceScene.graphJSON,
      },
      { propagate: false },
    );
  }
  return created;
}
