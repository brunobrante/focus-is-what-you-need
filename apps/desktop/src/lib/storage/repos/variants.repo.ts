import type { ComponentVariant } from "@/lib/data/types";
import { normalizeComponentRow } from "@/lib/storage/defaults";
import { peekOwnerOf, primeEdgeIndex } from "@/application/graph/edgeIndex";
import { parentVariantIdOf } from "@/application/graph/componentOwnership";
import { setOwner } from "@/lib/storage/repos/edges.repo";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
  listChildrenOfVariant,
  listTopLevelByScreenId,
  markComponentsLinkable,
  setActiveVariant,
  type InstanceDeleteStrategy,
} from "@/lib/storage/repos/components.repo";
import {
  linkifyChildComponentsInGraph,
  materializeInstancesInGraph,
} from "@/domain/canvas/graphTransforms";
import { htmlCanvasDocumentFromJSON } from "@/lib/canvas/htmlScene";
import {
  countInstanceUsages,
  detachInstancesOfComponents,
  getSceneByOwner,
  removeInstancesOfComponents,
  upsertScene,
} from "@/lib/storage/repos/scenes.repo";
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
 * The components a version (variant) owns outright: every component parented to
 * this variant, plus their whole subtrees. These are the masters that disappear
 * when the version is deleted — and the ones whose linked instances elsewhere
 * must be resolved first (Law 5).
 */
function collectVariantOwnedComponentIds(
  variantId: string,
  components: ComponentRow[],
  variants: VariantRow[],
): Set<string> {
  const ids = new Set<string>();
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const children = components.filter(
    (c) => (parentVariantIdOf(c.id, variantMap)) === variantId,
  );
  for (const child of children) {
    collectComponentTreeIds(child.id, components, variants).forEach((id) => ids.add(id));
  }
  return ids;
}

/**
 * How many linked-instance placements exist ELSEWHERE for the components this
 * version owns. Drives whether deleting the version must offer the per-instance
 * detach/cascade choice (Law 5), mirroring `countScreenInstanceUsages`.
 */
export async function countVariantInstanceUsages(variantId: string): Promise<number> {
  const variants = await listVariants();
  const variant = variants.find((v) => v.id === variantId);
  if (!variant || variant.order <= 0) return 0;
  const components = await listTable<ComponentRow>(TABLES.components);
  const ids = collectVariantOwnedComponentIds(variantId, components, variants);
  return ids.size === 0 ? 0 : countInstanceUsages(ids);
}

/**
 * Deletes a variant (a version): its scene, thumbnail, and any nested child
 * components owned by it. The default/original variant ("main") cannot be deleted. If
 * the deleted variant was the master's active one, the master switches to its
 * lowest-order sibling. Works for both screen and component masters.
 *
 * When the version owns components that are linked as instances elsewhere, the
 * caller must pass an `instanceStrategy` (Law 5): "detach" materializes each such
 * instance into a local copy, "cascade" removes them. Omitting it deletes the
 * masters outright — only safe when there are no external instances.
 */
export async function deleteVariant(
  variantId: string,
  opts?: { instanceStrategy?: InstanceDeleteStrategy },
): Promise<void> {
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
  const childComponentIds = collectVariantOwnedComponentIds(variantId, components, variants);

  // Law 5: those owned masters may be placed as linked instances in OTHER scenes.
  // Resolve every such placement BEFORE the masters disappear — "detach"
  // materializes each into a local copy, "cascade" removes it. Skipping this
  // would leave dangling `instanceOf` nodes that resolve to nothing.
  if (childComponentIds.size > 0) {
    if (opts?.instanceStrategy === "detach") {
      await detachInstancesOfComponents(childComponentIds);
    } else if (opts?.instanceStrategy === "cascade") {
      await removeInstancesOfComponents(childComponentIds);
    }
  }

  const childVariantIds = new Set(
    variants
      .filter((v) => v.ownerKind === "component" && childComponentIds.has(v.ownerId))
      .map((v) => v.id),
  );
  const deletedVariantIds = new Set([variantId, ...childVariantIds]);

  const scenes = await listTable<SceneRow>(TABLES.scenes);

  // VER-3: a linked version flips the masters it references to `linkable:true`
  // (markComponentsLinkable). Deleting the version removes those references, so an
  // auto-flipped master with no surviving instance anywhere must revert to
  // non-linkable — otherwise it stays pickable project-wide forever. Computed
  // before the scene rows are removed, by a direct scan of the graphs (the derived
  // instance_usage index lags a removal).
  const mastersToRevert = await collectAutoLinkableToRevert(
    scenes,
    deletedVariantIds,
    childComponentIds,
    components,
  );

  await replaceTable<VariantRow>(KEY, variants.filter((v) => !deletedVariantIds.has(v.id)));
  if (childComponentIds.size > 0 || mastersToRevert.size > 0) {
    await replaceTable<ComponentRow>(
      TABLES.components,
      components
        .filter((c) => !childComponentIds.has(c.id))
        .map((c) => (mastersToRevert.has(c.id) ? { ...c, linkable: false, updatedAt: now() } : c)),
    );
  }

  // Delete only the affected scene/thumbnail rows; removeRecords enqueues
  // O(deleted) deletes instead of re-stringifying every surviving large blob.
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

/**
 * VER-3: masters that the deleted version's scenes referenced as linked instances and
 * that NO surviving scene still references — restricted to **variant-owned** masters.
 * Those are the ones a linked version auto-flipped to `linkable` via
 * `markComponentsLinkable`; project/workspace-global components are linkable by design
 * (created that way) and are owned by a project/workspace edge, so they are never
 * auto-reverted. The owner edge is what distinguishes auto-flipped from user-opted,
 * with no extra schema field.
 */
async function collectAutoLinkableToRevert(
  scenes: SceneRow[],
  deletedVariantIds: Set<string>,
  deletedComponentIds: Set<string>,
  components: ComponentRow[],
): Promise<Set<string>> {
  const referencedByDeleted = new Set<string>();
  const survivingReferenced = new Set<string>();
  for (const s of scenes) {
    if (s.ownerType !== "variant") continue;
    const doc = htmlCanvasDocumentFromJSON(s.graphJSON);
    if (!doc) continue;
    const target = deletedVariantIds.has(s.ownerId)
      ? referencedByDeleted
      : survivingReferenced;
    for (const n of doc.nodes) {
      if (n.instanceOf) target.add(n.instanceOf.componentId);
    }
  }

  const result = new Set<string>();
  if (referencedByDeleted.size === 0) return result;
  await primeEdgeIndex();
  for (const id of referencedByDeleted) {
    if (deletedComponentIds.has(id)) continue; // the master itself is being deleted
    if (survivingReferenced.has(id)) continue; // still linked somewhere else
    const comp = components.find((c) => c.id === id);
    if (!comp || comp.linkable !== true) continue;
    const owner = peekOwnerOf("component", id);
    if (owner?.type === "variant") result.add(id);
  }
  return result;
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

  // Child capture is an OWNER-EDGE operation: it must run whenever the subject has
  // children, even if it was never saved (no scene yet). Gating it on `sourceScene`
  // meant a Copy version owned NONE of the parent's children and a Linked version
  // referenced none — silently diverging from the Versioning law (VER-2). The
  // graph-level work (linkifying the instance nodes, copying the source graph) still
  // applies only when a scene exists.
  if (input.mode === "linked") {
    // The child masters become this version's linked instances — make them pickable
    // from the canvas "Add components" picker regardless of scene presence.
    if (children.length > 0) {
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
      if (linked) graphJSON = linked;
    }
    await upsertScene(
      { ownerType: "variant", ownerId: created.id, graphJSON },
      { propagate: false },
    );
  }
  return created;
}

/**
 * Promotes a version variant to be its master's **main** (order 0) — the canonical,
 * owned definition. It is the mirror image of creating a version and serves both
 * screen and component masters.
 *
 * The crown carries ownership. Two shapes, detected automatically:
 *
 *  - **Copy version** (independent — it already embeds its own cloned masters): a plain
 *    swap. Reorder so the promoted variant is main and point the owner's active variant
 *    at it. For a screen, top-level component ownership (`screenId` vs `parentVariantId`)
 *    is swapped too, so the new main owns its components as screen-owned and the demoted
 *    old main keeps its own as version-owned — otherwise the old main's screen-owned
 *    components would resolve their embedding scene to the new main (a latent corruption).
 *
 *  - **Linked version** (holds instances of the old main's child masters): the **masters
 *    move with the crown**. The child masters are re-parented to the promoted variant and
 *    its scene re-embeds their real subtrees; the demoted old main keeps linked instances
 *    pointing at them. This keeps the new main editable and independent of any version's
 *    lifetime (deleting the old version never guts the main) while preserving the link —
 *    editing the new main still reflects in the old version. Master ids are preserved (a
 *    re-parent, never a clone), so linked instances placed elsewhere keep resolving.
 *
 * Only the children the promoted version **still shares** (an instance of them survives in
 * its scene) move with the crown and get linkified back onto the old main. A child the
 * version dropped — unlinked then deleted inside it — is left as the demoted main's own
 * **local copy**: not re-homed onto the new main (no phantom subcomponent) and not turned
 * into a dangling instance pointing at a master the new main never received.
 *
 * No-op when the variant is already the main or is unknown.
 */
export async function promoteVariantToMain(variantId: string): Promise<void> {
  const variants = await listVariants();
  const promoted = variants.find((v) => v.id === variantId);
  if (!promoted || promoted.order <= 0) return; // already main / unknown

  const siblings = variants.filter(
    (v) => v.ownerKind === promoted.ownerKind && v.ownerId === promoted.ownerId,
  );
  const oldMain = siblings.find((v) => v.order <= 0);
  if (!oldMain || oldMain.id === promoted.id) return;

  const components = await listTable<ComponentRow>(TABLES.components);
  await primeEdgeIndex();

  // The old main's OWNED child components, read off the graph: everything owned by the
  // old main variant (screen-top-level OR component-nested — the edge unifies them).
  const ownedChildren = components.filter((c) => {
    const o = peekOwnerOf("component", c.id);
    return o?.type === "variant" && o.id === oldMain.id;
  });
  const ownedIds = new Set(ownedChildren.map((c) => c.id));

  const promotedScene = await getSceneByOwner("variant", promoted.id);
  const oldMainScene = await getSceneByOwner("variant", oldMain.id);

  // Which of the old main's owned children the promoted variant STILL references as a linked
  // instance. Only these move with the crown. A child the version dropped — the user unlinked
  // then deleted it inside the version — must NOT be force-linkified back onto the old main:
  // there is no master left to point at, so it stays the demoted main's own local copy, and it
  // must not be re-homed onto the new main (where it would resurface as a phantom subcomponent
  // with no node in the scene). Verifying this per child, instead of assuming every owned child
  // is still shared, is what stops a promotion from resurrecting a component the version lost.
  const promotedDoc = htmlCanvasDocumentFromJSON(promotedScene?.graphJSON ?? null);
  const sharedIds = new Set<string>();
  for (const node of promotedDoc?.nodes ?? []) {
    if (node.instanceOf && ownedIds.has(node.instanceOf.componentId)) {
      sharedIds.add(node.instanceOf.componentId);
    }
  }
  const sharedChildren = ownedChildren.filter((c) => sharedIds.has(c.id));
  // Linked promotion = the version still links at least one of the old main's children;
  // otherwise it is an independent (copy) version and promotion is a plain swap.
  const isLinkedVersion = sharedChildren.length > 0;

  // 1. Reorder: promoted → main (0); old main → a fresh version slot.
  const maxOrder = siblings.reduce((m, v) => (v.order > m ? v.order : m), 0);
  const t = now();
  await replaceTable<VariantRow>(
    KEY,
    variants.map((v) => {
      if (v.id === promoted.id) return { ...v, order: 0, updatedAt: t };
      if (v.id === oldMain.id) return { ...v, order: maxOrder + 1, updatedAt: t };
      return v;
    }),
  );
  notify(KEY);

  // 2. The owner's active variant follows the crown (a kept field — activeVariantId).
  if (promoted.ownerKind === "component") {
    const nextComponents = components.map((c) =>
      c.id === promoted.ownerId ? { ...c, activeVariantId: promoted.id, updatedAt: t } : c,
    );
    await replaceTable<ComponentRow>(TABLES.components, nextComponents);
    notify(TABLES.components);
  } else {
    const screens = await listTable<ScreenRow>(TABLES.screens);
    await replaceTable<ScreenRow>(
      TABLES.screens,
      screens.map((s) =>
        s.id === promoted.ownerId ? { ...s, activeVariantId: promoted.id, updatedAt: t } : s,
      ),
    );
    notify(TABLES.screens);
  }

  // 2b. Ownership re-home is now a pure EDGE operation (no screenId/parentVariantId
  // swap). The owner edges point at SPECIFIC variants, so:
  //   - Copy version: nothing moves — the old main's children stay owned by the
  //     demoted old main, the promoted variant's clones stay owned by it. Promotion is
  //     a pure reorder (the doc's "Copy promote carries ownership for free").
  //   - Linked version: only the children the version STILL shares re-home from the old
  //     main onto the promoted (new main) variant — the crown carries the shared masters.
  //     Dropped children stay owned by the demoted old main as its local copies.
  if (isLinkedVersion) {
    for (const child of sharedChildren) {
      await setOwner({ type: "variant", id: promoted.id }, { type: "component", id: child.id });
    }
  }

  // 3. Linked only: swap embed↔instance between the two scenes, for the SHARED children only.
  if (isLinkedVersion) {
    // Keep the (now promoted-owned) masters pickable as linked instances.
    await markComponentsLinkable([...sharedIds]);

    const scenes = await listTable<SceneRow>(TABLES.scenes);
    const sceneByVariant = new Map(
      scenes
        .filter((s) => s.ownerType === "variant")
        .map((s) => [s.ownerId, s.graphJSON] as const),
    );

    // New main: inline each linked instance back into owned, embedded content.
    if (promotedScene) {
      const embedded = materializeInstancesInGraph(
        promotedScene.graphJSON,
        (node) => !!node.instanceOf && sharedIds.has(node.instanceOf.componentId),
        (vid) => sceneByVariant.get(vid) ?? null,
      );
      if (embedded) {
        await upsertScene(
          { ownerType: "variant", ownerId: promoted.id, graphJSON: embedded },
          { propagate: true },
        );
      }
    }

    // Old main: collapse only the still-shared subtrees into linked instances of the new
    // main. Dropped children are left embedded as the demoted main's own local copy.
    if (oldMainScene) {
      const linked = linkifyChildComponentsInGraph(
        oldMainScene.graphJSON,
        sharedChildren.map((c) => ({
          id: c.id,
          activeVariantId: c.activeVariantId,
          sourceNodeId: c.sourceNodeId ?? null,
          name: c.name,
        })),
      );
      if (linked && linked !== oldMainScene.graphJSON) {
        await upsertScene(
          { ownerType: "variant", ownerId: oldMain.id, graphJSON: linked },
          // The demoted old main's composition changed (embedded subtrees became
          // linked instances), so its ancestors' thumbnails must regenerate too
          // (Versioning.md §11) — propagate like the promoted scene above.
          { propagate: true },
        );
      }
    }
  }
  // Ownership edges were re-homed directly above (2b) — no field-derived reconcile.
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

  await primeEdgeIndex();
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
  const cloneVariantMap = new Map(allVariants.map((v) => [v.id, v]));
  const childrenOfVariant = (variantId: string) =>
    allComponents.filter(
      (c) => (parentVariantIdOf(c.id, cloneVariantMap)) === variantId,
    );

  // (cloneComponentId → owner variant) — clones are version-owned; ownership is the
  // edge now, so we track the owner here and emit `variant owns component` below.
  const cloneOwnerEdges: Array<{ componentId: string; ownerVariantId: string }> = [];

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
        linkable: false,
        activeVariantId: newActiveVariantId,
        createdAt: t,
        updatedAt: t,
      }),
    );
    // Owned by the new version's variant — a version-scoped local copy.
    cloneOwnerEdges.push({ componentId: newComponentId, ownerVariantId: parentVariantId });

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
    // Emit each clone's `owns` edge (version-owned → `variant owns component`).
    for (const e of cloneOwnerEdges) {
      await setOwner(
        { type: "variant", id: e.ownerVariantId },
        { type: "component", id: e.componentId },
      );
    }
  }
  for (const scene of newScenes) {
    await upsertScene(
      { ownerType: "variant", ownerId: scene.ownerId, graphJSON: scene.graphJSON },
      { propagate: false },
    );
  }
}
