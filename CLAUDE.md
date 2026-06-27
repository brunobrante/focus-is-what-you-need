# CLAUDE.md

Operating guide for this repo. Keep it lean — the deep detail lives in the linked
docs below.

## The locked idea

The product concept and the UX behavior the app must obey are set in stone in
[`Product.md`](./Product.md). It is the only "do not change the idea" document.
Everything else — the database, the code, the storage model, the file structure,
performance, naming — is implementation you may refactor and improve freely, as
long as no law in `Product.md` is broken. When the idea and the code disagree,
`Product.md` wins.

## Documentation map

- [`Product.md`](./Product.md) — product concept + UX laws (locked). **Read first.**
- [`UX.md`](./docs/UX.md) — living UI spec: every route, page, modal, and interaction.
- [`Design.md`](./Design.md) — UI patterns, height scale, component conventions, visual tokens.
- [`Versioning.md`](./docs/Versioning.md) — master / instance / detach / version model.
- [`Architecture.md`](./docs/Architecture.md) — save system, settings, storage ownership (graph edges, per-row tokens, asset store), the storage model's locked decisions + rationale, snapshot propagation, Rust backend. The living implementation reference.

Read the relevant doc before touching its area. Two are not optional to keep in
sync:

- **`UX.md`** — any change that affects UX (new/changed pages, routes, modals,
  navigation flows, buttons, actions, toolbar/tool behavior, or any feature that
  changes how the user reaches or uses a capability) **must update `UX.md` before
  committing**. It is the living spec.
- **`Design.md`** — read before adding or modifying toolbar controls, cards,
  buttons, or empty states.

## Where the code lives

Monorepo (Bun + Tauri v2 + React 19 + Tailwind v4 + React Router v7):

```
apps/desktop/     — the Tauri + React app (all app code lives here)
  src/domain/         — pure types/logic, zero I/O
  src/application/    — use cases (save queue, scenes, settings)
  src/infrastructure/ — persistence adapters (SQLite / IndexedDB / memory)
  src/lib/storage/    — record store + repos
  src/canvas/         — the canvas editor
  src/generate/       — the Builder (/generate, /tools)
  src-tauri/          — Rust backend (single SQLite connection)
packages/         — ui (shadcn), config (tsconfig/tailwind), types
```

Docs reference code as `src/...`, meaning `apps/desktop/src/...`.

Run / check (from `apps/desktop/`):

- `bun run dev` — Vite only (no Rust)
- `bunx tauri dev` — full desktop app
- `bun run typecheck` — note: a root `tsc --noEmit` is a no-op; the real check is
  `tsc --noEmit -p tsconfig.app.json`. The app has pre-existing type errors.

## Branching

Active local development, not yet in production. Always commit directly to `main`.
Never create branches, never open pull requests.

## Language

All code and file content must be in **English**, regardless of the conversation
language — variable/function/type names, file/folder names, comments, JSDoc,
non-UI string literals, SQL/Rust identifiers, and commit messages. A
Portuguese prompt still produces English code. The only exception is user-visible
UI copy (button labels, error messages, placeholders), which follows the
product's interface language.

## Runtime and tooling

Default to **Bun**, not Node.js:

- `bun <file>` (not `node`/`ts-node`), `bun test` (not jest/vitest),
  `bun build` (not webpack/esbuild), `bun install`, `bun run <script>`,
  `bunx <pkg>`.
- Bun loads `.env` automatically — do not add `dotenv`.
- Prefer Bun-native primitives: `Bun.serve()`, `bun:sqlite`, `Bun.redis`,
  `Bun.sql`, built-in `WebSocket`, `Bun.file`.

## Data lifecycle and migrations

This app is **local-only and pre-release** — no production deployment, no real
user data anywhere. Therefore **do not write data migrations or compatibility
shims.** When you change the persisted shape or the seed, bump `SCHEMA_VERSION`;
`ensureSeededAndMigrated` in `src/lib/storage/seed.ts` nukes and reseeds on any
mismatch — that is intended, not a bug. A full reseed discarding local
projects/scenes/edits is acceptable during development. (Revisit this section only
if the app ever ships with data worth keeping.)

The database (SQLite on desktop, IndexedDB on web) is the **source of truth**.
Files (`.figx`) are **export-only**, written on an explicit user action — do not
auto-mirror the DB into files.

## Storage and save guardrails

Detail and rationale live in [`Architecture.md`](./docs/Architecture.md). The
non-negotiables:

- **Never** call `getTable` / `setTable` (gone). Use `listTable`, `putRecord`,
  `removeRecords`, `replaceTable` from `src/lib/storage/store.ts`.
- **Never** `await saveScene` — it is `void`; the UI must not block on it.
- **Never** write to the persistence port directly — go through
  `getSaveQueue().enqueue(...)` or `putRecord` (which enqueues internally).
- **Never** open a SQLite connection in Rust — use the one in `tauri::State<Db>`.
- **Never** add a new blob key to `kv_store` — new data is a row in `records` via
  `putRecord`, keyed by `(table, id)`.
- **Never** store a canvas scene under a screen/component id — variants own scenes.
- For configurable canvas behavior, use `matchesKeyCommand` /
  `isModifierCommandActive` from `src/domain/settings/resolve.ts`, not raw
  `event.metaKey` / `altKey` / `shiftKey`.
