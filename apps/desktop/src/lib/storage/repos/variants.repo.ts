import type { ComponentVariant } from "@/lib/data/types";
import { normalizeComponentRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
  listChildrenOfVariant,
  listTopLevelByScreenId,
  markComponentsLinkable,
  setActiveVariant,
} from "@/lib/storage/repos/components.repo";
import { linkifyChildComponentsInGraph } from "@/domain/canvas/graphTransforms";
import { getSceneByOwner, upsertScene } from "@/lib/storage/repos/scenes.repo";
import type {
  ComponentRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantOwnerKind,
  VariantRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, removeRecords, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.variants;

export async function listVariants(): Promise<VariantRow[]> {
  return listTable<VariantRow>(KEY);
}

/** All variants (versions) owned by a master — a screen or a component. */
export async function listVariantsByOwner(
  ownerKind: VariantOwnerKind,
  ownerId: string,
): Promise<VariantRow[]> {
  const rows = await listVariants();
  return rows
    .filter((r) => r.ownerKind === ownerKind && r.ownerId === ownerId)
    .sort((a, b) => a.order - b.order);
}

/** Convenience: variants of a component master. */
export async function listVariantsByComponent(
  componentId: string,
): Promise<VariantRow[]> {
  return listVariantsByOwner("component", componentId);
}

/** Convenience: variants (versions) of a screen master. */
export async function listVariantsByScreen(
  screenId: string,
): Promise<VariantRow[]> {
  return listVariantsByOwner("screen", screenId);
}

export async function getVariant(id: string): Promise<VariantRow | null> {
  const rows = await listVariants();
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * The version tag for a variant: "main" for the default/original (order <= 0),
 * "V1"/"V2"… for the actual versions. Shared by screens and components — both are
 * masters that own a variant chain, all sharing the master's (one) name, each
 * identified by this tag.
 */
export function variantVersionLabel(variant: VariantRow): string {
  return variant.order <= 0 ? "main" : `V${variant.order}`;
}

/** Whether the variant is the default/original ("main") version of its master. */
export function isMainVariant(variant: VariantRow): boolean {
  return variant.order <= 0;
}

/**
 * Deletes a variant (a version): its scene, thumbnail, and any nested child
 * components owned by it. The default/original variant ("main") cannot be deleted. If
 * the deleted variant was the master's active one, the master switches to its
 * lowest-order sibling. Works for both screen and component masters.
 */
export async function deleteVariant(variantId: string): Promise<void> {
  const variants = await listVariants();
  const variant = variants.find((v) => v.id === variantId);
  if (!variant || variant.order <= 0) return; // never delete the main

  const components = await listTable<ComponentRow>(TABLES.components);

  // Lowest-order remaining sibling to fall back to if this was the active variant.
  const fallback = variants
    .filter(
      (v) =>
        v.ownerKind === variant.ownerKind &&
        v.ownerId === variant.ownerId &&
        v.id !== variantId,
    )
    .sort((a, b) => a.order - b.order)[0];

  if (variant.ownerKind === "component") {
    const owner = components.find((c) => c.id === variant.ownerId);
    if (owner?.activeVariantId === variantId && fallback) {
      await setActiveVariant(owner.id, fallback.id);
    }
  } else {
    const screens = await listTable<ScreenRow>(TABLES.screens);
    const owner = screens.find((s) => s.id === variant.ownerId);
    if (owner?.activeVariantId === variantId && fallback) {
      await replaceTable<ScreenRow>(
        TABLES.screens,
        screens.map((s) =>
          s.id === owner.id ? { ...s, activeVariantId: fallback.id, updatedAt: now() } : s,
        ),
      );
      notify(TABLES.screens);
    }
  }

  // Child components nested under this variant (and their whole subtrees).
  const childComponentIds = new Set<string>();
  for (const child of components.filter((c) => c.parentVariantId === variantId)) {
    collectComponentTreeIds(child.id, components, variants).forEach((id) => childComponentIds.add(id));
  }
  const childVariantIds = new Set(
    variants
      .filter((v) => v.ownerKind === "component" && childComponentIds.has(v.ownerId))
      .map((v) => v.id),
  );
  const deletedVariantIds = new Set([variantId, ...childVariantIds]);

  await replaceTable<VariantRow>(KEY, variants.filter((v) => !deletedVariantIds.has(v.id)));
  if (childComponentIds.size > 0) {
    await replaceTable<ComponentRow>(
      TABLES.components,
      components.filter((c) => !childComponentIds.has(c.id)),
    );
  }

  // Delete only the affected scene/thumbnail rows; removeRecords enqueues
  // O(deleted) deletes instead of re-stringifying every surviving large blob.
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  removeRecords(
    TABLES.scenes,
    scenes.filter((s) => deletedVariantIds.has(s.ownerId)).map((s) => s.id),
  );
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  removeRecords(
    TABLES.thumbnails,
    thumbnails.filter((t) => deletedVariantIds.has(t.ownerId)).map((t) => t.id),
  );

  notify(KEY);
  notify(TABLES.components);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}

export async function findVariantByName(
  ownerKind: VariantOwnerKind,
  ownerId: string,
  name: string,
): Promise<VariantRow | null> {
  const rows = await listVariantsByOwner(ownerKind, ownerId);
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
  ownerKind: VariantOwnerKind;
  ownerId: string;
  name: string;
  seedKey?: ComponentVariant | null;
}): Promise<VariantRow> {
  const rows = await listVariants();
  const siblings = rows.filter(
    (r) => r.ownerKind === input.ownerKind && r.ownerId === input.ownerId,
  );
  const order =
    siblings.reduce((max, r) => (r.order > max ? r.order : max), -1) + 1;
  const t = now();
  const created: VariantRow = {
    id: newId(),
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
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
 * a new version" flow. Serves both screen and component masters. Two modes:
 *
 *  - "copy" (default): the source scene graph is duplicated verbatim. Node ids are
 *    scene-scoped, so a verbatim copy is safe for a sibling variant.
 *  - "linked": the frame and non-component content are copied, but every child
 *    component is collapsed into a linked instance pointing at the original child
 *    master (see linkifyChildComponentsInGraph). Editing a master then reflects in
 *    this version too.
 *
 * A component's children are the components nested under the source variant; a
 * screen's children are the screen's top-level components.
 */
export async function duplicateVariant(input: {
  ownerKind: VariantOwnerKind;
  ownerId: string;
  sourceVariantId: string;
  name: string;
  mode?: "copy" | "linked";
}): Promise<VariantRow> {
  const created = await createVariant({
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    name: input.name,
  });
  // The subject's child components: a screen's top-level components, or a component
  // variant's nested children.
  const children =
    input.ownerKind === "screen"
      ? await listTopLevelByScreenId(input.ownerId)
      : await listChildrenOfVariant(input.sourceVariantId);

  const sourceScene = await getSceneByOwner("variant", input.sourceVariantId);
  if (sourceScene) {
    let graphJSON = sourceScene.graphJSON;
    if (input.mode === "linked") {
      const linked = linkifyChildComponentsInGraph(
        graphJSON,
        children.map((c) => ({
          id: c.id,
          activeVariantId: c.activeVariantId,
          sourceNodeId: c.sourceNodeId ?? null,
          name: c.name,
        })),
      );
      if (linked) {
        graphJSON = linked;
        // The child masters are now referenced as linked instances — make them
        // pickable from the canvas "Add components" picker.
        await markComponentsLinkable(children.map((c) => c.id));
      }
    } else {
      // "copy": a fully independent version. Deep-clone every child component master
      // (its whole variant chain + scenes + nested children) into NEW masters owned
      // by the new variant, so the version owns its components outright — editing or
      // DELETING one never touches the original it was copied from.
      await cloneChildComponentsIntoVariant({
        sourceChildren: children,
        targetVariantId: created.id,
      });
    }
    await upsertScene(
      { ownerType: "variant", ownerId: created.id, graphJSON },
      { propagate: false },
    );
  }
  return created;
}

/**
 * Deep-clones a set of child component masters into fresh masters parented to
 * `targetVariantId` — used by "copy"-mode versioning so the new version owns
 * independent components with no link back to the originals.
 *
 * For each source child it clones the ComponentRow, its entire variant chain, and
 * each variant's scene (verbatim — node ids are scene-scoped so a verbatim copy is
 * safe), then recurses into the children nested under every source variant. Linked
 * instances embedded in a cloned scene keep their `instanceOf` (they still point at
 * their own external master); only owned content is given new masters. The clones are
 * not linkable (a fresh local copy is not shared until the user opts in).
 */
async function cloneChildComponentsIntoVariant(input: {
  sourceChildren: ComponentRow[];
  targetVariantId: string;
}): Promise<void> {
  if (input.sourceChildren.length === 0) return;

  const allComponents = await listTable<ComponentRow>(TABLES.components);
  const allVariants = await listTable<VariantRow>(KEY);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const sceneByOwner = new Map(
    scenes.map((s) => [`${s.ownerType}:${s.ownerId}`, s] as const),
  );

  const newComponents: ComponentRow[] = [];
  const newVariants: VariantRow[] = [];
  const newScenes: Array<{ ownerId: string; graphJSON: string }> = [];

  const variantsOfComponent = (componentId: string) =>
    allVariants
      .filter((v) => v.ownerKind === "component" && v.ownerId === componentId)
      .sort((a, b) => a.order - b.order);
  const childrenOfVariant = (variantId: string) =>
    allComponents.filter((c) => c.parentVariantId === variantId);

  const cloneOne = (source: ComponentRow, parentVariantId: string): void => {
    const t = now();
    const newComponentId = newId();
    const sourceVariants = variantsOfComponent(source.id);
    const variantIdMap = new Map<string, string>();

    for (const sv of sourceVariants) {
      const newVariantId = newId();
      variantIdMap.set(sv.id, newVariantId);
      newVariants.push({ ...sv, id: newVariantId, ownerId: newComponentId, createdAt: t, updatedAt: t });
      const scene = sceneByOwner.get(`variant:${sv.id}`);
      if (scene) newScenes.push({ ownerId: newVariantId, graphJSON: scene.graphJSON });
    }

    const newActiveVariantId =
      variantIdMap.get(source.activeVariantId) ?? [...variantIdMap.values()][0] ?? newId();

    newComponents.push(
      normalizeComponentRow({
        ...source,
        id: newComponentId,
        // Owned by the new version's variant — a version-scoped local copy.
        parentVariantId,
        screenId: null,
        linkable: false,
        activeVariantId: newActiveVariantId,
        createdAt: t,
        updatedAt: t,
      }),
    );

    // Recurse into the children nested under each source variant.
    for (const sv of sourceVariants) {
      const nextParent = variantIdMap.get(sv.id)!;
      for (const grandchild of childrenOfVariant(sv.id)) {
        cloneOne(grandchild, nextParent);
      }
    }
  };

  for (const child of input.sourceChildren) cloneOne(child, input.targetVariantId);

  if (newVariants.length > 0) {
    await replaceTable<VariantRow>(KEY, [...newVariants, ...allVariants]);
    notify(KEY);
  }
  if (newComponents.length > 0) {
    await replaceTable<ComponentRow>(TABLES.components, [...newComponents, ...allComponents]);
    notify(TABLES.components);
  }
  for (const scene of newScenes) {
    await upsertScene(
      { ownerType: "variant", ownerId: scene.ownerId, graphJSON: scene.graphJSON },
      { propagate: false },
    );
  }
}
