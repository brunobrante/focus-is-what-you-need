// The canonical graph-edge model (save-architecture-v3). Containment, ownership,
// versioning, and attachment are EDGES — indexed both directions — instead of
// fixed foreign-key fields. A new cross-entity capability is always a new
// EntityType + GraphRelation + edges, never a new nullable column (the
// fast-feature-building invariant).
//
// Instances are deliberately NOT edges (D7): a component instance is an
// `instanceOf` node inside the host scene's graphJSON; a token instance is the
// `TokenRow.instanceOf` field. There is no `instance_of` relation.

/**
 * Every entity that can sit at either end of an edge. `"user"` is reserved now so
 * workspace-people-permissions lands as pure additions later (D2).
 */
export type EntityType =
  | "workspace"
  | "project"
  | "screen"
  | "component"
  | "variant"
  | "scene"
  | "systemDesign"
  | "token"
  | "reference"
  | "stack"
  | "cut"
  | "user";

/**
 * Every relationship the graph expresses. `"member_of"` is reserved for the
 * permissions model (role in the edge metadata — D2). There is intentionally no
 * `instance_of` (D7).
 */
export type GraphRelation =
  | "contains" // workspace→project, project→screen
  | "owns" // workspace/project/variant → component; *→ systemDesign/reference
  | "has_version" // screen/component → variant
  | "owns_scene" // variant → scene
  | "has_stack" // reference → stack
  | "has_cut" // stack → cut
  | "attached_to" // reference/cut → {workspace|project|screen|component|variant}
  | "derived_from" // cut → component
  | "member_of"; // user → {workspace|project}  (reserved — D2)

export type EntityRef = { type: EntityType; id: string };

/**
 * One directed, typed edge. Carries the same `{deletedAt, rev}` envelope the
 * record store stamps on every row (it IS a record — table `graph_edges`), so it
 * rides the existing SaveQueue, outbox, SAVE-11 coalescing, and rev guard. A
 * deleted edge is a tombstone (`deletedAt != null`) filtered at hydration and
 * swept by a periodic GC.
 */
export type GraphEdgeRow = {
  id: string;
  fromType: EntityType;
  fromId: string;
  relation: GraphRelation;
  toType: EntityType;
  toId: string;
  order: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  rev?: number;
};

/** Filter for an edge query — any combination of endpoint and relation. */
export type EdgeFilter = {
  from?: EntityRef;
  to?: EntityRef;
  relation?: GraphRelation;
  includeDeleted?: boolean;
};

/** Stable key for the live-uniqueness of an edge: one live edge per triple. */
export function edgeTripleKey(
  fromType: EntityType,
  fromId: string,
  relation: GraphRelation,
  toType: EntityType,
  toId: string,
): string {
  return `${fromType}:${fromId}|${relation}|${toType}:${toId}`;
}

export function isLiveEdge(edge: GraphEdgeRow): boolean {
  return edge.deletedAt == null;
}
