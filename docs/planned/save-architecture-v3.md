# Save Architecture v3 — Workspace Graph Storage

## What this document is

The next storage model for the app. It builds on the **v2 persistence rewrite**
(record-per-row, async `SaveQueue`, outbox, SQLite/IndexedDB/memory adapters) and
turns the cross-entity relationships — today encoded in fixed fields and scattered
inside scene JSON — into an **indexed graph of edges**.

This is **storage-only**. It does not define editor UI, renderer behavior, sync
APIs, or visual design.

> **This revision is aligned to the shipped model.** An earlier draft of v3 was
> written before the versioning unification (`Versioning.md` Phase 8) and
> promote-to-main landed. It re-split screens and component versions into separate
> `ScreenVersionRow` / `ComponentVersionRow` and revived the `ComponentPlacementRow`
> /`screen_versions` tables that `Versioning.md` §3.1 explicitly **removed as unused
> aspirational code**. That contradicted Law 7 (Screen = Component) and the Copy /
> promote laws. This version keeps the **unified `VariantRow`** model and folds the
> deferred "unify component ownership" cleanup in. See "What stays from today".

---

## Why v3 exists

v2 fixed *performance of persistence* (one row per record, batched async writes, no
UI `await`). That foundation is **kept**. The remaining problem is the **domain
shape**: the product is already a graph but is stored as a tree pretending to be one.

Three concrete pains today, all traceable to that mismatch:

1. **Loose entities strain the field model.** `Product.md` says projects can exist
   without a workspace, screens/components without a project ("Drafts"), references
   with no attachment. The current rows lean on near-mandatory `projectId` /
   `screenId`, so "no parent" is a nullable-field special case instead of simply
   "no edge".
2. **Cross-entity relationships are not indexed.** "Which scenes use this master?"
   (`listInstanceUsages`) scans **every** scene and `JSON.parse`s its `graphJSON`
   (O(scenes × nodes), see `Better.md` SAVE-5). Ownership asymmetry
   (`screenId` for a screen's main vs `parentVariantId` for everything else) forces
   re-home logic and "is this the screen's main" special-casing across the layers.
3. **Large blobs live in the hot table.** Scene `graphJSON` and base64 thumbnails sit
   in the same generic `records` table that gets bulk-listed under the DB lock
   (`Better.md` RUST-4), so a full table read drags megabytes through one IPC.

v3 separates **entity identity** (what a thing is) from **graph structure** (how
things connect), indexes the structure, and moves large binaries out of the row JSON.

---

## Core principles

1. **An entity row stores what the entity is.** No parent ids, no consumer lists as
   the *source of truth* for structure.
2. **An edge row stores how entities connect.** Containment, ownership, attachment,
   and token links are `graph_edges` rows — indexed both directions.
3. **A scene's `graphJSON` stays the node tree of one subject** — including instance
   nodes (`instanceOf`). The node tree *within* a subject is a tree and stays a JSON
   blob, edited in memory and serialized (exactly like today; like Figma's layer
   tree). **We do not explode scene nodes into edge rows.**
4. **Derived indexes are never canonical.** The reverse "who uses this master" index
   is *rebuilt from* `graphJSON` on scene save — one-way, never hand-edited — so there
   is **no second source of truth** for instance placement. (This is the key
   correction over the old draft's canonical `ComponentPlacementRow`.)
5. **Big binaries are not row JSON.** Thumbnails, crop images, imported assets live in
   an asset store keyed by `blobKey`; rows hold only metadata + the key.
6. **All writes still go through `SaveQueue` + outbox.** No synchronous persistence on
   the interaction path. No direct `port.applyBatch`.

---

## What stays from today (do not regress)

These are shipped laws/decisions the model must preserve:

- **Unified `VariantRow`.** Every versionable subject — a **screen or a component** —
  is a master that owns a chain of `VariantRow`s (`ownerKind: "screen" | "component"`
  + `ownerId`; `order <= 0` is the main, `order > 0` is a version). A version **is** a
  variant. There is **no** separate `ScreenVersionRow` / `ComponentVersionRow`.
  (`Versioning.md` §3.1, Law 7.)
- **Scenes are variant-owned.** `SceneOwnerType` is the single value `"variant"`. A
  screen's editable scene lives on its active variant; the **main** variant embeds the
  screen's top-level components.
- **Instances live in `graphJSON`.** An instance is a node carrying
  `instanceOf: { componentId, variantId }` with no children; the master subtree is
  expanded at render time, never persisted into the parent (`Versioning.md` §2.1).
- **Content is embedded at the origin, instanced elsewhere** (`Versioning.md` §11).
  Propagation/thumbnail regeneration up the ancestor chain stays (off the critical
  path), exactly as in `Architecture.md`.
- **`SaveQueue`, outbox, SQLite/IndexedDB/memory adapters, no UI `await`.**

---

## High-level graph

```txt
workspace ──contains──▶ project ──contains──▶ screen
   │                      │                      │
   │                      │                      └─has_version─▶ variant(screen) ─owns_scene─▶ scene
   ├─owns────────────────▶│                                          │
   │   component(global)   ├─owns─▶ component(project-global)         └─owns─▶ component(top-level)
   ├─owns─▶ systemDesign   │                                                      │
   └─owns─▶ referenceAsset │                                          (nested) variant(component) ─owns─▶ component
                           │
component ──has_version──▶ variant(component) ──owns_scene──▶ scene
token(project) ──instance_of──▶ token(workspace master)        [live linked token]
referenceAsset ──has_stack──▶ stack ──has_cut──▶ cut
referenceAsset / cut ──attached_to──▶ {workspace|project|screen|component|variant}
cut ──derived_from──▶ component

Loose (valid): project with no incoming `contains`; component/screen with no owner
edge (a Draft); referenceAsset with no `attached_to`.
```

Instance placement of a **component** is **not** an edge — it is the `instanceOf`
node inside the host scene's `graphJSON`, mirrored into a *derived* usage index
(below).

---

## Entity rows

Minimal collaboration-ready envelope (additive; only `rev` + `deletedAt` are needed
now — `rev` powers the optimistic upsert guard, `deletedAt` powers tombstones). The
rest of the sync fields are **deferred** (see "Deferred").

```ts
export type RowEnvelope = {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;   // tombstone; hard delete only in compaction
  rev: number;                // monotonic per row; optimistic-guard key
};
```

```ts
export type WorkspaceRow = RowEnvelope & { name: string; slug: string | null };

export type ProjectRow = RowEnvelope & {
  name: string;
  type: "mobile" | "tablet" | "desktop";
  source: "mock" | "local" | "imported";
  thumbnailBlobKey: string | null;   // was thumbnailDataUrl — now a blob key
  description: string | null;
  previewScreenId: string | null;
};

export type ScreenRow = RowEnvelope & {
  title: string;
  screenKind: "mobile" | "tablet" | "desktop" | "custom";
  order: number;
  activeVariantId: string;           // screens own a variant chain (unified)
};

export type ComponentRow = RowEnvelope & {
  name: string;
  kind: string | null;
  category: string | null;
  description: string | null;
  thumbnailBlobKey: string | null;
  activeVariantId: string;
  linkable: boolean;                 // shareable as a linked instance
};

// Unified: one variant type for screens AND components.
export type VariantRow = RowEnvelope & {
  ownerKind: "screen" | "component";
  ownerId: string;                   // the screen id or component id
  label: string;
  order: number;                     // <= 0 = main, > 0 = version V{order}
};

export type SceneRow = RowEnvelope & {
  ownerType: "variant";              // collapsed — no "screen" owner
  ownerId: string;                   // a variant id
  graphJSON: string;                 // node tree incl. instanceOf nodes
  sceneVersion: number;              // monotonic; enables write compare-and-set
};

export type ThumbnailRow = RowEnvelope & {
  ownerType: "variant";
  ownerId: string;
  dataBlobKey: string;               // base64 out of the hot table
  capturedAt: number;
  sourceSceneVersion: number;
};
```

References and tokens get their own sections below.

---

## Ownership as edges (the uniform rule)

This folds in the deferred **"unify component ownership"** cleanup. **Every**
component is owned through exactly one edge; no `screenId` / `parentVariantId` field
is the source of truth anymore:

| Component | Owner edge |
| --- | --- |
| Workspace-global | `workspace owns component` |
| Project-global | `project owns component` |
| Screen top-level | `variant owns component` (the screen's **main** variant) |
| Nested in a component | `variant owns component` (the parent component's variant) |
| Copy-version child | `variant owns component` (the **version** variant) |
| Draft (loose) | *no owner edge* |

Top-level and nested and version-owned components all use the **same**
`variant owns component` edge — the asymmetry is gone. `componentScope` becomes:
incoming `workspace owns` → workspace; `project owns` → project; `variant owns` →
resolve the variant's `ownerKind` (`"screen"` → screen-level, `"component"` →
nested); no owner edge → loose/draft.

This is what makes the version laws fall out cleanly (next section).

---

## The canonical edge row

```ts
export type GraphRelation =
  | "contains"        // workspace→project, project→screen
  | "owns"            // workspace/project/variant → component; *→ systemDesign/referenceAsset
  | "has_version"     // screen/component → variant
  | "owns_scene"      // variant → scene
  | "has_stack"       // referenceAsset → stack
  | "has_cut"         // stack → cut
  | "attached_to"     // referenceAsset/cut → {workspace|project|screen|component|variant}
  | "derived_from"    // cut → component
  | "instance_of";    // token(project) → token(workspace master)  [tokens only — see note]

export type GraphEdgeRow = RowEnvelope & {
  fromType: EntityType; fromId: string;
  relation: GraphRelation;
  toType: EntityType; toId: string;
  order: number | null;
  metadata: Record<string, unknown> | null;
};
```

> **Note on `instance_of`.** Component instances are **not** edges — they are
> `instanceOf` nodes in `graphJSON` (see below). `instance_of` as an edge is used
> only for **tokens** (a project token that is a live instance of a workspace master
> token), because a token instance is a row, not a scene node.

```sql
CREATE TABLE graph_edges (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL, from_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  to_type TEXT NOT NULL,  to_id TEXT NOT NULL,
  order_index INTEGER, metadata_json TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER, rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_edges_from ON graph_edges(from_type, from_id, relation, order_index);
CREATE INDEX idx_edges_to   ON graph_edges(to_type,   to_id,   relation);
CREATE UNIQUE INDEX idx_edges_unique_live
  ON graph_edges(from_type, from_id, relation, to_type, to_id) WHERE deleted_at IS NULL;
```

`idx_edges_to` is the reverse-lookup index (e.g. "which projects own this component").
IndexedDB mirrors both compound indexes.

---

## Component instances stay in `graphJSON` + a derived usage index

Instances are **not** lifted into canonical rows (the old draft's mistake — it created
two sources of truth that must be kept in sync). Instead:

- The host scene's `graphJSON` keeps the `instanceOf: { componentId, variantId }` node
  (current model, `Versioning.md` §3.2). This stays the canonical placement.
- On scene save, the save path **derives** an instance-usage index from the scene's
  nodes and writes it as a small indexed table — a **cache**, rebuilt from the graph,
  never hand-edited:

```ts
// derived from graphJSON on every scene save; one row per (scene, instance node)
export type InstanceUsageRow = {
  id: string;              // `${sceneId}:${nodeId}`
  componentId: string;     // master referenced
  variantId: string;       // pinned version
  ownerVariantId: string;  // the scene's owner variant (host)
  nodeId: string;
};
```

```sql
CREATE TABLE instance_usage (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL, variant_id TEXT NOT NULL,
  owner_variant_id TEXT NOT NULL, node_id TEXT NOT NULL
);
CREATE INDEX idx_usage_component ON instance_usage(component_id);
```

`countInstanceUsages` / `listInstanceUsages` (`Versioning.md` §9, the delete dialog)
become an O(1) index hit instead of scanning + parsing every scene (`Better.md`
SAVE-5). Because the index is derived, a stale/missing row only costs a rebuild, never
a correctness divergence.

---

## Versioning maps cleanly (the laws fall out)

With uniform `variant owns component` edges and instances-in-graph, every versioning
law is expressible **without** re-home special cases:

- **Linked version** (`Versioning.md` §7): copy the frame + non-component children;
  each component child becomes an `instanceOf` node in the new variant's scene. **No
  `owns` edge** — the children are referenced, not owned. ✔ matches the law.
- **Copy version** (`[LAW]`): deep-clone each child master into a **new component owned
  by the new variant** — a `variant owns component` edge from the version's variant.
  Deleting the version cascades its owned components (delete the variant → delete its
  `owns` targets). There is **no** link back to the originals. ✔ The old draft could
  not express this (it had no "version owns component"); this model can.
- **Promote to main** (`[LAW]`, "the crown carries ownership", `Versioning.md` §7c):
  - *Copy version → main:* reorder so the promoted variant is `order 0`; its `owns`
    edges already point the right way → nothing to re-home. (This is the payoff: the
    `screenId`↔`parentVariantId` re-home **disappears**.)
  - *Linked version → main:* re-point the shared child masters' `variant owns
    component` edges from the old main's variant to the promoted variant
    (`UPDATE`/upsert edge, master ids preserved so placed instances keep resolving);
    re-embed the promoted scene; linkify the demoted main's scene. Only the children
    the version **still references** move (the `sharedIds` rule, §7c).
- **Detach** (component): materialize the instance subtree into owned nodes in the
  host `graphJSON`, clear `instanceOf`; if the detaching scene is a version, the new
  owned content is materialized into a **version-owned** component (a `variant owns
  component` edge). No edge gymnastics beyond that.

---

## Linkable / instance / detach — all three capabilities

One mechanism, three subjects (`Product.md` "Linkable, instances, and detach"). The
model must express **each verb** for each:

| Capability | Linkable marker | Linked instance | Detach |
| --- | --- | --- | --- |
| **Component** | `ComponentRow.linkable` | `instanceOf` node in host `graphJSON` | materialize subtree, clear `instanceOf` (→ version-owned component if in a version) |
| **Token** | `linkable` on the token | `instance_of` **edge** project-token → workspace master (or `instanceOf` on the token row) | copy master values locally, clear `instanceOf` |
| **Reference** | `ReferenceRow.linkable` | master row + an `attached_to` edge per place | new local row (`detachedFrom`, `linkable:false`), remove that owner's `attached_to` edge |

**Removing a linkable item used elsewhere** (`Product.md`): on unlink/delete with live
usages, the app offers the per-place **keep-a-copy (detach) or delete** choice for all
three. Storage supports it: the usage list comes from `idx_edges_to` (tokens,
references) and `instance_usage` (components). *(The dialog/decision applier is
app-level; storage only has to make the usage list cheap — it now is.)*

---

## System Design tokens (per-token link — matches the current law)

Tokens reuse the **component** linkable model at the row level — **not** whole-design-
system inheritance (`Product.md`: *"the unit of sharing is now the individual token"*;
this replaced the old per-category inheritance, which the earlier v3 draft had
re-introduced).

```ts
export type SystemDesignRow = RowEnvelope & {
  scope: "workspace" | "project";
  ownerId: string;                   // workspace or project id
};

export type TokenRow = RowEnvelope & {
  systemDesignId: string;
  category: "color" | "gradient" | "typography" | "icon" | "spacing" | "radius" | "image";
  tokenKey: string;                  // stable key for $$ref bindings
  name: string;
  value: unknown;
  linkable: boolean;                 // workspace token shareable into projects
  instanceOf: { systemDesignId: string; tokenId: string } | null; // live linked token
};
```

- A project links **individual** workspace tokens by creating a `TokenRow` with
  `instanceOf` set (the live reference) — opt-in, one at a time. `resolveSystemDesign`
  refreshes a linked token's display values from the master (keeping its id so `$$ref`
  `"<category>:<tokenId>"` bindings in `graphJSON` stay valid).
- **Detach** copies the master's values into the local row and clears `instanceOf`.
- There is **no** `project inherits designSystem` / `designToken overrides designToken`
  edge. Sharing is per token, not per system.

This is exactly the model already described in `Architecture.md` — v3 just gives the
token its own row + envelope instead of living inside `SystemDesignRow.tokens`.

---

## References (assets, stacks, cuts)

```ts
export type ReferenceRow = RowEnvelope & {            // the master asset
  title: string;
  sourceKind: "upload" | "url" | "gallery" | "clipboard";
  blobKey: string | null;            // binary in the asset store, not base64 JSON
  contentHash: string | null;
  mimeType: string | null;
  width: number | null; height: number | null;
  thumbnailBlobKey: string | null;
  linkable: boolean;
  detachedFrom: string | null;       // set on a detached local copy
};

export type ReferenceStackRow = RowEnvelope & { referenceId: string; name: string; order: number };

export type ReferenceCutRow = RowEnvelope & {
  referenceId: string; stackId: string;
  label: string;
  cropBox: { x: number; y: number; width: number; height: number };
  cropBlobKey: string | null;        // derived cache, regenerable
  thumbnailBlobKey: string | null;
  order: number;
};
```

- Multi-attach is `attached_to` edges (`referenceAsset|cut attached_to
  {workspace|project|screen|component|variant}`) — one master, many places.
- A cut can be `derived_from` a component (Builder "share a piece as a component").
- The original image is source of truth; `cropBlobKey` / `thumbnailBlobKey` are
  regenerable caches.
- **Builder cut variant-history** (AI tools save a new variant keeping the old — a
  Builder `[NOW]` law) is **out of scope here**: Builder storage stays separate until
  an explicit import creates `ReferenceRow` / stack / cut records. *(Flagged so this
  isn't mistaken for "covered".)*

---

## Local asset store (binaries out of the hot path)

```ts
export type AssetBlobRow = {
  blobKey: string; contentHash: string | null;
  mimeType: string; byteLength: number;
  width: number | null; height: number | null;
  storageKind: "sqliteBlob" | "file" | "indexedDbBlob";
};
```

- Desktop: small blobs in SQLite; large assets in the app data dir, `blobKey` in
  SQLite. Web: an IndexedDB `asset_blobs` object store keyed by `blobKey`.
- **Large base64 strings must not be saved in generic row JSON.** Thumbnails and crop
  images move here. This directly removes the `Better.md` RUST-4 cliff (bulk-listing
  `records` no longer drags megabytes of base64 under the lock).
- Original assets are source of truth; thumbnails/crops are deletable, regenerable.

---

## Persistence port additions

The v2 record port is kept and extended — reads gain indexed graph/usage queries;
binaries get their own get/put. Writes stay batchable through one `applyBatch`.

```ts
export interface GraphPersistencePort extends PersistencePort {
  listGraphEdges(filter: {
    from?: EntityRef; to?: EntityRef; relation?: GraphRelation; includeDeleted?: boolean;
  }): Promise<GraphEdgeRow[]>;
  listInstanceUsage(componentId: string): Promise<InstanceUsageRow[]>;
  getAssetBlob(blobKey: string): Promise<Blob | Uint8Array | null>;
  putAssetBlob(blob: Blob | Uint8Array, meta: AssetBlobRow): Promise<void>;
}

export type GraphMutation =
  | { op: "upsertRecord"; table: string; id: string; json: string }
  | { op: "deleteRecords"; table: string; ids: string[] }
  | { op: "upsertGraphEdge"; edge: GraphEdgeRow }
  | { op: "deleteGraphEdges"; ids: string[] };
```

Coalescing keys (extends `mutationKey`): `up:record:{table}:{id}`,
`del:record:{table}:{ids}`, `up:edge:{id}`, `del:edge:{ids}`. The `instance_usage`
rebuild for a scene is part of that scene's save batch (same transaction), so the
index can never lag the scene across a crash.

---

## Adapter requirements

**SQLite (desktop):** one pooled connection in `tauri::State` (recover a poisoned
mutex with `into_inner` — `Better.md` RUST-1); WAL; one batch = one transaction with
**`prepare_cached` statements hoisted out of the row loop** (`Better.md` RUST-2);
indexed `graph_edges` + `instance_usage` queries; blobs out of the bulk-listed JSON
path (`Better.md` RUST-4); `rev`-guarded optimistic upsert:

```sql
INSERT INTO graph_edges (...) VALUES (...)
ON CONFLICT(id) DO UPDATE SET ... WHERE excluded.rev > graph_edges.rev;
```

**IndexedDB (web):** `records` keyed by `[table, id]`; `graph_edges` with compound
indexes `[fromType, fromId, relation, order]` and `[toType, toId, relation]`;
`instance_usage` indexed by `componentId`; `asset_blobs` keyed by `blobKey`. Web and
desktop pass the **same** port contract tests (memory adapter is the reference).

---

## No migration — nuke and reseed

The app is **local-only and pre-release** (`CLAUDE.md`). There is **no** production
data and no migration path. Do **not** write the backfill steps the old draft listed.
Instead: change the shapes, **bump `SCHEMA_VERSION`**, and let
`ensureSeededAndMigrated` nuke and reseed (`seed.ts`). The seed must produce the new
shape directly: edges for containment/ownership, variant-owned top-level components,
per-token linked instances, references as asset/stack/cut + `attached_to` edges,
thumbnails/crops in `asset_blobs`. Discarding local projects/scenes during development
is acceptable and intended.

---

## Suggested staging (one shippable step at a time)

Each step compiles, reseeds, and passes the port contract tests before the next:

1. **Asset store + envelope.** Add `asset_blobs` + `RowEnvelope` (`rev`/`deletedAt`)
   and the `rev`-guarded upsert. Move thumbnails/crops to `blobKey`. (Pure perf win;
   no graph yet — this is the `Better.md` RUST-4 fix and is independently valuable.)
2. **`graph_edges` + ownership.** Introduce edges; move containment + the uniform
   `owns` (workspace/project/variant → component) onto them; derive `componentScope`
   from the incoming edge. Drop `screenId`/`parentVariantId` as sources of truth.
   (This absorbs "unify component ownership".)
3. **`instance_usage` derived index.** Build it on scene save; repoint
   `listInstanceUsages`/`countInstanceUsages` to it. (Kills the `Better.md` SAVE-5
   scan.)
4. **Promote-to-main simplification.** With ownership on edges, delete the
   `screenId`↔`parentVariantId` re-home; promotion becomes reorder + edge repoint.
5. **References + tokens as rows/edges.** `ReferenceRow`/stack/cut + `attached_to`;
   `TokenRow` with `instanceOf`. Specify detach for all three.
6. **Reseed.** Bump `SCHEMA_VERSION`; seed emits the new shape.

---

## Deferred — explicitly NOT modeled now

To keep the scope honest (these are not `[NOW]` product functionality):

- **Checklists** (`checklists` / `checklist_items` + rollups) — a future feature; no
  table until it is built.
- **Full collaboration envelope** (`createdBy` / `updatedBy` / `clientMutationId`) and
  any sync transport — keep only `rev` + `deletedAt` now; the rest lands with
  collaboration (see `docs/planned/collaboration-*.md`).
- **`latestCompatible` version pinning with semver ranges** — versions pin by id
  (`instanceOf.variantId`) or follow the master's `activeVariantId`; no range policy.
- **Builder internal storage** (cut variant history, AI variant tree) — stays in the
  Builder until an explicit import materializes reference rows.

---

## Law-faithfulness checklist

Each `[LAW]` and how the model honors it:

- **Law 7 (Screen = Component):** one `VariantRow` type; screens and components both
  own variant chains; scenes are variant-owned. No screen/component version split.
- **Copy independence `[LAW]`:** Copy clones child masters as **variant-owned**
  components (`variant owns component`); deleting the version cascades them; no link
  back.
- **Promote carries ownership `[LAW]`:** re-point `owns` edges to the promoted variant
  (master ids preserved); Copy promote is a pure reorder (no re-home).
- **Law 11 (ownership/origin never ambiguous):** owned = `owns` edge / embedded
  subtree; instance = `instanceOf` node / `attached_to` edge / token `instanceOf`.
  Always distinguishable; the master is always reachable.
- **Per-place copy-or-delete `[NOW]`:** usage lists are cheap (`idx_edges_to` +
  `instance_usage`), enabling the per-instance dialog for all three capabilities.
- **Loose entities `[NOW]`:** "no owner edge" is a first-class state, not a nullable
  field special case.

---

## Acceptance checklist (current functionality only)

- [ ] A workspace contains many projects via `contains` edges; a project can have **no**
      workspace (no incoming `contains`).
- [ ] Components are owned by workspace, project, or a **variant** (screen-top-level /
      nested / version) through one uniform `owns` edge — or by nothing (Draft).
- [ ] `componentScope` is derived from the incoming owner edge (no `screenId` /
      `parentVariantId` field as source of truth).
- [ ] Screens and components share **one** `VariantRow` chain; scenes are
      variant-owned.
- [ ] A Linked version's children are `instanceOf` nodes; a Copy version's children are
      variant-owned cloned components; deleting a Copy version cannot empty the
      original.
- [ ] Promote-to-main re-points `owns` edges (no `screenId`↔`parentVariantId` re-home).
- [ ] "Which scenes use this master?" is an `instance_usage` index hit, not a scene
      scan.
- [ ] Workspace tokens link into projects **per token** (`instanceOf` on a `TokenRow`),
      with detach; no whole-design-system inheritance edge.
- [ ] References are master assets with stacks/cuts; multi-attach via `attached_to`
      edges; detach creates a local `detachedFrom` row.
- [ ] Thumbnails, crop images, and imported assets live in `asset_blobs`, not in row
      JSON.
- [ ] All writes go through `SaveQueue` + outbox; the `instance_usage` rebuild rides
      the scene's save batch.
- [ ] New rows carry `rev` + `deletedAt`; edges/large rows use the `rev` optimistic
      guard.
- [ ] No migration code — `SCHEMA_VERSION` bump + reseed produces the new shape.
