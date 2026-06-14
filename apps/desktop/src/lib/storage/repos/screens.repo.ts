import type { ScreenVariant } from "@/lib/data/types";
import { normalizeReferenceRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
  listTopLevelByScreen,
  type InstanceDeleteStrategy,
} from "@/lib/storage/repos/components.repo";
import {
  countInstanceUsages,
  detachInstancesOfComponents,
  getSceneByOwner,
  linkifyChildComponentsInGraph,
  removeInstancesOfComponents,
  upsertScene,
} from "@/lib/storage/repos/scenes.repo";
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
 * The version siblings of a screen (including itself), derived from an already-loaded
 * screens array. A screen with no version group is its own sole version.
 */
export function screenVersionsFromList(
  screens: ScreenRow[],
  screen: ScreenRow | null | undefined,
): ScreenRow[] {
  if (!screen) return [];
  if (!screen.versionGroupId) return [screen];
  return screens
    .filter((s) => s.versionGroupId === screen.versionGroupId)
    .sort((a, b) => (a.versionIndex ?? 1) - (b.versionIndex ?? 1) || a.createdAt - b.createdAt);
}

/**
 * The stable version tag for a screen ("V1", "V2", …), or null when the screen is
 * standalone (not part of a version group). V1 is the original ("main").
 */
export function screenVersionLabel(screen: ScreenRow | null | undefined): string | null {
  if (!screen?.versionGroupId) return null;
  return `V${screen.versionIndex ?? 1}`;
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
  const created: ScreenRow = {
    id: newId(),
    projectId: input.projectId,
    title: input.title,
    variant: input.variant ?? "blank",
    order,
    createdAt: t,
    updatedAt: t,
  };
  await replaceTable<ScreenRow>(KEY, [...rows, created]);
  notify(KEY);
  return created;
}

/**
 * Creates a new version of a screen as a sibling screen in the same project.
 *
 *  - "linked": the frame and non-component content are copied, but every top-level
 *    child component is collapsed into a linked instance pointing at the original
 *    child master. Editing a master then reflects in this version too.
 *  - "copy": the scene graph is duplicated verbatim (fully independent).
 *
 * The source and the new screen share a `versionGroupId` so the screen detail page
 * can list them together as versions of one another.
 */
export async function createScreenVersion(input: {
  screenId: string;
  mode: "copy" | "linked";
}): Promise<ScreenRow | null> {
  const source = await getScreen(input.screenId);
  if (!source) return null;

  // Ensure both screens share a version group; the original becomes V1 ("main").
  const groupId = source.versionGroupId ?? newId();
  if (!source.versionGroupId) {
    await updateScreen(source.id, { versionGroupId: groupId, versionIndex: 1 });
  }

  // Next stable version index = max existing in the group + 1.
  const screens = await listScreens();
  const nextIndex =
    screens
      .filter((s) => s.versionGroupId === groupId)
      .reduce((max, s) => Math.max(max, s.versionIndex ?? 1), 0) + 1;

  // All versions share the same name — the tag (V2, V3…) is the identifier.
  const created = await createScreen({
    projectId: source.projectId,
    title: source.title,
    variant: source.variant,
  });
  const versioned = await updateScreen(created.id, {
    versionGroupId: groupId,
    versionIndex: nextIndex,
  });

  const sourceScene = await getSceneByOwner("screen", input.screenId);
  if (sourceScene) {
    let graphJSON = sourceScene.graphJSON;
    if (input.mode === "linked") {
      const children = await listTopLevelByScreen(source.projectId, input.screenId);
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
      { ownerType: "screen", ownerId: created.id, graphJSON },
      { propagate: false },
    );
  }

  return versioned ?? created;
}

export async function updateScreen(
  screenId: string,
  patch: Partial<Pick<ScreenRow, "title" | "variant" | "versionGroupId" | "versionIndex">>,
): Promise<ScreenRow | null> {
  const rows = await listScreens();
  const idx = rows.findIndex((screen) => screen.id === screenId);
  if (idx < 0) return null;

  const current = rows[idx]!;
  const t = now();
  const next: ScreenRow = {
    ...current,
    ...patch,
    title: patch.title?.trim() || current.title,
    updatedAt: t,
  };

  // All members of a version group share the same name: a title change propagates
  // to every sibling in the group.
  const titleChanged = next.title !== current.title;
  const groupId = next.versionGroupId ?? current.versionGroupId ?? null;

  let nextRows = [...rows];
  nextRows[idx] = next;
  if (titleChanged && groupId) {
    nextRows = nextRows.map((r) =>
      r.id !== screenId && r.versionGroupId === groupId
        ? { ...r, title: next.title, updatedAt: t }
        : r,
    );
  }

  await replaceTable<ScreenRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

/** Collects all component ids owned (transitively) by a screen. */
async function screenComponentIds(screenId: string): Promise<Set<string>> {
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const topLevelIds = components
    .filter((c) => c.screenId === screenId && c.parentVariantId === null)
    .map((c) => c.id);
  const ids = new Set<string>();
  for (const id of topLevelIds) {
    collectComponentTreeIds(id, components, variants).forEach((childId) => ids.add(childId));
  }
  return ids;
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
  const topLevelIds = components
    .filter((c) => c.screenId === screenId && c.parentVariantId === null)
    .map((c) => c.id);
  const componentIds = new Set<string>();
  for (const id of topLevelIds) {
    collectComponentTreeIds(id, components, variants).forEach((childId) =>
      componentIds.add(childId),
    );
  }
  const variantIds = new Set(
    variants.filter((v) => componentIds.has(v.componentId)).map((v) => v.id),
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
    scenes.filter(
      (s) =>
        !(s.ownerType === "screen" && s.ownerId === screenId) &&
        !(s.ownerType === "variant" && variantIds.has(s.ownerId)),
    ),
  );

  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  await replaceTable<ThumbnailRow>(
    TABLES.thumbnails,
    thumbnails.filter(
      (t) =>
        !(t.ownerType === "screen" && t.ownerId === screenId) &&
        !(t.ownerType === "variant" && variantIds.has(t.ownerId)),
    ),
  );

  notify(KEY);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}
