import type { ComponentVariant } from "@/lib/data/types";
import { newId, now } from "@/lib/storage/ids";
import { listChildrenOfVariant } from "@/lib/storage/repos/components.repo";
import { getSceneByOwner, linkifyChildComponentsInGraph, upsertScene } from "@/lib/storage/repos/scenes.repo";
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
 * Create a new variant that is a version of an existing one — the "save current as
 * a new version" flow. Two modes:
 *
 *  - "copy" (default): the source scene graph is duplicated verbatim. Node ids are
 *    scene-scoped, so a verbatim copy is safe for a sibling variant.
 *  - "linked": the frame and non-component content are copied, but every child
 *    component is collapsed into a linked instance pointing at the original child
 *    master (see linkifyChildComponentsInGraph). Editing a master then reflects in
 *    this version too.
 */
export async function duplicateVariant(input: {
  componentId: string;
  sourceVariantId: string;
  name: string;
  mode?: "copy" | "linked";
}): Promise<VariantRow> {
  const created = await createVariant({
    componentId: input.componentId,
    name: input.name,
  });
  const sourceScene = await getSceneByOwner("variant", input.sourceVariantId);
  if (sourceScene) {
    let graphJSON = sourceScene.graphJSON;
    if (input.mode === "linked") {
      const children = await listChildrenOfVariant(input.sourceVariantId);
      const linked = linkifyChildComponentsInGraph(
        graphJSON,
        children.map((c) => ({
          id: c.id,
          activeVariantId: c.activeVariantId,
          sourceNodeId: c.sourceNodeId ?? null,
          name: c.name,
        })),
      );
      if (linked) graphJSON = linked;
    }
    await upsertScene(
      { ownerType: "variant", ownerId: created.id, graphJSON },
      { propagate: false },
    );
  }
  return created;
}
