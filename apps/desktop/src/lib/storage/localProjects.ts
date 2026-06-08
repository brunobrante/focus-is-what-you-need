import { invoke } from "@tauri-apps/api/core";
import {
  normalizeComponentRow,
  normalizeProjectRow,
  normalizeReferenceRow,
} from "@/lib/storage/defaults";
import { ensureSeededAndMigrated } from "@/lib/storage/seed";
import {
  SCHEMA_VERSION,
  type ComponentPlacementRow,
  type ComponentRow,
  type HistoryEntryRow,
  type ProjectRow,
  type ReferenceRow,
  type SceneRow,
  type ScreenRow,
  type ScreenVersionRow,
  type SystemDesignRow,
  type ThumbnailRow,
  type VariantRow,
  type WorkspaceRow,
} from "@/lib/storage/schema";
import { TABLES, listTable, notify, replaceTable, subscribe } from "@/lib/storage/store";

const FIGX_FORMAT_VERSION = 1;
const AUTOSAVE_DELAY_MS = 650;

type FigxArchive = {
  format: "figx";
  formatVersion: number;
  schemaVersion: number;
  savedAt: number;
  project: ProjectRow;
  tables: {
    screens: ScreenRow[];
    components: ComponentRow[];
    variants: VariantRow[];
    references: ReferenceRow[];
    scenes: SceneRow[];
    thumbnails: ThumbnailRow[];
    screenVersions: ScreenVersionRow[];
    placements: ComponentPlacementRow[];
    history: HistoryEntryRow[];
    systemDesigns: SystemDesignRow[];
  };
};

type FigxProjectSyncInput = {
  project_id: string;
  project_name: string;
  archive_json: string;
  reference_ids: string[];
};

const PERSISTED_TABLES = [
  TABLES.projects,
  TABLES.screens,
  TABLES.components,
  TABLES.variants,
  TABLES.references,
  TABLES.scenes,
  TABLES.thumbnails,
  TABLES.screenVersions,
  TABLES.placements,
  TABLES.history,
  TABLES.systemDesigns,
] as const;

let readyPromise: Promise<void> | null = null;
let autosaveStarted = false;
let autosaveTimer: number | null = null;
let autosaveRunning = false;
let autosavePending = false;

export function isLocalProject(project: ProjectRow | null | undefined): boolean {
  return Boolean(project && project.source !== "mock");
}

export async function deleteLocalFigxProjectFile(projectId: string): Promise<void> {
  await invoke("delete_figx_project", { projectId }).catch(() => undefined);
}

export async function ensureLocalProjectsLoaded(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await ensureSeededAndMigrated();
      try {
        await importLocalFigxProjects();
      } catch (error) {
        console.warn("[storage] Failed to load local .figx projects", error);
      }
    })();
  }
  return readyPromise;
}

export function startLocalFigxAutosave(): () => void {
  if (autosaveStarted) return () => undefined;
  autosaveStarted = true;

  const unsubscribe = PERSISTED_TABLES.map((table) =>
    subscribe(table, () => scheduleLocalFigxSync()),
  );

  void ensureLocalProjectsLoaded().then(() => scheduleLocalFigxSync());

  return () => {
    unsubscribe.forEach((fn) => fn());
    autosaveStarted = false;
    if (autosaveTimer != null) {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  };
}

async function importLocalFigxProjects(): Promise<void> {
  let archiveJSONs: string[] = [];
  try {
    archiveJSONs = await invoke<string[]>("read_local_figx_projects");
  } catch {
    return;
  }
  const archives = archiveJSONs
    .map(parseArchive)
    .filter((archive): archive is FigxArchive => archive != null);
  if (archives.length === 0) return;

  const importedProjectIds = new Set(archives.map((archive) => archive.project.id));
  const importedScreenIds = new Set<string>();
  const importedComponentIds = new Set<string>();
  const importedVariantIds = new Set<string>();
  const importedScreenVersionIds = new Set<string>();

  for (const archive of archives) {
    archive.tables.screens.forEach((row) => importedScreenIds.add(row.id));
    archive.tables.components.forEach((row) => importedComponentIds.add(row.id));
    archive.tables.variants.forEach((row) => importedVariantIds.add(row.id));
    archive.tables.screenVersions.forEach((row) => importedScreenVersionIds.add(row.id));
  }

  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const references = await listTable<ReferenceRow>(TABLES.references);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const workspaces = await listTable<WorkspaceRow>(TABLES.workspaces);
  const screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  const placements = await listTable<ComponentPlacementRow>(TABLES.placements);
  const history = await listTable<HistoryEntryRow>(TABLES.history);
  const systemDesigns = await listTable<SystemDesignRow>(TABLES.systemDesigns);

  const importedProjects = archives.map((archive) =>
    normalizeProjectRow({ ...archive.project, source: "local" }),
  );
  const importedScreens = archives.flatMap((archive) => archive.tables.screens);
  const importedComponents = archives.flatMap((archive) =>
    archive.tables.components.map(normalizeComponentRow),
  );
  const importedVariants = archives.flatMap((archive) => archive.tables.variants);
  const importedReferences = archives.flatMap((archive) =>
    archive.tables.references.map(normalizeReferenceRow),
  );
  const importedScenes = archives.flatMap((archive) => archive.tables.scenes);
  const importedThumbnails = archives.flatMap((archive) => archive.tables.thumbnails);
  const importedScreenVersions = archives.flatMap((archive) => archive.tables.screenVersions);
  const importedPlacements = archives.flatMap((archive) => archive.tables.placements);
  const importedHistory = archives.flatMap((archive) => archive.tables.history);
  const importedSystemDesigns = archives.flatMap((archive) => archive.tables.systemDesigns);

  const nextProjects = [
    ...projects.filter((project) => !importedProjectIds.has(project.id)),
    ...importedProjects,
  ];
  const nextScreens = [
    ...screens.filter((screen) => !importedProjectIds.has(screen.projectId)),
    ...importedScreens,
  ];
  const nextComponents = [
    ...components.filter((component) => !importedProjectIds.has(component.projectId)),
    ...importedComponents,
  ];
  const nextVariants = [
    ...variants.filter((variant) => !importedComponentIds.has(variant.componentId)),
    ...importedVariants,
  ];
  const nextReferences = mergeImportedReferences(
    references,
    importedReferences,
    importedProjectIds,
  );
  const nextScenes = [
    ...scenes.filter(
      (scene) =>
        !(
          (scene.ownerType === "screen" && importedScreenIds.has(scene.ownerId)) ||
          (scene.ownerType === "variant" && importedVariantIds.has(scene.ownerId))
        ),
    ),
    ...importedScenes,
  ];
  const nextThumbnails = [
    ...thumbnails.filter(
      (thumbnail) =>
        !(
          (thumbnail.ownerType === "screen" && importedScreenIds.has(thumbnail.ownerId)) ||
          (thumbnail.ownerType === "variant" && importedVariantIds.has(thumbnail.ownerId))
        ),
    ),
    ...importedThumbnails,
  ];
  const nextScreenVersions = [
    ...screenVersions.filter((version) => !importedScreenIds.has(version.screenId)),
    ...importedScreenVersions,
  ];
  const nextPlacements = [
    ...placements.filter(
      (placement) =>
        !importedScreenVersionIds.has(placement.screenVersionId) &&
        !importedComponentIds.has(placement.componentId),
    ),
    ...importedPlacements,
  ];
  const nextHistory = [
    ...history.filter(
      (entry) =>
        !importedScreenIds.has(entry.targetId) && !importedComponentIds.has(entry.targetId),
    ),
    ...importedHistory,
  ];
  const nextSystemDesigns = [
    ...systemDesigns.filter(
      (design) => !(design.ownerScope === "project" && importedProjectIds.has(design.ownerId)),
    ),
    ...importedSystemDesigns,
  ];
  const nextWorkspaces = ensureWorkspaceProjectIds(
    workspaces,
    nextProjects.map((project) => project.id),
  );

  await replaceTable<ProjectRow>(TABLES.projects, nextProjects);
  await replaceTable<ScreenRow>(TABLES.screens, nextScreens);
  await replaceTable<ComponentRow>(TABLES.components, nextComponents);
  await replaceTable<VariantRow>(TABLES.variants, nextVariants);
  await replaceTable<ReferenceRow>(TABLES.references, nextReferences);
  await replaceTable<SceneRow>(TABLES.scenes, nextScenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, nextThumbnails);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, nextWorkspaces);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, nextScreenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, nextPlacements);
  await replaceTable<HistoryEntryRow>(TABLES.history, nextHistory);
  await replaceTable<SystemDesignRow>(TABLES.systemDesigns, nextSystemDesigns);

  PERSISTED_TABLES.forEach((table) => notify(table));
  notify(TABLES.workspaces);
}

function parseArchive(raw: string): FigxArchive | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FigxArchive>;
    if (parsed.format !== "figx" || !parsed.project || !parsed.tables) return null;
    return {
      format: "figx",
      formatVersion: parsed.formatVersion ?? FIGX_FORMAT_VERSION,
      schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION,
      savedAt: parsed.savedAt ?? Date.now(),
      project: parsed.project,
      tables: {
        screens: parsed.tables.screens ?? [],
        components: parsed.tables.components ?? [],
        variants: parsed.tables.variants ?? [],
        references: parsed.tables.references ?? [],
        scenes: parsed.tables.scenes ?? [],
        thumbnails: parsed.tables.thumbnails ?? [],
        screenVersions: parsed.tables.screenVersions ?? [],
        placements: parsed.tables.placements ?? [],
        history: parsed.tables.history ?? [],
        systemDesigns: parsed.tables.systemDesigns ?? [],
      },
    };
  } catch {
    return null;
  }
}

function mergeImportedReferences(
  current: ReferenceRow[],
  imported: ReferenceRow[],
  importedProjectIds: Set<string>,
): ReferenceRow[] {
  const withoutImportedProjects = current
    .map(normalizeReferenceRow)
    .map((reference) => {
      const attachments = reference.attachments.filter(
        (attachment) => !importedProjectIds.has(attachment.projectId),
      );
      return normalizeReferenceRow({
        ...reference,
        attachments,
        projectIds: Array.from(new Set(attachments.map((attachment) => attachment.projectId))),
      });
    })
    .filter((reference) => reference.projectIds.length > 0);

  const byId = new Map(withoutImportedProjects.map((reference) => [reference.id, reference]));
  for (const reference of imported.map(normalizeReferenceRow)) {
    const existing = byId.get(reference.id);
    if (!existing) {
      byId.set(reference.id, reference);
      continue;
    }
    byId.set(reference.id, {
      ...existing,
      ...reference,
      projectIds: Array.from(new Set([...existing.projectIds, ...reference.projectIds])),
      attachments: mergeAttachments(existing.attachments, reference.attachments),
    });
  }
  return Array.from(byId.values());
}

function mergeAttachments(
  left: ReferenceRow["attachments"],
  right: ReferenceRow["attachments"],
): ReferenceRow["attachments"] {
  const byKey = new Map<string, ReferenceRow["attachments"][number]>();
  for (const attachment of [...left, ...right]) {
    byKey.set(
      `${attachment.projectId}:${attachment.screenId ?? ""}:${attachment.componentId ?? ""}`,
      attachment,
    );
  }
  return Array.from(byKey.values());
}

function ensureWorkspaceProjectIds(
  workspaces: WorkspaceRow[],
  projectIds: string[],
): WorkspaceRow[] {
  if (workspaces.length === 0) {
    const t = Date.now();
    return [
      {
        id: crypto.randomUUID(),
        name: "workspace",
        projectIds,
        createdAt: t,
        updatedAt: t,
      },
    ];
  }
  const [first, ...rest] = workspaces;
  return [
    {
      ...first!,
      projectIds: Array.from(new Set([...first!.projectIds, ...projectIds])),
      updatedAt: Date.now(),
    },
    ...rest,
  ];
}

function scheduleLocalFigxSync(): void {
  if (autosaveTimer != null) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    void syncLocalFigxProjects();
  }, AUTOSAVE_DELAY_MS);
}

async function syncLocalFigxProjects(): Promise<void> {
  if (autosaveRunning) {
    autosavePending = true;
    return;
  }
  autosaveRunning = true;
  try {
    await ensureLocalProjectsLoaded();
    const archives = await buildLocalProjectArchives();
    const payload: FigxProjectSyncInput[] = archives.map(({ archive, referenceIds }) => ({
      project_id: archive.project.id,
      project_name: archive.project.name,
      archive_json: JSON.stringify(archive),
      reference_ids: referenceIds,
    }));
    if (payload.length === 0) return;
    await invoke("sync_figx_projects", { projects: payload }).catch(() => undefined);
  } finally {
    autosaveRunning = false;
    if (autosavePending) {
      autosavePending = false;
      scheduleLocalFigxSync();
    }
  }
}

async function buildLocalProjectArchives(): Promise<
  Array<{ archive: FigxArchive; referenceIds: string[] }>
> {
  const projects = (await listTable<ProjectRow>(TABLES.projects))
    .map(normalizeProjectRow)
    .filter(isLocalProject);
  if (projects.length === 0) return [];

  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  const variants = await listTable<VariantRow>(TABLES.variants);
  const references = (await listTable<ReferenceRow>(TABLES.references)).map(
    normalizeReferenceRow,
  );
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  const placements = await listTable<ComponentPlacementRow>(TABLES.placements);
  const history = await listTable<HistoryEntryRow>(TABLES.history);
  const systemDesigns = await listTable<SystemDesignRow>(TABLES.systemDesigns);

  return projects.map((project) => {
    const projectScreens = screens.filter((screen) => screen.projectId === project.id);
    const projectComponents = components.filter(
      (component) => component.projectId === project.id,
    );
    const projectScreenIds = new Set(projectScreens.map((screen) => screen.id));
    const projectComponentIds = new Set(projectComponents.map((component) => component.id));
    const projectVariants = variants.filter((variant) =>
      projectComponentIds.has(variant.componentId),
    );
    const projectVariantIds = new Set(projectVariants.map((variant) => variant.id));
    const projectReferences = references.filter((reference) =>
      reference.projectIds.includes(project.id),
    );
    const projectScreenVersions = screenVersions.filter((version) =>
      projectScreenIds.has(version.screenId),
    );
    const projectScreenVersionIds = new Set(
      projectScreenVersions.map((version) => version.id),
    );

    const archive: FigxArchive = {
      format: "figx",
      formatVersion: FIGX_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      project: { ...project, source: "local" },
      tables: {
        screens: projectScreens,
        components: projectComponents,
        variants: projectVariants,
        references: projectReferences,
        scenes: scenes.filter(
          (scene) =>
            (scene.ownerType === "screen" && projectScreenIds.has(scene.ownerId)) ||
            (scene.ownerType === "variant" && projectVariantIds.has(scene.ownerId)),
        ),
        thumbnails: thumbnails.filter(
          (thumbnail) =>
            (thumbnail.ownerType === "screen" && projectScreenIds.has(thumbnail.ownerId)) ||
            (thumbnail.ownerType === "variant" && projectVariantIds.has(thumbnail.ownerId)),
        ),
        screenVersions: projectScreenVersions,
        placements: placements.filter(
          (placement) =>
            projectScreenVersionIds.has(placement.screenVersionId) ||
            projectComponentIds.has(placement.componentId),
        ),
        history: history.filter(
          (entry) =>
            projectScreenIds.has(entry.targetId) || projectComponentIds.has(entry.targetId),
        ),
        systemDesigns: systemDesigns.filter(
          (design) => design.ownerScope === "project" && design.ownerId === project.id,
        ),
      },
    };

    return {
      archive,
      referenceIds: projectReferences.map((reference) => reference.id),
    };
  });
}
