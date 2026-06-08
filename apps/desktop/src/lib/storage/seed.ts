import {
  getCanvasMockBundleForScreen,
  type CanvasMockData,
  type MockComponentSeed,
} from "@/components/mocks/data/canvasMocks";
import { PROJECTS, screensForProject } from "@/lib/data/projects";
import {
  createDefaultDesignSystem,
  normalizeComponentRow,
  normalizeProjectRow,
} from "@/lib/storage/defaults";
import { newId, now } from "@/lib/storage/ids";
import {
  SCHEMA_VERSION,
  type ComponentPlacementRow,
  type ComponentRow,
  type Meta,
  type ProjectRow,
  type ReferenceRow,
  type SceneRow,
  type ScreenRow,
  type ScreenVersionRow,
  type ThumbnailRow,
  type VariantRow,
  type WorkspaceRow,
} from "@/lib/storage/schema";
import { TABLES, getMeta, listTable, notify, replaceTable, setMeta } from "@/lib/storage/store";

async function readMeta(): Promise<Meta> {
  return (
    (await getMeta<Meta>()) ?? {
      schemaVersion: SCHEMA_VERSION,
      seededAt: null,
    }
  );
}

async function writeMeta(meta: Meta): Promise<void> {
  setMeta<Meta>(meta);
}

export async function ensureSeededAndMigrated(): Promise<void> {
  const meta = await readMeta();

  if (meta.seededAt != null && meta.schemaVersion === SCHEMA_VERSION) {
    await ensureFactoryMocksPresent();
    return;
  }

  // Fresh install or schema version mismatch: nuke and reseed.
  await firstBootSeedV5();
  await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: now() });
}

export async function resetToFactoryData(): Promise<void> {
  await firstBootSeedV5();
  await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: now() });
  notify(TABLES.meta);
  notify(TABLES.workspaces);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

async function firstBootSeedV5(): Promise<void> {
  const t = now();

  const projects: ProjectRow[] = PROJECTS.map((p) => ({
    id: newId(),
    name: p.name,
    type: p.type,
    source: "mock",
    thumbnailDataUrl: null,
    description: null,
    previewScreenId: null,
    designSystem: createDefaultDesignSystem(),
    createdAt: t,
    updatedAt: t,
  }));

  const screens: ScreenRow[] = [];
  for (const project of projects) {
    screensForProject(project).forEach((s, idx) => {
      screens.push({
        id: newId(),
        projectId: project.id,
        title: s.title,
        variant: s.variant,
        order: idx,
        createdAt: t,
        updatedAt: t,
      });
    });
  }

  const components: ComponentRow[] = [];
  const variants: VariantRow[] = [];
  const references: ReferenceRow[] = [];
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));
  const scenes: SceneRow[] = [];
  const thumbnails: ThumbnailRow[] = [];

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) continue;
    scenes.push(createMockSceneRow(screen.id, "screen", bundle.screen, t));
    thumbnails.push(createMockThumbnailRow(screen.id, "screen", bundle.screen, t));
    seedComponentTree({
      projectId: screen.projectId,
      parent: { kind: "screen", screenId: screen.id },
      nodes: bundle.components,
      components,
      variants,
      scenes,
      thumbnails,
      t,
    });
  }

  const workspace: WorkspaceRow = {
    id: newId(),
    name: "workspace",
    projectIds: projects.map((p) => p.id),
    createdAt: t,
    updatedAt: t,
  };

  const screenVersions: ScreenVersionRow[] = screens.map((screen) => ({
    id: newId(),
    screenId: screen.id,
    label: "Default",
    createdAt: t,
  }));

  const screenVersionByScreenId = new Map(
    screenVersions.map((sv) => [sv.screenId, sv]),
  );
  const placements: ComponentPlacementRow[] = [];
  for (const component of components) {
    if (!component.screenId || component.parentVariantId !== null) continue;
    const screenVersion = screenVersionByScreenId.get(component.screenId);
    if (!screenVersion) continue;
    placements.push({
      id: newId(),
      screenVersionId: screenVersion.id,
      componentId: component.id,
      versionId: component.activeVariantId,
      slot: component.name.toLowerCase().replace(/\s+/g, "-"),
      order: component.order,
      overrides: {},
    });
  }

  await replaceTable<ProjectRow>(TABLES.projects, projects);
  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<ReferenceRow>(TABLES.references, references);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, [workspace]);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);
  await replaceTable<never>(TABLES.history, []);

  notify(TABLES.projects);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.workspaces);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

async function ensureFactoryMocksPresent(): Promise<void> {
  const t = now();
  let projects = await listTable<ProjectRow>(TABLES.projects);
  let screens = await listTable<ScreenRow>(TABLES.screens);
  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  let scenes = await listTable<SceneRow>(TABLES.scenes);
  let thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let workspaces = await listTable<WorkspaceRow>(TABLES.workspaces);
  let screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  let placements = await listTable<ComponentPlacementRow>(TABLES.placements);

  const seedKeys = new Set(
    PROJECTS.map((project) => projectKey(project.name, project.type)),
  );
  let changed = false;

  projects = projects.map((project) => {
    if (project.source || !seedKeys.has(projectKey(project.name, project.type))) {
      return normalizeProjectRow(project);
    }
    changed = true;
    return normalizeProjectRow({ ...project, source: "mock" });
  });

  const existingMockKeys = new Set(
    projects
      .filter((project) => project.source === "mock")
      .map((project) => projectKey(project.name, project.type)),
  );

  const addedProjectIds: string[] = [];
  for (const seedProject of PROJECTS) {
    const key = projectKey(seedProject.name, seedProject.type);
    if (existingMockKeys.has(key)) continue;

    const project: ProjectRow = normalizeProjectRow({
      id: newId(),
      name: seedProject.name,
      type: seedProject.type,
      source: "mock",
      thumbnailDataUrl: null,
      description: null,
      previewScreenId: null,
      designSystem: createDefaultDesignSystem(),
      createdAt: t,
      updatedAt: t,
    });
    projects = [...projects, project];
    addedProjectIds.push(project.id);

    const newScreens: ScreenRow[] = screensForProject(project).map((screen, order) => ({
      id: newId(),
      projectId: project.id,
      title: screen.title,
      variant: screen.variant,
      order,
      createdAt: t,
      updatedAt: t,
    }));
    screens = [...screens, ...newScreens];

    for (const screen of newScreens) {
      const bundle = await getCanvasMockBundleForScreen(screen, project.type);
      if (!bundle) continue;
      scenes = [...scenes, createMockSceneRow(screen.id, "screen", bundle.screen, t)];
      thumbnails = [
        ...thumbnails,
        createMockThumbnailRow(screen.id, "screen", bundle.screen, t),
      ];
      seedComponentTree({
        projectId: project.id,
        parent: { kind: "screen", screenId: screen.id },
        nodes: bundle.components,
        components,
        variants,
        scenes,
        thumbnails,
        t,
      });
    }

    const newScreenVersions: ScreenVersionRow[] = newScreens.map((screen) => ({
      id: newId(),
      screenId: screen.id,
      label: "Default",
      createdAt: t,
    }));
    screenVersions = [...screenVersions, ...newScreenVersions];

    const screenVersionByScreenId = new Map(
      newScreenVersions.map((screenVersion) => [screenVersion.screenId, screenVersion]),
    );
    const newPlacements: ComponentPlacementRow[] = components
      .filter(
        (component) =>
          component.projectId === project.id &&
          component.screenId !== null &&
          component.parentVariantId === null,
      )
      .map((component) => {
        const screenVersion = screenVersionByScreenId.get(component.screenId!);
        if (!screenVersion) return null;
        return {
          id: newId(),
          screenVersionId: screenVersion.id,
          componentId: component.id,
          versionId: component.activeVariantId,
          slot: component.name.toLowerCase().replace(/\s+/g, "-"),
          order: component.order,
          overrides: {},
        } satisfies ComponentPlacementRow;
      })
      .filter((placement): placement is ComponentPlacementRow => placement !== null);
    placements = [...placements, ...newPlacements];
    changed = true;
  }

  if (!changed) return;

  const allProjectIds = projects.map((project) => project.id);
  if (workspaces.length === 0) {
    workspaces = [
      {
        id: newId(),
        name: "workspace",
        projectIds: allProjectIds,
        createdAt: t,
        updatedAt: t,
      },
    ];
  } else if (addedProjectIds.length > 0) {
    workspaces = workspaces.map((workspace, index) =>
      index === 0
        ? {
            ...workspace,
            projectIds: Array.from(new Set([...workspace.projectIds, ...addedProjectIds])),
            updatedAt: t,
          }
        : workspace,
    );
  }

  await replaceTable<ProjectRow>(TABLES.projects, projects);
  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, workspaces);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

  notify(TABLES.projects);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.workspaces);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

function projectKey(name: string, type: ProjectRow["type"]): string {
  return `${name.trim().toLowerCase()}::${type}`;
}

function createMockSceneRow(
  ownerId: string,
  ownerType: SceneRow["ownerType"],
  mock: CanvasMockData,
  t: number,
): SceneRow {
  return {
    id: newId(),
    ownerType,
    ownerId,
    graphJSON: mock.graphJSON,
    sceneVersion: mock.sceneVersion,
    updatedAt: t,
  };
}

function createMockThumbnailRow(
  ownerId: string,
  ownerType: ThumbnailRow["ownerType"],
  mock: CanvasMockData,
  t: number,
): ThumbnailRow {
  return {
    id: newId(),
    ownerType,
    ownerId,
    dataUrl: mock.snapshot,
    capturedAt: t,
  };
}

type SeedParent =
  | { kind: "screen"; screenId: string }
  | { kind: "variant"; variantId: string };

function seedComponentTree(input: {
  projectId: string;
  parent: SeedParent;
  nodes: MockComponentSeed[];
  components: ComponentRow[];
  variants: VariantRow[];
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  t: number;
}): void {
  for (const [order, node] of input.nodes.entries()) {
    const componentId = newId();
    const variantId = newId();

    input.variants.push({
      id: variantId,
      componentId,
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.components.push({
      id: componentId,
      projectId: input.projectId,
      screenId: input.parent.kind === "screen" ? input.parent.screenId : null,
      parentVariantId:
        input.parent.kind === "variant" ? input.parent.variantId : null,
      name: node.name,
      kind: node.kind,
      category: null,
      assignedScreenIds: [],
      activeVariantId: variantId,
      order,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.scenes.push(
      createMockSceneRow(variantId, "variant", node.canvas, input.t),
    );
    input.thumbnails.push(
      createMockThumbnailRow(variantId, "variant", node.canvas, input.t),
    );

    seedComponentTree({
      ...input,
      parent: { kind: "variant", variantId },
      nodes: node.children,
    });
  }
}
