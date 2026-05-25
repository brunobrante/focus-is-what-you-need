import type { ProjectType } from "@/lib/data/types";
import { createDefaultDesignSystem, normalizeProjectRow, normalizeReferenceRow } from "@/lib/storage/defaults";
import { deleteLocalFigxProjectFile, isLocalProject } from "@/lib/storage/localProjects";
import { newId, now } from "@/lib/storage/ids";
import { collectComponentTreeIds } from "@/lib/storage/repos/components.repo";
import type {
  ComponentRow,
  ProjectDesignSystem,
  ProjectRow,
  ReferenceRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
} from "@/lib/storage/schema";
import { ensureSeededAndMigrated } from "@/lib/storage/seed";
import { TABLES, getTable, notify, setTable } from "@/lib/storage/store";

const KEY = TABLES.projects;

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await getTable<ProjectRow>(KEY);
  return rows.map(normalizeProjectRow);
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const rows = await listProjects();
  return rows.find((r) => r.id === id) ?? null;
}

export async function findProjectByName(name: string): Promise<ProjectRow | null> {
  const rows = await listProjects();
  const match = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
  return match ?? null;
}

export async function createProject(input: {
  name: string;
  type: ProjectType;
  source?: ProjectRow["source"];
  thumbnailDataUrl?: string | null;
  description?: string | null;
  previewScreenId?: string | null;
  designSystem?: ProjectDesignSystem;
}): Promise<ProjectRow> {
  await ensureSeededAndMigrated();
  const t = now();
  const row = normalizeProjectRow({
    id: newId(),
    name: input.name,
    type: input.type,
    source: input.source ?? "local",
    thumbnailDataUrl: input.thumbnailDataUrl ?? null,
    description: input.description ?? null,
    previewScreenId: input.previewScreenId ?? null,
    designSystem: input.designSystem ?? createDefaultDesignSystem(),
    createdAt: t,
    updatedAt: t,
  });
  const rows = await listProjects();
  await setTable<ProjectRow>(KEY, [row, ...rows]);
  notify(KEY);
  return row;
}

export async function updateProject(
  projectId: string,
  patch: Partial<
    Pick<
      ProjectRow,
      "name" | "thumbnailDataUrl" | "description" | "previewScreenId" | "designSystem"
    >
  >,
): Promise<ProjectRow | null> {
  const rows = await listProjects();
  const idx = rows.findIndex((project) => project.id === projectId);
  if (idx < 0) return null;

  const next = normalizeProjectRow({
    ...rows[idx]!,
    ...patch,
    updatedAt: now(),
  });
  const updatedRows = [...rows];
  updatedRows[idx] = next;
  await setTable<ProjectRow>(KEY, updatedRows);
  notify(KEY);
  return next;
}

export async function deleteProject(projectId: string): Promise<void> {
  const projects = await listProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const screens = await getTable<ScreenRow>(TABLES.screens);
  const components = await getTable<ComponentRow>(TABLES.components);
  const variants = await getTable<VariantRow>(TABLES.variants);
  const screenIds = new Set(
    screens.filter((s) => s.projectId === projectId).map((s) => s.id),
  );
  const roots = components
    .filter((c) => c.projectId === projectId && c.parentVariantId === null)
    .map((c) => c.id);
  const componentIds = new Set<string>();
  for (const id of roots) {
    collectComponentTreeIds(id, components, variants).forEach((childId) =>
      componentIds.add(childId),
    );
  }
  for (const c of components) {
    if (c.projectId === projectId) componentIds.add(c.id);
  }
  const variantIds = new Set(
    variants.filter((v) => componentIds.has(v.componentId)).map((v) => v.id),
  );

  await setTable<ProjectRow>(
    KEY,
    projects.filter((p) => p.id !== projectId),
  );
  await setTable<ScreenRow>(
    TABLES.screens,
    screens.filter((s) => !screenIds.has(s.id)),
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
      .map((reference) => ({
        ...reference,
        projectIds: reference.projectIds.filter((id) => id !== projectId),
        attachments: reference.attachments.filter(
          (attachment) =>
            attachment.projectId !== projectId &&
            !screenIds.has(attachment.screenId ?? "") &&
            !componentIds.has(attachment.componentId ?? ""),
        ),
      }))
      .filter((reference) => reference.projectIds.length > 0),
  );

  const scenes = await getTable<SceneRow>(TABLES.scenes);
  await setTable<SceneRow>(
    TABLES.scenes,
    scenes.filter(
      (s) =>
        !(s.ownerType === "screen" && screenIds.has(s.ownerId)) &&
        !(s.ownerType === "variant" && variantIds.has(s.ownerId)),
    ),
  );

  const thumbnails = await getTable<ThumbnailRow>(TABLES.thumbnails);
  await setTable<ThumbnailRow>(
    TABLES.thumbnails,
    thumbnails.filter(
      (t) =>
        !(t.ownerType === "screen" && screenIds.has(t.ownerId)) &&
        !(t.ownerType === "variant" && variantIds.has(t.ownerId)),
    ),
  );

  if (isLocalProject(project)) {
    await deleteLocalFigxProjectFile(project.id);
  }

  notify(KEY);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}

export async function bulkInsertProjects(rows: ProjectRow[]): Promise<void> {
  await setTable<ProjectRow>(KEY, rows.map(normalizeProjectRow));
  notify(KEY);
}
