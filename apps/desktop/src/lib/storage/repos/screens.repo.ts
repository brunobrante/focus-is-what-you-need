import type { ScreenVariant } from "@/lib/data/types";
import { normalizeReferenceRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
  type InstanceDeleteStrategy,
} from "@/lib/storage/repos/components.repo";
import {
  countInstanceUsages,
  detachInstancesOfComponents,
  mainVariantIdForScreen,
  removeInstancesOfComponents,
} from "@/lib/storage/repos/scenes.repo";
import { duplicateVariant } from "@/lib/storage/repos/variants.repo";
import type {
  ComponentRow,
  ReferenceRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.screens;

export async function listScreens(): Promise<ScreenRow[]> {
  return listTable<ScreenRow>(KEY);
}

export async function listScreensByProject(projectId: string): Promise<ScreenRow[]> {
  const rows = await listScreens();
  return rows
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => a.order - b.order);
}

export async function getScreen(id: string): Promise<ScreenRow | null> {
  const rows = await listScreens();
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * Point a screen at a different variant (its active version). Mirrors
 * `setActiveVariant` for components — `activeVariantId` owns the editable scene.
 */
export async function setActiveScreenVariant(
  screenId: string,
  variantId: string,
): Promise<ScreenRow | null> {
  const rows = await listScreens();
  const idx = rows.findIndex((s) => s.id === screenId);
  if (idx < 0) return null;
  if (rows[idx]!.activeVariantId === variantId) return rows[idx]!;
  const next: ScreenRow = { ...rows[idx]!, activeVariantId: variantId, updatedAt: now() };
  const nextRows = [...rows];
  nextRows[idx] = next;
  await replaceTable<ScreenRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

export async function findScreenByTitle(
  projectId: string,
  title: string,
): Promise<ScreenRow | null> {
  const rows = await listScreens();
  const match = rows.find(
    (r) =>
      r.projectId === projectId && r.title.toLowerCase() === title.toLowerCase(),
  );
  return match ?? null;
}

export async function bulkInsertScreens(rows: ScreenRow[]): Promise<void> {
  await replaceTable<ScreenRow>(KEY, rows);
  notify(KEY);
}

export async function createScreen(input: {
  projectId: string;
  title: string;
  variant?: ScreenVariant;
}): Promise<ScreenRow> {
  const rows = await listScreens();
  const projectRows = rows.filter((r) => r.projectId === input.projectId);
  const order =
    projectRows.reduce((max, r) => (r.order > max ? r.order : max), -1) + 1;
  const t = now();
  const screenId = newId();
  const variantId = newId();

  // A screen is a master that owns a variant chain; its main variant (order 0) owns
  // the editable scene, exactly like a component.
  const mainVariant: VariantRow = {
    id: variantId,
    ownerKind: "screen",
    ownerId: screenId,
    name: "Default",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  };
  const created: ScreenRow = {
    id: screenId,
    projectId: input.projectId,
    title: input.title,
    variant: input.variant ?? "blank",
    order,
    activeVariantId: variantId,
    createdAt: t,
    updatedAt: t,
  };

  const variants = await listTable<VariantRow>(TABLES.variants);
  await replaceTable<VariantRow>(TABLES.variants, [mainVariant, ...variants]);
  await replaceTable<ScreenRow>(KEY, [...rows, created]);
  notify(KEY);
  notify(TABLES.variants);
  return created;
}

/**
 * Creates a new version of a screen — a new variant owned by the screen master, exactly
 * like creating a new variant of a component. Returns the created variant.
 *
 *  - "linked": the frame and non-component content are copied, but every top-level
 *    child component is collapsed into a linked instance pointing at the original
 *    child master. Editing a master then reflects in this version too.
 *  - "copy": the scene graph is duplicated verbatim (fully independent).
 *
 * The new variant is duplicated from the screen's main variant (its embedding scene).
 */
export async function createScreenVersion(input: {
  screenId: string;
  mode: "copy" | "linked";
}): Promise<VariantRow | null> {
  const source = await getScreen(input.screenId);
  if (!source) return null;

  const variants = await listTable<VariantRow>(TABLES.variants);
  const mainVariantId = mainVariantIdForScreen(variants, input.screenId) ?? source.activeVariantId;

  return duplicateVariant({
    ownerKind: "screen",
    ownerId: source.id,
    sourceVariantId: mainVariantId,
    name: source.title,
    mode: input.mode,
  });
}

export async function updateScreen(
  screenId: string,
  patch: Partial<Pick<ScreenRow, "title" | "variant" | "activeVariantId">>,
): Promise<ScreenRow | null> {
  const rows = await listScreens();
  const idx = rows.findIndex((screen) => screen.id === screenId);
  if (idx < 0) return null;

  const current = rows[idx]!;
  const next: ScreenRow = {
    ...current,
    ...patch,
    title: patch.title?.trim() || current.title,
    updatedAt: now(),
  };

  const nextRows = [...rows];
  nextRows[idx] = next;
  await replaceTable<ScreenRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

/**
 * Collects all component ids owned (transitively) by a screen: its top-level
 * components (parentVariantId === null) PLUS any component parented to one of the
 * screen's version variants — copy-mode versions own independent child components
 * there — and the full subtree under each.
 */
function collectScreenComponentIds(
  screenId: string,
  components: ComponentRow[],
  variants: VariantRow[],
): Set<string> {
  const screenVariantIds = new Set(
    variants.filter((v) => v.ownerKind === "screen" && v.ownerId === screenId).map((v) => v.id),
  );
  const rootIds = components
    .filter(
      (c) =>
        (c.screenId === screenId && c.parentVariantId === null) ||
        (c.parentVariantId != null && screenVariantIds.has(c.parentVariantId)),
    )
    .map((c) => c.id);
  const ids = new Set<string>();
  for (const id of rootIds) {
    collectComponentTreeIds(id, components, variants).forEach((childId) => ids.add(childId));
  }
  return ids;
}

/** Collects all component ids owned (transitively) by a screen. */
async function screenComponentIds(screenId: string): Promise<Set<string>> {
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  return collectScreenComponentIds(screenId, components, variants);
}

/** Number of linked instances elsewhere that reference any of this screen's components. */
export async function countScreenInstanceUsages(screenId: string): Promise<number> {
  return countInstanceUsages(await screenComponentIds(screenId));
}

export async function deleteScreen(
  screenId: string,
  opts?: { instanceStrategy?: InstanceDeleteStrategy },
): Promise<void> {
  const screens = await listScreens();
  const screen = screens.find((r) => r.id === screenId);
  if (!screen) return;

  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const componentIds = collectScreenComponentIds(screenId, components, variants);
  // Variants to delete: the screen's own version variants, plus every variant owned
  // by the screen's (transitive) components.
  const variantIds = new Set(
    variants
      .filter(
        (v) =>
          (v.ownerKind === "screen" && v.ownerId === screenId) ||
          (v.ownerKind === "component" && componentIds.has(v.ownerId)),
      )
      .map((v) => v.id),
  );

  // Resolve linked instances of this screen's components before they disappear.
  if (opts?.instanceStrategy === "detach") {
    await detachInstancesOfComponents(componentIds);
  } else if (opts?.instanceStrategy === "cascade") {
    await removeInstancesOfComponents(componentIds);
  }

  await replaceTable<ScreenRow>(
    KEY,
    screens.filter((r) => r.id !== screenId),
  );
  await replaceTable<ComponentRow>(
    TABLES.components,
    components.filter((c) => !componentIds.has(c.id)),
  );
  await replaceTable<VariantRow>(
    TABLES.variants,
    variants.filter((v) => !variantIds.has(v.id)),
  );

  const references = await listTable<ReferenceRow>(TABLES.references);
  await replaceTable<ReferenceRow>(
    TABLES.references,
    references
      .map((reference) => normalizeReferenceRow(reference))
      .map((reference) => {
        const attachments = reference.attachments.filter(
          (attachment) =>
            attachment.screenId !== screenId &&
            !componentIds.has(attachment.componentId ?? ""),
        );
        return {
          ...reference,
          attachments,
          projectIds: Array.from(new Set(attachments.map((attachment) => attachment.projectId))),
        };
      })
      .filter((reference) => reference.projectIds.length > 0),
  );

  const scenes = await listTable<SceneRow>(TABLES.scenes);
  await replaceTable<SceneRow>(
    TABLES.scenes,
    scenes.filter((s) => !variantIds.has(s.ownerId)),
  );

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  await replaceTable<ThumbnailRow>(
    TABLES.thumbnails,
    thumbnails.filter((t) => !variantIds.has(t.ownerId)),
  );

  notify(KEY);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}
