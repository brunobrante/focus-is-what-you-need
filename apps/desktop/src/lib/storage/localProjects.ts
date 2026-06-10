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
} from "@/lib/storage/schema";
import { TABLES, listTable } from "@/lib/storage/store";

// SQLite (the `records` table) is the source of truth for projects. `.figx` is
// only an explicit, user-triggered export format — never written automatically
// and never read back automatically.
const FIGX_FORMAT_VERSION = 1;

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

let readyPromise: Promise<void> | null = null;

export function isLocalProject(project: ProjectRow | null | undefined): boolean {
  return Boolean(project && project.source !== "mock");
}

export async function deleteLocalFigxProjectFile(projectId: string): Promise<void> {
  await invoke("delete_figx_project", { projectId }).catch(() => undefined);
}

export async function ensureLocalProjectsLoaded(): Promise<void> {
  if (!readyPromise) {
    readyPromise = ensureSeededAndMigrated();
  }
  return readyPromise;
}

/**
 * Explicitly export a single local project to a `.figx` file in the workspace.
 * This is the only path that writes `.figx` — it runs on user action, never
 * automatically. Returns false if the project isn't a local project.
 */
export async function exportLocalProjectToFigx(projectId: string): Promise<boolean> {
  await ensureLocalProjectsLoaded();
  const archives = await buildLocalProjectArchives();
  const target = archives.find(({ archive }) => archive.project.id === projectId);
  if (!target) return false;
  const project: FigxProjectSyncInput = {
    project_id: target.archive.project.id,
    project_name: target.archive.project.name,
    archive_json: JSON.stringify(target.archive),
    reference_ids: target.referenceIds,
  };
  await invoke("export_figx_project", { project });
  return true;
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
