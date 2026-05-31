/**
 * Boot path for the storage layer:
 * - Fresh install (no `meta.seededAt`): write the current shape directly from
 *   PROJECTS, the screens assigned to each project, and the hierarchical
 *   canvas mock data.
 * - Existing v1 store (`meta.schemaVersion < 2`): in-place migration that
 *   creates one Default Variant per existing component and rewires
 *   scenes/thumbnails to point at variants instead of components.
 * - Existing v2/v3 store (`meta.schemaVersion < 4`): replace old static mock
 *   canvas scenes with real per-device canvas mocks, and remove empty-card
 *   placeholders from persisted canvas data.
 * - Existing v11 store (`meta.schemaVersion < 12`): add the Alignment Debug
 *   screen, a fixed white scene with one red 30x30 component at center.
 *
 * All writes happen at the end of each path so a partial failure leaves the
 * previous state intact.
 */

import {
  getCanvasMockBundleForScreen,
  getCanvasMockForScreen,
  type CanvasMockData,
  type MockComponentSeed,
} from "@/components/mocks/data/canvasMocks";
import { ensureHtmlCanvasSubjectRootJSON } from "@/lib/canvas/htmlScene";
import {
  PROJECTS,
  isAlignmentDebugProject,
  screensForProject,
} from "@/lib/data/projects";
import {
  createDefaultDesignSystem,
  normalizeComponentRow,
  normalizeProjectRow,
  normalizeReferenceRow,
} from "@/lib/storage/defaults";
import { collectComponentTreeIds } from "@/lib/storage/repos/components.repo";
import { syncConnectedSceneSnapshots } from "@/lib/storage/repos/scenes.repo";
import { newId, now } from "@/lib/storage/ids";
import { snapshotDataUrlFromGraphJSON } from "@/lib/storage/sceneSnapshots";
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
  type V1ComponentRow,
  type V1SceneRow,
  type V1ThumbnailRow,
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

  // Up-to-date: nothing to do.
  if (meta.seededAt != null && meta.schemaVersion === SCHEMA_VERSION) {
    await ensureFactoryMocksPresent();
    return;
  }

  // Fresh install: write current shape directly.
  if (meta.seededAt == null) {
    await firstBootSeedV5();
    await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: now() });
    return;
  }

  // Existing v1 store: in-place migration.
  if (meta.schemaVersion < 2) {
    await migrateV1toV2();
    await writeMeta({ schemaVersion: 2, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 3) {
    await migrateV2toV3CanvasMocks();
    await writeMeta({ schemaVersion: 3, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 4) {
    await migrateV3toV4CanvasMocks();
    await writeMeta({ schemaVersion: 4, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 5) {
    await migrateV4toV5MockHierarchy();
    await writeMeta({ schemaVersion: 5, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 6) {
    await migrateV5toV6HtmlCanvasMocks();
    await writeMeta({ schemaVersion: 6, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 7) {
    await migrateV6toV7NewTables();
    await writeMeta({ schemaVersion: 7, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 8) {
    await migrateV7toV8DataIntegrity();
    await writeMeta({ schemaVersion: 8, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 9) {
    await migrateV8toV9CanvasSubjectRoots();
    await writeMeta({ schemaVersion: 9, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 10) {
    await migrateV9toV10DistinctMockHierarchy();
    await writeMeta({ schemaVersion: 10, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 11) {
    await migrateV10toV11ConnectedSnapshots();
    await writeMeta({ schemaVersion: 11, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 12) {
    await migrateV11toV12AlignmentDebugScreen();
    await writeMeta({ schemaVersion: 12, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 13) {
    await migrateV12toV13StripMockReferences();
    await writeMeta({ schemaVersion: 13, seededAt: meta.seededAt });
  }

  if (meta.schemaVersion < 14) {
    await migrateV13toV14ProjectSources();
    await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: meta.seededAt });
  }

  await ensureFactoryMocksPresent();
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

  // Workspace — one default workspace containing all projects
  const workspace: WorkspaceRow = {
    id: newId(),
    name: "workspace",
    projectIds: projects.map((p) => p.id),
    createdAt: t,
    updatedAt: t,
  };

  // Screen versions — one "Default" version per screen
  const screenVersions: ScreenVersionRow[] = screens.map((screen) => ({
    id: newId(),
    screenId: screen.id,
    label: "Default",
    createdAt: t,
  }));

  // Component placements — derive from top-level components linked to screens
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

  // Single batch of writes — store has no transaction, but each table's row
  // set is replaced atomically and the meta gate on top short-circuits a
  // re-run if any of these fail.
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
  let references = await listTable<ReferenceRow>(TABLES.references);
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

  references = references.filter(
    (reference) => !SEEDED_MOCK_REFERENCE_IDS.has(reference.id),
  );

  await replaceTable<ProjectRow>(TABLES.projects, projects);
  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<ReferenceRow>(TABLES.references, references);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, workspaces);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

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

async function migrateV6toV7NewTables(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);

  // Skip if already seeded (idempotent guard)
  const existingWorkspaces = await listTable<WorkspaceRow>(TABLES.workspaces);
  const existingVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);

  const workspace: WorkspaceRow =
    existingWorkspaces[0] ?? {
      id: newId(),
      name: "workspace",
      projectIds: projects.map((p) => p.id),
      createdAt: t,
      updatedAt: t,
    };

  // One "Default" version per screen that doesn't already have one
  const existingVersionScreenIds = new Set(existingVersions.map((v) => v.screenId));
  const newVersions: ScreenVersionRow[] = screens
    .filter((s) => !existingVersionScreenIds.has(s.id))
    .map((s) => ({
      id: newId(),
      screenId: s.id,
      label: "Default",
      createdAt: t,
    }));
  const allVersions = [...existingVersions, ...newVersions];

  // Component placements from top-level screen components not yet placed
  const existingPlacements = await listTable<ComponentPlacementRow>(TABLES.placements);
  const placedComponentIds = new Set(existingPlacements.map((p) => p.componentId));
  const screenVersionByScreenId = new Map(allVersions.map((sv) => [sv.screenId, sv]));

  const newPlacements: ComponentPlacementRow[] = [];
  for (const component of components) {
    if (!component.screenId || component.parentVariantId !== null) continue;
    if (placedComponentIds.has(component.id)) continue;
    const screenVersion = screenVersionByScreenId.get(component.screenId);
    if (!screenVersion) continue;
    newPlacements.push({
      id: newId(),
      screenVersionId: screenVersion.id,
      componentId: component.id,
      versionId: component.activeVariantId,
      slot: component.name.toLowerCase().replace(/\s+/g, "-"),
      order: component.order,
      overrides: {},
    });
  }

  await replaceTable<WorkspaceRow>(TABLES.workspaces, [workspace]);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, allVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, [
    ...existingPlacements,
    ...newPlacements,
  ]);

  // Ensure history table exists (empty for existing stores)
  const existingHistory = await listTable<never>(TABLES.history);
  if (existingHistory.length === 0) {
    await replaceTable<never>(TABLES.history, []);
  }

  notify(TABLES.workspaces);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

async function migrateV7toV8DataIntegrity(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));

  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  let scenes = await listTable<SceneRow>(TABLES.scenes);
  let thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  let placements = await listTable<ComponentPlacementRow>(TABLES.placements);

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) {
      ensureOwnerThumbnailFromScene(scenes, thumbnails, "screen", screen.id, t);
      continue;
    }

    ensureOwnerSceneData({
      scenes,
      thumbnails,
      ownerType: "screen",
      ownerId: screen.id,
      mock: bundle.screen,
      t,
    });
    ensureMockComponentRows({
      projectId: screen.projectId,
      parent: { kind: "screen", screenId: screen.id },
      seeds: bundle.components,
      components,
      variants,
      scenes,
      thumbnails,
      t,
    });
  }

  for (const scene of scenes) {
    ensureOwnerThumbnailFromScene(
      scenes,
      thumbnails,
      scene.ownerType,
      scene.ownerId,
      t,
    );
  }

  const versionByScreenId = new Map(screenVersions.map((v) => [v.screenId, v]));
  for (const screen of screens) {
    if (versionByScreenId.has(screen.id)) continue;
    const version: ScreenVersionRow = {
      id: newId(),
      screenId: screen.id,
      label: "Default",
      createdAt: t,
    };
    screenVersions = [...screenVersions, version];
    versionByScreenId.set(screen.id, version);
  }

  const placementKeys = new Set(
    placements.map((placement) => `${placement.screenVersionId}:${placement.componentId}`),
  );
  for (const component of components) {
    if (!component.screenId || component.parentVariantId !== null) continue;
    const screenVersion = versionByScreenId.get(component.screenId);
    if (!screenVersion) continue;
    const key = `${screenVersion.id}:${component.id}`;
    if (placementKeys.has(key)) continue;
    placementKeys.add(key);
    placements = [
      ...placements,
      {
        id: newId(),
        screenVersionId: screenVersion.id,
        componentId: component.id,
        versionId: component.activeVariantId,
        slot: component.name.toLowerCase().replace(/\s+/g, "-"),
        order: component.order,
        overrides: {},
      },
    ];
  }

  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

async function migrateV8toV9CanvasSubjectRoots(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  let screens = await listTable<ScreenRow>(TABLES.screens);
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));

  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  let scenes = await listTable<SceneRow>(TABLES.scenes);
  let thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  let placements = await listTable<ComponentPlacementRow>(TABLES.placements);

  const emptyUnsupportedScreenIds = new Set(
    screens
      .filter((screen) => {
        if (templateIsSeeded(screen)) return false;
        const hasComponents = components.some((component) => component.screenId === screen.id);
        const hasScene = scenes.some(
          (scene) => scene.ownerType === "screen" && scene.ownerId === screen.id,
        );
        return !hasComponents && !hasScene;
      })
      .map((screen) => screen.id),
  );

  if (emptyUnsupportedScreenIds.size > 0) {
    const removedVersionIds = new Set(
      screenVersions
        .filter((version) => emptyUnsupportedScreenIds.has(version.screenId))
        .map((version) => version.id),
    );
    screens = screens.filter((screen) => !emptyUnsupportedScreenIds.has(screen.id));
    screenVersions = screenVersions.filter(
      (version) => !emptyUnsupportedScreenIds.has(version.screenId),
    );
    placements = placements.filter(
      (placement) => !removedVersionIds.has(placement.screenVersionId),
    );
    thumbnails = thumbnails.filter(
      (thumbnail) =>
        !(thumbnail.ownerType === "screen" && emptyUnsupportedScreenIds.has(thumbnail.ownerId)),
    );
  }

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) {
      ensureOwnerThumbnailFromScene(scenes, thumbnails, "screen", screen.id, t);
      continue;
    }

    ensureOwnerSubjectRootSceneData({
      scenes,
      thumbnails,
      ownerType: "screen",
      ownerId: screen.id,
      mock: bundle.screen,
      wrapperName: `${screen.title} Canvas`,
      t,
    });
    ensureMockComponentRowsWithSubjectRoots({
      projectId: screen.projectId,
      parent: { kind: "screen", screenId: screen.id },
      seeds: bundle.components,
      components,
      variants,
      scenes,
      thumbnails,
      t,
    });
  }

  for (const scene of scenes) {
    ensureOwnerThumbnailFromScene(
      scenes,
      thumbnails,
      scene.ownerType,
      scene.ownerId,
      t,
    );
  }

  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

function templateIsSeeded(screen: Pick<ScreenRow, "title" | "variant">): boolean {
  const title = screen.title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    title.includes("home") ||
    title.includes("list") ||
    title.includes("detal") ||
    title.includes("form") ||
    isAlignmentDebugScreen(screen)
  );
}

function isAlignmentDebugScreen(screen: Pick<ScreenRow, "title" | "variant">): boolean {
  const title = screen.title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    (title.includes("alignment") || title.includes("alinhamento")) &&
    title.includes("debug")
  );
}

function ensureMockComponentRowsWithSubjectRoots(input: {
  projectId: string;
  parent: SeedParent;
  seeds: MockComponentSeed[];
  components: ComponentRow[];
  variants: VariantRow[];
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  t: number;
}): void {
  for (const [order, seed] of input.seeds.entries()) {
    const component = ensureMockComponentRow({ ...input, seed, order });
    const variant = ensureActiveVariant(component, input.variants, input.t);

    ensureOwnerSubjectRootSceneData({
      scenes: input.scenes,
      thumbnails: input.thumbnails,
      ownerType: "variant",
      ownerId: variant.id,
      mock: seed.canvas,
      wrapperName: `${seed.name} Canvas`,
      t: input.t,
    });
    ensureMockComponentRowsWithSubjectRoots({
      ...input,
      parent: { kind: "variant", variantId: variant.id },
      seeds: seed.children,
    });
  }
}

function ensureOwnerSubjectRootSceneData(input: {
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  ownerType: SceneRow["ownerType"];
  ownerId: string;
  mock: CanvasMockData;
  wrapperName: string;
  t: number;
}): void {
  const existing = input.scenes.find(
    (scene) => scene.ownerType === input.ownerType && scene.ownerId === input.ownerId,
  );

  const graphJSON =
    ensureHtmlCanvasSubjectRootJSON(existing?.graphJSON, {
      wrapperName: input.wrapperName,
      subjectLocked: true,
    }) ?? input.mock.graphJSON;

  upsertRawSceneData(
    input.scenes,
    input.ownerType,
    input.ownerId,
    graphJSON,
    input.t,
  );

  const dataUrl = snapshotDataUrlFromGraphJSON(graphJSON) ?? input.mock.snapshot;
  upsertThumbnailData(
    input.thumbnails,
    input.ownerType,
    input.ownerId,
    dataUrl,
    input.t,
  );
}

function upsertRawSceneData(
  scenes: SceneRow[],
  ownerType: SceneRow["ownerType"],
  ownerId: string,
  graphJSON: string,
  t: number,
): void {
  const sceneIdx = scenes.findIndex(
    (scene) => scene.ownerType === ownerType && scene.ownerId === ownerId,
  );
  if (sceneIdx >= 0) {
    if (scenes[sceneIdx]!.graphJSON === graphJSON) return;
    scenes[sceneIdx] = {
      ...scenes[sceneIdx]!,
      graphJSON,
      sceneVersion: Math.max(1, scenes[sceneIdx]!.sceneVersion),
      updatedAt: t,
    };
    return;
  }

  scenes.push({
    id: newId(),
    ownerType,
    ownerId,
    graphJSON,
    sceneVersion: 1,
    updatedAt: t,
  });
}

async function migrateV9toV10DistinctMockHierarchy(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  let screens = await listTable<ScreenRow>(TABLES.screens);
  let references = await listTable<ReferenceRow>(TABLES.references);
  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  let scenes = await listTable<SceneRow>(TABLES.scenes);
  let thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  let placements = await listTable<ComponentPlacementRow>(TABLES.placements);

  const projectTypeById = new Map(projects.map((project) => [project.id, project.type]));
  const emptyUnsupportedScreenIds = new Set(
    screens
      .filter((screen) => {
        if (templateIsSeeded(screen)) return false;
        const hasComponents = components.some((component) => component.screenId === screen.id);
        const hasScene = scenes.some(
          (scene) => scene.ownerType === "screen" && scene.ownerId === screen.id,
        );
        return !hasComponents && !hasScene;
      })
      .map((screen) => screen.id),
  );

  if (emptyUnsupportedScreenIds.size > 0) {
    const removedVersionIds = new Set(
      screenVersions
        .filter((version) => emptyUnsupportedScreenIds.has(version.screenId))
        .map((version) => version.id),
    );
    screens = screens.filter((screen) => !emptyUnsupportedScreenIds.has(screen.id));
    screenVersions = screenVersions.filter(
      (version) => !emptyUnsupportedScreenIds.has(version.screenId),
    );
    placements = placements.filter(
      (placement) => !removedVersionIds.has(placement.screenVersionId),
    );
    scenes = scenes.filter(
      (scene) =>
        !(scene.ownerType === "screen" && emptyUnsupportedScreenIds.has(scene.ownerId)),
    );
    thumbnails = thumbnails.filter(
      (thumbnail) =>
        !(thumbnail.ownerType === "screen" && emptyUnsupportedScreenIds.has(thumbnail.ownerId)),
    );
  }

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) continue;

    const topLevel = components.filter(
      (component) =>
        component.screenId === screen.id && component.parentVariantId === null,
    );
    const componentIds = new Set<string>();
    for (const component of topLevel) {
      collectComponentTreeIds(component.id, components, variants).forEach((id) =>
        componentIds.add(id),
      );
    }
    const variantIds = new Set(
      variants
        .filter((variant) => componentIds.has(variant.componentId))
        .map((variant) => variant.id),
    );

    references = references
      .map((reference) => normalizeReferenceRow(reference))
      .map((reference) => {
        const attachments = reference.attachments.filter(
          (attachment) => !componentIds.has(attachment.componentId ?? ""),
        );
        return {
          ...reference,
          attachments,
          projectIds: Array.from(new Set(attachments.map((attachment) => attachment.projectId))),
        };
      })
      .filter((reference) => reference.projectIds.length > 0);
    components = components.filter((component) => !componentIds.has(component.id));
    variants = variants.filter((variant) => !variantIds.has(variant.id));
    scenes = scenes.filter(
      (scene) =>
        !(
          (scene.ownerType === "screen" && scene.ownerId === screen.id) ||
          (scene.ownerType === "variant" && variantIds.has(scene.ownerId))
        ),
    );
    thumbnails = thumbnails.filter(
      (thumbnail) =>
        !(
          (thumbnail.ownerType === "screen" && thumbnail.ownerId === screen.id) ||
          (thumbnail.ownerType === "variant" && variantIds.has(thumbnail.ownerId))
        ),
    );

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

  const versionByScreenId = new Map(screenVersions.map((version) => [version.screenId, version]));
  for (const screen of screens) {
    if (versionByScreenId.has(screen.id)) continue;
    const version: ScreenVersionRow = {
      id: newId(),
      screenId: screen.id,
      label: "Default",
      createdAt: t,
    };
    screenVersions = [...screenVersions, version];
    versionByScreenId.set(screen.id, version);
  }

  const validComponentIds = new Set(components.map((component) => component.id));
  const validScreenVersionIds = new Set(screenVersions.map((version) => version.id));
  placements = placements.filter(
    (placement) =>
      validComponentIds.has(placement.componentId) &&
      validScreenVersionIds.has(placement.screenVersionId),
  );

  const placementKeys = new Set(
    placements.map((placement) => `${placement.screenVersionId}:${placement.componentId}`),
  );
  for (const component of components) {
    if (!component.screenId || component.parentVariantId !== null) continue;
    const screenVersion = versionByScreenId.get(component.screenId);
    if (!screenVersion) continue;
    const key = `${screenVersion.id}:${component.id}`;
    if (placementKeys.has(key)) continue;
    placementKeys.add(key);
    placements = [
      ...placements,
      {
        id: newId(),
        screenVersionId: screenVersion.id,
        componentId: component.id,
        versionId: component.activeVariantId,
        slot: component.name.toLowerCase().replace(/\s+/g, "-"),
        order: component.order,
        overrides: {},
      },
    ];
  }

  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ReferenceRow>(TABLES.references, references);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

  notify(TABLES.screens);
  notify(TABLES.references);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

async function migrateV10toV11ConnectedSnapshots(): Promise<void> {
  await syncConnectedSceneSnapshots();
}

async function migrateV11toV12AlignmentDebugScreen(): Promise<void> {
  const t = now();
  let projects = await listTable<ProjectRow>(TABLES.projects);
  let workspaces = await listTable<WorkspaceRow>(TABLES.workspaces);
  let screens = await listTable<ScreenRow>(TABLES.screens);
  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let screenVersions = await listTable<ScreenVersionRow>(TABLES.screenVersions);
  let placements = await listTable<ComponentPlacementRow>(TABLES.placements);

  const projectSeed = PROJECTS.find((project) =>
    isAlignmentDebugProject(project.name),
  );
  if (!projectSeed) return;

  let project = projects.find((candidate) =>
    isAlignmentDebugProject(candidate.name),
  );
  if (!project) {
    project = {
      id: newId(),
      name: projectSeed.name,
      type: projectSeed.type,
      source: "mock",
      thumbnailDataUrl: null,
      description: null,
      previewScreenId: null,
      designSystem: createDefaultDesignSystem(),
      createdAt: t,
      updatedAt: t,
    };
    projects = [...projects, project];
  }

  if (workspaces.length === 0) {
    workspaces = [
      {
        id: newId(),
        name: "workspace",
        projectIds: projects.map((candidate) => candidate.id),
        createdAt: t,
        updatedAt: t,
      },
    ];
  } else {
    workspaces = workspaces.map((workspace) =>
      workspace.projectIds.includes(project.id)
        ? workspace
        : {
            ...workspace,
            projectIds: [...workspace.projectIds, project.id],
            updatedAt: t,
          },
    );
  }

  let screen = screens.find(
    (candidate) =>
      candidate.projectId === project.id && isAlignmentDebugScreen(candidate),
  );
  if (!screen) {
    screen = {
      id: newId(),
      projectId: project.id,
      title: "Alignment Debug",
      variant: "blank",
      order: 0,
      createdAt: t,
      updatedAt: t,
    };
    screens = [...screens, screen];
  }

  const bundle = await getCanvasMockBundleForScreen(screen, project.type);
  if (!bundle) return;

  ensureOwnerSceneData({
    scenes,
    thumbnails,
    ownerType: "screen",
    ownerId: screen.id,
    mock: bundle.screen,
    t,
  });
  ensureMockComponentRows({
    projectId: project.id,
    parent: { kind: "screen", screenId: screen.id },
    seeds: bundle.components,
    components,
    variants,
    scenes,
    thumbnails,
    t,
  });

  const versionByScreenId = new Map(
    screenVersions.map((version) => [version.screenId, version]),
  );
  if (!versionByScreenId.has(screen.id)) {
    const version: ScreenVersionRow = {
      id: newId(),
      screenId: screen.id,
      label: "Default",
      createdAt: t,
    };
    screenVersions = [...screenVersions, version];
    versionByScreenId.set(screen.id, version);
  }

  const placementKeys = new Set(
    placements.map((placement) => `${placement.screenVersionId}:${placement.componentId}`),
  );
  for (const component of components) {
    if (
      component.screenId !== screen.id ||
      component.parentVariantId !== null
    ) {
      continue;
    }
    const screenVersion = versionByScreenId.get(component.screenId);
    if (!screenVersion) continue;
    const key = `${screenVersion.id}:${component.id}`;
    if (placementKeys.has(key)) continue;
    placementKeys.add(key);
    placements = [
      ...placements,
      {
        id: newId(),
        screenVersionId: screenVersion.id,
        componentId: component.id,
        versionId: component.activeVariantId,
        slot: component.name.toLowerCase().replace(/\s+/g, "-"),
        order: component.order,
        overrides: {},
      },
    ];
  }

  await replaceTable<ProjectRow>(TABLES.projects, projects);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, workspaces);
  await replaceTable<ScreenRow>(TABLES.screens, screens);
  await replaceTable<ComponentRow>(TABLES.components, components);
  await replaceTable<VariantRow>(TABLES.variants, variants);
  await replaceTable<SceneRow>(TABLES.scenes, scenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails);
  await replaceTable<ScreenVersionRow>(TABLES.screenVersions, screenVersions);
  await replaceTable<ComponentPlacementRow>(TABLES.placements, placements);

  notify(TABLES.projects);
  notify(TABLES.workspaces);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.screenVersions);
  notify(TABLES.placements);
}

/** IDs that were seeded into every project by firstBootSeedV5 / older migrations. */
const SEEDED_MOCK_REFERENCE_IDS = new Set([
  "g-ext-1", "g-ext-2", "g-ext-3", "g-ext-4",
  "g-ext-5", "g-ext-6", "g-ext-7", "g-ext-8",
  "g-loc-1", "g-loc-2", "g-loc-3", "g-loc-4",
]);

async function migrateV12toV13StripMockReferences(): Promise<void> {
  const references = await listTable<ReferenceRow>(TABLES.references);
  const nextReferences = references.filter(
    (reference) => !SEEDED_MOCK_REFERENCE_IDS.has(reference.id),
  );
  if (nextReferences.length === references.length) return; // nothing to strip
  await replaceTable<ReferenceRow>(TABLES.references, nextReferences);
  notify(TABLES.references);
}

async function migrateV13toV14ProjectSources(): Promise<void> {
  const seedProjectKeys = new Set(
    PROJECTS.map((project) => `${project.name.toLowerCase()}::${project.type}`),
  );
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const nextProjects = projects.map((project) => {
    if (project.source) return normalizeProjectRow(project);
    const seedKey = `${project.name.toLowerCase()}::${project.type}`;
    return normalizeProjectRow({
      ...project,
      source: seedProjectKeys.has(seedKey) ? "mock" : "local",
    });
  });
  await replaceTable<ProjectRow>(TABLES.projects, nextProjects);
  notify(TABLES.projects);
}

function ensureMockComponentRows(input: {
  projectId: string;
  parent: SeedParent;
  seeds: MockComponentSeed[];
  components: ComponentRow[];
  variants: VariantRow[];
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  t: number;
}): void {
  for (const [order, seed] of input.seeds.entries()) {
    const component = ensureMockComponentRow({ ...input, seed, order });
    const variant = ensureActiveVariant(component, input.variants, input.t);

    ensureOwnerSceneData({
      scenes: input.scenes,
      thumbnails: input.thumbnails,
      ownerType: "variant",
      ownerId: variant.id,
      mock: seed.canvas,
      t: input.t,
    });
    ensureMockComponentRows({
      ...input,
      parent: { kind: "variant", variantId: variant.id },
      seeds: seed.children,
    });
  }
}

function ensureMockComponentRow(input: {
  projectId: string;
  parent: SeedParent;
  seed: MockComponentSeed;
  order: number;
  components: ComponentRow[];
  variants: VariantRow[];
  t: number;
}): ComponentRow {
  const existing = input.components.find((component) => {
    if (component.name !== input.seed.name) return false;
    if (input.parent.kind === "screen") {
      return (
        component.screenId === input.parent.screenId &&
        component.parentVariantId === null
      );
    }
    return component.parentVariantId === input.parent.variantId;
  });

  if (!existing) {
    const componentId = newId();
    const variantId = newId();
    const component = normalizeComponentRow({
      id: componentId,
      projectId: input.projectId,
      screenId: input.parent.kind === "screen" ? input.parent.screenId : null,
      parentVariantId:
        input.parent.kind === "variant" ? input.parent.variantId : null,
      name: input.seed.name,
      kind: input.seed.kind,
      category: null,
      description: null,
      assignedScreenIds: [],
      activeVariantId: variantId,
      order: input.order,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.variants.push({
      id: variantId,
      componentId,
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.components.push(component);
    return component;
  }

  const index = input.components.findIndex((component) => component.id === existing.id);
  const next = normalizeComponentRow({
    ...existing,
    kind: existing.kind ?? input.seed.kind,
    order: Number.isFinite(existing.order) ? existing.order : input.order,
    updatedAt: existing.updatedAt || input.t,
  });
  input.components[index] = next;
  return next;
}

function ensureActiveVariant(
  component: ComponentRow,
  variants: VariantRow[],
  t: number,
): VariantRow {
  const existing = variants.find((variant) => variant.id === component.activeVariantId);
  if (existing) return existing;

  const variantId = component.activeVariantId || newId();
  component.activeVariantId = variantId;
  const variant: VariantRow = {
    id: variantId,
    componentId: component.id,
    name: "Default",
    order: 0,
    seedKey: null,
    createdAt: t,
    updatedAt: t,
  };
  variants.push(variant);
  return variant;
}

function ensureOwnerSceneData(input: {
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  ownerType: SceneRow["ownerType"];
  ownerId: string;
  mock: CanvasMockData;
  t: number;
}): void {
  const existing = input.scenes.find(
    (scene) => scene.ownerType === input.ownerType && scene.ownerId === input.ownerId,
  );
  const shouldSeed =
    !existing ||
    !snapshotDataUrlFromGraphJSON(existing.graphJSON) ||
    isLegacyPlaceholderScene(existing.graphJSON);

  if (shouldSeed) {
    upsertSceneData(input.scenes, input.ownerType, input.ownerId, input.mock, input.t);
    upsertThumbnailData(
      input.thumbnails,
      input.ownerType,
      input.ownerId,
      input.mock.snapshot,
      input.t,
    );
    return;
  }

  ensureOwnerThumbnailFromScene(
    input.scenes,
    input.thumbnails,
    input.ownerType,
    input.ownerId,
    input.t,
  );
}

function upsertSceneData(
  scenes: SceneRow[],
  ownerType: SceneRow["ownerType"],
  ownerId: string,
  mock: CanvasMockData,
  t: number,
): void {
  const sceneIdx = scenes.findIndex(
    (scene) => scene.ownerType === ownerType && scene.ownerId === ownerId,
  );
  if (sceneIdx >= 0) {
    const sceneVersion = scenes[sceneIdx]!.sceneVersion;
    scenes[sceneIdx] = {
      ...scenes[sceneIdx]!,
      graphJSON: mock.graphJSON,
      sceneVersion: Number.isFinite(sceneVersion) ? Math.max(1, sceneVersion) : 1,
      updatedAt: t,
    };
  } else {
    scenes.push(createMockSceneRow(ownerId, ownerType, mock, t));
  }
}

function ensureOwnerThumbnailFromScene(
  scenes: SceneRow[],
  thumbnails: ThumbnailRow[],
  ownerType: SceneRow["ownerType"],
  ownerId: string,
  t: number,
): void {
  const scene = scenes.find(
    (candidate) => candidate.ownerType === ownerType && candidate.ownerId === ownerId,
  );
  if (!scene) return;
  const dataUrl = snapshotDataUrlFromGraphJSON(scene.graphJSON);
  if (!dataUrl) return;
  upsertThumbnailData(thumbnails, ownerType, ownerId, dataUrl, t);
}

function upsertThumbnailData(
  thumbnails: ThumbnailRow[],
  ownerType: ThumbnailRow["ownerType"],
  ownerId: string,
  dataUrl: string,
  t: number,
): void {
  const thumbIdx = thumbnails.findIndex(
    (thumbnail) =>
      thumbnail.ownerType === ownerType && thumbnail.ownerId === ownerId,
  );
  if (thumbIdx >= 0) {
    if (thumbnails[thumbIdx]!.dataUrl === dataUrl) return;
    thumbnails[thumbIdx] = {
      ...thumbnails[thumbIdx]!,
      dataUrl,
      capturedAt: t,
    };
    return;
  }
  thumbnails.push({
    id: newId(),
    ownerType,
    ownerId,
    dataUrl,
    capturedAt: t,
  });
}

function isLegacyPlaceholderScene(graphJSON: string): boolean {
  return (
    graphJSON.includes("mock-default-empty") ||
    graphJSON.includes("Screen · ")
  );
}

async function migrateV2toV3CanvasMocks(): Promise<void> {
  await migrateV3toV4CanvasMocks();
}

async function migrateV3toV4CanvasMocks(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));

  const nextScenes = [...scenes];
  const nextThumbnails = [...thumbnails];

  const removeOwnerMock = (ownerType: SceneRow["ownerType"], ownerId: string) => {
    const sceneIdx = nextScenes.findIndex(
      (scene) => scene.ownerType === ownerType && scene.ownerId === ownerId,
    );
    if (sceneIdx >= 0 && isReplaceableMockScene(nextScenes[sceneIdx]!.graphJSON)) {
      nextScenes.splice(sceneIdx, 1);
      const thumbIdx = nextThumbnails.findIndex(
        (thumb) => thumb.ownerType === ownerType && thumb.ownerId === ownerId,
      );
      if (thumbIdx >= 0) nextThumbnails.splice(thumbIdx, 1);
    }
  };

  const upsertMock = (
    ownerType: SceneRow["ownerType"],
    ownerId: string,
    mock: CanvasMockData,
  ) => {
    const sceneIdx = nextScenes.findIndex(
      (scene) => scene.ownerType === ownerType && scene.ownerId === ownerId,
    );
    const shouldReplaceScene =
      sceneIdx < 0 || isReplaceableMockScene(nextScenes[sceneIdx]!.graphJSON);

    if (sceneIdx >= 0 && !shouldReplaceScene) return;

    if (sceneIdx >= 0 && shouldReplaceScene) {
      nextScenes[sceneIdx] = {
        ...nextScenes[sceneIdx]!,
        graphJSON: mock.graphJSON,
        sceneVersion: mock.sceneVersion,
        updatedAt: t,
      };
    } else if (sceneIdx < 0) {
      nextScenes.unshift(createMockSceneRow(ownerId, ownerType, mock, t));
    }

    const thumbIdx = nextThumbnails.findIndex(
      (thumb) => thumb.ownerType === ownerType && thumb.ownerId === ownerId,
    );
    if (thumbIdx >= 0 && shouldReplaceScene) {
      nextThumbnails[thumbIdx] = {
        ...nextThumbnails[thumbIdx]!,
        dataUrl: mock.snapshot,
        capturedAt: t,
      };
    } else if (thumbIdx < 0) {
      nextThumbnails.unshift(createMockThumbnailRow(ownerId, ownerType, mock, t));
    }
  };

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    const mock = projectType
      ? await getCanvasMockForScreen(screen, projectType)
      : null;
    if (mock) {
      upsertMock("screen", screen.id, mock);
    } else {
      removeOwnerMock("screen", screen.id);
    }
  }
  for (const variant of variants) {
    removeOwnerMock("variant", variant.id);
  }

  const normalizedVariants = variants.map((variant) => ({
    ...variant,
    seedKey: null,
  }));

  await replaceTable<SceneRow>(TABLES.scenes, nextScenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, nextThumbnails);
  await replaceTable<VariantRow>(TABLES.variants, normalizedVariants);

  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.variants);
}

async function migrateV4toV5MockHierarchy(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const references = await listTable<ReferenceRow>(TABLES.references);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));

  let nextReferences = [...references];
  let nextComponents = [...components];
  let nextVariants = [...variants];
  let nextScenes = [...scenes];
  let nextThumbnails = [...thumbnails];

  const legacyTopLevelNames = new Set([
    "Header",
    "Footer",
    "Buttons",
    "Input field",
    "Hero",
    "Card grid",
    "Sidebar",
    "Modal",
  ]);

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) continue;

    const topLevel = nextComponents.filter(
      (component) =>
        component.screenId === screen.id && component.parentVariantId === null,
    );
    const shouldReplace =
      topLevel.length === 0 ||
      topLevel.every((component) => legacyTopLevelNames.has(component.name));

    if (!shouldReplace) {
      upsertOwnerMock(nextScenes, nextThumbnails, "screen", screen.id, bundle.screen, t);
      continue;
    }

    const componentIds = new Set<string>();
    for (const component of topLevel) {
      collectComponentTreeIds(component.id, nextComponents, nextVariants).forEach((id) =>
        componentIds.add(id),
      );
    }
    const variantIds = new Set(
      nextVariants
        .filter((variant) => componentIds.has(variant.componentId))
        .map((variant) => variant.id),
    );

    nextReferences = nextReferences.filter(
      (reference) =>
        normalizeReferenceRow(reference).attachments.every(
          (attachment) => !componentIds.has(attachment.componentId ?? ""),
        ),
    );
    nextComponents = nextComponents.filter(
      (component) => !componentIds.has(component.id),
    );
    nextVariants = nextVariants.filter((variant) => !variantIds.has(variant.id));
    nextScenes = nextScenes.filter(
      (scene) =>
        !(
          (scene.ownerType === "screen" && scene.ownerId === screen.id) ||
          (scene.ownerType === "variant" && variantIds.has(scene.ownerId))
        ),
    );
    nextThumbnails = nextThumbnails.filter(
      (thumbnail) =>
        !(
          (thumbnail.ownerType === "screen" && thumbnail.ownerId === screen.id) ||
          (thumbnail.ownerType === "variant" && variantIds.has(thumbnail.ownerId))
        ),
    );

    nextScenes.unshift(createMockSceneRow(screen.id, "screen", bundle.screen, t));
    nextThumbnails.unshift(
      createMockThumbnailRow(screen.id, "screen", bundle.screen, t),
    );
    seedComponentTree({
      projectId: screen.projectId,
      parent: { kind: "screen", screenId: screen.id },
      nodes: bundle.components,
      components: nextComponents,
      variants: nextVariants,
      scenes: nextScenes,
      thumbnails: nextThumbnails,
      t,
    });
  }

  await replaceTable<ReferenceRow>(TABLES.references, nextReferences);
  await replaceTable<ComponentRow>(TABLES.components, nextComponents);
  await replaceTable<VariantRow>(TABLES.variants, nextVariants);
  await replaceTable<SceneRow>(TABLES.scenes, nextScenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, nextThumbnails);

  notify(TABLES.references);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}

async function migrateV5toV6HtmlCanvasMocks(): Promise<void> {
  const t = now();
  const projects = await listTable<ProjectRow>(TABLES.projects);
  const screens = await listTable<ScreenRow>(TABLES.screens);
  const components = await listTable<ComponentRow>(TABLES.components);
  const variants = await listTable<VariantRow>(TABLES.variants);
  const scenes = await listTable<SceneRow>(TABLES.scenes);
  const thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));

  const nextScenes = [...scenes];
  const nextThumbnails = [...thumbnails];

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) continue;

    upsertOwnerMock(nextScenes, nextThumbnails, "screen", screen.id, bundle.screen, t);
    upsertComponentMockScenes({
      parent: { kind: "screen", screenId: screen.id },
      seeds: bundle.components,
      components,
      variants,
      scenes: nextScenes,
      thumbnails: nextThumbnails,
      t,
    });
  }

  await replaceTable<SceneRow>(TABLES.scenes, nextScenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, nextThumbnails);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}

function upsertComponentMockScenes(input: {
  parent: SeedParent;
  seeds: MockComponentSeed[];
  components: ComponentRow[];
  variants: VariantRow[];
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  t: number;
}): void {
  const siblings = input.components
    .filter((component) => {
      if (input.parent.kind === "screen") {
        return (
          component.screenId === input.parent.screenId &&
          component.parentVariantId === null
        );
      }
      return component.parentVariantId === input.parent.variantId;
    })
    .sort((a, b) => a.order - b.order);

  input.seeds.forEach((seed, index) => {
    const component =
      siblings.find((candidate) => candidate.name === seed.name) ?? siblings[index];
    if (!component) return;

    const variant = input.variants.find(
      (candidate) => candidate.id === component.activeVariantId,
    );
    if (!variant) return;

    upsertOwnerMock(
      input.scenes,
      input.thumbnails,
      "variant",
      variant.id,
      seed.canvas,
      input.t,
    );
    upsertComponentMockScenes({
      ...input,
      parent: { kind: "variant", variantId: variant.id },
      seeds: seed.children,
    });
  });
}

function upsertOwnerMock(
  scenes: SceneRow[],
  thumbnails: ThumbnailRow[],
  ownerType: SceneRow["ownerType"],
  ownerId: string,
  mock: CanvasMockData,
  t: number,
): void {
  const sceneIdx = scenes.findIndex(
    (scene) => scene.ownerType === ownerType && scene.ownerId === ownerId,
  );
  if (sceneIdx >= 0) {
    scenes[sceneIdx] = {
      ...scenes[sceneIdx]!,
      graphJSON: mock.graphJSON,
      sceneVersion: mock.sceneVersion,
      updatedAt: t,
    };
  } else {
    scenes.unshift(createMockSceneRow(ownerId, ownerType, mock, t));
  }

  const thumbIdx = thumbnails.findIndex(
    (thumbnail) =>
      thumbnail.ownerType === ownerType && thumbnail.ownerId === ownerId,
  );
  if (thumbIdx >= 0) {
    thumbnails[thumbIdx] = {
      ...thumbnails[thumbIdx]!,
      dataUrl: mock.snapshot,
      capturedAt: t,
    };
  } else {
    thumbnails.unshift(createMockThumbnailRow(ownerId, ownerType, mock, t));
  }
}

function isReplaceableMockScene(graphJSON: string): boolean {
  return (
    graphJSON.includes("mock-default-empty") ||
    graphJSON.includes("Screen · ") ||
    graphJSON.includes('"name":"Header"') ||
    graphJSON.includes('"name":"Hero"') ||
    graphJSON.includes('"name":"Buttons"') ||
    graphJSON.includes('"name":"Input"') ||
    graphJSON.includes('"name":"Cards"') ||
    graphJSON.includes('"name":"Sidebar"') ||
    graphJSON.includes('"name":"Modal"') ||
    graphJSON.includes('"name":"Footer"') ||
    graphJSON.includes('"name":"Component"') ||
    graphJSON.includes('"name":"Hero Banner"') ||
    graphJSON.includes('"name":"Category Strip"') ||
    graphJSON.includes('"name":"Featured List"') ||
    graphJSON.includes('"name":"Search Bar"') ||
    graphJSON.includes('"name":"Filter Chips"') ||
    graphJSON.includes('"name":"Product Results"') ||
    graphJSON.includes('"name":"Product Gallery"') ||
    graphJSON.includes('"name":"Product Summary"') ||
    graphJSON.includes('"name":"Options List"') ||
    graphJSON.includes('"name":"Shipping Form"') ||
    graphJSON.includes('"name":"Payment Methods"') ||
    graphJSON.includes('"name":"Mobile App Cart"') ||
    graphJSON.includes('"name":"Home"') ||
    graphJSON.includes('"name":"Listagem"') ||
    graphJSON.includes('"name":"Detalhe"') ||
    graphJSON.includes('"name":"Formulario"') ||
    graphJSON.includes('"name":"List"') ||
    graphJSON.includes('"name":"Detail"') ||
    graphJSON.includes('"name":"Form"')
  );
}

async function migrateV1toV2(): Promise<void> {
  const oldComponents = await listTable<V1ComponentRow>(TABLES.components);
  const oldScenes = await listTable<V1SceneRow>(TABLES.scenes);
  const oldThumbnails = await listTable<V1ThumbnailRow>(TABLES.thumbnails);
  const screens = await listTable<ScreenRow>(TABLES.screens);

  // First-screen lookup per project for orphan ("global") components.
  const firstScreenByProject = new Map<string, string>();
  const projectScreensSorted = new Map<string, ScreenRow[]>();
  for (const s of screens) {
    const arr = projectScreensSorted.get(s.projectId) ?? [];
    arr.push(s);
    projectScreensSorted.set(s.projectId, arr);
  }
  for (const [projectId, arr] of projectScreensSorted) {
    arr.sort((a, b) => a.order - b.order);
    if (arr[0]) firstScreenByProject.set(projectId, arr[0].id);
  }

  // Build new component + variant rows in memory.
  const componentToVariant = new Map<string, string>();
  const newComponents: ComponentRow[] = [];
  const newVariants: VariantRow[] = [];

  // Order computed per (projectId, screenId) bucket, sorted by createdAt then id.
  const bucketed = new Map<string, V1ComponentRow[]>();
  for (const c of oldComponents) {
    const screenId =
      c.screenId ?? firstScreenByProject.get(c.projectId) ?? null;
    if (!screenId) continue; // project has no screens — skip orphan
    const k = `${c.projectId}::${screenId}`;
    const arr = bucketed.get(k) ?? [];
    arr.push(c);
    bucketed.set(k, arr);
  }
  for (const [, arr] of bucketed) {
    arr.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  for (const [bucketKey, arr] of bucketed) {
    const [projectId, screenId] = bucketKey.split("::");
    arr.forEach((c, idx) => {
      const variantId = newId();
      componentToVariant.set(c.id, variantId);
      newVariants.push({
        id: variantId,
        componentId: c.id,
        name: "Default",
        order: 0,
        seedKey: c.variant,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });
      newComponents.push({
        id: c.id,
        projectId: projectId!,
        screenId: screenId!,
        parentVariantId: null,
        name: c.title,
        kind: c.kind,
        category: null,
        assignedScreenIds: [],
        activeVariantId: variantId,
        order: idx,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      });
    });
  }

  // Rewire scenes: 'component' rows now point at the Default variant.
  const newScenes: SceneRow[] = oldScenes
    .map<SceneRow | null>((s) => {
      if (s.ownerType === "screen") {
        return {
          id: s.id,
          ownerType: "screen",
          ownerId: s.ownerId,
          graphJSON: s.graphJSON,
          sceneVersion: s.sceneVersion,
          updatedAt: s.updatedAt,
        };
      }
      const variantId = componentToVariant.get(s.ownerId);
      if (!variantId) return null; // orphan scene (component dropped) — discard
      return {
        id: s.id,
        ownerType: "variant",
        ownerId: variantId,
        graphJSON: s.graphJSON,
        sceneVersion: s.sceneVersion,
        updatedAt: s.updatedAt,
      };
    })
    .filter((x): x is SceneRow => x !== null);

  const newThumbnails: ThumbnailRow[] = oldThumbnails
    .map<ThumbnailRow | null>((t) => {
      if (t.ownerType === "screen") {
        return {
          id: t.id,
          ownerType: "screen",
          ownerId: t.ownerId,
          dataUrl: t.dataUrl,
          capturedAt: t.capturedAt,
        };
      }
      const variantId = componentToVariant.get(t.ownerId);
      if (!variantId) return null;
      return {
        id: t.id,
        ownerType: "variant",
        ownerId: variantId,
        dataUrl: t.dataUrl,
        capturedAt: t.capturedAt,
      };
    })
    .filter((x): x is ThumbnailRow => x !== null);

  // All transformations done — commit.
  await replaceTable<ComponentRow>(TABLES.components, newComponents);
  await replaceTable<VariantRow>(TABLES.variants, newVariants);
  await replaceTable<SceneRow>(TABLES.scenes, newScenes);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, newThumbnails);

  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
}
