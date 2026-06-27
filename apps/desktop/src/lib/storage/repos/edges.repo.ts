import { newId, now } from "@/lib/storage/ids";
import { TABLES, putRecord } from "@/lib/storage/store";
import {
  applyEdgeToIndex,
  edgesFrom,
  edgesTo,
  liveEdgeForTriple,
} from "@/application/graph/edgeIndex";
import type {
  EdgeFilter,
  EntityRef,
  GraphEdgeRow,
  GraphRelation,
} from "@/domain/graph/edges";

const KEY = TABLES.graphEdges;

/**
 * The one uniform edge API (save-architecture-v3 fast-feature-building
 * invariant): features compose `linkEdge` / `unlinkEdge` / `relinkEdge` /
 * `listEdges` instead of adding nullable foreign-key columns. Edges are rows in
 * the `graph_edges` table, so every write rides the SaveQueue + outbox + rev
 * guard for free; a delete is a tombstone (`deletedAt`), swept later by GC.
 *
 * Live-uniqueness (one live edge per from→relation→to triple) is enforced here
 * via the adjacency index, so `linkEdge` is idempotent.
 */

function persist(edge: GraphEdgeRow): void {
  putRecord<GraphEdgeRow>(KEY, edge);
  // Keep the in-memory index current and clear the dirty flag our putRecord set.
  applyEdgeToIndex(edge);
}

export type LinkEdgeInput = {
  from: EntityRef;
  relation: GraphRelation;
  to: EntityRef;
  order?: number | null;
  metadata?: Record<string, unknown> | null;
};

/** Create the edge, or update an existing live edge for the same triple. */
export async function linkEdge(input: LinkEdgeInput): Promise<GraphEdgeRow> {
  const existing = await liveEdgeForTriple(
    input.from.type,
    input.from.id,
    input.relation,
    input.to.type,
    input.to.id,
  );
  const t = now();
  if (existing) {
    const order = input.order === undefined ? existing.order : input.order;
    const metadata =
      input.metadata === undefined ? existing.metadata : input.metadata;
    if (order === existing.order && metadata === existing.metadata) {
      return existing; // nothing changed — idempotent
    }
    const updated: GraphEdgeRow = { ...existing, order, metadata, updatedAt: t };
    persist(updated);
    return updated;
  }
  const edge: GraphEdgeRow = {
    id: newId(),
    fromType: input.from.type,
    fromId: input.from.id,
    relation: input.relation,
    toType: input.to.type,
    toId: input.to.id,
    order: input.order ?? null,
    metadata: input.metadata ?? null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  };
  persist(edge);
  return edge;
}

/** Tombstone the live edge for a triple, if present. */
export async function unlinkEdge(
  from: EntityRef,
  relation: GraphRelation,
  to: EntityRef,
): Promise<void> {
  const existing = await liveEdgeForTriple(
    from.type,
    from.id,
    relation,
    to.type,
    to.id,
  );
  if (!existing) return;
  const t = now();
  persist({ ...existing, deletedAt: t, updatedAt: t });
}

/**
 * Move an edge's target (e.g. re-home an `owns` edge on promote): tombstone the
 * old triple and link the new one, carrying order/metadata across.
 */
export async function relinkEdge(
  from: EntityRef,
  relation: GraphRelation,
  oldTo: EntityRef,
  newTo: EntityRef,
): Promise<GraphEdgeRow | null> {
  const existing = await liveEdgeForTriple(
    from.type,
    from.id,
    relation,
    oldTo.type,
    oldTo.id,
  );
  if (!existing) return null;
  await unlinkEdge(from, relation, oldTo);
  return linkEdge({
    from,
    relation,
    to: newTo,
    order: existing.order,
    metadata: existing.metadata,
  });
}

/** Query live edges by any combination of endpoint + relation. */
export async function listEdges(filter: EdgeFilter): Promise<GraphEdgeRow[]> {
  if (filter.from) {
    let edges = await edgesFrom(filter.from, filter.relation);
    if (filter.to) {
      edges = edges.filter(
        (e) => e.toType === filter.to!.type && e.toId === filter.to!.id,
      );
    }
    return edges;
  }
  if (filter.to) {
    return edgesTo(filter.to, filter.relation);
  }
  // No endpoint anchor — rare; callers should anchor on from/to for the index.
  // A relation-only sweep would need a full scan, intentionally unsupported here.
  return [];
}

// --- typed convenience over the generic API ---------------------------------

/** The single entity that `owns` the target, via the incoming `owns` edge. */
export async function ownerOf(target: EntityRef): Promise<EntityRef | null> {
  const [edge] = await edgesTo(target, "owns");
  return edge ? { type: edge.fromType, id: edge.fromId } : null;
}

/**
 * Make `owner` the sole owner of `target` (or remove ownership when null — a
 * Draft). Tombstones any other incoming `owns` edge, so this is the one
 * ownership primitive every write path uses: create, re-home (promote), or
 * detach-to-draft. Idempotent.
 */
export async function setOwner(
  owner: EntityRef | null,
  target: EntityRef,
): Promise<void> {
  const current = await edgesTo(target, "owns");
  for (const e of current) {
    if (owner && e.fromType === owner.type && e.fromId === owner.id) continue;
    await unlinkEdge({ type: e.fromType, id: e.fromId }, "owns", target);
  }
  if (owner) await linkEdge({ from: owner, relation: "owns", to: target });
}

/**
 * Reconcile the FULL set of `from --relation--> *` edges to exactly `targets`:
 * tombstone live edges no longer wanted, link the rest (ordered). The multi-target
 * primitive behind containment and reference attachment — idempotent.
 */
export async function setEdges(
  from: EntityRef,
  relation: GraphRelation,
  targets: EntityRef[],
): Promise<void> {
  const desired = new Set(targets.map((t) => `${t.type}:${t.id}`));
  for (const e of await edgesFrom(from, relation)) {
    if (!desired.has(`${e.toType}:${e.toId}`)) {
      await unlinkEdge(from, relation, { type: e.toType, id: e.toId });
    }
  }
  let order = 0;
  for (const target of targets) {
    await linkEdge({ from, relation, to: target, order: order++ });
  }
}

/** Make `container` the sole container of `target` (or loose when null). */
export async function setContainer(
  container: EntityRef | null,
  target: EntityRef,
  order?: number | null,
): Promise<void> {
  const current = await edgesTo(target, "contains");
  for (const e of current) {
    if (container && e.fromType === container.type && e.fromId === container.id) continue;
    await unlinkEdge({ type: e.fromType, id: e.fromId }, "contains", target);
  }
  if (container) {
    await linkEdge({ from: container, relation: "contains", to: target, order });
  }
}

/** The single container of the target, via the incoming `contains` edge. */
export async function containerOf(target: EntityRef): Promise<EntityRef | null> {
  const [edge] = await edgesTo(target, "contains");
  return edge ? { type: edge.fromType, id: edge.fromId } : null;
}

/** Targets the source entity points at over a relation (ordered if `order` set). */
export async function relatedTargets(
  from: EntityRef,
  relation: GraphRelation,
): Promise<EntityRef[]> {
  const edges = await edgesFrom(from, relation);
  return edges
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((e) => ({ type: e.toType, id: e.toId }));
}
