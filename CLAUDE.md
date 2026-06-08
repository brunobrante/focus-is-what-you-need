# CLAUDE.md

## Branching Rule

This project is in active local development and has not reached production.
Always commit directly to `main`. Never create branches, never open pull requests.

## Language Rule

All code must be written in English, regardless of the language used in the prompt
or conversation.

This applies to everything inside a file:

- variable names, function names, class names, type names
- file names and folder names
- comments and JSDoc
- string literals that are not user-facing UI copy
- SQL column names, table names, Rust struct fields and enum variants
- git branch names and commit messages

The conversation language (Portuguese or any other) does not change this rule.
If a prompt is written in Portuguese, the code and file content produced in
response must still be entirely in English.

The only exception is user-visible UI copy (button labels, error messages shown
to the user, placeholder text) — those follow whatever language the product uses
for its interface.

## Runtime And Tooling

Default to Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun test` instead of `jest` or `vitest`.
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`.
- Use `bun install` instead of `npm install`, `yarn install`, or `pnpm install`.
- Use `bun run <script>` instead of `npm run <script>`, `yarn run <script>`, or `pnpm run <script>`.
- Use `bunx <package> <command>` instead of `npx <package> <command>`.
- Bun loads `.env` automatically, so do not add `dotenv`.

When touching app APIs, prefer Bun-native primitives:

- `Bun.serve()` instead of `express`
- `bun:sqlite` instead of `better-sqlite3`
- `Bun.redis` instead of `ioredis`
- `Bun.sql` instead of `pg` or `postgres.js`
- built-in `WebSocket` instead of `ws`
- `Bun.file` instead of `fs.readFile` and `fs.writeFile` where practical

## Core Product Idea

This project is not just a gallery of screens and it is not just a flat component library.

The core idea is a screen-first component explorer built from mocked data, where each screen is the source of truth and every component is derived from that screen's visual hierarchy.

The system should let someone start from a complete screen, understand every meaningful child inside it, click deeper into any child, and keep drilling down while always preserving the parent-child relationship that explains where that component came from.

In short:

- screens are the starting point
- components are extracted from screens
- children are extracted from components
- every preview is a snapshot of the real bounds of that exact node
- the hierarchy matters more than a generic design-system categorization

## Mental Model

Think of each mocked screen as a tree.

A screen is the root node.
Its direct UI sections are child components.
Those sections can contain their own children.
Those children can contain smaller children again.

The user should be able to navigate that tree visually.

Example mental model:

- `Home` is a screen
- `Header`, `Hero Banner`, `Category Strip`, `Featured List`, and `Mobile App Cart` are direct children of `Home`
- `Header` contains `Logo Image`, `Header Copy`, and `Search Button`
- `Featured List` contains product cards
- each product card contains an image, title, price, and so on

This means the product is effectively a visual decomposition tool:

1. start from the whole screen
2. split the screen into meaningful child components
3. let each child be previewed on its own
4. let each child reveal its own children
5. never lose the ancestry back to the father screen

`father` here means `parent`.
The parent relationship is not optional metadata. It is the main structure of the product.

## What Must Always Be True

### 1. The screen is the source of truth

Components should not be invented in isolation first and attached later.
They should come from a specific screen or from a specific parent component inside a screen.

If a component exists, it should be possible to answer:

- which screen did it come from?
- who is its immediate parent?
- what are its immediate children?

If those questions cannot be answered, the structure is too generic and no longer matches the intent of this project.

### 2. Every component must preserve hierarchy

Each component must belong to its father.
Each child must keep its parent relationship.
Each screen must expose its direct children.

This is more important than naming things as `Layout`, `Atom`, `Pattern`, or `Section`.
Those labels can help, but the hierarchy is the real truth.

### 3. The same hierarchy should drive all views

The same mocked hierarchy should feed:

- screen previews
- component detail previews
- child component lists
- seed data
- mock canvas scenes
- navigation between screen and component detail pages

There should not be one fake structure for previews and another unrelated structure for stored mock data.
The hierarchy should be defined once and reused everywhere.

### 4. Snapshot size must come from the node itself

This is a non-negotiable rule.

Snapshots must use the intrinsic size of the node being previewed.
Do not force everything into a generic preview ratio such as `4:3`.
Do not crop a component into an arbitrary card if that changes its meaning.

Examples:

- if a mobile screen is `390x844`, its snapshot must be `390x844`
- if a header is `342x72`, its snapshot must be `342x72`
- if a cart bar is `342x88`, its snapshot must be `342x88`
- if a product card is `150x184`, its snapshot must be `150x184`

The point of the snapshot is to represent the actual component, not a normalized placeholder.

### 5. Mock content should be realistic enough to communicate structure

The mock data should not be empty boxes with vague labels if the screen clearly implies richer structure.
Each screen and component should include believable content such as:

- header text
- logo image block
- search controls
- CTA labels
- product names
- prices
- helper copy
- filter chips
- list rows
- summary text
- form fields
- payment methods
- cart totals

The goal is not realism for its own sake.
The goal is to make the hierarchy legible and the preview understandable immediately.

### 6. Components are screen-derived, not detached design tokens

This project does not start from a pure design-system mindset where a generic component exists independently of context.

Instead, a component here is primarily:

- a piece of a real screen
- with a known parent
- with known children
- with enough data to render a believable snapshot

It is acceptable for the same conceptual pattern to exist in different screens with different content if that helps preserve the screen-first truth.

## Required Interaction Behavior

### Screen click behavior

When the user opens or clicks a screen such as `Home`, the preview must show the complete screen snapshot with all its visible children already included.

That means:

- the screen snapshot is a whole composition
- it represents the full screen, not one isolated component
- the user should be able to understand the layout and the child sections from this single preview

### Component click behavior

When the user clicks a component inside that screen, the UI should transition to that component as the selected subject.

At that point:

- the main preview should show only that component's own snapshot
- the snapshot must keep the component's real dimensions
- the child components contained inside that component should be shown adjacent to it in the side panel or child list
- those child components should themselves be openable

So the browsing model is:

- whole screen first
- one selected child next
- that child's children beside it
- then repeat

### Child adjacency behavior

When a selected node has children, those children should appear as siblings in the surrounding inspector or grid, adjacent to the currently selected item in the UI flow.

The important point is that the selected node is not shown mixed back into the full screen.
It is shown on its own, while its contained children are available nearby for continued navigation.

## Canvas Editing And Storage

### Frames and screens

Every component has a **frame** — the base element that defines its bounds and acts as the canvas boundary when that component is being edited. The frame is the root of the component's editable scene.

A **screen** is a special frame: the top-level root of the hierarchy. Screens have fixed defaults (device dimensions, type) that cannot be edited from within the canvas. In every other respect a screen behaves identically to a component frame.

### Editing model

A frame is only editable when its component is explicitly opened in the canvas. When opened:

- the frame becomes the canvas boundary — elements can only be placed inside it, not outside
- the frame itself is locked in position and cannot be moved or resized
- closing the component returns to the parent context

This is by design: a component already occupies a fixed position in its parent screen or parent component, so its frame boundary is fixed. You never edit a component by going to the full screen and clicking inside it from there. You open the specific component, and only that component's frame becomes editable.

Every screen and every component opened in the canvas must have exactly one editable scene tied to its frame:

- opening a screen edits the screen's frame scene
- opening `Header` edits the `Header` frame scene
- opening `Logo Design` edits the `Logo Design` frame scene

For a full mobile screen the frame is the screen body at `390x844`.
For a component such as `Header`, the frame is the component root at `342x72` — not the original phone body.

If the user opens a component, the canvas must not secretly render the full screen and then select a nested node. It must render the component's own frame as the canvas root, using the frame's own bounds.

### Canvas zoom behavior

The canvas is not an infinite workspace.
There is no infinite horizontal or vertical panning area around the frame.
The editable area is the frame of what was opened: the screen or the component.

Zoom must respect that model:

- the minimum user zoom is `1x` (`100%`)
- users must not be able to zoom out below `1x`
- zooming and panning must stay clamped to the opened subject's bounds
- the maximum user zoom is `25x` (`2500%`)

Opening a full screen should start at `1x` user zoom.
At `1x`, one document pixel maps to one CSS pixel — the projection is independent of the browser window size. If the screen is larger than the visible canvas area, the screen overflows and the user pans to see the rest. The browser window is purely a clipping rectangle: resizing it changes what's visible but never recomputes the canvas projection. This is what keeps the selection outline glued to its element while the window is being resized.

Opening a component should calculate the initial zoom from that component's own intrinsic size.
Small components must not open as tiny `1x` objects.
For example, a `60x60` component can open around `5x` (`500%`) because the subject is small enough to inspect comfortably while still being bounded by its own scene.

This initial zoom must be based on the opened subject's width and height, not on generic project type, component kind, arbitrary preview ratios, or the original parent screen size.

Snapshots keep their intrinsic source dimensions, but component snapshots shown in previews may be visually scaled using the same subject-size zoom logic so small components are legible.
This visual scaling must not rewrite the snapshot dimensions, crop the image, distort the aspect ratio, or imply that the component itself has different bounds.

### Storage ownership

Storage follows the same hierarchy as the UI:

- screen scenes are stored with `ownerType: "screen"` and the screen id
- component scenes are stored with `ownerType: "variant"` and the component's active variant id
- a top-level component belongs to its source screen through `screenId`
- a nested component belongs to its parent component through `parentVariantId`
- every component owns an `activeVariantId`, and that variant owns the editable canvas scene

Do not store component canvas scenes under component ids.
Variants are the editable scene owners for components.

### Snapshot propagation

Snapshots are derived from scenes.
They should not be manually maintained as disconnected mock images once a scene exists.

When a component variant scene is saved, the storage layer must:

1. update that variant's scene
2. regenerate that variant's thumbnail from the scene graph
3. replace the matching subtree inside its parent scene
4. regenerate the parent thumbnail
5. continue upward until the source screen thumbnail has been regenerated

Example:

- editing `Logo Design` updates the `Logo Design` snapshot
- the `Logo Design` subtree is replaced inside `Header`
- the `Header` snapshot updates
- the `Header` subtree is replaced inside `Home`
- the `Home` screen snapshot updates

This propagation is required because parent previews are visual compositions of their children.
If a child component changes but the parent snapshot still shows the old child, the hierarchy is broken.

Schema migrations should also be used when needed to repair older local storage rows whose scenes and thumbnails were created before connected snapshot propagation existed.

## Data Modeling Rules

When defining mock data, the minimum useful unit is:

- node name
- node kind
- parent relationship
- children
- content data needed to render the preview

This means a component record should conceptually answer:

- `name`: what this node is
- `kind`: what type of component it is
- `parent`: which screen or component owns it
- `children`: which nodes are directly inside it
- `preview data`: the text, images, colors, shapes, and layout information needed to render it

Do not create orphan components with no parent unless the product explicitly evolves to support truly global shared nodes later.
For the mocked experience, the safer assumption is that every important node is born inside a screen tree.

## Screen Decomposition Guidelines

When decomposing a mocked screen, split by meaningful UI ownership, not by microscopic DOM fragments.

Good direct children:

- `Header`
- `Hero Banner`
- `Search Bar`
- `Filter Chips`
- `Featured List`
- `Product Results`
- `Product Gallery`
- `Product Summary`
- `Options List`
- `Shipping Form`
- `Payment Methods`
- `Mobile App Cart`

Good nested children inside those:

- `Logo Image`
- `Header Copy`
- `Search Button`
- `Primary CTA`
- `Product Card`
- `Product Card Image`
- `Product Card Title`
- `Product Card Price`
- `Field Label`
- `Field Input`
- `Checkout CTA`

Avoid making the first decomposition level too tiny.
For example, `H1 text`, `left padding`, or `single icon` should usually not be top-level screen children unless they are independently meaningful in the product.

## Canonical Example Trees

These examples express the intent better than abstract rules alone.

### Home

- `Home` screen
- `Header`
- `Hero Banner`
- `Category Strip`
- `Featured List`
- `Mobile App Cart`

### Home > Header

- `Header`
- `Logo Image`
- `Header Copy`
- `Search Button`

### List

- `List` screen
- `Header`
- `Search Bar`
- `Filter Chips`
- `Product Results`
- `Mobile App Cart`

### Detail

- `Detail` screen
- `Header`
- `Product Gallery`
- `Product Summary`
- `Options List`
- `Mobile App Cart`

### Checkout / Mobile App Cart Flow

- `Checkout` screen
- `Header`
- `Shipping Form`
- `Payment Methods`
- `Mobile App Cart`

The important part is not the exact naming.
The important part is that each screen can be decomposed into a clear, navigable tree and every node can be previewed independently.

## What To Avoid

- do not treat the app as a random mock gallery with no hierarchy
- do not flatten all components into one unrelated library
- do not lose the link between a component and its father screen
- do not crop component previews into arbitrary ratios
- do not use empty placeholder boxes when the mock should communicate real structure
- do not define one hierarchy for storage and a different one for the UI
- do not decompose screens so aggressively that the tree becomes noisy and useless
- do not create component previews that secretly still depend on showing the whole screen

## Definition Of Success

The product is correct when a new person can open it and immediately understand:

- what the full screen looks like
- which major children exist inside that screen
- how to click into one child and isolate it
- how to see that child at its own true size
- how to continue into the next child level
- how every node remains anchored to the same original screen hierarchy

If a reader or user can say:

`I can start at Home, inspect the whole screen, click Header, see Header alone, then inspect Logo Image and Header Copy without losing context`

then the product is aligned with the intended idea.

## Builder

The Builder (`/generate`, `/tools` routes) is a standalone reference tool for UI/UX work. It is entirely separate from the canvas editor and the screen-first hierarchy — it has its own storage model, its own engine, and its output does not directly feed the component tree.

### Purpose

The problem the Builder solves: given a static UI screenshot or design image, extract meaningful component cuts from it. The user imports an image, draws crop regions over it to define component boundaries, and the resulting crops are grouped into a **stack**. A stack is a named collection of image cuts that, taken together, reconstruct the original reference image.

The long-term goal is to accumulate enough labeled image-to-component data to train a model capable of transforming a static UI image into HTML/CSS automatically.

### Current functionality

- **Import**: user uploads a static image (video planned, not yet implemented)
- **Cut**: user defines crop regions over the image to mark component boundaries
- **Stack**: all cuts from a reference image form a stack — one stack per image
- **View modes**: Builder (active cropping and editing) and Stack (viewing all collected cuts)

### Roadmap items — do not treat as bugs

These are intentionally not implemented yet:

- Video import
- Background-remove tool
- Other image processing tools to improve cut quality
- Connecting stacks to the References section of the main project

### Constraints for this area

- Builder storage is separate from the canvas `records` / `scenes` / `variants` system — do not connect them
- A Builder cut is an image crop, not a canvas scene node — do not treat it as one
- The Builder does not use an infinite canvas — it operates on a fixed reference image

## Save Architecture

The save system was rewritten from scratch. The old model stored every "table"
(scenes, components, variants, …) as a single giant JSON blob in a KV row. Every
edit read the whole blob, mutated one field in memory, then re-serialised and
re-wrote the entire blob over IPC. This caused hundreds of MB of IPC per editing
session and blocked the main thread.

The new model is delta-based, queue-backed, and follows clean architecture with a
single port that all adapters implement.

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
`open_and_migrate` runs once at setup, creates all tables, and sets WAL + NORMAL
sync. The old `open_kv_connection` (open + `CREATE TABLE` on every single
`kv_get`/`kv_set` call) is gone.

| Command | What it does |
| --- | --- |
| `db_apply(batch)` | Applies an entire coalesced batch in **one** `BEGIN…COMMIT` transaction. Handles `upsert_record`, `delete_records`, `upsert_scene`, `upsert_node`, `delete_node`, `delete_scene_nodes`, `upsert_thumbnail`, `delete_thumbnail`. Scene upserts use `WHERE excluded.scene_version > scenes.scene_version` (optimistic guard). Returns `ApplyAck { applied, scene_versions }`. |
| `db_get_record(table, id)` | Single-row read from the `records` table. |
| `db_list_records(table)` | All JSON strings for one table from `records`. |
| `db_get_scene(owner_type, owner_id)` | Reads from the typed `scenes` table. |
| `db_load_scene_nodes(owner_type, owner_id)` | All nodes for a scene from `nodes`, ordered by `order_index`. |
| `db_get_thumbnail(owner_type, owner_id)` | Reads from the typed `thumbnails` table. |
| `kv_get` / `kv_set` | Still exist for the legacy blob KV path, but now use the **same pooled connection** (no more per-call open + CREATE TABLE). |

SQLite schema created in `open_and_migrate`: `kv_store`, `scenes`, `thumbnails`,
`nodes` (with `idx_nodes_owner` index), and `records` (with `idx_records_tbl`
index).

#### Ancestor propagation

The old `propagateVariantSceneToParents` ran synchronously inside `upsertScene`,
multiplying the write cost by the depth of the component tree. Now:

- `upsertScene` calls `putRecord` (synchronous cache + enqueue) and schedules
  thumbnail regeneration via `scheduleThumbnailRefresh`.
- `propagateSceneToParents` in `scenes.repo.ts` is exported as a standalone
  function, called **off the critical path** (at idle, after the row is persisted).
- Moving a node in a deeply nested component no longer blocks the interaction.

## Global Settings Architecture

Settings are stored as ordinary `records` rows, not in `kv_store` and not inside
projects, scenes, or variants. The current global settings row is:

- `table`: `settings`
- `id`: `global`
- `json`: a `SettingsRow` containing `schemaVersion`, `scope`, and `overrides`

The SQLite layer does not need a dedicated settings table. The existing
`records(tbl, id, json)` table persists settings through the same record-store
cache and `SaveQueue` used by the rest of the app.

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

`defaults -> global overrides -> project overrides`

### Rules for models working in this codebase

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
