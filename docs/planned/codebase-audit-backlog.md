# Codebase Audit Backlog — July 2026

Status: **confirmed findings, ready to fix** — produced by a full multi-agent
audit (canvas, storage/save, Builder/pages/routes, Rust backend, duplication
sweep) on 2026-07-01. Work one item at a time: fix, verify, commit, next.

## Product.md conformance

Every item below was checked against `Product.md`. **No item conflicts with any
[LAW] or [NOW] behavior.** All fixes fall under "What is explicitly free to
change" (persistence, rendering, performance, module structure). Two findings
are the opposite of a conflict — the current *bug* violates Product.md, so the
fix is mandatory, not optional:

- [x] **H6 (delete-modal race)** violates *"Removing a linkable item that is used
  elsewhere"* **[NOW]**: the confirm window before the instance count resolves
  bypasses the per-instance keep-copy/delete choice, breaking law 11
  (ownership never ambiguous).
- [x] **H1 (swallowed commits)** breaks the product's basic promise that an edit
  applied to the scene is real and persisted (stated explicitly for Fast Edit,
  implicit for the canvas): style/vector edits are silently discarded and undo
  skips them.

Constraints to respect while fixing:

- [ ] Any fix that adds UI (e.g. M1 save-failure indicator) must update `UX.md`
  before committing.
- [ ] Shortcut fixes (M4, L-canvas modifiers) must go through
  `matchesKeyCommand` / `isModifierCommandActive`, not raw event flags.
- [ ] `domain/canvas/layout.ts` is planned work (see comments in
  `domain/canvas/types.ts`), **not** dead code — keep it.

Paths are relative to `apps/desktop/`.

## High

- [x] **H1 — Canvas equality comparators blind to newer fields; edits silently
  dropped.** `src/canvas/engine/history.ts:12-59` compares only 17 legacy style
  fields — misses `fills`, `effects`, `blendMode`, `cornerRadii`, `lineHeight`,
  `letterSpacing`, `path`, `viewBox`, `instanceOf`, `shellGrid`, layout fields.
  Via `store.tsx:416-423`: commits whose only delta is a blind field are
  discarded ("no net change"); transient-first gestures push no undo entry;
  render diff (`stage/canvasStageHelpers.ts:68`) skips repaint;
  `refreshInstances` drops vector-only master updates. Verified empirically by
  two independent audits. Fix: derive equality from the type (or one canonical
  deep-compare) so new fields can't drift out again.
- [x] **H2 — No flush on quit; last edits lost on Cmd+Q.** Save queue defers to
  `requestIdleCallback` (`src/application/persistence/saveQueue.ts:202-209`);
  no `beforeunload`/`pagehide` handler anywhere; no `CloseRequested` handler in
  `src-tauri/src/lib.rs`; `flushRecordStore` has zero callers; canvas edits sit
  an extra 300ms in `src/canvas/hooks/useDeferredPersistence.ts:134-136` that
  no quit path drains.
- [x] **H3 — One failed job permanently bricks owner propagation/thumbnails.**
  `src/application/persistence/ownerDebounceQueue.ts:56`: `writeChain =
  writeChain.then(() => runJob(key))` has no `.catch`; a single rejection stops
  every later job for the session. Also `flush()` (lines 62-80) runs jobs
  outside `writeChain`, bypassing the ordering the module documents.
- [x] **H4 — Sync Tauri commands freeze the UI.** Non-async commands run on the
  main thread: `export_figx_project` (`src-tauri/src/lib.rs:708`) reads all
  reference binaries into RAM, zips in memory, table-less CRC32
  (`lib.rs:1068`); `write/read_reference_file`, `write/read_reference_stack_*`,
  `read_reference_frame` (`lib.rs:300-677`); `extract_colors`
  (`src-tauri/src/models.rs:709`); `model_uninstall` (`models.rs:410`,
  ~700 MB `remove_dir_all`). Convert to `async` + `spawn_blocking` (pattern
  already used by `extract_video_frames`).
- [x] **H5 — Stack batch swap destroys old and new on failure.**
  `src-tauri/src/lib.rs:477-481`: `write_reference_stack_batch` deletes the old
  stack dir *before* the rename, and the rename error path deletes the temp —
  a failed rename loses both. Rename the old dir aside instead.
- [x] **H6 — Screen-delete modal race bypasses the detach/cascade choice.**
  `src/pages/GalleryPage.tsx:199-220`: `ConfirmActionModal` opens while the
  instance-usage count resolves async; a fast confirm runs
  `handleConfirmDeleteScreen()` with no `instanceStrategy`
  (`useGallery.ts:162-169`). **Violates Product.md** (per-instance
  copy-or-delete prompt).
- [x] **H7 — Navigation to nonexistent `/projects` route.** Falls into the `*`
  catch-all and renders the Dashboard at a bogus URL. Call sites:
  `src/pages/NewProjectPage.tsx:56`,
  `src/application/new-workspace/useNewWorkspace.ts:62` (workspace wizard
  finishes on the Dashboard instead of the new workspace),
  `src/domain/search/commandPalette.ts:49`.
- [x] **H8 — Stack component rename breaks all preview images.**
  `src/routes/references/components/ReferenceDetailModal.tsx:215` (with
  `:139`): rename creates a new preview object sharing `ownedUrls`; the cleanup
  effect revokes blob URLs the new preview still displays.

## Medium — persistence

- [x] **M1 — Save failure is invisible and stops retrying.**
  `src/application/persistence/saveQueue.ts:182-185` gives up after
  `maxRetries`, leaves mutations in `pending` with no re-scheduled retry (and
  `retries` never resets); `saveQueueProvider.ts:23` passes no `onStatusChange`
  and nothing reads `getStatus()` — the error state reaches no UI. UI addition
  → update `UX.md`.
- [x] **M2 — Schema-mismatch reseed doesn't clear derived/aux tables.**
  `src/lib/storage/seed.ts:171-188` replaces 12 tables but not `graph_edges`,
  `instance_usage`, `checklists`, `gallery_layout`, `reference_library(_groups)`;
  `reconcileAllGraphEdges` only adds edges; stale `instance_usage` blocks the
  cold rebuild (`src/application/scenes/instanceUsage.ts:128-138`); old seed
  thumbnail blobs orphan.
- [x] **M3 — Hydration clobbers in-session writes.**
  `src/lib/storage/recordStore.ts:84-91` unconditionally `map.set`s disk rows
  over the cache; a sync `putRecord`/`removeRecords` to a not-yet-hydrated
  table is overwritten/resurrected, and the enqueued upsert carries rev=1 which
  the adapters then drop (`db.rs:152`, `indexedDbPersistence.ts:140`) — lost on
  both sides.
- [x] **M4 — Deletes have no staleness guard; outbox replay races the session.**
  `deleteRecords` is unconditional in all three adapters; `replayOutbox`
  (`saveQueueProvider.ts:25`, `saveQueue.ts:136-144`) doesn't block boot;
  `acceptIfFresh` only checks the pending map — a stale replayed delete can
  land after a re-create. Related: adapters diverge on rev-less upserts (SQLite
  drops via `excluded.rev > records.rev`, `db.rs:113,152`; IndexedDB/memory
  apply unconditionally).
  **Done (2026-07-02):** `deleteRecords` now carries an optional per-id `revs[]`
  parallel to `ids`; `removeRecords` stamps each with the row's next revision
  (read before it leaves the cache). All three adapters apply a delete only when
  `revs[i] > stored.rev` (absent/empty → unconditional, for legacy + whole-table
  `replaceTable` prunes), so a stale replayed delete can no longer wipe a row a
  newer session re-created. Also fixed the divergence: SQLite's upsert guard is
  now `excluded.rev = 0 OR excluded.rev > records.rev`, so a rev-less upsert
  applies unconditionally like memory/IndexedDB and the documented contract. New
  shared-contract tests (stale delete rejected, out-ranking delete applied,
  lower-rev delete can't wipe) pass on all three adapters. **→ sanity-check
  in-app:** deleting a screen / component / reference still works normally.

## Medium — Builder / UI

- [x] **M5 — Builder shortcuts ignore modifier keys.**
  `src/generate/hooks/useToolsEditor.ts:1042-1069`: Cmd+C switches to crop,
  Cmd+V to move, Cmd+F creates a screen. Guard on
  modifiers (and prefer the key-command settings layer).
- [x] **M6 — GallerySlider crashes and swallows AI-tool errors.**
  `src/generate/ui/GallerySlider.tsx:65,134`: `cuts[index]` unguarded —
  deleting a non-focused cut while viewing the last index throws in render;
  `:71-108`: `checkColors`/`checkText`/`checkFont` are `try/finally` with no
  catch → unhandled rejection, spinner dies silently.
- [x] **M7 — Import duplicate resolution drops the "Use existing" decision.**
  `src/routes/references/components/ImportModal.tsx:169-178`: `onUseExisting`
  only fires when `remaining.length === 0 && staged.length === 0`; with other
  files staged the add-to-group decision is lost (`References.tsx:241-244`).
  Related: `:504` `DuplicatePreview` renders `item.url` which hydrates as `""`
  (blank preview); `:338` the ">150 MB videos ignored" warning only renders in
  the `!isStaged` branch.
- [x] **M8 — Reference library stuck loading forever on read failure.**
  `src/routes/references/hooks/useReferenceLibrary.ts:104-117`: `void
  loadLibrary().then(...)` has no `.catch`; `setLoading(false)` never runs.
- [x] **M9 — Builder Save silently drops the project link.**
  `src/generate/ToolsEditorView.tsx:878-887`: `linkReferenceToOwner` runs
  uncaught inside a `void (async () => ...)()`; the button shows "saved" even
  when the link write failed.

## Medium — Rust

- [x] **M10 — `.figx` export silently truncates.** `src-tauri/src/lib.rs:946,986`:
  unreadable reference binaries are skipped without error; a corrupt
  `meta.json` exports zero references; the command still returns success.
- [x] **M11 — `model_install` has no concurrency guard.**
  `src-tauri/src/models.rs:333`: two concurrent installs of the same id stream
  interleaved into the same `.part` file; no checksum catches the corrupt
  result.
- [ ] **M12 — IPC payload overhead.** Image bytes cross IPC as JSON number
  arrays (`Vec<u8>`, ~4x blowup — `lib.rs:38-41`, all model runners); assets
  round-trip as base64 (+33% — `db.rs:230-297`). Use `tauri::ipc::Request`/raw
  buffers (the reverse direction already uses `ipc::Response`).
  **Output direction done (2026-07-02):** the three image-*returning* commands
  (`run_birefnet`, `run_real_esrgan`, `run_lama`) now return `tauri::ipc::Response`
  (raw ArrayBuffer) instead of a JSON number array — the biggest blowup, since
  these results are multi-MB (upscale output is larger than input). Wrapper
  signatures (`Uint8Array` in/out) are unchanged, so no downstream caller moved.
  **→ verify in-app:** background-remove / upscale / remove-element must still
  produce a correct image.
  **Remaining:** the *input* direction still passes `Array.from(imageBytes)`.
  Raw `ipc::Request` has a single body, which doesn't fit the multi-arg commands
  (`run_lama` = image+mask, `run_auto_detect`/`run_sam_segment` = image+params),
  and passing a bare `Uint8Array` arg isn't a confirmed-efficient path — so the
  input side is a real design change, left for a focused task. Same for `db.rs`
  base64 assets (`asset_get_many` returns many blobs, no single-body fit).
- [ ] **M13 — Florence2 decoder is O(n²).** `src-tauri/src/models.rs:1850-1908`:
  cache-less decode clones `encoder_hidden` (~MB) and full `decoder_embeds`
  every step, up to 512 steps. Inside `spawn_blocking`, so slowness only.
  **Allocation blowup done (2026-07-02):** the audit's headline cost — re-cloning
  the invariant `encoder_hidden` (~MB) and the dummy past into a fresh tensor on
  every one of up to 512 steps ("O(n²) multi-GB cumulative copying") — is gone.
  `ort` `Value` is `Arc`-backed and exposes `.view()` → a borrowed
  `SessionInputValue`, so the invariant inputs (encoder hidden states, its mask,
  `use_cache_branch=false`, the shared dummy past) are now built **once** before
  the loop and viewed zero-copy each step. This does **not** touch the decode math
  — same no-cache branch, byte-identical tensor values — so detections are
  unchanged (**→ sanity-check auto-detect returns the same regions**). Verified by
  `cargo check`.
  **Remaining:** the deeper O(n²) is *compute*, not copying — the decoder still
  re-processes the full sequence each step, and `florence2_embed` re-embeds the
  whole growing sequence. Turning that into O(n) means driving the model's
  `use_cache` branch (feed `present.*` KV outputs back as `past_key_values.*`),
  which changes the execution path and needs a runtime detection-diff to confirm
  parity. Left as a focused task.

## Medium — StrictMode

- [x] **M14 — Text editing mutates ref + dispatches inside a setState updater.**
  `src/canvas/stage/hooks/useTextEditingSession.ts:69-84` — the exact pattern
  already fixed twice (zoom, pen-move); double transient dispatch per
  keystroke today, corruption-prone under change. Move the mutation/dispatch
  out of the updater.

## Low

- [x] **L1 — Rejected boot promises cached forever** (no retry all session):
  `src/lib/storage/recordStore.ts:78-95`, `localProjects.ts:63-68`,
  `indexedDbPersistence.ts:167-186`, `sqlitePersistence.ts:92-99`.
- [x] **L2 — Swallowed persistence errors**: outbox saves `.catch(() => {})`
  (`saveQueue.ts:72,162,174-175`); `void refreshProjectThumbnailForVariantSnapshot`
  (end of `src/application/thumbnails/thumbnailQueue.ts`) has no catch anywhere.
- [x] **L3 — `linkEdge` live-uniqueness race**:
  `src/lib/storage/repos/edges.repo.ts:44-63` check-then-write; interleaved
  calls create duplicate live edges.
- [x] **L4 — Deletion commands discard errors**: `src-tauri/src/lib.rs:337,344,426,699,803,844`
  (`let _ = remove_*`) return `Ok` on permission failures. Also
  `src-tauri/src/db.rs:79,92` `ensure_column` interpolates identifiers via
  `format!` — keep private to constants. Panicking index ops on model outputs:
  `models.rs:476,535,605,657,929,1119,1124,1918`.
  **Done (2026-07-02):** hardened the two ops with a real edge-case crash — the
  SAM encoder's `enc_out[1]` (now checks the output count) and the decoder's
  `shape[1] - 1` (now `checked_sub`, guarding a zero-length sequence).
  **Left as-is (rationale):** the ubiquitous `outputs[0]`/`inputs()[0]` indexes
  can't panic — an ONNX graph always has ≥1 input/output by spec; the
  `let _ = remove_*` calls are deliberate best-effort cleanup of maybe-absent
  paths (erroring would break normal delete flows); `ensure_column`'s `format!`
  is only ever called with the constants `("records","rev")`, not injectable.
- [x] **L5 — Canvas gesture modifiers hardcoded** outside the bindings registry:
  `src/canvas/stage/useCanvasPointerEvents.ts:475,481,264,548`,
  `canvasVectorInteraction.ts:266` (shift add-to-selection, alt remove-anchor).
  Register `CanvasModifierCommandId`s when touched.
- [x] **L6 — Builder editor perf**: shortcut effect deps include
  `selection`/`drawingPath` → window listener re-added at pointermove rate
  (`useToolsEditor.ts:1069`); padding-base effect commits a fresh object per
  selection change → second full re-render per pointermove (`:545-551`).
- [x] **L7 — Canvas perf (minor)**: reparent drag rebuilds `excludeIds` +
  corner-transforms per move (`stage/canvasInteractionHandlers.ts:221-224`);
  `draftContentBounds` memo keyed on whole document → per-frame AABB scan in
  draft mode (`CanvasStage.tsx:378-381`); Inspector subscribes to full document
  identity (`shell/Inspector.tsx:123`).
  **Done (2026-07-02):** cached the reparent `excludeIds` on the interaction
  (`reparentExcludeIds`), mirroring the existing `snapCandidates`/`parentBoundsById`
  lazy caches — behavior-identical, just computed once per drag instead of every
  frame. **Left (rationale):** narrowing the Inspector's document subscription
  risks the *intended* live X/Y/W/H updates during a drag (a correctness-sensitive
  change needing runtime verification), and the `draftContentBounds` memo only
  bites in draft mode on large scenes — both are unverifiable-perf against `tsc`
  and better done with a profiler in hand.
- [x] **L8 — GallerySlider arrow keys** have no input-target guard
  (`src/generate/ui/GallerySlider.tsx:54-63`) — moving the opacity range slider
  also flips cuts.
- [x] **L9 — Icon drafts delete with no confirmation**
  (`src/pages/DraftsPage.tsx:181`), unlike sibling `DraftCard`.
- [x] **L10 — `Tabs` references count prop missing from its type**
  (`src/routes/Gallery/Tabs.tsx:9`, TS2339 at `GalleryPage.tsx:121`); badge
  never renders.
- [x] **L11 — Portuguese strings in the English UI**:
  `src/pages/NewProjectPage.tsx:118,452,455`,
  `src/pages/detail/ComponentContent.tsx:134,263,278`,
  `src/pages/detail/detailUi.tsx:71`, `src/pages/GlobalComponentsPage.tsx:232`.
- [x] **L12 — StrictMode hazard in `removeItem`**
  (`src/routes/references/hooks/useReferenceLibrary.ts:345-357`): URL revokes
  inside setState updaters — benign today, same class `ImportModal.tsx:52-58`
  already fixed.

## Duplication / dead code

- [x] **D1 — Dead files (verified: zero importers reachable from `main.tsx`).**
  Delete: `src/canvas/editorEngines.ts`, `src/canvas/engine/export.ts`,
  `src/canvas/shell/Chat.tsx`, `src/canvas/shell/ContextMenu.tsx`,
  `src/canvas/stage/canvasStageUtils.ts`,
  `src/canvas/stage/canvasToolingHitTest.ts` (superseded by
  `canvasHitTesting.ts`), `src/canvas/useHtmlCanvasDocument.ts`,
  `src/canvas/useCanvasHistory.ts` (also has StrictMode-broken undo — delete
  before anyone adopts it), `src/components/layout/WorkspaceEditPanel.tsx`,
  `src/components/modals/ProjectSettingsModal.tsx`,
  `src/components/mocks/cards/` (5 files),
  `src/components/references/ReferenceRowCard.tsx` + `ReferenceThumbCard.tsx`,
  `src/components/ui/card.tsx`, `src/components/ui/separator.tsx`,
  `src/lib/models/useCraftCheck.ts`, `src/lib/models/useFontDetect.ts`,
  `src/lib/storage/repos/history.repo.ts`, `src/routes/References.tsx`.
  **Keep** `src/domain/canvas/layout.ts` (planned layout compiler).
- [x] **D2 — ID generation: 4 competing schemes.** Canonical is `newId()`
  (`src/lib/storage/ids.ts:21`). Consolidate:
  `src/routes/references/lib/utils.ts:26` (second `newId`),
  `src/canvas/engine/mutations/coreUtils.ts:5` (`createId`), inline
  `Math.random().toString(36)` in `src/generate/hooks/useBuilderCutOperations.ts:149,216,315`,
  `useAutoDetect.ts:76`, `src/generate/engine/componentModel.ts:38`,
  `variants.ts:16`, `src/lib/references/groupTypes.ts:37-39`,
  `src/application/system-design/useSystemDesign.ts:34`.
  **Revised (2026-07-02):** NOT a mechanical "→ `newId()`" swap. `newId()` is
  specifically for persisted entity/edge/row ids; `ids.ts` states scene-local
  node ids intentionally do NOT use it. Every other generator carries a
  load-bearing prefix (`r-` refs, `el-` elements, `c-` cuts, `v-` variants,
  `g-` groups, `tok-` tokens, `root-`, `d-`) that acts as a discriminator, so
  stripping it risks silent breakage. Correct fix is a shared crypto-backed
  `prefixedId(prefix)` helper that preserves each prefix — a design change, not
  a find-and-replace. Deferred pending that decision.
  **Done (2026-07-02):** the real defect was the weak, collision-prone
  `Math.random().toString(36)` — replaced all 9 sites with a single shared
  crypto-backed `randomSuffix()` in `ids.ts`, each keeping its load-bearing
  prefix/timestamp verbatim. `randomSuffix` deliberately uses a **dash-free**
  base36 alphabet (unlike `newId`'s `-`/`_` alphabet) so it stays a drop-in for
  prefixes parsed via `split("-")`. Left as-is: `createId` (coreUtils) and the
  `crypto.randomUUID()` primary paths of `utils.newId`/`groupTypes` — already
  crypto-backed, not the defect, and `createId`'s dash-free uuid8 could be
  split-parsed, so redirecting it carries needless risk.
- [x] **D3 — `normalizeName` ×3 with real drift.** `src/canvas/canvasUtils.ts:213`
  = `src/domain/canvas/graphTransforms.ts:238`, but
  `src/domain/canvas/htmlScene/styleUtils.ts:120` lacks `.trim()` — the same
  name normalizes differently by caller. Consolidate to one.
- [x] **D4 — `cloneDocument` ×4 byte-identical** in
  `src/canvas/engine/mutations/` (`coreUtils.ts:12` exports it;
  `elementGeometry.ts:16`, `elementOrder.ts:3`, `elementContent.ts:5` shadow
  it). Also `clampNodeToParentBounds` duplicated
  (`elementGeometry.ts:21`/`elementHierarchy.ts:22`).
- [x] **D5 — Stack-helpers module duplicated.**
  `src/routes/references/components/stackViewHelpers.ts` vs
  `src/routes/references/lib/stackHelpers.ts` — `buildStackTree` verbatim
  (44 lines) plus `loadStackPreview`/`releaseStackUrls`/`findStackNode`/
  `listStackRoots`; both live. Merge into `lib/stackHelpers.ts`.
- [x] **D6 — `ComponentScope` name collision with different shapes.**
  `src/lib/storage/defaults.ts:74` (`workspace|project|screen|nested`) vs
  `src/lib/data/types.ts:37` (`global|screen`) — a wrong import compiles for
  `"screen"`. **Fixed:** renamed the mock-layer one to `MockComponentScope`, so
  the dangerous same-name/same-`"screen"`-member collision is gone. **Left as-is
  (no drift risk):** the `ComponentKind` collision (`lib/data/types.ts:36`
  Layout/Atom/… vs `src/generate/engine/types.ts:52` root|cut) lives in two
  separate subsystems that never cross-import; `CmpKindFilter`/`SectionState`
  (`useGallery.ts:32-33`, `useScreenDetail.ts:41`, `routes/Gallery/types.ts:4-5`)
  and `Point` ×3 / `Rect` ×2 are byte-identical 1-liners — consolidating them
  rewires imports across ~6 files for no correctness gain, so deferred to D7-class
  cleanup.
- [ ] **D7 — Copy-pasted components.** Toggle switch verbatim
  (`src/canvas/CanvasTabs.tsx:298-329` = `src/canvas/shell/PreviewLauncher.tsx:201-232`);
  `DeviceCard` (`NewDraftPage.tsx:267-313` = `NewProjectPage.tsx:388-435`);
  wizard chrome (`NewDraftPage.tsx:91-123` = `NewWorkspacePage.tsx:64-96`);
  edit-form header (`WorkspaceEditPage.tsx:109-144` =
  `routes/Gallery/ProjectEditPanel.tsx:157-192`); "new item" popover
  (`ComponentsTab.tsx:255-292` = `ScreensTab.tsx:131-168`); `CardMenu` ×2
  (`components/screen/CardMenu.tsx` vs `routes/Gallery/shared/CardMenu.tsx`);
  `measureImage` ×2 where only one copy got the leak fix
  (`src/generate/engine/image.ts:47` vs
  `src/routes/references/lib/fileHelpers.ts:114`); test fixture seeds
  copy-pasted across 4 suites (~220 lines collapsible into a shared helper).
  **Partly done (2026-07-02):** fixed the one item that was an actual bug — the
  leaky `measureImage` in `generate/engine/image.ts` now releases the element on
  settle, matching the fileHelpers copy. The remaining entries are cosmetic
  component extractions (Toggle, DeviceCard, wizard chrome, popovers, CardMenu)
  that change rendered UI and need preview verification — left as a visual-dedup
  pass, not folded into this backend-heavy sweep.
- [x] **D8 — Stale docstring.** `src/routes/references/References.tsx:17-21`
  claims it serves `/workspace/:id/references`; that route renders
  `WorkspaceReferencesPage`. Also `WorkspaceReferencesPage.tsx:34-36`
  re-syncs the active workspace already synced by `WorkspaceLayout.tsx:16-18`.
