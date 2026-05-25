import type { ScreenVariant } from "@/lib/data/types";
import { normalizeReferenceRow } from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  collectComponentTreeIds,
} from "@/lib/storage/repos/components.repo";
import type {
  ComponentRow,
  ReferenceRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.screens;

export async function listScreens(): Promise<ScreenRow[]> {
  return getTable<ScreenRow>(KEY);
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
  await setTable<ScreenRow>(KEY, rows);
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
  await setTable<ScreenRow>(KEY, [...rows, created]);
  notify(KEY);
  return created;
}

export async function updateScreen(
  screenId: string,
  patch: Partial<Pick<ScreenRow, "title" | "variant">>,
): Promise<ScreenRow | null> {
  const rows = await listScreens();
  const idx = rows.findIndex((screen) => screen.id === screenId);
  if (idx < 0) return null;

  const next: ScreenRow = {
    ...rows[idx]!,
    ...patch,
    title: patch.title?.trim() || rows[idx]!.title,
    updatedAt: now(),
  };
  const nextRows = [...rows];
  nextRows[idx] = next;
  await setTable<ScreenRow>(KEY, nextRows);
  notify(KEY);
  return next;
}

export async function deleteScreen(screenId: string): Promise<void> {
  const screens = await listScreens();
  const screen = screens.find((r) => r.id === screenId);
  if (!screen) return;

  const components = await getTable<ComponentRow>(TABLES.components);
  const variants = await getTable<VariantRow>(TABLES.variants);
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

  await setTable<ScreenRow>(
    KEY,
    screens.filter((r) => r.id !== screenId),
  );
  await setTable<ComponentRow>(
    TABLES.components,
    components.filter((c) => !componentIds.has(c.id)),
  );
  await setTable<VariantRow>(
    TABLES.variants,
    variants.filter((v) => !variantIds.has(v.id)),
  );

  const references = await getTable<ReferenceRow>(TABLES.references);
  await setTable<ReferenceRow>(
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

  const scenes = await getTable<SceneRow>(TABLES.scenes);
  await setTable<SceneRow>(
    TABLES.scenes,
    scenes.filter(
      (s) =>
        !(s.ownerType === "screen" && s.ownerId === screenId) &&
        !(s.ownerType === "variant" && variantIds.has(s.ownerId)),
    ),
  );

  const thumbnails = await getTable<ThumbnailRow>(TABLES.thumbnails);
  await setTable<ThumbnailRow>(
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
