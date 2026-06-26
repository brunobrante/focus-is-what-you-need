# Save Architecture v3 — Workspace Graph Storage

> **Implementing agent: read "Locked decisions" (D1–D10) FIRST.** It resolves every
> open question and overrides any older phrasing in the body below. Then follow
> "Execution order" — the 6 staging steps in sequence, one commit each, green on the
> tri-adapter contract suite (D9) before the next. Do not one-shot; the field→edge
> cutover (Step 2) must land as a single clean pass. The only thing you may not change
> is `Product.md`.

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
2. **An edge row stores how entities connect.** Containment, ownership, and attachment
   are `graph_edges` rows — indexed both directions. (Token links are the exception: a
   `TokenRow.instanceOf` field, not an edge — D7.)
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

## Locked decisions (resolved — implement exactly this)

Every open question / underspecified point is decided here. These are binding; the
implementing agent must not re-litigate them. Rationale is **performance first**,
**offline→online additive** (no row reshape once real user data exists), and **fast
feature-building** (new capability = new edge, never a new field). None of these
touch `Product.md`.

**D1 — Sync envelope is lean, and that is deliberate.** Every row carries exactly
`{ id, createdAt, updatedAt, deletedAt, rev }` — nothing more. The planned
collaboration model (`collaboration-sync-protocol.md`) resolves conflicts **per
frame, explicitly, in the Versions UI** — it is *not* CRDT, not field-merge, not
op-replay. So a single monotonic `rev` (the optimistic-write guard) is sufficient,
and `updatedAt` doubles as the wall-clock last-write-wins tiebreak. Adding a clock
field later is a cheap default-backfill, not a reshape — so we do **not** speculatively
add HLC / version-vectors / per-field clocks now. All sync identity
(`clientId`, `clientMutationId`, `frameId`, transport) lives in the **frame-commit
envelope at the future `SyncAdapter` layer, never on rows.** Sync transmits committed
frame *state* (rev-guarded), so the coalescing outbox is already the right shape — no
oplog reshape.

**D2 — The graph is the extensibility mechanism; reserve the known-future shapes
now.** `EntityType` must already include `"user"`, and `GraphRelation` must already
include `"member_of"` (for `workspace-people-permissions.md`: a user is an entity, a
membership is a `user member_of {workspace|project}` edge with `role` in the edge
`metadata`). This means people/permissions land as **pure additions** later, zero
reshape. Inspector guides stay in scene `graphJSON` metadata until specified (no
table). Multiple screen types are already covered by `screenKind` (incl. `"custom"`).
Builder stays out-of-band until an explicit import (unchanged).

**D3 — `instance_usage` is derived in TypeScript, not Rust.** It is a *cache*
(a stale/missing row only costs a rebuild, never a correctness divergence — see this
doc's own framing). Therefore it does **not** need server-side same-transaction
atomicity, and Rust must stay a dumb key-value + edge store with **zero graphJSON
parsing.** On scene save, TS derives the `instance_usage` upserts/deletes from the
scene's nodes and enqueues them in the **same `SaveQueue` batch** as the scene row.
(This overrides the doc's earlier "same transaction" phrasing, which would have forced
graph-parsing into Rust — slower to build, no benefit for a rebuildable cache.)

**D4 — `GraphPersistencePort` extends, it does not replace.** Keep `PersistencePort`;
add `GraphPersistencePort extends PersistencePort` with the graph/blob methods; the
factory hands repos the graph-capable port. No breaking churn across existing repos.

**D5 — Asset store reuses the on-disk pattern.** `storageKind` decides by size:
`byteLength <= 256 KB` → `sqliteBlob` (a `blob` column in `asset_blobs`);
`> 256 KB` → `file` in the app data dir keyed by `blobKey` (reuse the existing
`write_reference_file` plumbing in `lib.rs`). Dedup by `contentHash`. Thumbnails/crops
are regenerable caches (deletable). Web → `indexedDbBlob`.

**D6 — `rev`-guarded upsert everywhere** (records *and* edges):
`... ON CONFLICT(id) DO UPDATE SET ... WHERE excluded.rev > <table>.rev`. Uniform,
cheap, and the single mechanism the future sync layer rides on.

**D7 — Token links are a field, not an edge.** `TokenRow.instanceOf` is the source of
truth for a project token that mirrors a workspace master. **Drop `instance_of` from
`GraphRelation` entirely** — component instances live in `graphJSON`, token instances
live in the `TokenRow` field, so no relation needs it. (Removes the doc's one
ambiguity.)

**D8 — VER-2 is fixed as part of the version-create rework**: capture children by
iterating components owned via `sourceVariantId`, **not** by walking the source scene
(so a never-saved subject still gets its children cloned/linkified). VER-3 stays
as-is — linkability is a deliberate component property (Law 11), not ownership-derived.

**D9 — The port contract test suite is written in Step 1 and is mandatory.** One
suite, memory adapter as the reference, run against **all three** adapters
(memory / sqlite / indexeddb), covering records, graph edges (both index directions +
unique-live), `instance_usage`, asset blobs, and the `rev` guard. No step is "done"
until its behavior is in this suite and green on all three.

**D10 — Data encoding (decide the id scheme now; the rest is do-anytime).** The
`graphJSON` blob is the hottest data in the app (structuredClone'd + parsed +
serialized on every commit), and today every node carries a 36-char UUID for `id` and
`parentId` plus the full ~26-field `style` object even at defaults. Decisions:

- **IDs are short, client-generated, NOT UUIDv4.** Entity / edge / row ids are
  ~12-char collision-resistant ids (nanoid-style; ~71 bits is ample for offline+online
  client-gen — 122-bit UUID is overkill). Node ids *inside* `graphJSON` are
  **scene-local** and short — they only need uniqueness within their own scene, and
  `uniqueNodeId(preferred, usedIds)` already dedups against the target. **This is the
  one encoding choice that must be decided NOW:** ids are referenced everywhere and have
  no cheap post-launch migration, so v3's reseed is the moment to set the format. (Keeps
  D1 — still client-generated strings, just shorter; no autoincrement.)
- **Omit defaults on `graphJSON` serialization** (serialization-only, not
  migration-critical — can land anytime). Persist only fields that differ from the type
  defaults; drop the default `style` props, empty `cssId`/`className`/`text`/`imageUrl`,
  and default `visible`/`locked`/`appearance`, rehydrating them on parse. Likely the
  single biggest blob shrink. Serialization MUST stay **canonical/deterministic** (stable
  key order, consistent omission) so the `documentsEqual` / string-equality save-skip
  still holds.
- **Round `bounds` to 2 decimals** on serialize — kills float noise and bytes; minor.
- **Rejected (do not cargo-cult):** cryptic short key names (`p` for `parentId`) —
  readability/tooling cost outweighs the bytes; binary serialization (MessagePack/CBOR)
  — `JSON.parse` beats JS-land decoders at this scale and you lose debuggability;
  integer/autoincrement ids — incompatible with offline-first client-gen (D1).

### Performance invariants (the whole point — never regress these)

- **No full-table scan on any interactive path.** Every cross-entity question is an
  index hit: `graph_edges` dual index (`idx_edges_from` / `idx_edges_to`),
  `instance_usage` by `component_id`, derived caches invalidated on the table
  subscription. This is what kills the `Better.md` SAVE-5 / RUST-4 cliffs.
- **Edges live in the in-memory record-store cache like any table**, and a bidirectional
  adjacency index is derived from them once and invalidated on the `graph_edges`
  subscription (same pattern as `sceneDependencyIndexCache`). Ownership / containment /
  usage resolution is therefore **in-memory O(1)** and never round-trips to SQLite on a
  read.
- **The 60fps path never touches edges, `instance_usage`, blobs, or Rust.** The scene
  `graphJSON` stays an in-memory blob, `structuredClone`-cheap, serialized only on
  discrete commits. Edges, `instance_usage`, and thumbnails update **off the critical
  path** through the existing debounced owner-queues.
- **Big binaries are never in row JSON** (asset store), so a bulk table read never drags
  megabytes under the lock.
- **In-memory record-store cache is the read source; all writes are async,
  fire-and-forget through `SaveQueue`.** The UI never awaits persistence.

### Graph hot-path specifics (so the graph itself stays fast)

These three keep the edge model from hiding a latent cliff:

- **Maintain the adjacency index incrementally, never full-rebuild.** On the
  `graph_edges` subscription, apply only the *changed* edge to the two maps
  (`from→edges`, `to→edges`) — add on upsert, remove on tombstone. An edge write is
  then O(1), not O(E). (Full rebuild on every structural op would be a hidden
  per-write cost as the workspace grows.)
- **Filter tombstones at hydration + GC periodically.** `deletedAt` rows accumulate
  until compaction (deferred), so the boot hydration must skip `deletedAt != null`
  edges and a periodic sweep must hard-delete old tombstones — otherwise the table and
  the in-memory index bloat with dead edges over a long-lived workspace. (Don't wait
  for full compaction to add the filter + sweep.)
- **Edge mutations reuse the record cross-op coalescing (SAVE-11).** An
  `upsertGraphEdge` + `deleteGraphEdges` of the same edge id in one batch must collapse
  last-op-wins — extend `eachRecordMutation` / `oppositeMutationKey` to the edge ops,
  don't merely add `up:edge` / `del:edge` keys, or a create-then-delete in one flush can
  resurrect a deleted edge (the exact bug SAVE-11 fixed for records).
- **Scope edge hydration by active workspace/project when data grows.** All-edges-in-
  memory is fine for bounded single-user data now; when it stops being bounded, load
  edges for the open workspace's subtree rather than the whole store. (Not needed for
  Step 2; noted so it isn't designed out.)

### Fast-feature-building invariant

A new cross-entity capability is **always** a new `EntityType` + new `GraphRelation` +
edges — **never** a new nullable foreign-key field on a row. Expose one uniform edge
repo API (`listEdges({from?,to?,relation?})`, `linkEdge`, `unlinkEdge`, `relinkEdge`);
features compose edges. This is the real reason ownership-as-edges matters: it turns
"add a relationship" from a schema change into a data write.

### Execution order (do NOT one-shot)

Follow the 6-step staging below **in sequence**, one commit per step, each
compiling + reseeding + green on the contract suite (D9) before the next. A fresh agent
may do all six in one session, but must checkpoint per step — a half-applied
field→edge cutover (some code reads edges, some reads fields) corrupts ownership, so
Step 2 lands as a single clean pass.

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
token(project).instanceOf ⇢ token(workspace master)   [field link, NOT an edge — D7]
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
  id: string;                 // short client-gen id (~12-char nanoid, NOT UUID) — D10
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
  | "member_of";      // user → {workspace|project}  (reserved for permissions; role in metadata — D2)
  // NOTE: no `instance_of` relation — token links are a TokenRow field, component
  // instances live in graphJSON (locked decision D7). `member_of` is reserved now so
  // workspace-people-permissions lands as pure additions (D2).

export type GraphEdgeRow = RowEnvelope & {
  fromType: EntityType; fromId: string;
  relation: GraphRelation;
  toType: EntityType; toId: string;
  order: number | null;
  metadata: Record<string, unknown> | null;
};
```

> **Note on instances (locked decision D7).** Neither component nor token instances are
> edges. A component instance is an `instanceOf` node in the host `graphJSON`; a token
> instance is the `TokenRow.instanceOf` field (a project token mirroring a workspace
> master). There is **no** `instance_of` relation — it was tokens-only and the field
> covers it, so the relation is dropped to remove ambiguity.

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
| **Token** | `linkable` on the token | `TokenRow.instanceOf` field → workspace master (a *field*, not an edge — D7) | copy master values locally, clear `instanceOf` |
| **Reference** | `ReferenceRow.linkable` | master row + an `attached_to` edge per place | new local row (`detachedFrom`, `linkable:false`), remove that owner's `attached_to` edge |

**Removing a linkable item used elsewhere** (`Product.md`): on unlink/delete with live
usages, the app offers the per-place **keep-a-copy (detach) or delete** choice for all
three. Storage makes each usage list cheap: **references** from `idx_edges_to`,
**components** from `instance_usage`, **tokens** by filtering `TokenRow`s whose
`instanceOf.tokenId` is the master (tokens are few — an in-memory filter over the
cached tokens table, no edge index needed — D7). *(The dialog/decision applier is
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
rows are **derived in TypeScript** on scene save and enqueued in the **same `SaveQueue`
batch** as the scene row (locked decision D3) — so the index rides the scene's atomic
apply, while Rust stays a dumb store with no graphJSON parsing. It's a rebuildable
cache: a lag after a crash self-heals on the next save, never a correctness divergence.

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

1. **Asset store + envelope + the test harness.** Add `asset_blobs` + `RowEnvelope`
   (`rev`/`deletedAt`) and the `rev`-guarded upsert. Move thumbnails/crops to `blobKey`.
   **Write the tri-adapter port contract suite here (D9)** — it's the gate for every
   later step. **Switch `newId()` to the short scheme (D10) now** so every row/edge/node
   created from here on uses it. (Pure perf win; no graph yet — this is the `Better.md`
   RUST-4 fix and is independently valuable.)
2. **`graph_edges` + ownership.** Introduce edges; move containment + the uniform
   `owns` (workspace/project/variant → component) onto them; derive `componentScope`
   from the incoming edge. Drop `screenId`/`parentVariantId` as sources of truth.
   (This absorbs "unify component ownership".)
3. **`instance_usage` derived index.** Build it on scene save; repoint
   `listInstanceUsages`/`countInstanceUsages` to it. (Kills the `Better.md` SAVE-5
   scan.)
4. **Promote-to-main simplification.** With ownership on edges, delete the
   `screenId`↔`parentVariantId` re-home; promotion becomes reorder + edge repoint.
5. **References (rows + edges) and tokens (rows + field link).** `ReferenceRow`/stack/cut
   + `attached_to` edges; `TokenRow` with the `instanceOf` field (no token edge — D7).
   Specify detach for all three.
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
- [ ] New rows carry `rev` + `deletedAt`; **every** upsert (records and edges) uses the
      `rev` optimistic guard (D6). Sync identity stays at the future SyncAdapter, not on
      rows (D1).
- [ ] One port contract suite runs green against **all three** adapters — records, edges
      (both indexes + unique-live), `instance_usage`, blobs, `rev` guard (D9).
- [ ] IDs are short client-gen (not UUID); node ids are scene-local; `graphJSON` omits
      default fields canonically so the save-skip equality still holds (D10).
- [ ] The edge adjacency index is maintained **incrementally** (O(1) per edge write);
      tombstones are filtered at hydration with a periodic GC; edge mutations reuse the
      SAVE-11 cross-op coalescing (graph hot-path).
- [ ] `EntityType` includes `"user"` and `GraphRelation` includes `"member_of"` (reserved
      for permissions); there is **no** `instance_of` relation (D2/D7).
- [ ] No migration code — `SCHEMA_VERSION` bump + reseed produces the new shape.
