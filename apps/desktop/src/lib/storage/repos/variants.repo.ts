import type { ComponentVariant } from "@/lib/data/types";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
  listChildrenOfVariant,
  setActiveVariant,
} from "@/lib/storage/repos/components.repo";
import { getSceneByOwner, linkifyChildComponentsInGraph, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type { ComponentRow, SceneRow, ThumbnailRow, VariantRow } from "@/lib/storage/schema";
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

/**
 * The version tag for a component variant: "main" for the default/original variant,
 * "V1"/"V2"… for the actual versions (the first version created is V1). Mirrors the
 * screen version model — a component's variants are its versions, all sharing the
 * component's (one) name, each identified by this tag.
 */
export function variantVersionLabel(variant: VariantRow): string {
  return variant.order <= 0 ? "main" : `V${variant.order}`;
}

/** Whether the variant is the default/original ("main") version of its component. */
export function isMainVariant(variant: VariantRow): boolean {
  return variant.order <= 0;
}

/**
 * Deletes a component version (variant): its scene, thumbnail, and any nested child
 * components owned by it. The default/original variant ("main") cannot be deleted. If
 * the deleted variant was active, the component switches to its lowest-order sibling.
 */
export async function deleteVariant(variantId: string): Promise<void> {
  const variants = await listVariants();
  const variant = variants.find((v) => v.id === variantId);
  if (!variant || variant.order <= 0) return; // never delete the main

  const components = await listTable<ComponentRow>(TABLES.components);

  // If active, switch the component to the lowest-order remaining sibling first.
  const owner = components.find((c) => c.id === variant.componentId);
  if (owner?.activeVariantId === variantId) {
    const sibling = variants
      .filter((v) => v.componentId === variant.componentId && v.id !== variantId)
      .sort((a, b) => a.order - b.order)[0];
    if (sibling) await setActiveVariant(owner.id, sibling.id);
  }

  // Child components nested under this variant (and their whole subtrees).
  const childComponentIds = new Set<string>();
  for (const child of components.filter((c) => c.parentVariantId === variantId)) {
    collectComponentTreeIds(child.id, components, variants).forEach((id) => childComponentIds.add(id));
  }
  const childVariantIds = new Set(
    variants.filter((v) => childComponentIds.has(v.componentId)).map((v) => v.id),
  );
  const deletedVariantIds = new Set([variantId, ...childVariantIds]);

  await replaceTable<VariantRow>(KEY, variants.filter((v) => !deletedVariantIds.has(v.id)));
  if (childComponentIds.size > 0) {
    await replaceTable<ComponentRow>(
      TABLES.components,
      components.filter((c) => !childComponentIds.has(c.id)),
    );
  }

  const scenes = await listTable<SceneRow>(TABLES.scenes);
  await replaceTable<SceneRow>(
    TABLES.scenes,
    scenes.filter((s) => !(s.ownerType === "variant" && deletedVariantIds.has(s.ownerId))),
  );
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  await replaceTable<ThumbnailRow>(
    TABLES.thumbnails,
    thumbnails.filter((t) => !(t.ownerType === "variant" && deletedVariantIds.has(t.ownerId))),
  );

  notify(KEY);
  notify(TABLES.components);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
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
