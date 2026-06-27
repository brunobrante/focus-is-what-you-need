import { TABLES, listTable } from "@/lib/storage/store";
import { linkEdge, setEdges } from "@/lib/storage/repos/edges.repo";
import type { EntityRef } from "@/domain/graph/edges";
import type {
  ComponentRow,
  ProjectRow,
  ReferenceAttachment,
  ReferenceRow,
  SceneRow,
  ScreenRow,
  VariantRow,
  WorkspaceRow,
} from "@/lib/storage/schema";

/**
 * Reconcile the ownership / containment / version / scene EDGES from the
 * authoritative row fields (Architecture.md, Storage ownership). This is
 * the transitional bridge: edges are derived from the existing `projectId` /
 * `screenId` / `parentVariantId` / `ownerKind` / `projectIds` fields the same way
 * `instance_usage` is derived from `graphJSON` — so the edge graph is always
 * correct and authoritative-capable, while the sync field readers keep working.
 *
 * The final flip (edges become the SOLE source; the fields are deleted and
 * `componentScope` reads `componentScopeFromEdges` via a hook) is the app-gated
 * step; this makes the graph real and consistent in the meantime, idempotently.
 */

// NOTE: component ownership is NOT reconciled from fields anymore — screenId /
// parentVariantId are gone and every write path (seed, createComponent, promote,
// clone, detach) emits the `owns` edge directly. Reconcile derives only the edges
// that still have an authoritative field source (containment / version / scene /
// reference attachment).

/** Reconcile workspace→project containment from `WorkspaceRow.projectIds`. */
export async function reconcileWorkspaceContainment(
  ws: WorkspaceRow,
): Promise<void> {
  await setEdges(
    { type: "workspace", id: ws.id },
    "contains",
    (ws.projectIds ?? []).map((id) => ({ type: "project" as const, id })),
  );
}

/** The single owner an attachment anchors to (component → screen → project →
 *  workspace precedence — the `attached_to` target). */
function attachmentOwner(a: ReferenceAttachment): EntityRef | null {
  if (a.componentId) return { type: "component", id: a.componentId };
  if (a.screenId) return { type: "screen", id: a.screenId };
  if (a.projectId) return { type: "project", id: a.projectId };
  if (a.workspaceId) return { type: "workspace", id: a.workspaceId };
  return null;
}

/** Reconcile a reference's `attached_to` edges from its `attachments[]` (one
 *  master, many places — multi-attach). The edge set mirrors the array. */
export async function reconcileReferenceAttachments(
  ref: ReferenceRow,
): Promise<void> {
  const targets = (ref.attachments ?? [])
    .map(attachmentOwner)
    .filter((o): o is EntityRef => o != null);
  await setEdges({ type: "reference", id: ref.id }, "attached_to", targets);
}

/**
 * Full backfill: derive the entire edge graph from every row. Idempotent
 * (linkEdge/setOwner dedupe by triple), so it is safe to run on every boot — it
 * self-heals any edge a not-yet-wired write path failed to emit, exactly like the
 * instance_usage cold rebuild.
 */
export async function reconcileAllGraphEdges(): Promise<void> {
  const [workspaces, projects, screens, components, variants, scenes, references] =
    await Promise.all([
      listTable<WorkspaceRow>(TABLES.workspaces),
      listTable<ProjectRow>(TABLES.projects),
      listTable<ScreenRow>(TABLES.screens),
      listTable<ComponentRow>(TABLES.components),
      listTable<VariantRow>(TABLES.variants),
      listTable<SceneRow>(TABLES.scenes),
      listTable<ReferenceRow>(TABLES.references),
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

  // Component `owns` edges are emitted directly by the seed + write paths (no field
  // source), so they are NOT reconciled here. `components` stays read for the other
  // backfills' consistency.
  void components;

  // reference/cut ──attached_to──▶ {workspace|project|screen|component} (multi-attach)
  for (const ref of references) {
    await reconcileReferenceAttachments(ref);
  }

  // `projects` is read to keep the backfill total even though project rows carry
  // no outgoing edge of their own (a loose project has no incoming `contains`).
  void projects;
}
