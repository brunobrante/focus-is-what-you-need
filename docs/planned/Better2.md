# Better2.md — Audit + Verification Pass

A second code-quality sweep of `apps/desktop`, **with an explicit verification step**.
Every finding from the initial fan-out was re-opened in the real code and cross-checked
against [`Product.md`](../../Product.md) (the locked laws), [`Architecture.md`](../Architecture.md),
[`Versioning.md`](../Versioning.md) and [`UX.md`](../UX.md) **before** being trusted. The
goal of the second pass was to stop "looks wrong → must be a bug" mistakes: many first-pass
findings turned out to be intentional product behavior, deliberate design, or simply false.

This companion also records a verification of the **Critical/High** items in
[`Better.md`](./Better.md) (the earlier 8-agent sweep), so the two docs agree on what is real.

## How to read this

Each finding carries a **verdict**:

- **CONFIRMED** — real defect, safe to fix. (For some, the fix is bigger than one line — noted.)
- **INTENTIONAL** — a `Product.md` LAW or deliberate design. **Do not "fix" it** — that would
  break the product. The reason/cite is given.
- **OVERSTATED** — real, but the severity (or the security/perf framing) was wrong. Corrected.
- **FALSE POSITIVE** — not actually true; the surrounding code prevents it.

Nothing here overrides `Product.md`. This is a backlog of suggestions, not a spec.

---

## ⛔ Do NOT touch — intentional, LAW, or false positive

The single most important section: "fixing" any of these risks violating the product or
churning correct code. All were traced in the real source.

| Item | Verdict | Why |
| --- | --- | --- |
| `materializeVersionScene` / extra-Current window `if (!projectId) return` | **INTENTIONAL** | Drafts (screens/components with no project) legitimately do not materialize component rows — consistent in *every* materialize path (`canvasMaterializer.ts:96`, `createComponent` requires a project, `useDeferredPersistence.ts:161` has the same guard). The draft's content still lives in the saved scene. |
| Deep-clone of the whole document per keystroke/frame (engine mutations) | **FALSE POSITIVE** | The 60fps hot paths (drag/resize/scale) already use `shallowCloneDocument` in `stage/canvasDocumentMutations.ts`. The deep `structuredClone` only runs on discrete commits (typing a value in the inspector), which is fine. |
| `snapping.ts` O(n·depth) candidate scan | **FALSE POSITIVE** | Cached once per drag (`interaction.snapCandidates ??= …`), not rebuilt per frame; the all-nodes branch only runs for mixed-parent selection. |
| `commitDocument` full `documentsEqual` deep-compare | **INTENTIONAL** | Short-circuits; it is the no-op-commit filter that keeps the undo history clean. (But see ENG-1 below — returning a *new reference* on equality is a separate, real bug.) |
| `handleDrawMove` height clamp "below minimum" | **FALSE POSITIVE** | Math resolves to exactly `minH`, never below (`Math.max(rawH, minH)` floor). |
| Module-scoped cursor caches "unbounded" | **FALSE POSITIVE** | Keyed by rounded angle 0–359 → finite (~1.8k tiny strings worst case). Bounded memoization. |
| `1×` zoom floor / no zoom-out | **LAW 10** | Implemented correctly via `USER_MIN_ZOOM=1` → `clampViewportState`. |
| `roundCropBox` mutates `interaction.committedCorner` | **INTENTIONAL** | Load-bearing gesture state (locks the corner for the rest of the drag). Purifying it breaks the gesture. |
| `getParentSize` (border-box) vs `getParentBounds` (content-box) in one clamp | **OVERSTATED → Low** | Deliberate coarse-then-fine clamp; the authoritative content-box clamp runs in the same synchronous tick (no intermediate render). |
| `export.ts` raw CSS values = "injection vuln" | **NOT a vuln** | Single-user local desktop tool exporting the user's own design; no trust boundary. At most output-robustness. |
| `resolveMaster` memo keyed on `graphJSON` but reads scenes snapshot | **FALSE POSITIVE** | `LiveInstanceRefresh` subscribes to the scenes table and re-resolves open editors when a referenced master changes. |
| Two initial-zoom helpers "disagree" | **INTENTIONAL** | Different callers: container-agnostic seed at init (no viewport yet) vs viewport-aware fit after measure. See ENG-2. |
| Single global `writeChain` serializes propagation/thumbnail jobs | **INTENTIONAL** | Ordering is required for ancestor snapshot propagation (shared parents); parallelizing would race parent scene/thumbnail rows (Architecture.md §propagation). |
| Save-queue put/delete "reorder resurrects a row" | **OVERSTATED** | Common put/delete pairs are correct (distinct `up:`/`del:` keys, insertion order preserved). Only a `put→delete→put` triple in one batch window misbehaves — essentially unreachable via real flows. |
| `domain/canvas/graphTransforms.ts` "impure" / `canvasMaterializer` layer | **OVERSTATED → Low** | `@/lib/canvas/htmlScene` is a pure serialization codec (zero I/O); `ComponentRow` is type-only. It is a folder-location preference, which `Product.md` explicitly leaves free. (Better.md DOM-1 still has a point: the *direction* of the dependency could be inverted — but it is not a purity violation.) |
| Detach implemented in 3 places | **OVERSTATED → Low** | Token / reference-row / recursive-subtree are genuinely different data; "detach" is one UX verb, not one function. |
| `loadStackThumbnailUrl` object-URL leak | **FALSE POSITIVE** | Revocation is correct in `useReferenceLibrary.ts` (revokes on replace, on cancel, and all URLs on unmount). |
| XSS / SVG `font-family` injection / `target="_blank"` | **FALSE POSITIVES** | No `dangerouslySetInnerHTML`; attributes pass through `escapeAttr`; the one `_blank` already has `rel="noopener noreferrer"`. |
| Builder keeps all variant data-URLs in memory | **OVERSTATED / by design** | Per-cut variant history is a Builder LAW; the painter cache *does* evict (the "no eviction" sub-claim was false). |
| Builder: "new variant keeps the old" / "can't share groups" | **INTENTIONAL** | Honored correctly in `variants.ts`. |
| `ENG-2` `getInitialZoomForSubjectSize` "floors to 1×" | **FALSE POSITIVE** | It only *seeds* zoom before the viewport is measured; `useViewportControls` overwrites it with the viewport-aware `getInitialZoomForCanvas` before paint. Frame-mode subjects do not open at 1×. |
| `STAGE-1` render-diff reads a layout-effect ref → missed repaint | **FALSE POSITIVE** | The memo runs during render and the ref lags by exactly one committed document, so the diff is always (prev-doc, current-doc). The `prev===next→empty` path is not reachable under React's render/commit ordering. |
| `UI-4` object-URL leak in `AddReferenceModal` | **FALSE POSITIVE** | The URL is registered via `registerObjectUrl` (`:694`) and revoked on close (`:197-200`). Not an unbounded leak. |

---

## 🔴 Confirmed bugs / LAW gaps — worth acting on

### A — [High, LAW gap] References lack the per-instance "copy-or-delete" flow
- **Where:** `application/references/*`, `routes/references/components/GroupDialogs.tsx` (`DeleteReferenceModal`),
  `lib/storage/repos/references.repo.ts:317` (`removeReferenceLinksForLibraryId`).
- **Problem:** `Product.md` "Removing a linkable item that is used elsewhere" requires the per-place
  keep-a-copy-or-delete choice for **all three** capabilities (components, tokens, references).
  Components (`UnlinkComponentModal` + `applyInstanceDecisions`) and tokens (`applyTokenLinkDecisions`)
  have it; references only offer "Delete everywhere" and silently drop the links. `detachReference`
  (the "keep a copy" half) already exists — only the per-instance dialog is missing.
- **Verdict:** CONFIRMED. The one genuine LAW violation found. Not a one-liner (needs a per-instance
  modal + decision applier mirroring the component flow). Update `UX.md` before building.

### B — [Medium-High] Hardcoded "updated 1 hour ago"
- **Where:** `pages/detail/ScreenContent.tsx:96` renders a literal `<span>updated 1 hour ago</span>`.
- **Verdict:** CONFIRMED. It sits next to real derived fields; this is the `updatedAt` field that should
  be wired, not "believable mock structure" (LAW 5 covers content *inside* a mock screen, not chrome
  metadata that is always false).

### C — [Medium] VideoFramePicker conflates "empty" and "error"
- **Where:** `routes/import/VideoFramePicker.tsx:38-64`.
- **Verdict:** CONFIRMED. A successful extraction returning 0 frames and an ffmpeg-missing failure
  collapse into the same blank state. Distinguish them.

### D — [Low-Medium] Hardcoded author "You"/"VC" on every version chip
- **Where:** `pages/detail/ComponentContent.tsx:59-60`.
- **Verdict:** CONFIRMED. Real attribution fields stubbed; lower impact than B.

### E — [Low] RootSwitcher leaks one object URL on the cancelled path
- **Where:** `generate/ui/RootSwitcher.tsx:338-341`.
- **Verdict:** CONFIRMED. The sibling loaders revoke on the cached branch; this one drops a fresh
  `blob:` URL when the effect is cancelled after load. One-line fix (revoke `loaded` when cancelled).

---

## 🔴 Confirmed from Better.md (this session's cross-check of its Critical/High)

> Verified by re-opening the cited code. Verdicts only — see Better.md for full detail/fixes.

| ID | Title | Verdict |
| --- | --- | --- |
| **SAVE-1** | Outbox omits edits arriving during an in-flight flush (crash-window loss) | **CONFIRMED** — real loss window between `outbox.clear()` and the next `outbox.save()` (`saveQueue.ts:109-114`). Sub-claim "UI already reported saved" is slightly overstated (status is still `saving`), but the loss is silent. |
| **SAVE-2** | Propagation can overwrite a newer direct parent edit (lost update) | **CONFIRMED** — no `sceneVersion` compare-and-set anywhere; both upserts only increment. *Correction:* only the **propagation** chain races scene rows; the thumbnail chain writes the thumbnails table, so the "two chains race scene rows" framing is imprecise. |
| **SAVE-3** | `replayOutbox` clobbers newer pending with stale outbox values | **CONFIRMED** — `replayOutbox` does unconditional `pending.set` (`saveQueue.ts:88-90`), missing the retry path's `if (!pending.has(key))` guard. Narrow window, trivial fix. |
| **ENG-1** | No-op commit replaces `state.document` with a new equal reference | **CONFIRMED** — `store.tsx:402-404` returns `document: action.document` on equality, re-firing the identity-keyed persistence effect. One-line fix: return `document: state.document`. |
| **ENG-3** | Module-global clipboard shared across split editors | **CONFIRMED** — `clipboard.ts:10` singleton; multiple `EditorProvider`/`CanvasSurface` instances exist in split view → cross-document id/position leak. Fix is structural (scope per editor), not one line. |
| **UI-2** | `Date.now()` section IDs collide → duplicate keys | **CONFIRMED (latent)** — `SectionedGrid.tsx:83`; same-ms creation is human-gated, so unlikely. Use `crypto.randomUUID()`. |
| **UI-3** | Delete-screen modal flips branch mid-async; first-frame confirm skips cascade | **CONFIRMED** — `GalleryPage.tsx` fetches usage after setting the pending screen (defaults 0); confirming before it resolves calls `deleteScreen(id, undefined)` with no `instanceStrategy`, bypassing the per-instance keep-or-delete law. |
| **UI-5** | Side effects (file deletion) inside `setState` updaters in `ImportModal` | **CONFIRMED** — `ImportModal.tsx:140-141,72-79` run `removeReferenceFile`/`revokeObjectURL` inside updaters; React 19 may double-invoke. `doCancel` (`:94-100`) shows the correct out-of-updater pattern. |
| **RUST-1** | Mutex poisoning permanently bricks the single DB connection | **CONFIRMED** — `db.rs:82,124,141` use `map_err(\|_\| "db mutex poisoned")`; writes are transactional so `unwrap_or_else(\|e\| e.into_inner())` is safe. |
| **RUST-2** | `db_apply` recompiles SQL per row inside the txn | **CONFIRMED** — no `prepare_cached`; `tx.execute(<literal>, …)` per row under the global mutex. Hoist two cached statements before the loop. |
| **RUST-4** | `db_list_records` materializes the whole table under lock | **CONFIRMED (Medium)** — full scan + `Vec<String>` build while holding the lock; IPC serialization is after the lock releases. Page / fetch large-blob tables per-id. |
| **RUST-8** | Florence-2 reloads all 5 ONNX sessions from disk every call | **CONFIRMED (perf)** — no session caching; each call re-parses hundreds of MB. A cache needs interior mutability (`Session::run` takes `&mut self`). |

### Reclassified from Better.md

| ID | Title | Verdict |
| --- | --- | --- |
| **UI-1** | FastEdit edits never persisted ("Critical data loss") | **OVERSTATED → spec, not a bug** — the code claim is accurate (no persistence path), but `UX.md:1237` documents FastEdit as "**No draft system — all edits applied directly to the scene state held by the modal**." Ephemeral by design. Adding persistence is a **product decision** that requires changing `UX.md` first, not a drop-in fix. |
| **ENG-2** | `getInitialZoomForSubjectSize` floors to `MIN_ZOOM` | **FALSE POSITIVE** — see the "do not touch" table. |
| **STAGE-1** | Render-diff reads layout-effect ref → missed repaints | **FALSE POSITIVE** — see the "do not touch" table. |

### Not yet verified (interrupted)
The Better.md **VER-1…VER-4** (versioning — most LAW-sensitive) and **DOM-1…DOM-3 / BLD-1, BLD-2**
checks were interrupted before completing. VER-1 (`deleteVariant` deleting version-owned masters
that are linked elsewhere, with no `instanceStrategy`) is the highest-priority unverified claim and
is closely related to gap **A** above — worth finishing.

---

## 🟢 Safe cleanups (behavior-neutral)

No LAW risk — pure hygiene.

- **Mixed-language UI copy (PT in an English UI)** — confirmed across `Inspector.tsx`, `ElementTab.tsx`,
  `ShellTab.tsx`, `CanvasTab.tsx`, `Tree.tsx`, `LayersFooter.tsx`, `TreeRow.tsx`, `CanvasSurfaces.tsx`,
  `treeHelpers.ts` (`"elipse"`→`"ellipse"`), `useNewProject.ts` (visible hints), `"Projeto"` fallbacks,
  and Builder (`ToolsEditorView.tsx`, `ConfirmModal.tsx`). Interface language is clearly English.
- **Truly duplicated code:** `cloneDocument` (4×) + `clampNodeToParentBounds` (2×); `normalizedVector` (2×);
  `arrayValuesEqual` (2×); the `byOwner`+`applyInstanceDecisions` block in `useUnlinkComponent`/`useDeleteComponent`;
  `KIND_BY_MEDIA`+payload in `linkReferenceToOwner`/`addReferencesFromFiles`; crop→canvas rasterization
  in `useBuilderCutOperations`/`useAutoDetect`; `IconButton` (2×).
- **Divergent duplication (higher value):** two reference URL caches used together in `ReferenceCard.tsx`;
  `stackHelpers.ts` vs `stackViewHelpers.ts`; two `CardMenu` implementations; three near-identical
  Builder thumbnail loaders (unifying fixes leak **E**).
- **Dead code:** `routes/NewProject.tsx` (14KB, unimported, missing the token step); dead 2D tooling
  drawers in `canvasToolingRenderer.ts` (~160 lines, renderer is Skia — also touches one test);
  fully-unrendered mock panels (`Chat.tsx`, `GalleryPanel`); dead placeholder controls ("Formas" toggles,
  render-mode pill).
- **`useDismissable` exists but has ~0 adopters** — ~10–13 hand-rolled outside-click/Escape effects could use it.

---

## 🟡 Real but minor (perf / optional)

- `deleteProject` (and `deleteScreen`) use `replaceTable` (re-stringifies the whole table) where
  `deleteComponentTree`/`deleteVariant` already use the cheaper `removeRecords`. Real, but an
  infrequent op, not a hot path.
- Builder: base64 char-by-char + synchronous canvas raster (`modelCommands.ts:129`) → jank on large
  images (Medium, not High); `rebuildAllRoots` O(n²) per edit (preserve the spatial-parent invariant);
  `measureImage` has no timeout.
- Grid overlay: re-renders per frame (fresh `canvasRect` object in deps) and is not DPR-scaled
  (blurry only at zoom ≥ 4). `reset` reducer wastes a localStorage hydration. `useCanvasWindows`
  split-collapse reads a stale closure (self-corrects on the next effect; root cause is the threshold
  computed two ways).

---

## Suggested sequencing

1. **The LAW gap:** finish verifying Better.md **VER-1**, then close **A** (references copy-or-delete) — the only confirmed product-law violation.
2. **Confirmed data-loss/correctness:** SAVE-1, SAVE-3, RUST-1, UI-3, UI-5, ENG-1.
3. **Confirmed small bugs:** B, C, D, E, UI-2.
4. **Perf cliffs:** RUST-2, RUST-4, RUST-8, the `deleteProject`/`deleteScreen` `removeRecords` swap.
5. **Cleanups:** PT strings, dead code (`routes/NewProject.tsx`), the duplications, `useDismissable` adoption.

> Each item is independently shippable. Where a fix changes UX (A, UI-1, UI-3), update `UX.md` first,
> per the project rule. Do not act on anything in the "Do NOT touch" section.
