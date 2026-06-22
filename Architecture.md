# Architecture.md

Implementation reference for this codebase. **This is implementation detail — it
may be refactored freely** as long as no law in [`Product.md`](./Product.md) is
broken. `CLAUDE.md` links here for the deep detail; keep this file in sync with
the code.

Paths written as `src/...` live under `apps/desktop/`.

---

## Storage ownership

Storage follows the same hierarchy as the UI. Screens and components are unified:
both are masters that own a chain of `VariantRow`s (a `VariantRow` carries
`ownerKind: "screen" | "component"` + `ownerId`). A version is a variant.

- **all** scenes are stored with `ownerType: "variant"` and a variant id — there
  is no `"screen"` scene owner. `SceneOwnerType` is just `"variant"`.
- a screen owns its versions as `ownerKind: "screen"` variants; its **main**
  variant (order 0) owns the screen's editable scene and embeds its top-level
  components.
- a component owns its versions as `ownerKind: "component"` variants.
- both screens and components carry an `activeVariantId` pointing at the variant
  whose scene is currently shown/edited.
- a top-level component belongs to its source screen through `screenId`; its
  embedding scene is that screen's main variant.
- a nested component belongs to its parent component through `parentVariantId`.

Do not store any canvas scene under a screen id or a component id. Variants are
the editable scene owners for **both** screens and components.

### Linkable model: tokens & references (same shape as component instances)

System Design tokens and References reuse the component **linkable → linked
instance → detach** model (the product law is in `Product.md`). The data shapes:

- **System Design tokens** (`domain/system-design/types.ts`): every token carries
  optional `linkable?: boolean` (a workspace token shareable into projects, on by
  default) and `instanceOf?: { systemDesignId, tokenId } | null` (a linked
  instance pointing at a master token). A project's `SystemDesignRow.tokens` holds
  both its local tokens and the linked instances it chose; there is **no**
  per-category inheritance / `excludedShared`. `resolveSystemDesign(design, parent)`
  refreshes a linked token's display values live from the master (keeping its id so
  `$$ref` pointers stay valid) and exposes the workspace's unlinked linkable tokens
  as `availableShared` for the picker. **Detach** (`detachToken` in
  `useSystemDesign`) copies the master's values locally and clears `instanceOf`.
- **References** (`ReferenceRow`): `linkable?: boolean` (library references are
  linkable by default) and `detachedFrom?: string | null`. A reference attached to
  many owners via `attachments[]` **is** the linked-instance mechanism (one master
  row, many places). **Detach** (`detachReference` in `references.repo.ts`) creates
  a new local row (`visibility: "local"`, `linkable: false`, `detachedFrom`) owned
  only by the current owner and removes that owner's attachment from the master,
  preserving the master row.

A SCHEMA_VERSION bump (→ 20) reseeds; no migration of the old inheritance shapes.

---

## Component ownership & navigation (the contract the canvas must obey)

Get this right before changing any "open a component", "go to component", or
"detach" behavior. (The product-level model is in `Product.md`; the full
versioning model is in `Versioning.md`.)

**Ownership — a component has exactly one owner, fixed at creation:**

| Created where | Owner | Canonical location |
| --- | --- | --- |
| Inside a screen | that screen (`screenId`) | `project/screen/component` |
| Inside a **versioned** screen (e.g. by detach) | that **version** (`parentVariantId` = the screen's version variant) | `project/screen/version/component` |
| Inside another component | that parent component (`parentVariantId` = the parent's variant) | nested |
| Global project component | the project (or null) | `project/component` |

A **linked instance** (`instanceOf`) placed inside any screen or version is only a
**visual reference** — it does **not** transfer ownership.

**A versioned screen is a normal screen in every way** — same storage, same
operations, same component creation. It is only "versioned" in that it is linked
to a main screen. Components created or detached inside it are owned by **that
version**, not the main screen. Therefore a `parentVariantId` that points at a
**screen variant** (a version, or the main) must resolve to that screen
everywhere paths are walked (`componentPathFromRoot`, the Versions back footer,
etc.) — never assume `parentVariantId` is always a *component's* variant.

**Navigation — "open" depends on whether the node is a link or owned content:**

- **Linked instance** → "go to component" opens the **master's own canonical
  location** (its origin), regardless of where the instance is placed. The master
  is shown in the **Current** window. (A linked component inside `screen1/version1`
  still opens `screen1/component`, owned by `screen1` — not by the version.)
- **Owned / detached content** (a real component, not an instance) → "open"
  navigates **within the same window** to that component's own scene. In
  **Current** it navigates Current (this is how a global component, not part of
  the screen, is opened — accessed without being linked to the screen). In the
  **Versions** window it navigates the **Versions** window (stays on the version
  tab) — the copy belongs to the version, so it is edited there.

**Detach** turns a linked instance into a **local copy owned by the current screen
/ version**, completely **unlinked from the master**. In a version this copy is
owned by the version variant — a duplicate within the version screen. It is then a
normal local component you can open and edit.

**The Versions window is a full editor, identical to Current** — same canvas, same
functionalities. It can open/drill into its own components (with a back button
that pops its drill-in history to return to the exact screen+version, and a header
showing the current subject), and it can show a **component** subject's own
variant, not only screen versions.

---

## Snapshot propagation

Snapshots are derived from scenes. They should not be manually maintained as
disconnected mock images once a scene exists.

When a component variant scene is saved, the storage layer must:

1. update that variant's scene
2. regenerate that variant's thumbnail from the scene graph
3. replace the matching subtree inside its parent scene
4. regenerate the parent thumbnail
5. continue upward until the source screen thumbnail has been regenerated

Example: editing `Logo Design` updates its snapshot → the `Logo Design` subtree is
replaced inside `Header` → the `Header` snapshot updates → the `Header` subtree is
replaced inside `Home` → the `Home` screen snapshot updates.

This propagation is required because parent previews are visual compositions of
their children. If a child changes but the parent snapshot still shows the old
child, the hierarchy is broken. (Stale local rows are handled by nuke-and-reseed
on a schema bump — see Data Lifecycle in `CLAUDE.md` — not by repair migrations.)

---

## Save Architecture

The save system is delta-based, queue-backed, and follows clean architecture with
a single port that all adapters implement. (The old model stored every "table" as
one giant JSON blob in a KV row and re-wrote the whole blob on every edit —
hundreds of MB of IPC per session, main-thread blocking. That model is gone.)

### The mental model in one diagram

```
user drags/edits a node
        │
        ▼
engine reducer (synchronous, in-memory)   ← UI always reads this, never waits
        │ commits the interaction
        ▼
recordStore.putRecord(table, row)          ← updates in-memory cache
        │ fire-and-forget, no await
        ▼
SaveQueue.enqueue(mutation)                ← coalesces by (op, table, id)
        │ 60fps drag of one node = one pending entry
        │ microtask + requestIdleCallback
        ▼
SaveQueue.flush() → port.applyBatch([...mutations])   ← 1 IPC / 1 IDBTransaction
        │
        ├─ desktop  → invoke("db_apply") → Rust → 1 SQLite transaction
        └─ web      → 1 IDBTransaction over the "records" object store
```

The UI never awaits the database. Ancestor propagation and thumbnail regeneration
run off the critical path, at idle, after the row is already written.

### File map

#### Domain — zero I/O, no framework imports

| File | What it contains |
| --- | --- |
| `src/domain/persistence/mutations.ts` | `Mutation` union type (`upsertRecord` / `deleteRecords`), `ApplyAck`, and `mutationKey()` — the coalescing key function. A 60fps drag of one node → one key → one pending entry. |
| `src/domain/persistence/persistencePort.ts` | `PersistencePort` interface: `applyBatch(mutations)`, `getRecord(table, id)`, `listRecords(table)`. This is the only boundary all adapters must satisfy. |

#### Application — use cases, depend only on the port

| File | What it contains |
| --- | --- |
| `src/application/persistence/saveQueue.ts` | `SaveQueue` class. Coalesces mutations in a `Map<key, Mutation>` (last-write-wins per key). Drains via `queueMicrotask` + `requestIdleCallback`. Retry with exponential backoff (6 attempts, max 30s). Crash-durable: writes the pending batch to an `OutboxStore` before each flush; replays on boot if the previous session crashed mid-write. `getSaveQueue()` in `createPersistence.ts` is the singleton entry point. |
| `src/application/scenes/saveScene.ts` | `saveScene()` is now `void` (fire-and-forget). It calls `upsertScene` which writes to the record-store cache and enqueues. The caller never awaits the database. |

#### Infrastructure — adapters (the only pieces that know about SQLite / IndexedDB)

| File | What it contains |
| --- | --- |
| `src/infrastructure/persistence/createPersistence.ts` | Factory + singletons. `createPersistencePort()` picks the adapter from `detectPersistenceRuntime()`. `getSaveQueue()` creates the singleton `SaveQueue` with outbox and replays any crash-leftover batch on first call. `resetPersistenceSingletons()` is the test seam. |
| `src/infrastructure/persistence/sqlitePersistence.ts` | Desktop adapter. Translates `Mutation[]` to snake_case wire format and calls `invoke("db_apply")`. One IPC call = one SQLite transaction in Rust. Reads use `invoke("db_get_record")` / `invoke("db_list_records")` on the pooled connection. |
| `src/infrastructure/persistence/indexedDbPersistence.ts` | Web adapter. Stores one `{ table, id, json }` row per record, keyed by `[table, id]`, in a single `records` object store. `applyBatch` applies all mutations inside one `IDBTransaction` (atomic). Reads use `IDBKeyRange.bound` to query by table without scanning everything. |
| `src/infrastructure/persistence/memoryPersistence.ts` | In-memory adapter (`Map<table, Map<id, json>>`). Backs the `"memory"` runtime (Bun tests). Reference implementation the other adapters must match. |
| `src/infrastructure/persistence/outbox.ts` | Two outbox implementations: `createLocalStorageOutbox()` (synchronous, IPC-free, crash-durable — used in web + desktop) and `createMemoryOutbox()` (tests). The outbox key is `__save_outbox_v1` in `localStorage`. |

#### Record store — in-memory cache that connects repos to the queue

| File | What it contains |
| --- | --- |
| `src/lib/storage/recordStore.ts` | The in-process source of truth for every persisted row. `listTable` / `getRecordById` hydrate from the port once, then serve from cache — read-after-write within a session is always synchronous. `putRecord` updates the cache and enqueues a per-row delta in one call with no await. `replaceTable` diffs the incoming array against the cache and enqueues only the rows that actually changed — so repos that compute a full next-array still persist O(changed), never O(table). |
| `src/lib/storage/store.ts` | Thin re-export facade. The old `getTable` / `setTable` blob API is gone. This file now just re-exports `listTable`, `putRecord`, `removeRecords`, `replaceTable`, `notify`, `subscribe` from `recordStore.ts`. Repos import from here unchanged. |

#### Rust backend — `src-tauri/src/db.rs`

A single `Connection` lives in `tauri::State<Db>` (wrapped in `Arc<Mutex<>>`).
`open_and_migrate` runs once at setup, creates the `records` table, and sets WAL
+ NORMAL sync.

Every entity — including scenes and thumbnails — is one row in the generic
`records(tbl, id, json)` table. A scene graph is JSON, a thumbnail is base64,
both stored in the `json` column like any other record. There is **no** typed
per-node/per-scene table or node-delta path: the TS side only ever emits
`upsert_record` / `delete_records`, so that is all the backend implements.

| Command | What it does |
| --- | --- |
| `db_apply(batch)` | Applies an entire coalesced batch in **one** `BEGIN…COMMIT` transaction. Handles `upsert_record` and `delete_records`. Returns `ApplyAck { applied }`. |
| `db_get_record(table, id)` | Single-row read from the `records` table. |
| `db_list_records(table)` | All JSON strings for one table from `records`. |

SQLite schema created in `open_and_migrate`: only `records` (with the
`idx_records_tbl` index).

#### Ancestor propagation

The old `propagateVariantSceneToParents` ran synchronously inside `upsertScene`,
multiplying the write cost by the depth of the component tree. Now:

- `upsertScene` calls `putRecord` (synchronous cache + enqueue) and schedules
  thumbnail regeneration via `scheduleThumbnailRefresh`.
- `propagateSceneToParents` in `scenes.repo.ts` is exported as a standalone
  function, called **off the critical path** (at idle, after the row is persisted).
- Moving a node in a deeply nested component no longer blocks the interaction.

---

## Global Settings Architecture

Settings are stored as ordinary `records` rows, not in `kv_store` and not inside
projects, scenes, or variants. Settings rows are scoped:

- `table`: `settings`
- `id`: `global`, `workspace:<workspaceId>`, or `project:<projectId>`
- `json`: a `SettingsRow` containing `schemaVersion`, `scope`
  (`global | workspace | project`), `workspaceId`/`projectId`, and `overrides`

The SQLite layer does not need a dedicated settings table. The existing
`records(tbl, id, json)` table persists settings through the same record-store
cache and `SaveQueue` used by the rest of the app.

### Scoped resolution (cascade)

Effective settings resolve in this order, later layers overriding earlier ones:

`defaults -> global -> workspace -> project`

- The **global** row stores the full resolved tree (it is the base override).
- **workspace** and **project** rows store **only their own overrides** (a
  `DeepPartial<GlobalSettings>`), so unset fields keep inheriting from the parent
  scope. A new project inside a workspace therefore inherits the workspace's
  config automatically; editing it writes a project-scoped override.
- `resolveSettingsLayers([...])` in `src/domain/settings/resolve.ts` merges the
  layers (deep-merging objects, replacing arrays). `resolveGlobalSettings` is the
  single-layer special case.
- The canvas resolves its effective settings with
  `useResolvedCanvasSettings(projectId)` (which looks up the project's workspace
  via `getWorkspaceForProject`); element creation then reads those defaults.
- Element-defaults editing UI: **Global** in the Settings modal's "Element
  defaults" tab, **workspace** at `/element-defaults`, **project** in the Gallery
  "Element defaults" tab. All three reuse `ElementDefaultsEditor`; the scoped
  loaders/savers live in `useScopedElementDefaults.ts`.
- Font-size snapping (`fontSizeSnap: "designSystem"`) reuses the project's
  resolved design-system typography sizes, read read-only (no row creation) via
  `useProjectFontTokens` and passed to `createElementForTool`.

### File map

| File | What it contains |
| --- | --- |
| `src/domain/settings/types.ts` | Pure settings types: global settings, canvas settings, key commands, modifier commands, toolbar layout, element defaults, and persisted `SettingsRow`. |
| `src/domain/settings/defaults.ts` | The complete default settings tree. Defaults are the source of truth for missing persisted fields. |
| `src/domain/settings/commands.ts` | The canvas command registry. Every shortcut or held modifier should map to a named command id such as `canvas.drag.reparent` or `canvas.tool.rectangle`. |
| `src/domain/settings/resolve.ts` | Default-plus-override resolution, keybinding matching, modifier matching, shortcut formatting, and recording helpers. |
| `src/lib/storage/repos/settings.repo.ts` | Storage repo for global settings. It reads/writes `TABLES.settings` through `getRecordById` and `putRecord`. |
| `src/application/settings/useGlobalSettings.ts` | React hook that loads global settings and subscribes to the `settings` table. |

### Canvas settings model

Canvas settings are split by ownership:

- `canvas.tools`: toolbar layout and default active tool.
- `canvas.toolDefaults`: tool-level defaults such as shape render modes.
- `canvas.elementDefaults`: default names, sizes, styles, and content for newly created elements.
- `canvas.inputBindings.keyCommands`: discrete keyboard commands such as undo, paste, zoom, and tool selection.
- `canvas.inputBindings.modifierCommands`: held modifiers such as reparent while dragging, context toolbar, resize from center, constrain aspect, and rotation snapping.
- `canvas.viewport`: canvas interaction values such as zoom step and wheel zoom sensitivity.
- `canvas.shell`: shell-level defaults such as background and grid.

Do not check `event.metaKey`, `event.altKey`, or `event.shiftKey` directly for
canvas behavior that should be configurable. Use the helpers in
`src/domain/settings/resolve.ts`:

- `matchesKeyCommand(event, settings, commandId)` for discrete shortcuts.
- `isModifierCommandActive(event, settings, commandId)` for held modifiers.

Toolbar config must stay serializable. Persist only tool ids, groups, dropdowns,
and badges. The React icon registry lives in `src/canvas/toolbarConfig.tsx`,
which turns the serializable layout plus current keybindings into renderable
toolbar entries.

Future project-specific settings should use the same table with ids such as
`project:<projectId>` and resolve in this order:
`defaults -> global overrides -> project overrides`.

---

## Rules for models working in this codebase

- **Never call `getTable` or `setTable`.** Those symbols no longer exist. Use
  `listTable`, `putRecord`, `removeRecords`, `replaceTable` from
  `src/lib/storage/store.ts` (or directly from `recordStore.ts`).
- **Never `await saveScene`.** It is `void`. The UI must not block on it.
- **Never write to the persistence port directly.** All writes go through
  `getSaveQueue().enqueue(mutation)` or through `putRecord` (which calls enqueue
  internally). Direct `port.applyBatch` calls bypass the outbox and the coalescing.
- **Never open a SQLite connection in Rust.** The only connection is the one in
  `tauri::State<Db>`, injected by Tauri. All Rust commands receive it via
  `state: State<'_, Db>`.
- **Do not add a new blob key to `kv_store`.** New data goes in the `records`
  table via `putRecord`, keyed by `(table, id)`.
- **Do not store a canvas scene under a screen id or a component id.** Variants
  own scenes (see Storage ownership).

---

## Platform gotchas

- **WKWebView has no `<foreignObject>` support.** SVG-data-URL images displayed
  via an `<img>` tag must use native SVG primitives, not HTML/CSS embedded in a
  `<foreignObject>` — it renders blank on macOS desktop.
