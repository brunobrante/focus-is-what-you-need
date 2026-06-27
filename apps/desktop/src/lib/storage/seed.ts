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
import { reconcileAllGraphEdges } from "@/application/graph/ownershipReconcile";
import { linkEdge } from "@/lib/storage/repos/edges.repo";
import { sweepEdgeTombstones } from "@/application/graph/edgeIndex";
import { primeInstanceUsage } from "@/application/scenes/instanceUsage";
import {
  SCHEMA_VERSION,
  type ComponentRow,
  type Meta,
  type ProjectRow,
  type ReferenceRow,
  type SceneRow,
  type ScreenRow,
  type ThumbnailRow,
  type VariantRow,
  type WorkspaceRow,
} from "@/lib/storage/schema";
import { TABLES, getMeta, listTable, notify, replaceTable, setMeta } from "@/lib/storage/store";
import { sceneRecordId } from "@/lib/storage/repos/scenes.repo";
import { thumbnailRecordId } from "@/lib/storage/repos/thumbnails.repo";
import { putAssetText } from "@/application/persistence/assetStore";

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
  } else {
    // Fresh install or schema version mismatch: nuke and reseed.
    await firstBootSeedV5();
    await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: now() });
  }

  // Derive the ownership/containment/version/scene edge graph from the row fields
  // (save-architecture-v3 Step 2). Idempotent + self-healing: it backfills any
  // edge a not-yet-wired write path missed, so the graph is always consistent.
  await reconcileAllGraphEdges();
  // Reclaim disk/hydration cost from edge tombstones a long-lived workspace
  // accumulated (graph hot-path GC). In-memory reads already skip tombstones.
  await sweepEdgeTombstones();
  // Warm the instance_usage cache so the synchronous save-path reconcile sees a
  // complete existing-row set via peekTable (cold-rebuilds from scenes if empty).
  await primeInstanceUsage();
}

export async function resetToFactoryData(): Promise<void> {
  await firstBootSeedV5();
  await writeMeta({ schemaVersion: SCHEMA_VERSION, seededAt: now() });
  await reconcileAllGraphEdges();
  notify(TABLES.meta);
  notify(TABLES.workspaces);
}

async function firstBootSeedV5(): Promise<void> {
  const t = now();

  const projects: ProjectRow[] = PROJECTS.map((p) => ({
    id: newId(),
    name: p.name,
    type: p.type,
    source: "mock",
    thumbnailBlobKey: null,
    description: null,
    previewScreenId: null,
    designSystem: createDefaultDesignSystem(),
    createdAt: t,
    updatedAt: t,
  }));

  const screens: ScreenRow[] = [];
  const variants: VariantRow[] = [];
  // Each screen is a master owning a main variant (order 0); that variant owns the
  // screen's editable scene.
  const mainVariantByScreenId = new Map<string, string>();
  for (const project of projects) {
    screensForProject(project).forEach((s, idx) => {
      const screenId = newId();
      const variantId = newId();
      variants.push({
        id: variantId,
        ownerKind: "screen",
        ownerId: screenId,
        name: "Default",
        order: 0,
        seedKey: null,
        createdAt: t,
        updatedAt: t,
      });
      mainVariantByScreenId.set(screenId, variantId);
      screens.push({
        id: screenId,
        projectId: project.id,
        title: s.title,
        variant: s.variant,
        order: idx,
        activeVariantId: variantId,
        createdAt: t,
        updatedAt: t,
      });
    });
  }

  const components: ComponentRow[] = [];
  const references: ReferenceRow[] = [];
  const projectTypeById = new Map(projects.map((p) => [p.id, p.type]));
  const scenes: SceneRow[] = [];
  const thumbnails: ThumbnailRow[] = [];
  const thumbnailBlobs: SeedThumbnailBlob[] = [];
  const ownerEdges: SeedOwnerEdge[] = [];

  for (const screen of screens) {
    const projectType = projectTypeById.get(screen.projectId);
    if (!projectType) continue;
    const bundle = await getCanvasMockBundleForScreen(screen, projectType);
    if (!bundle) continue;
    const mainVariantId = mainVariantByScreenId.get(screen.id)!;
    scenes.push(createMockSceneRow(mainVariantId, "variant", bundle.screen, t));
    thumbnails.push(
      createMockThumbnailRow(mainVariantId, "variant", bundle.screen, t, thumbnailBlobs),
    );
    seedComponentTree({
      projectId: screen.projectId,
      // Screen-top-level components are owned by the screen's MAIN variant.
      ownerVariantId: mainVariantId,
      nodes: bundle.components,
      components,
      variants,
      scenes,
      thumbnails,
      thumbnailBlobs,
      ownerEdges,
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

  // Populate every cache silently, then fire one batched notify below, so a
  // subscriber never observes a half-applied cross-table reseed (SAVE-4).
  const silent = { silent: true };
  await replaceTable<ProjectRow>(TABLES.projects, projects, silent);
  await replaceTable<ScreenRow>(TABLES.screens, screens, silent);
  await replaceTable<ComponentRow>(TABLES.components, components, silent);
  await replaceTable<VariantRow>(TABLES.variants, variants, silent);
  await replaceTable<ReferenceRow>(TABLES.references, references, silent);
  await replaceTable<SceneRow>(TABLES.scenes, scenes, silent);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails, silent);
  await writeSeedThumbnailBlobs(thumbnailBlobs);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, [workspace], silent);
  await replaceTable<never>(TABLES.history, [], silent);
  // System designs (and their tokens, now their own rows — flip 2) are created
  // lazily, never seeded. Clear both so a reseed cannot leave a stale design from
  // a prior schema shape behind; they re-materialize fresh on next access.
  await replaceTable<never>(TABLES.systemDesigns, [], silent);
  await replaceTable<never>(TABLES.tokens, [], silent);

  notify(TABLES.projects);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.references);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.workspaces);
  notify(TABLES.history);
  notify(TABLES.systemDesigns);
  notify(TABLES.tokens);

  // Ownership is the edge now — emit the `variant owns component` edges the tree
  // collected (the rows carry no screenId/parentVariantId to derive from).
  await emitSeedOwnerEdges(ownerEdges);
}

async function ensureFactoryMocksPresent(): Promise<void> {
  const t = now();
  const ownerEdges: SeedOwnerEdge[] = [];
  const thumbnailBlobs: SeedThumbnailBlob[] = [];
  let projects = await listTable<ProjectRow>(TABLES.projects);
  let screens = await listTable<ScreenRow>(TABLES.screens);
  let components = (await listTable<ComponentRow>(TABLES.components)).map(
    normalizeComponentRow,
  );
  let variants = await listTable<VariantRow>(TABLES.variants);
  let scenes = await listTable<SceneRow>(TABLES.scenes);
  let thumbnails = await listTable<ThumbnailRow>(TABLES.thumbnails);
  let workspaces = await listTable<WorkspaceRow>(TABLES.workspaces);

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
      thumbnailBlobKey: null,
      description: null,
      previewScreenId: null,
      designSystem: createDefaultDesignSystem(),
      createdAt: t,
      updatedAt: t,
    });
    projects = [...projects, project];
    addedProjectIds.push(project.id);

    const newScreens: ScreenRow[] = [];
    const newMainVariantByScreenId = new Map<string, string>();
    screensForProject(project).forEach((screen, order) => {
      const screenId = newId();
      const variantId = newId();
      variants.push({
        id: variantId,
        ownerKind: "screen",
        ownerId: screenId,
        name: "Default",
        order: 0,
        seedKey: null,
        createdAt: t,
        updatedAt: t,
      });
      newMainVariantByScreenId.set(screenId, variantId);
      newScreens.push({
        id: screenId,
        projectId: project.id,
        title: screen.title,
        variant: screen.variant,
        order,
        activeVariantId: variantId,
        createdAt: t,
        updatedAt: t,
      });
    });
    screens = [...screens, ...newScreens];

    for (const screen of newScreens) {
      const bundle = await getCanvasMockBundleForScreen(screen, project.type);
      if (!bundle) continue;
      const mainVariantId = newMainVariantByScreenId.get(screen.id)!;
      scenes = [...scenes, createMockSceneRow(mainVariantId, "variant", bundle.screen, t)];
      thumbnails = [
        ...thumbnails,
        createMockThumbnailRow(mainVariantId, "variant", bundle.screen, t, thumbnailBlobs),
      ];
      seedComponentTree({
        projectId: project.id,
        ownerVariantId: mainVariantId,
        nodes: bundle.components,
        components,
        variants,
        scenes,
        thumbnails,
        thumbnailBlobs,
        ownerEdges,
        t,
      });
    }

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

  // Silent fill + one batched notify, so no subscriber sees a partial state (SAVE-4).
  const silent = { silent: true };
  await replaceTable<ProjectRow>(TABLES.projects, projects, silent);
  await replaceTable<ScreenRow>(TABLES.screens, screens, silent);
  await replaceTable<ComponentRow>(TABLES.components, components, silent);
  await replaceTable<VariantRow>(TABLES.variants, variants, silent);
  await replaceTable<SceneRow>(TABLES.scenes, scenes, silent);
  await replaceTable<ThumbnailRow>(TABLES.thumbnails, thumbnails, silent);
  await writeSeedThumbnailBlobs(thumbnailBlobs);
  await replaceTable<WorkspaceRow>(TABLES.workspaces, workspaces, silent);

  notify(TABLES.projects);
  notify(TABLES.screens);
  notify(TABLES.components);
  notify(TABLES.variants);
  notify(TABLES.scenes);
  notify(TABLES.thumbnails);
  notify(TABLES.workspaces);

  await emitSeedOwnerEdges(ownerEdges);
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
    id: sceneRecordId(ownerType, ownerId),
    ownerType,
    ownerId,
    graphJSON: mock.graphJSON,
    sceneVersion: mock.sceneVersion,
    updatedAt: t,
  };
}

// A snapshot blob the seed must write to the asset store (flip 3): thumbnails no
// longer carry the data URL inline. Collected while rows are built, written after.
type SeedThumbnailBlob = { blobKey: string; dataUrl: string };

function createMockThumbnailRow(
  ownerId: string,
  ownerType: ThumbnailRow["ownerType"],
  mock: CanvasMockData,
  t: number,
  blobSink: SeedThumbnailBlob[],
): ThumbnailRow {
  const id = thumbnailRecordId(ownerType, ownerId);
  // Stable blob key == record id (matches the runtime upsert), so the snapshot
  // overwrites in place when a screen is later edited.
  blobSink.push({ blobKey: id, dataUrl: mock.snapshot });
  return {
    id,
    ownerType,
    ownerId,
    dataBlobKey: id,
    capturedAt: t,
  };
}

/** Write the collected snapshot data URLs to the asset store. */
async function writeSeedThumbnailBlobs(blobs: SeedThumbnailBlob[]): Promise<void> {
  for (const blob of blobs) {
    await putAssetText(blob.dataUrl, {
      blobKey: blob.blobKey,
      mimeType: "image/svg+xml",
    });
  }
}

/** An `owns` edge the seed must emit: `variant ──owns──▶ component`. Ownership is
 *  the edge now (no screenId/parentVariantId fields), so the seed records the
 *  owner of each component it builds and emits the edges after the rows land. */
export type SeedOwnerEdge = { ownerVariantId: string; componentId: string };

function seedComponentTree(input: {
  projectId: string;
  // The variant that OWNS the nodes at this level: a screen's main variant for its
  // top-level components, or the parent component's default variant for nested ones.
  ownerVariantId: string;
  nodes: MockComponentSeed[];
  components: ComponentRow[];
  variants: VariantRow[];
  scenes: SceneRow[];
  thumbnails: ThumbnailRow[];
  thumbnailBlobs: SeedThumbnailBlob[];
  ownerEdges: SeedOwnerEdge[];
  t: number;
}): void {
  for (const [order, node] of input.nodes.entries()) {
    const componentId = newId();
    const variantId = newId();

    input.variants.push({
      id: variantId,
      ownerKind: "component",
      ownerId: componentId,
      name: "Default",
      order: 0,
      seedKey: null,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.components.push({
      id: componentId,
      projectId: input.projectId,
      name: node.name,
      kind: node.kind,
      category: null,
      assignedScreenIds: [],
      activeVariantId: variantId,
      order,
      createdAt: input.t,
      updatedAt: input.t,
    });
    input.ownerEdges.push({ ownerVariantId: input.ownerVariantId, componentId });
    input.scenes.push(
      createMockSceneRow(variantId, "variant", node.canvas, input.t),
    );
    input.thumbnails.push(
      createMockThumbnailRow(
        variantId,
        "variant",
        node.canvas,
        input.t,
        input.thumbnailBlobs,
      ),
    );

    // Children nest under this component's own Default variant.
    seedComponentTree({ ...input, ownerVariantId: variantId, nodes: node.children });
  }
}

/** Emit the `variant owns component` edges the seed collected (after the rows are
 *  in the store), so component ownership is edge-authoritative from first boot. */
async function emitSeedOwnerEdges(edges: SeedOwnerEdge[]): Promise<void> {
  for (const e of edges) {
    await linkEdge({
      from: { type: "variant", id: e.ownerVariantId },
      relation: "owns",
      to: { type: "component", id: e.componentId },
    });
  }
}
