import type { ProjectType } from "@/lib/data/types";
import { createDefaultDesignSystem, normalizeProjectRow, normalizeReferenceRow } from "@/lib/storage/defaults";
import { deleteLocalFigxProjectFile, isLocalProject } from "@/lib/storage/localProjects";
import { newId, now } from "@/lib/storage/ids";
import { collectComponentTreeIds } from "@/lib/storage/repos/components.repo";
import { parentVariantIdOf } from "@/application/graph/componentOwnership";
import type {
  ComponentRow,
  ProjectDesignSystem,
  ProjectRow,
  ReferenceRow,
  SceneRow,
  ScreenRow,
  ThumbnailRow,
  VariantRow,
  WorkspaceRow,
} from "@/lib/storage/schema";
import { ensureSeededAndMigrated } from "@/lib/storage/seed";
import { TABLES, listTable, notify, replaceTable } from "@/lib/storage/store";

const KEY = TABLES.projects;

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await listTable<ProjectRow>(KEY);
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
  await replaceTable<ProjectRow>(KEY, [row, ...rows]);
  notify(KEY);
  return row;
}

export async function updateProject(
  projectId: string,
  patch: Partial<
    Pick<
      ProjectRow,
      "name" | "icon" | "thumbnailDataUrl" | "description" | "previewScreenId" | "designSystem"
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
  await replaceTable<ProjectRow>(KEY, updatedRows);
  notify(KEY);
  return next;
}

export async function deleteProject(projectId: string): Promise<void> {
  const projects = await listProjects();
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;

  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const screenIds = new Set(
    screens.filter((s) => s.projectId === projectId).map((s) => s.id),
  );
  const variantLookup = new Map(variants.map((v) => [v.id, v]));
  const roots = components
    .filter(
      (c) =>
        c.projectId === projectId &&
        (parentVariantIdOf(c.id, variantLookup) ?? c.parentVariantId) === null,
    )
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
  // Variants owned by this project's screens (versions) or components.
  const variantIds = new Set(
    variants
      .filter((v) =>
        v.ownerKind === "screen"
          ? screenIds.has(v.ownerId)
          : componentIds.has(v.ownerId),
      )
      .map((v) => v.id),
  );

  await replaceTable<ProjectRow>(
    KEY,
    projects.filter((p) => p.id !== projectId),
  );

  // Drop the project from any workspace that owns it so per-workspace counts
  // and scoping stay accurate.
  const workspaces = await listTable<WorkspaceRow>(TABLES.workspaces);
  if (workspaces.some((w) => w.projectIds.includes(projectId))) {
    await replaceTable<WorkspaceRow>(
      TABLES.workspaces,
      workspaces.map((w) =>
        w.projectIds.includes(projectId)
          ? { ...w, projectIds: w.projectIds.filter((id) => id !== projectId), updatedAt: now() }
          : w,
      ),
    );
    notify(TABLES.workspaces);
  }

  await replaceTable<ScreenRow>(
    TABLES.screens,
    screens.filter((s) => !screenIds.has(s.id)),
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
  await replaceTable<ProjectRow>(KEY, rows.map(normalizeProjectRow));
  notify(KEY);
}
