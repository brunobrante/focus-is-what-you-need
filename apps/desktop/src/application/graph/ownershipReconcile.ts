import { TABLES, listTable } from "@/lib/storage/store";
import { linkEdge, setOwner } from "@/lib/storage/repos/edges.repo";
import type { EntityRef } from "@/domain/graph/edges";
import type {
  ComponentRow,
  ProjectRow,
  SceneRow,
  ScreenRow,
  VariantRow,
  WorkspaceRow,
} from "@/lib/storage/schema";

/**
 * Reconcile the ownership / containment / version / scene EDGES from the
 * authoritative row fields (save-architecture-v3 "Ownership as edges"). This is
 * the transitional bridge: edges are derived from the existing `projectId` /
 * `screenId` / `parentVariantId` / `ownerKind` / `projectIds` fields the same way
 * `instance_usage` is derived from `graphJSON` — so the edge graph is always
 * correct and authoritative-capable, while the sync field readers keep working.
 *
 * The final flip (edges become the SOLE source; the fields are deleted and
 * `componentScope` reads `componentScopeFromEdges` via a hook) is the app-gated
 * step; this makes the graph real and consistent in the meantime, idempotently.
 */

/** The lowest-order ("main") variant id a screen owns — its embedding scene.
 *  Inlined (not imported from scenes.repo) to keep this module out of the
 *  scenes.repo → thumbnailQueue → projects.repo → seed import cycle. */
function mainVariantIdForScreen(
  variants: VariantRow[],
  screenId: string,
): string | null {
  let main: VariantRow | null = null;
  for (const v of variants) {
    if (v.ownerKind !== "screen" || v.ownerId !== screenId) continue;
    if (!main || v.order < main.order) main = v;
  }
  return main?.id ?? null;
}

/** Map a component's owner fields to the single `owns`-edge source (D: uniform
 *  `*owns* component`). A screen-top-level component is owned by the screen's
 *  MAIN variant, collapsing the old screenId/parentVariantId asymmetry. */
function componentOwnerRef(
  row: ComponentRow,
  screenMainVariantId: (screenId: string) => string | null,
): EntityRef | null {
  if (row.parentVariantId) return { type: "variant", id: row.parentVariantId };
  if (row.screenId) {
    const mainId = screenMainVariantId(row.screenId);
    return mainId ? { type: "variant", id: mainId } : null;
  }
  if (row.projectId) return { type: "project", id: row.projectId };
  if (row.workspaceId) return { type: "workspace", id: row.workspaceId };
  return null; // Draft — no owner edge
}

/** Reconcile one component's `owns` edge from its fields. */
export async function reconcileComponentOwner(
  row: ComponentRow,
  variants?: VariantRow[],
): Promise<void> {
  const vs = variants ?? (await listTable<VariantRow>(TABLES.variants));
  const owner = componentOwnerRef(row, (sid) => mainVariantIdForScreen(vs, sid));
  await setOwner(owner, { type: "component", id: row.id });
}

/** Reconcile workspace→project containment from `WorkspaceRow.projectIds`. */
export async function reconcileWorkspaceContainment(
  ws: WorkspaceRow,
): Promise<void> {
  let order = 0;
  for (const projectId of ws.projectIds ?? []) {
    await linkEdge({
      from: { type: "workspace", id: ws.id },
      relation: "contains",
      to: { type: "project", id: projectId },
      order: order++,
    });
  }
}

/**
 * Full backfill: derive the entire edge graph from every row. Idempotent
 * (linkEdge/setOwner dedupe by triple), so it is safe to run on every boot — it
 * self-heals any edge a not-yet-wired write path failed to emit, exactly like the
 * instance_usage cold rebuild.
 */
export async function reconcileAllGraphEdges(): Promise<void> {
  const [workspaces, projects, screens, components, variants, scenes] =
    await Promise.all([
      listTable<WorkspaceRow>(TABLES.workspaces),
      listTable<ProjectRow>(TABLES.projects),
      listTable<ScreenRow>(TABLES.screens),
      listTable<ComponentRow>(TABLES.components),
      listTable<VariantRow>(TABLES.variants),
      listTable<SceneRow>(TABLES.scenes),
    ]);

  // workspace ──contains──▶ project
  for (const ws of workspaces) await reconcileWorkspaceContainment(ws);

  // project ──contains──▶ screen
  for (const screen of screens) {
    if (!screen.projectId) continue;
    await linkEdge({
      from: { type: "project", id: screen.projectId },
      relation: "contains",
      to: { type: "screen", id: screen.id },
      order: screen.order,
    });
  }

  // screen/component ──has_version──▶ variant
  for (const v of variants) {
    await linkEdge({
      from: { type: v.ownerKind, id: v.ownerId },
      relation: "has_version",
      to: { type: "variant", id: v.id },
      order: v.order,
    });
  }

  // variant ──owns_scene──▶ scene
  for (const scene of scenes) {
    if (scene.ownerType !== "variant") continue;
    await linkEdge({
      from: { type: "variant", id: scene.ownerId },
      relation: "owns_scene",
      to: { type: "scene", id: scene.id },
    });
  }

  // owner ──owns──▶ component (uniform rule, derived from fields)
  for (const c of components) {
    await reconcileComponentOwner(c, variants);
  }

  // `projects` is read to keep the backfill total even though project rows carry
  // no outgoing edge of their own (a loose project has no incoming `contains`).
  void projects;
}
