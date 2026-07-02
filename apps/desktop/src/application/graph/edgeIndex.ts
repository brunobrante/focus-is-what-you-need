import {
  edgeTripleKey,
  isLiveEdge,
  type EntityRef,
  type GraphEdgeRow,
  type GraphRelation,
} from "@/domain/graph/edges";
import { TABLES, listTable, removeRecords, subscribe } from "@/lib/storage/store";
import { now } from "@/lib/storage/ids";

/**
 * The bidirectional adjacency index over `graph_edges` (Architecture.md
 * graph hot-path). Edges live in the record-store cache like any table; this
 * derives `from→edges` / `to→edges` maps once and then maintains them
 * **incrementally** — an edge write is O(1), never an O(E) full rebuild — so
 * ownership / containment / usage resolution is in-memory O(1) and never
 * round-trips to SQLite on a read.
 *
 * Tombstones (`deletedAt != null`) are filtered at hydration and excluded from
 * the maps; a periodic GC hard-deletes old ones (`sweepEdgeTombstones`, below).
 */
type EdgeMaps = {
  from: Map<string, GraphEdgeRow[]>;
  to: Map<string, GraphEdgeRow[]>;
  byTriple: Map<string, GraphEdgeRow>;
  byId: Map<string, GraphEdgeRow>;
};

function emptyMaps(): EdgeMaps {
  return { from: new Map(), to: new Map(), byTriple: new Map(), byId: new Map() };
}

let maps = emptyMaps();
let hydrated = false;
/** Set by an EXTERNAL graph_edges change (reseed); forces a rebuild. The repo
 *  clears it after applying its own write incrementally, so a normal edge write
 *  never costs a rebuild. */
let dirty = false;
let subscribed = false;

const refKey = (type: string, id: string) => `${type}:${id}`;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  subscribe(TABLES.graphEdges, () => {
    dirty = true;
  });
}

function addToBucket(
  map: Map<string, GraphEdgeRow[]>,
  key: string,
  edge: GraphEdgeRow,
): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(edge);
  else map.set(key, [edge]);
}

function removeFromBucket(
  map: Map<string, GraphEdgeRow[]>,
  key: string,
  id: string,
): void {
  const bucket = map.get(key);
  if (!bucket) return;
  const next = bucket.filter((e) => e.id !== id);
  if (next.length) map.set(key, next);
  else map.delete(key);
}

function indexLiveEdge(edge: GraphEdgeRow): void {
  maps.byId.set(edge.id, edge);
  maps.byTriple.set(
    edgeTripleKey(edge.fromType, edge.fromId, edge.relation, edge.toType, edge.toId),
    edge,
  );
  addToBucket(maps.from, refKey(edge.fromType, edge.fromId), edge);
  addToBucket(maps.to, refKey(edge.toType, edge.toId), edge);
}

function build(edges: GraphEdgeRow[]): void {
  maps = emptyMaps();
  for (const edge of edges) {
    if (isLiveEdge(edge)) indexLiveEdge(edge);
  }
  hydrated = true;
  dirty = false;
}

async function ensureMaps(): Promise<EdgeMaps> {
  ensureSubscribed();
  if (!hydrated || dirty) {
    build(await listTable<GraphEdgeRow>(TABLES.graphEdges));
  }
  return maps;
}

/**
 * Incrementally fold one edge write into the live index (called by the edge repo
 * AFTER it persists, so the repo's own notify never triggers a rebuild). Removes
 * any prior copy of the edge (by id), then re-adds it when still live.
 */
export function applyEdgeToIndex(edge: GraphEdgeRow): void {
  if (!hydrated) return; // not built yet — the next ensureMaps() will include it
  const prev = maps.byId.get(edge.id);
  if (prev) {
    maps.byId.delete(prev.id);
    maps.byTriple.delete(
      edgeTripleKey(prev.fromType, prev.fromId, prev.relation, prev.toType, prev.toId),
    );
    removeFromBucket(maps.from, refKey(prev.fromType, prev.fromId), prev.id);
    removeFromBucket(maps.to, refKey(prev.toType, prev.toId), prev.id);
  }
  if (isLiveEdge(edge)) indexLiveEdge(edge);
  // The repo clears the dirty flag its own putRecord just set.
  dirty = false;
}

// --- queries (all in-memory O(1) / O(degree)) --------------------------------

export async function edgesFrom(
  ref: EntityRef,
  relation?: GraphRelation,
): Promise<GraphEdgeRow[]> {
  const m = await ensureMaps();
  const all = m.from.get(refKey(ref.type, ref.id)) ?? [];
  return relation ? all.filter((e) => e.relation === relation) : all.slice();
}

export async function edgesTo(
  ref: EntityRef,
  relation?: GraphRelation,
): Promise<GraphEdgeRow[]> {
  const m = await ensureMaps();
  const all = m.to.get(refKey(ref.type, ref.id)) ?? [];
  return relation ? all.filter((e) => e.relation === relation) : all.slice();
}

/** The single live edge for a triple, if any (the unique-live guarantee). */
export async function liveEdgeForTriple(
  fromType: GraphEdgeRow["fromType"],
  fromId: string,
  relation: GraphRelation,
  toType: GraphEdgeRow["toType"],
  toId: string,
): Promise<GraphEdgeRow | null> {
  const m = await ensureMaps();
  return m.byTriple.get(edgeTripleKey(fromType, fromId, relation, toType, toId)) ?? null;
}

// --- sync peeks (best-effort; null/empty until the index is hydrated) --------
//
// For render-path readers that cannot await. They read the CURRENT maps without
// triggering hydration, so a caller must tolerate a miss before the graph_edges
// table has loaded (e.g. fall back to a row field). Once any async edge query has
// run, or `primeEdgeIndex()` has resolved, these are authoritative.

export function peekEdgesTo(
  type: string,
  id: string,
  relation?: GraphRelation,
): GraphEdgeRow[] {
  if (!hydrated) return [];
  const all = maps.to.get(refKey(type, id)) ?? [];
  return relation ? all.filter((e) => e.relation === relation) : all.slice();
}

export function peekEdgesFrom(
  type: string,
  id: string,
  relation?: GraphRelation,
): GraphEdgeRow[] {
  if (!hydrated) return [];
  const all = maps.from.get(refKey(type, id)) ?? [];
  return relation ? all.filter((e) => e.relation === relation) : all.slice();
}

/** Sync owner ref of a target via its incoming `owns` edge (null if none/cold). */
export function peekOwnerOf(type: string, id: string): EntityRef | null {
  const [edge] = peekEdgesTo(type, id, "owns");
  return edge ? { type: edge.fromType, id: edge.fromId } : null;
}

/**
 * Sync live edge for a triple (null until the index is hydrated). Lets `linkEdge`
 * do an atomic check-then-write with no await between the two, closing the race
 * where two concurrent links for the same triple both miss and create duplicate
 * live edges (L3).
 */
export function peekLiveEdgeForTriple(
  fromType: GraphEdgeRow["fromType"],
  fromId: string,
  relation: GraphRelation,
  toType: GraphEdgeRow["toType"],
  toId: string,
): GraphEdgeRow | null {
  if (!hydrated) return null;
  return maps.byTriple.get(edgeTripleKey(fromType, fromId, relation, toType, toId)) ?? null;
}

/** Eagerly hydrate the index so subsequent sync peeks are authoritative. */
export async function primeEdgeIndex(): Promise<void> {
  await ensureMaps();
}

/**
 * Periodic GC: hard-delete edge tombstones older than `maxAgeMs` (graph hot-path
 * decision). In-memory reads already filter tombstones, so this only reclaims
 * disk + hydration cost — but without it a long-lived workspace's `graph_edges`
 * table bloats with dead rows. The grace window keeps recent deletes around for a
 * future sync layer to observe before they're reaped. Returns the count swept.
 */
const TOMBSTONE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function sweepEdgeTombstones(
  maxAgeMs: number = TOMBSTONE_GRACE_MS,
): Promise<number> {
  const cutoff = now() - maxAgeMs;
  const edges = await listTable<GraphEdgeRow>(TABLES.graphEdges);
  const stale = edges.filter(
    (e) => e.deletedAt != null && e.deletedAt < cutoff,
  );
  if (stale.length === 0) return 0;
  removeRecords(
    TABLES.graphEdges,
    stale.map((e) => e.id),
  );
  return stale.length;
}

/** Test seam: drop the index so the next query rebuilds from the store. */
export function resetEdgeIndex(): void {
  maps = emptyMaps();
  hydrated = false;
  dirty = false;
}
