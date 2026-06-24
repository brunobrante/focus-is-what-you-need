# MCP Server Implementation Plan

> A Paper-style Model Context Protocol server for this design canvas app, so AI
> agents (Claude Code, Cursor, Codex, Copilot, etc.) can read from and write to
> the live editor over a local HTTP endpoint.
>
> Status: **planning** — nothing here is built yet. This document is the spec.
> Last updated: 2026-06-07.

---

## 1. Goal

Replicate the core of [Paper's MCP server](https://paper.design/docs/mcp) for our
own canvas:

- An MCP server starts **automatically** in the background when the desktop app
  is running, exposed over **Streamable HTTP** on a fixed loopback port.
- AI agents connect with one command (e.g. `claude mcp add ... --transport http`)
  and get **bidirectional** access: read the scene tree, screenshots, computed
  styles, and JSX; write HTML, edit text, restyle, move/duplicate/delete nodes.
- Writes land in the **live editor** the user is looking at, not just the DB, so
  the user watches the agent work in real time — and the changes flow through the
  existing SaveQueue → SQLite pipeline and thumbnail propagation.

### What "similar to Paper" concretely means

Paper exposes ~24–25 tools over `http://127.0.0.1:29979/mcp`. We mirror the
shape of that tool surface but map every tool onto **our** data model
(`HtmlCanvasDocument` / `HtmlCanvasNode`, screens, components, variants) rather
than Paper's artboard model. Their tool list (for reference):

| Group | Paper tools |
| --- | --- |
| Info | `get_basic_info`, `get_selection`, `get_node_info`, `get_children`, `get_tree_summary`, `get_screenshot`, `get_jsx`, `get_computed_styles`, `get_fill_image`, `get_font_family_info`, `get_guide` |
| Export | `export` |
| Create/modify | `create_artboard`, `write_html`, `set_text_content`, `rename_nodes`, `duplicate_nodes`, `move_nodes`, `update_styles`, `delete_nodes`, `finish_working_on_nodes` |

We will not implement all of these on day one — see the phased roadmap in §12.

---

## 2. Key architectural problem

Paper's server is tied to the **live, open file**. Tools like `get_selection`
and `finish_working_on_nodes` (clear the "agent is editing this" indicator) only
make sense against the running editor, not a database snapshot.

Our app has the same split:

- **Source of truth for live edits** is the in-memory engine reducer in the
  frontend (`apps/desktop/src/canvas/engine/`). The UI reads this synchronously
  and never waits on the DB.
- **Durable state** is SQLite, written asynchronously through the SaveQueue
  (`putRecord` → `SaveQueue.enqueue` → `db_apply` IPC → one SQLite transaction).
  This is eventually consistent and lags the live engine by up to an idle tick.

A scene the user is actively editing is therefore **newer in the frontend than
in SQLite**. Any MCP write that goes straight to SQLite would (a) be invisible
until reload and (b) collide with the editor's `sceneVersion` optimistic guard.

**Conclusion: the MCP server must route live tools through the frontend, not the
DB.** We adopt a *bridged* architecture (Paper does effectively the same — the
server lives inside the desktop process and talks to the open document).

---

## 3. Chosen architecture

```
┌─────────────────────────── AI agent (Claude Code / Cursor / …) ──────────────┐
│  speaks MCP over Streamable HTTP                                              │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │  POST/GET http://127.0.0.1:29979/mcp   (JSON-RPC 2.0)
                ▼
┌──────────── Rust / Tauri process (apps/desktop/src-tauri) ────────────────────┐
│                                                                               │
│  axum HTTP server  ──►  MCP protocol layer (initialize, tools/list, …)        │
│        │                                                                       │
│        │  tool call needs live editor?                                        │
│        │     yes ─────────────────────────────────────────────┐              │
│        │                                                        ▼              │
│        │                                          ┌─── Bridge (request/reply) │
│        │                                          │   - assign requestId      │
│        │                                          │   - park a oneshot        │
│        │                                          │   - app.emit("mcp://call")│
│        │                                          └────────────┬──────────────│
│        │     no (static read) ──► read SQLite via Db state      │             │
│        │                          (db_get_record / records tbl) │             │
│        └────────────────────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────┬──────────────────┘
                                                              │  Tauri event
                                                              ▼
┌──────────── Frontend (React, the live editor) ───────────────────────────────┐
│  MCP bridge listener (useMcpBridge)                                           │
│     - receives {requestId, tool, args}                                        │
│     - dispatches to a tool handler that runs engine mutations / reads         │
│     - commits via existing actions → putRecord → SaveQueue → propagation      │
│     - invoke("mcp_resolve", {requestId, result|error})  ──► resolves oneshot  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Why this split

- **Live tools** (`get_selection`, `write_html`, `set_text_content`,
  `update_styles`, `move_nodes`, `delete_nodes`, `duplicate_nodes`,
  `rename_nodes`, `create_artboard`, `finish_working_on_nodes`, and
  *screenshot of the currently open subject*) → **bridged to the frontend** so
  they hit live state and the user sees them.
- **Static reads that don't need the open editor** (`get_basic_info` for any
  project/screen, `get_tree_summary` of a stored scene, `get_node_info` from a
  persisted scene, listing projects/screens/components) → can be served
  **directly from SQLite in Rust** for speed and so they work even when the
  target isn't the open document. These read the `records`/`scenes` tables
  through the existing `Db` state.

When in doubt, bridge it. Direct-DB reads are an optimization, not the default.

### Transport: Streamable HTTP

Match Paper exactly: a single endpoint `http://127.0.0.1:<port>/mcp` that
accepts `POST` (client→server JSON-RPC messages) and `GET` (server→client SSE
stream for notifications/streamed responses), per the MCP **Streamable HTTP**
spec. No stdio transport — the server is long-lived inside the desktop app, and
HTTP is what lets multiple agents attach to the running app without spawning a
child process.

- Bind to `127.0.0.1` only (loopback) — never `0.0.0.0`.
- Default port: pick one and document it (Paper uses `29979`; we can use e.g.
  **`29380`** — confirm it's free, make it configurable via settings).
- Validate the `Origin` header and require a session id to mitigate
  DNS-rebinding / drive-by browser access (see §11).

---

## 4. Component breakdown & file map

New code, by layer. Paths are relative to repo root.

### 4.1 Rust (Tauri backend)

| File | Responsibility |
| --- | --- |
| `apps/desktop/src-tauri/src/mcp/mod.rs` | Module root; `start_mcp_server(app_handle)` spawns the axum server on app setup; `McpState` (port, session map, pending-request map). |
| `apps/desktop/src-tauri/src/mcp/http.rs` | axum router: `POST /mcp`, `GET /mcp`, health check. Session handling, Origin checks, SSE stream. |
| `apps/desktop/src-tauri/src/mcp/protocol.rs` | JSON-RPC 2.0 + MCP envelope: `initialize`, `tools/list`, `tools/call`, `ping`, error mapping. The static tool catalog (names + JSON Schemas) lives here. |
| `apps/desktop/src-tauri/src/mcp/bridge.rs` | Request/reply bridge to the frontend: `call_frontend(tool, args) -> Result<Value>` (assign id, park `oneshot`, `app.emit`, await with timeout). `#[tauri::command] mcp_resolve(...)` to receive the frontend's answer. |
| `apps/desktop/src-tauri/src/mcp/db_tools.rs` | Direct-SQLite implementations of static read tools, reusing the `Db` connection. |
| `apps/desktop/src-tauri/src/lib.rs` | Register `mcp_resolve` (+ any control commands) in `invoke_handler`; call `mcp::start_mcp_server` in `.setup()`. |
| `apps/desktop/src-tauri/Cargo.toml` | Add deps: `axum`, `tokio` (with `rt-multi-thread`, `sync`, `time`), `tower-http` (CORS/limits), `uuid`. Optionally `rmcp` (official Rust MCP SDK) instead of hand-rolling `protocol.rs` — evaluate in §10. |

### 4.2 Frontend (React)

| File | Responsibility |
| --- | --- |
| `apps/desktop/src/application/mcp/mcpBridge.ts` | Subscribes to the `mcp://call` Tauri event, routes to handlers, calls `invoke("mcp_resolve", …)`. Framework-agnostic core. |
| `apps/desktop/src/application/mcp/useMcpBridge.ts` | React hook that wires `mcpBridge` to the active editor (current document, selection, the engine `dispatch`, the active owner `{ownerType, ownerId}`). Mounted once near the canvas root. |
| `apps/desktop/src/application/mcp/tools/*.ts` | One file per tool group (`reads.ts`, `writes.ts`, `screenshot.ts`). Each tool is a pure-ish function `(ctx, args) => Promise<result>` where `ctx` exposes the live document, selection, and commit helpers. |
| `apps/desktop/src/application/mcp/serialize.ts` | Map `HtmlCanvasNode` → MCP-facing node shapes (`nodeInfo`, `treeSummary`, `computedStyles`). Keep MCP output decoupled from internal types. |
| `apps/desktop/src/application/mcp/writeHtml.ts` | HTML string → `HtmlCanvasNode[]` parser/inserter for `write_html` (the hardest tool — see §9.3). |

### 4.3 Existing code we build on (do not duplicate)

- Engine mutations: `apps/desktop/src/canvas/engine/actions.ts` (re-exports
  `insertElement`, `reparentElements`, `deleteElements`, `duplicateElements`,
  `updateElementGeometry`, `updateElementStyles`, `updateElementText`,
  `renameElement`, `setElementVisible`, `setElementLocked`, …).
- Scene types: `apps/desktop/src/lib/canvas/htmlScene/types.ts`
  (`HtmlCanvasNode`, `HtmlCanvasStyle`, `HtmlCanvasDocument`).
- Persistence: `apps/desktop/src/lib/storage/recordStore.ts`
  (`listTable`, `getRecordById`, `putRecord`), scene repo
  `apps/desktop/src/lib/storage/repos/scenes.repo.ts`
  (`getSceneByOwner`, `upsertScene`, `propagateVariantSceneToParents`).
- Thumbnails: `apps/desktop/src/application/thumbnails/thumbnailQueue.ts`
  (`scheduleThumbnailRefresh`), `apps/desktop/src/lib/storage/sceneSnapshots.ts`
  (`snapshotDataUrlFromGraphJSON`).
- Tables: `apps/desktop/src/lib/storage/storeKeys.ts` (`TABLES`).
- Tauri DB state + commands: `apps/desktop/src-tauri/src/db.rs`
  (`Db`, `db_get_record`, `db_list_records`, `db_apply`).

---

## 5. The MCP protocol layer (Rust)

Implement the minimum MCP surface a client needs:

1. **`initialize`** — return `protocolVersion`, `serverInfo {name, version}`,
   and `capabilities { tools: {} }`. Issue a session id (`Mcp-Session-Id`
   response header). Persist it in `McpState.sessions`.
2. **`notifications/initialized`** — ack, no-op.
3. **`tools/list`** — return the static tool catalog (name, description,
   `inputSchema` as JSON Schema). The catalog is a `const` in `protocol.rs`;
   keep it in sync with the frontend handlers via a shared test (§13).
4. **`tools/call`** — `{name, arguments}` → dispatch:
   - if the tool is in the **DB-direct** set → run in `db_tools.rs`;
   - else → `bridge::call_frontend(name, arguments)`.
   Wrap the result as MCP `content` (text and/or `image` blocks). On error,
   return `isError: true` with a text block, not a transport-level error, so the
   agent can recover.
5. **`ping`** — health.

JSON-RPC framing, batching, and error codes per spec. SSE (`GET /mcp`) streams
server-initiated messages; for v1 we can keep responses synchronous on the POST
and use SSE only for keep-alive — full streaming is a later refinement.

### Streamable HTTP details to get right

- `POST /mcp` with `Accept: application/json, text/event-stream`. Respond with
  either a single JSON response or an SSE stream depending on the request.
- Maintain session via the `Mcp-Session-Id` header on every request after
  `initialize`. Reject unknown sessions with `404` so the client re-initializes.
- Honor `DELETE /mcp` to end a session.

---

## 6. The Rust ↔ Frontend bridge (the crux)

This is the mechanism that lets a tool call arriving on the HTTP server be
handled by the running editor and return a value to the HTTP response.

### 6.1 Data structures (`bridge.rs`)

```rust
// Pending requests: requestId -> oneshot sender for the frontend's reply.
type Pending = Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>;

pub struct McpBridge {
    app: AppHandle,
    pending: Pending,
}
```

### 6.2 Outbound call (server → frontend)

```rust
pub async fn call_frontend(
    bridge: &McpBridge,
    tool: &str,
    args: Value,
) -> Result<Value, String> {
    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    bridge.pending.lock().unwrap().insert(request_id.clone(), tx);

    // Fire the event the frontend listens for.
    bridge.app.emit("mcp://call", json!({
        "requestId": request_id,
        "tool": tool,
        "args": args,
    })).map_err(|e| e.to_string())?;

    // Await the frontend, with a timeout so a stuck/!mounted UI can't hang HTTP.
    match tokio::time::timeout(Duration::from_secs(30), rx).await {
        Ok(Ok(result)) => result,                       // Result<Value, String>
        Ok(Err(_canceled)) => Err("frontend dropped reply".into()),
        Err(_elapsed) => {
            bridge.pending.lock().unwrap().remove(&request_id);
            Err("frontend did not respond (no editor open?)".into())
        }
    }
}
```

### 6.3 Inbound reply (frontend → server) — Tauri command

```rust
#[tauri::command]
pub fn mcp_resolve(
    bridge: State<'_, McpBridge>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    if let Some(tx) = bridge.pending.lock().unwrap().remove(&request_id) {
        let payload = match error {
            Some(msg) => Err(msg),
            None => Ok(result.unwrap_or(Value::Null)),
        };
        let _ = tx.send(payload); // receiver may have timed out; ignore
    }
    Ok(())
}
```

### 6.4 Frontend side (`mcpBridge.ts`)

```ts
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

type ToolHandler = (ctx: McpContext, args: unknown) => Promise<unknown>;

export function startMcpBridge(getCtx: () => McpContext, handlers: Record<string, ToolHandler>) {
  return listen<{ requestId: string; tool: string; args: unknown }>(
    "mcp://call",
    async ({ payload }) => {
      const { requestId, tool, args } = payload;
      const handler = handlers[tool];
      try {
        if (!handler) throw new Error(`unknown tool: ${tool}`);
        const result = await handler(getCtx(), args);
        await invoke("mcp_resolve", { requestId, result, error: null });
      } catch (e) {
        await invoke("mcp_resolve", {
          requestId, result: null, error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );
}
```

### 6.5 `McpContext` — what handlers get

```ts
export type McpContext = {
  // Live editor state (read synchronously from the engine):
  document: HtmlCanvasDocument;          // current open scene graph
  selectedIds: string[];
  owner: { ownerType: "screen" | "variant"; ownerId: string } | null;

  // Commit path — runs an engine mutation against live state AND persists it.
  commit: (next: HtmlCanvasDocument) => void;   // updates engine + putRecord + propagation

  // Helpers:
  findNode: (id: string) => HtmlCanvasNode | undefined;
  rasterize: (nodeId?: string) => Promise<string>; // PNG/SVG data URL for screenshots
  setAgentBadge: (nodeIds: string[], on: boolean) => void; // finish_working_on_nodes
};
```

`useMcpBridge` builds this context from the same hooks the canvas already uses,
so MCP writes are *identical* to user edits — same reducer, same SaveQueue, same
propagation. No second write path.

> **Concurrency note:** the bridge processes one call at a time per the engine's
> single-threaded reducer. If an agent fires parallel `tools/call`s, queue them
> in `mcpBridge.ts` so each mutation sees the result of the previous one.

---

## 7. Server lifecycle

- **Start:** in `lib.rs` `.setup()`, after `app.manage(Db…)`, call
  `mcp::start_mcp_server(app.handle().clone())`. It spawns the axum server on a
  Tokio runtime and stores `McpState` (incl. chosen port) via `app.manage`.
- **Port selection:** try the configured port; if taken, either fail loudly with
  a logged error or fall back to the next free port and surface the actual port
  to the UI (Paper uses a fixed port — prefer fixed + clear error so the
  client-setup command stays copy-pasteable).
- **Readiness:** expose the active port + status to the frontend (a settings
  panel "MCP server: running on :29380") via a `mcp_status` command. Optional:
  a toggle to enable/disable, stored in the `settings` records row.
- **Shutdown:** on app exit Tokio tasks die with the process; no explicit
  teardown needed for v1. For a runtime toggle, hold a `tokio` shutdown handle.

---

## 8. Mapping our data model to MCP node concepts

Paper's "artboard / node" maps to our model as:

| Paper concept | Our equivalent |
| --- | --- |
| File | A **project** (`ProjectRow`) or the open document |
| Page / artboard | A **screen** (`ScreenRow`) or a **component variant** scene — i.e. a `SceneRow` with `ownerType` + `ownerId` |
| Node | An `HtmlCanvasNode` inside the scene's `HtmlCanvasDocument` |
| Selection | Engine `selectedIds` |
| Node id | `HtmlCanvasNode.id` |
| JSX export | Generated from the node subtree (we already render HTML/CSS — reuse the JSX/HTML emitter, see `sceneSnapshots.ts` / any existing `get_jsx`-like exporter) |
| Computed styles | `HtmlCanvasNode.style` (already CSS-shaped: `background`, `color`, `borderRadius`, flex props, etc.) |

The "currently open subject" is the active `{ownerType, ownerId}` — a screen
frame (`390x844` etc.) or a component variant frame. This is exactly the
canvas-editing model in CLAUDE.md: you open one screen/component and its frame is
the editable root. MCP tools operate on **that open subject** by default.

---

## 9. Tool catalog (our implementation)

Each tool below lists: **transport** (bridged vs DB-direct), **input**,
**output**, and **implementation notes**. JSON Schemas live in `protocol.rs`
(`tools/list`) and are mirrored by the frontend handlers.

### 9.1 Read tools

#### `get_basic_info` — DB-direct (or bridged for the open doc)
- **Input:** `{ projectId?, screenId?, variantId? }`. If omitted, use the open subject.
- **Output:** project name/type, the subject's frame dimensions, owner type/id,
  node count, root id.
- **Notes:** reads `projects`/`screens`/`components`/`scenes` rows. Frame size
  comes from the scene's `viewport` (`HtmlCanvasDocument.viewport`).

#### `get_selection` — **bridged**
- **Input:** `{}`.
- **Output:** array of selected node summaries (`id`, `name`, `kind`, `bounds`).
- **Notes:** reads engine `selectedIds`; needs the live editor.

#### `get_node_info` — bridged (open doc) / DB-direct (stored scene)
- **Input:** `{ nodeId, ownerType?, ownerId? }`.
- **Output:** full `nodeInfo` — id, name, kind, tag, bounds, style, text,
  imageUrl, parentId, childIds, visible, locked.
- **Notes:** `serialize.ts` maps `HtmlCanvasNode` → public shape.

#### `get_children` — bridged / DB-direct
- **Input:** `{ nodeId }`.
- **Output:** direct children summaries, ordered by `order`.

#### `get_tree_summary` — bridged / DB-direct
- **Input:** `{ nodeId?, depth? }` (default root, full depth).
- **Output:** compact indented text of the subtree:
  `Header [frame 342x72] > Logo Image [image], Header Copy [text], Search Button [shape]`.
- **Notes:** cheap, token-efficient overview — the agent's primary map. Build
  from the node list filtered by `parentId`.

#### `get_screenshot` — **bridged**
- **Input:** `{ nodeId?, scale? }` (default: the open subject root).
- **Output:** MCP `image` content block, base64 PNG.
- **Notes:** rasterize the node's bounds. Reuse the canvas painter or render the
  node's HTML/SVG to a canvas and `toDataURL`. For non-open scenes we can fall
  back to the stored SVG thumbnail (`thumbnails` table) but live PNG is better.

#### `get_jsx` — bridged / DB-direct
- **Input:** `{ nodeId? }`.
- **Output:** React + Tailwind (or inline-style) JSX string for the subtree.
- **Notes:** reuse/extend the existing HTML emitter behind `sceneSnapshots.ts`.
  Translate `HtmlCanvasStyle` → Tailwind classes or a `style={{}}` object.

#### `get_computed_styles` — bridged / DB-direct
- **Input:** `{ nodeIds: string[] }` (batch).
- **Output:** map of `nodeId → CSS object` from `HtmlCanvasNode.style`.

#### `get_guide` — DB-direct (static)
- **Input:** `{}`.
- **Output:** a markdown workflow primer telling the agent how our model works
  (screens vs components vs variants, frames are fixed, edit the open subject,
  ids are stable). Mirrors Paper's `get_guide`. **Implement this early** — it
  dramatically improves agent behavior.

### 9.2 Write tools

All write tools are **bridged**, run through engine `actions`, and therefore:
- update the live editor immediately,
- persist via `commit` → `putRecord`/`upsertScene`,
- trigger `scheduleThumbnailRefresh` + `propagateVariantSceneToParents`,
- are **undoable** (they push onto the engine `past` stack like any user edit).

#### `set_text_content` — batch text edit
- **Input:** `{ edits: [{ nodeId, text }] }`.
- **Engine:** `updateElementText` per edit, then one `commit`.

#### `rename_nodes`
- **Input:** `{ renames: [{ nodeId, name }] }`.
- **Engine:** `renameElement`.

#### `update_styles`
- **Input:** `{ updates: [{ nodeId, style: Partial<HtmlCanvasStyle> }] }`.
- **Engine:** `updateElementStyles`. Validate keys against `HtmlCanvasStyle`.

#### `move_nodes`
- **Input:** `{ moves: [{ nodeId, x?, y?, newParentId?, index? }] }`.
- **Engine:** `updateElementGeometry` for position; `reparentElements` +
  `reorderElement` for parent/order changes. Respect frame bounds (CLAUDE.md:
  elements stay inside the frame).

#### `duplicate_nodes`
- **Input:** `{ nodeIds, offset?: {x,y} }`.
- **Engine:** `duplicateElements`. **Output:** id mapping `{ oldId: newId }`.

#### `delete_nodes`
- **Input:** `{ nodeIds }`.
- **Engine:** `deleteElements` (removes descendants too).

#### `create_artboard` → **`create_frame`** (our naming)
- **Input:** `{ parentId?, name, width, height, style? }`.
- **Engine:** `createElementForTool` (frame) + `insertElement`. Because our
  frames map to components/screens, decide policy: v1 creates a **frame node**
  inside the open subject; creating a full **screen/component** with its own
  scene is a separate, larger tool (`create_component`) — see §9.4.

#### `write_html` — the hard one
- **Input:** `{ html, targetNodeId?, mode: "append" | "replace" }`.
- **Behavior:** parse an HTML/CSS string into `HtmlCanvasNode[]` and insert under
  `targetNodeId` (or the open root), or replace that node's subtree.
- **Implementation (`writeHtml.ts`):**
  1. Parse HTML (DOMParser in the renderer — frontend handler, so DOM is
     available).
  2. Walk the DOM; for each element create an `HtmlCanvasNode`:
     - `tag` → nearest `HtmlCanvasTag`; `kind` inferred (`text` for text nodes,
       `image` for `<img>`, `shape` for styled `<div>`, `frame` for containers
       with layout).
     - Resolve `getComputedStyle` (mount offscreen) → map to `HtmlCanvasStyle`
       (background, color, border*, padding, flex direction/align/justify, gap,
       font*, radius, etc.).
     - Compute `bounds` from layout (offscreen measure) relative to target.
     - Generate ids, set `parentId`/`order`.
  3. `insertElement` the new subtree, one `commit`.
- **Notes:** this is the most valuable write tool (agents prefer emitting HTML).
  Budget real time for the CSS→`HtmlCanvasStyle` mapping and layout measurement.
  Constrain to the style subset we support; drop/flatten what we can't represent
  and report it in the result so the agent knows.

#### `finish_working_on_nodes`
- **Input:** `{ nodeIds }`.
- **Behavior:** clear the "agent is editing" visual indicator on those nodes
  (`ctx.setAgentBadge(ids, false)`). Pairs with a badge we set when a write tool
  starts touching nodes — gives the user Paper-like real-time feedback.

### 9.3 Export tool

#### `export`
- **Input:** `{ nodeId?, format: "png" | "jpg" | "svg", scale? }`.
- **Output:** image content block (base64) or SVG text. PNG/JPG via the same
  rasterize path as `get_screenshot`; SVG via `snapshotDataUrlFromGraphJSON`
  scoped to the node subtree. (MP4/video export: out of scope, matches our
  "video import not implemented" roadmap stance.)

### 9.4 Project/hierarchy tools (beyond Paper — leverage our model)

Optional but high-value, since our model is richer than artboards:

- `list_projects` / `list_screens` / `list_components` — DB-direct, return rows
  from `projects`/`screens`/`components` so an agent can navigate before opening.
- `open_subject` — **bridged**, ask the editor to open a screen/variant so
  subsequent live tools target it. (Mirrors how a user opens a component.)
- `create_screen` / `create_component` — create a new `ScreenRow` /
  `ComponentRow` (+ its `activeVariantId` variant + blank scene) via the repos,
  respecting the ownership rules (component scenes under `ownerType:"variant"`,
  `screenId`/`parentVariantId` links). Heavier; later phase.

---

## 10. Build vs. use a Rust MCP SDK

Two options for the protocol layer:

1. **`rmcp` (official Rust MCP SDK)** — handles JSON-RPC framing, the
   Streamable HTTP transport, `initialize`/`tools/list`/`tools/call` plumbing,
   and schema. We provide tool handlers. **Recommended** — less protocol code to
   maintain, spec-conformant. Wire tool handlers to call `bridge::call_frontend`
   or `db_tools`.
2. **Hand-rolled (`protocol.rs` + axum)** — full control, no extra dep, but we
   own correctness of the transport (sessions, SSE, batching, error codes).

Decision: **prototype with `rmcp` first.** If it constrains the Tauri-state
access or the bridge pattern awkwardly, fall back to hand-rolled axum (the
structures in §5–6 assume we can do either; `bridge.rs` and `db_tools.rs` are
SDK-agnostic).

> Verify current `rmcp` version, its Streamable-HTTP support, and MSRV against
> our `rust-version = "1.71"` before committing. Bump MSRV if needed.

---

## 11. Security

The endpoint runs on the user's machine and can read/modify their designs.

- **Loopback only:** bind `127.0.0.1`. Never `0.0.0.0`.
- **Origin validation:** reject requests whose `Origin` header is a browser
  origin we don't expect (prevents a malicious web page from reaching the local
  server via DNS rebinding). Allow no-Origin (native agents) and explicit
  localhost dev origins only.
- **Session id:** require `Mcp-Session-Id` after `initialize`; unknown → 404.
- **Optional token:** consider a per-launch bearer token surfaced in the UI that
  the user pastes into the client config, for defense in depth. Paper relies on
  loopback + "authenticated API" framing; a token is a reasonable upgrade.
- **Body size limits** (`tower-http`) and a per-request timeout (the 30s bridge
  timeout in §6.2) to avoid resource exhaustion.
- **No arbitrary file/network access** from tools — tools only touch the scene
  model and DB.

---

## 12. Phased roadmap

Ship in vertical slices; each phase is independently testable.

### Phase 0 — Spike (transport + bridge)
- axum (or `rmcp`) server on loopback; `initialize`, `tools/list`, `ping`.
- One trivial bridged tool: `get_selection`.
- Frontend `useMcpBridge` mounted; `mcp_resolve` round-trips.
- **Exit criteria:** `claude mcp add` connects; `get_selection` returns live
  selection from the running app.

### Phase 1 — Read surface
- `get_guide`, `get_basic_info`, `get_tree_summary`, `get_node_info`,
  `get_children`, `get_computed_styles`.
- `serialize.ts` + DB-direct reads in `db_tools.rs`.
- **Exit criteria:** an agent can fully describe the open screen's hierarchy.

### Phase 2 — Visual reads
- `get_screenshot`, `export`, `get_jsx`.
- Rasterize path + JSX emitter.

### Phase 3 — Targeted writes
- `set_text_content`, `rename_nodes`, `update_styles`, `move_nodes`,
  `duplicate_nodes`, `delete_nodes`, plus `finish_working_on_nodes` + the agent
  badge.
- Verify SaveQueue persistence, thumbnail propagation, and undo all work.
- **Exit criteria:** "rename these layers / restyle this button / move that card"
  works end-to-end and survives reload.

### Phase 4 — `write_html` + frame/component creation
- `writeHtml.ts` HTML→node parser; `create_frame`; later `create_screen`/
  `create_component`, `open_subject`, `list_*`.

### Phase 5 — Polish
- Settings panel (status, port, enable/disable, token), SSE streaming for
  long ops, error-message quality, docs for client setup.

---

## 13. Testing strategy

- **Bun unit tests** (per CLAUDE.md, `bun test`):
  - `serialize.ts`: node → public shapes, tree summary formatting.
  - `writeHtml.ts`: representative HTML snippets → expected `HtmlCanvasNode[]`
    (style mapping, nesting, bounds).
  - Tool handlers against a fabricated `McpContext` with an in-memory document;
    assert the resulting `HtmlCanvasDocument` and that `commit` was called.
- **Catalog parity test:** assert every name in the Rust `tools/list` catalog
  has a frontend handler and vice-versa (prevents drift). Export the name list
  from both sides for the test to compare.
- **Rust tests:** `db_tools` reads against a temp SQLite seeded with known rows;
  bridge timeout behavior.
- **Manual integration:** connect Claude Code (`claude mcp add design …
  --transport http http://127.0.0.1:29380/mcp --scope user`), run a scripted
  session (summary → screenshot → restyle → verify in UI). The user already runs
  Vite + Tauri locally and verifies changes themselves.
- **MCP Inspector:** use `@modelcontextprotocol/inspector` against the endpoint
  to validate `initialize`/`tools/list`/`tools/call` conformance early.

---

## 14. Client setup (what we'll document for users)

Once shipped, the README/docs should give one-liners, mirroring Paper:

- **Claude Code:**
  `claude mcp add design --transport http http://127.0.0.1:29380/mcp --scope user`
- **Cursor / Copilot / Codex / others:** an HTTP MCP entry pointing at the same
  URL (`.cursor`/`.vscode/mcp.json`/etc.). Provide copy-paste JSON blocks.
- Note that the server only runs while the desktop app is open, and which port
  it's on (surface it in-app).

---

## 15. Open questions / risks

1. **`write_html` fidelity.** Mapping arbitrary CSS to our constrained
   `HtmlCanvasStyle` is lossy. Define the supported subset explicitly and report
   dropped properties. Highest-effort, highest-risk tool.
2. **`rmcp` vs hand-rolled** and its compatibility with Tauri state + our MSRV
   (§10). Resolve in Phase 0.
3. **Screenshot rendering source.** Live canvas re-raster vs. stored SVG
   thumbnail vs. headless HTML render. Live PNG is best but needs a clean
   rasterize entry point — confirm one exists or build it.
4. **Multiple windows / documents.** If the app can have several editors open,
   the bridge must target the right one (route by window label, or only serve
   the focused editor). v1: assume single active subject.
5. **Concurrency.** Serialize bridged writes (§6.5) so agent batches don't race
   the reducer.
6. **Port conflicts.** Fixed port keeps setup commands stable but can collide;
   decide fail-loud vs. auto-fallback + surfaced port.
7. **Existing `hono`/`@hono/node-server` overrides** in `package.json` suggest a
   JS HTTP server may already exist somewhere — check whether an MCP server could
   instead live in a Bun/Hono sidecar with DB access. The Rust-in-Tauri approach
   in this plan is preferred (single process, direct `Db` + live bridge), but
   confirm there isn't already an HTTP layer to extend before adding axum.

---

## 16. Summary

Build a loopback **Streamable HTTP MCP server inside the Tauri process** that
exposes a Paper-shaped tool surface mapped onto our `HtmlCanvasDocument` model.
Live tools are **bridged to the running React editor** via a Tauri
event + `oneshot` request/reply, so they hit live state, are undoable, and flow
through the existing SaveQueue and thumbnail propagation — no second write path.
Static reads can shortcut to SQLite. Ship in vertical slices: transport+bridge →
reads → visual reads → writes → `write_html`/creation → polish.

**Sources:**
[Paper MCP docs](https://paper.design/docs/mcp) ·
[MCP specification](https://modelcontextprotocol.io)
