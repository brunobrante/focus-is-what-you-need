# Better.md — Code Quality Audit

A repo-wide audit of bugs, performance issues, clean-architecture problems, clean-code
violations, duplication, and improvement opportunities. Produced by a multi-agent sweep
(8 agents, one per subsystem), each grounded in [`Product.md`](../../Product.md),
[`Architecture.md`](../Architecture.md), and [`Versioning.md`](../Versioning.md) so that
**intentional product laws and business rules are not mistaken for bugs**.

This file is the **single, consolidated audit**: the original 8-agent sweep **plus** a second
verification pass that re-opened every Critical/High finding in the real code and labeled it
CONFIRMED / INTENTIONAL / OVERSTATED / FALSE POSITIVE. Those verdicts are folded in inline, in the
"Verification verdicts" table, and in the "Verified intentional / do-not-touch" table below. (The
old `Better2.md` was merged here and deleted.) **One correction was applied during the merge:** the
verification pass had waved away **UI-1** by citing `UX.md`; since only `Product.md` is law, UI-1 is
kept as a real finding — see its note.

## How to read this

- Every item says **why it is a real defect and not a feature**, because the most
  important discipline here is separating the two. Where a behavior looked wrong but is
  actually a law (the `1×` zoom floor, mock placeholders, the Builder living outside the
  component tree, kept AI variants, frame-bounded pan), it was **dropped**, not reported.
- This is a *findings* document (a backlog of improvements), not a spec. Nothing here
  overrides `Product.md`. Fixes are suggestions; pick the ones worth doing.
- Severity: **Critical** = data loss / corruption reachable in normal use ·
  **High** = real bug or law violation, or a clear performance cliff ·
  **Medium** = correctness smell, notable perf, or meaningful duplication ·
  **Low** = polish, dead code, latent traps.
- **Verdicts (from the verification pass, folded in below):** **CONFIRMED** = real, safe to fix ·
  **INTENTIONAL** = a law or deliberate design, do not touch · **OVERSTATED** = real but milder than
  first stated · **FALSE POSITIVE** = the surrounding code already prevents it.
- **Only `Product.md` is law.** `UX.md` is a *living spec* you may change — a finding is **not**
  dismissed just because `UX.md` documents the current behavior. If the behavior is wrong, the fix is
  to change `UX.md` *and* the code. (This is why UI-1 below stays a real finding.)

## What was checked and found CORRECT (not bugs)

Recording this explicitly, because "is it a bug or the model?" was the central question.

- **The versioning laws hold.** Copy-version independence (deep-clones masters under the
  new variant, `linkable:false`, no link back — deleting a clone never touches the
  original), Linked versions, **promote-to-main carrying ownership** (re-parent, not
  clone; old main linkified; deleting the old version cannot empty the new main), and
  **Detach** were all traced and confirmed faithful to `Product.md` §Versioning and
  `Versioning.md` §7/§7c/§8. Only the gaps in the **Versioning** section below are real.
- **Storage guardrails are respected almost everywhere.** No `getTable`/`setTable`, no
  `await saveScene`, no direct `port.applyBatch` outside the queue, no new `kv_store`
  blob keys, scenes consistently variant-owned. The single exception is one raw-modifier
  use (see UI-15). The Rust single-connection guardrail is fully respected.
- **Intentional behaviors deliberately not flagged:** `1×` zoom floor and frame-bounded
  pan/zoom; mock image/icon placeholders; the Builder's separation from the component
  tree; kept AI cut variants; no-group-sharing; multi-screen→group; the
  `forwardRef`+`useImperativeHandle` modal convention; the isolation navigation model;
  the absence of SQL migrations (nuke-and-reseed on `SCHEMA_VERSION` bump is intended).

### Verified intentional / do-not-touch (second-pass verification)

Re-opened in the real source and confirmed **safe / by-design / false-positive**. Do not "fix"
these — it would churn correct code or break a law. (All cite code, a `Product.md` law, or
`Architecture.md` — none was waved away on `UX.md` alone.)

| Item | Verdict | Why |
| --- | --- | --- |
| `materializeVersionScene` / extra-Current `if (!projectId) return` | INTENTIONAL | Drafts (no project) legitimately don't materialize component rows — consistent across every materialize path. Draft content still lives in the saved scene. |
| Deep-clone of the whole document per keystroke/frame | FALSE POSITIVE | 60fps paths use `shallowCloneDocument`; the deep `structuredClone` only runs on discrete commits. |
| `snapping.ts` O(n·depth) candidate scan | FALSE POSITIVE | Cached once per drag (`interaction.snapCandidates ??= …`), not per frame. |
| `commitDocument` full `documentsEqual` deep-compare | INTENTIONAL | The no-op-commit filter that keeps undo history clean. (But ENG-1 — new ref on equality — is a separate real bug.) |
| `handleDrawMove` height clamp "below minimum" | FALSE POSITIVE | `Math.max(rawH, minH)` floor — never below. |
| Module-scoped cursor caches "unbounded" | FALSE POSITIVE | Keyed by rounded angle 0–359 → finite. |
| `1×` zoom floor / no zoom-out | LAW 10 | Correct via `USER_MIN_ZOOM=1` → `clampViewportState`. |
| `roundCropBox` mutates `interaction.committedCorner` | INTENTIONAL | Load-bearing gesture state (locks the corner for the rest of the drag). |
| `getParentSize` vs `getParentBounds` in one clamp | OVERSTATED → Low | Deliberate coarse-then-fine clamp in one synchronous tick. |
| `export.ts` raw CSS values = "injection vuln" | NOT a vuln | Single-user local tool exporting the user's own design; no trust boundary. |
| `resolveMaster` memo keyed on `graphJSON` but reads scenes snapshot | FALSE POSITIVE | `LiveInstanceRefresh` re-resolves open editors when a referenced master changes. |
| Two initial-zoom helpers "disagree" | INTENTIONAL | Container-agnostic seed at init vs viewport-aware fit after measure (see ENG-2). |
| Single global `writeChain` serializes propagation/thumbnail | INTENTIONAL | Ordering required for ancestor snapshot propagation (`Architecture.md`). |
| `loadStackThumbnailUrl` object-URL leak | FALSE POSITIVE | Revoked correctly in `useReferenceLibrary.ts` (on replace, cancel, unmount). |
| XSS / SVG `font-family` / `target="_blank"` injection | FALSE POSITIVE | No `dangerouslySetInnerHTML`; attrs go through `escapeAttr`; the one `_blank` has `rel="noopener noreferrer"`. |
| Builder keeps all variant data-URLs in memory | OVERSTATED | Per-cut variant history is a Builder law; the painter cache *does* evict. |
| Builder "new variant keeps old" / "can't share groups" | INTENTIONAL | Honored correctly in `variants.ts`. |

---

## Priority summary

### Critical
| ID | Title |
| --- | --- |
| UI-1 | FastEdit edits are never persisted — silent data loss |

### High
| ID | Title |
| --- | --- |
| RUST-1 | Mutex poisoning permanently bricks the single DB connection |
| RUST-2 | `db_apply` recompiles prepared statements per row inside the txn |
| SAVE-1 | Outbox omits edits that arrive during an in-flight flush (crash-window loss) |
| SAVE-2 | Propagation/thumbnail write chains can race the main flush and drop a parent edit |
| ENG-1 | No-op commit replaces `state.document` reference, re-firing persistence |
| ENG-2 | `getInitialZoomForSubjectSize` ignores viewport, often floors to `MIN_ZOOM` |
| ENG-3 | Module-global clipboard shared across split editors |
| STAGE-1 | Render-diff reads a ref mutated in a layout effect → missed repaints |
| DOM-1 | Domain layer imports `lib/` (storage schema + canvas) — layering inversion |
| DOM-2 | `"+"` zoom-in keybinding is effectively dead (shift-modifier gap) |
| DOM-3 | `isMacLike()` relies on deprecated/empty `navigator.platform` |
| BLD-1 | `onWheel` `preventDefault()` on React's passive listener (zoom scroll not suppressed) |
| BLD-2 | Stack-save is non-atomic — partial disk/localStorage state on failure |
| VER-1 | `deleteVariant` silently breaks linked instances elsewhere (Law 5 violation) |
| UI-2 | `Date.now()` section IDs collide → duplicate keys + corrupted assignment |
| UI-3 | Delete-screen modal flips branch mid-async; first-frame confirm skips cascade |
| UI-4 | Object-URL leak in `AddReferenceModal` `ScreenThumb` |
| UI-5 | Side effects (file deletion) inside `setState` updaters in `ImportModal` |

### Cross-cutting themes (recur across subsystems)
- **Mixed-language UI copy** (PT + EN in the same view) — canvas shell, Builder, and many
  pages/modals. No i18n layer. CLAUDE.md allows localized copy but not mixing.
- **Hand-rolled outside-click/Escape dismissal** duplicated ~13× despite an existing
  `useDismissable` hook — canvas shell (~9 sites) and Gallery/CardMenu (~4 sites).
- **Object-URL caches never revoked** (bounded leaks) — Builder `RootSwitcher`, UI
  `AddReferenceModal`, `ReferenceDetailModal`.
- **Raw `event.metaKey/altKey/shiftKey`** instead of `matchesKeyCommand`/
  `isModifierCommandActive` on configurable canvas paths — `useStepZoom.ts` (UI-15), a
  minor alt-key hint in the stage.
- **Full-table JSON re-parse / re-stringify** on hot paths — instance/delete flows,
  `replaceTable` diffing large blobs, repeated graph parses per render.

### Verification verdicts (Critical/High re-checked against the real code)

| ID | Verdict | Note |
| --- | --- | --- |
| SAVE-1 | CONFIRMED | Real loss window between `outbox.clear()` and the next `outbox.save()`. |
| SAVE-2 | CONFIRMED | No `sceneVersion` compare-and-set anywhere. Only the **propagation** chain races scene rows (the thumbnail chain writes the thumbnails table). |
| SAVE-3 | CONFIRMED | `replayOutbox` does unconditional `pending.set` — missing the retry guard. Narrow window, trivial fix. |
| ENG-1 | CONFIRMED | `store.tsx:402-404` returns a new equal ref. One-line fix. |
| ENG-3 | CONFIRMED | `clipboard.ts:10` singleton leaks across split editors. Structural fix. |
| ENG-2 | **FALSE POSITIVE** | Only *seeds* zoom before the viewport is measured; `useViewportControls` overwrites it with the viewport-aware fit before paint. Do not act. |
| STAGE-1 | **FALSE POSITIVE** | The memo runs during render; the ref lags by exactly one committed doc, so the diff is always (prev, current). The `prev===next` path is unreachable. Do not act. |
| UI-1 | CONFIRMED (real data loss) | No persistence path. `UX.md` calls FastEdit ephemeral, but `UX.md` is not law — persisting is a product decision, not a closed false-positive. |
| UI-2 | CONFIRMED (latent) | Same-ms creation is human-gated → unlikely but real. |
| UI-3 | CONFIRMED | Usage fetched after the pending screen is set → first-frame confirm bypasses the per-instance law. |
| UI-5 | CONFIRMED | I/O inside `setState` updaters; React 19 may double-invoke. |
| RUST-1 | CONFIRMED | `unwrap_or_else(\|e\| e.into_inner())` is safe (writes are transactional). |
| RUST-2 | CONFIRMED | No `prepare_cached`; hoist two cached statements before the loop. |
| RUST-4 | CONFIRMED | Full scan + `Vec<String>` under lock. Page / fetch large-blob tables per-id. |
| RUST-8 | CONFIRMED | No session caching; a cache needs interior mutability (`Session::run` takes `&mut self`). |
| VER-1, DOM-1..3, BLD-1, BLD-2 | NOT RE-VERIFIED | The verification pass was interrupted before these. VER-1 (`deleteVariant` ignoring `instanceStrategy`) is the highest-priority unverified claim and ties to REF-1 below. |

---

## Status (live)

Tracks what has actually been actioned since the audit, overlaid on the findings below
(the prose findings are left intact). Resolutions cite the commit that landed them. The
P0/P1/P2 phases follow the **Suggested sequencing** at the bottom of this file.

**Legend:** ✅ fixed (this pass) · ☑️ already fixed before this pass (audit was stale) ·
🟡 false positive (no action) · ⏭️ deferred (large/risky — needs its own focused effort).

### P0 — data loss / corruption
| ID | Status | Note |
| --- | --- | --- |
| UI-1 | ☑️ already fixed | FastEdit persists via `saveScene` (debounced + flush on close); `UX.md` already says so. |
| SAVE-1 | ☑️ already fixed | `saveQueue.ts` keeps the outbox = in-flight + pending (`unflushedSnapshot`). |
| SAVE-2 | ✅ `b9b515f` | Ancestor propagation writes atomically (reuse the just-read parent row, no await gap). |
| VER-1 | ✅ `57e2d1c` (repo) + `195b6ec` (UI) | `deleteVariant` takes an `instanceStrategy`; version delete now opens the detach/cascade choice. |
| RUST-1 | ☑️ already fixed | All three DB commands recover the poisoned guard via `unwrap_or_else(\|e\| e.into_inner())`. |
| UI-5 | ✅ `9e797af` | `discardReferenceItem` moved out of the `setState` updaters (refs). |
| UI-3 | ☑️ already fixed | Delete-screen usage count is resolved before the modal swaps to `InstanceDeleteModal`. |
| REF-1 | ✅ `1fa8e9b` | Deleting a library reference linked elsewhere now opens the per-place keep-a-copy/delete dialog (`useDeleteReference` reusing `UnlinkComponentModal`); `detachReference` keeps the master blob alive for kept copies. The one remaining `Product.md` LAW gap is closed. |

### P1 — correctness bugs with user-visible impact
| ID | Status | Note |
| --- | --- | --- |
| ENG-1 | ☑️ already fixed | No-op commit preserves the existing `state.document` reference. |
| ENG-2 | 🟡 false positive | Only seeds zoom before the viewport is measured; overwritten by the viewport-aware fit. |
| ENG-3 | ✅ `0a6ab94` | Clipboard scoped per `EditorProvider` (was a module singleton shared across split editors). |
| STAGE-1 | 🟡 false positive | The `prev===next` empty-diff path is unreachable under React's render/commit order. |
| DOM-2 | ✅ `fd01c9d` | `"+"` zoom-in binding marked `shift:true` so it actually fires. |
| DOM-3 | ✅ `fe3243f` | `isMacLike()` falls back `userAgentData → platform → UA`. |
| BLD-1 | ✅ `fd5213a` | Stage wheel attached as a non-passive native listener. |
| BLD-2 | ✅ `e904d2d` | Stack save staged in `stack.tmp` and swapped in only on full success. |
| UI-2 | ✅ `2f3c516` | Section ids via `newId()` instead of `Date.now()`. |
| UI-4 | ☑️ already fixed | `AddReferenceModal` registers + revokes object URLs on close. |
| UI-10 | ✅ `4a01441` | "Move to"/"Make global" hidden until a handler is wired. |
| UI-11 | ✅ `f3b1787` | `ReferenceCard` uses `formatSize`/`formatDuration`. |
| META-1 | ✅ `1fa8e9b` | `ScreenContent` renders real `screen.updatedAt` via `formatRelativeTime`, not the hardcoded "updated 1 hour ago". |

### P2 — performance cliffs
| ID | Status | Note |
| --- | --- | --- |
| UI-6 | ✅ `1d7fcd9` | Emoji icon data-URLs baked once (module-scope lazy cache). |
| DOM-5 | ✅ `244b6f5` | Settings `clone()` uses `structuredClone`. |
| DOM-6 | ✅ `95b9ebb` | `linkify` builds the parent index once (new `collectDescendantIdsFrom`). |
| ENG-7 | ✅ `d0b5b4b` | Subcomponent resolution indexed by `sourceNodeId`. |
| STAGE-3 | ✅ `ecbf72d` | Pointer handler reuses the memoized viewport transform. |
| UI-7 | ✅ `690b209` | Component source badges resolve screens via a precomputed `screenById`. |
| RUST-2 | ✅ `7ef532a` | `db_apply` hoists `prepare_cached` statements out of the loop. |
| ENG-6 | ⏭️ deferred | Already memoized (per-scene-change, not per-render); mock-detection logic is subtle and untested. |
| SAVE-5 | ⏭️ deferred | Needs a cached reverse instance index with invalidation; delete ops are infrequent. |
| SAVE-6 | ⏭️ deferred | The double-stringify *is* the skip-unchanged diff on the incremental path; only the post-nuke seed would gain (dev-time only). |
| SHELL-5 | ⏭️ deferred | `React.memo` is inert unless the parent stabilizes its Set/callback props — needs a parallel refactor. |
| RUST-4 | ⏭️ deferred | Pagination changes the `PersistencePort` contract across 3 adapters + the hydration model. |
| RUST-8 | ⏭️ deferred | Session cache needs interior mutability (`Session::run` is `&mut self`) + ONNX-state care. |

> Not yet scheduled: the remaining Medium/Low findings (SAVE-3/4/7-12, ENG-4/5/8-10, the
> SHELL/UI/BLD/DOM/RUST mediums and lows, VER-2..4, META-2, VID-1) and the
> cross-cutting duplication / dead-code / mixed-language sweeps. With REF-1 landed
> (`1fa8e9b`), there is no remaining confirmed `Product.md` LAW gap.

---

## Storage & Save System

### SAVE-1 — [High] Outbox omits edits that arrive during an in-flight flush
- **Category:** Bug · **Location:** `src/application/persistence/saveQueue.ts:103-114`
- **Problem:** `drain()` snapshots `batch`, clears `pending`, writes *only that batch* to
  the outbox, then awaits `applyBatch`. Edits enqueued while `applyBatch` is in flight land
  in the now-empty `pending` but are **not** in the outbox. A crash after those edits are
  enqueued but before the next drain persists them loses them.
- **Why real:** The outbox's stated purpose is crash-durability of unflushed work; these
  edits are unflushed, and the UI already reported them saved (fire-and-forget) → silent loss.
- **Fix:** Persist the union of in-flight `batch` + current `pending` to the outbox, or only
  clear the outbox after confirming `pending` is empty.

### SAVE-2 — [High] Propagation/thumbnail write chains race the main flush
- **Category:** Bug · **Location:** `src/application/scenes/propagationQueue.ts:64-74`,
  `src/lib/storage/repos/scenes.repo.ts:185-233`
- **Problem:** Two independent debounced write chains (propagation 140ms, thumbnails 120ms)
  plus the main `SaveQueue` all write scene rows with last-write-wins coalescing that ignores
  `sceneVersion`. A slower propagation pass computed from a stale parent graph can overwrite a
  newer direct edit of that parent scene (lost update).
- **Why real:** Classic lost-update setup; no shared ordering or version guard across the chains.
- **Fix:** Route propagation through the same ordered path, or guard parent writes with a
  `sceneVersion` compare-and-set (skip if the cached parent is newer than the pass's basis).

### SAVE-3 — [Medium] `replayOutbox` clobbers newer pending edits with stale outbox values
- **Category:** Bug · **Location:** `src/application/persistence/saveQueueProvider.ts:24-27`,
  `saveQueue.ts:84-92`
- **Problem:** Replay runs fire-and-forget on first `getSaveQueue()` and does `pending.set(key, m)`
  unconditionally. If a newer version of a row was enqueued before replay runs, replay overwrites
  it with the stale outbox value — the retry path's `if (!pending.has(key))` guard is missing here.
- **Fix:** Mirror the retry guard (`if (!pending.has(key))`), or await replay before accepting enqueues.

### SAVE-4 — [Medium] Seed reseed can expose cross-table-inconsistent state mid-reseed
- **Category:** Bug · **Location:** `src/lib/storage/seed.ts:145-163`, `recordStore.ts:112-140`
- **Problem:** Eight `replaceTable` calls are awaited sequentially; a consumer reacting to an early
  table's notify can read state where screens exist but their variants don't yet.
- **Fix:** Populate all caches first, enqueue, then `notify` once at the end of the reseed.

### SAVE-5 — [Medium] N+1 full-table scans on every component delete / instance op
- **Category:** Performance · **Location:** `src/lib/storage/repos/scenes.repo.ts:293-445`,
  `components.repo.ts:499-509`
- **Problem:** `listInstanceUsages`, `detachInstancesOfComponents`, `removeInstancesOfComponents`,
  `applyInstanceDecisions`, `listDetailedInstanceUsages` each call `listScenes()` and parse every
  scene's `graphJSON`; several run back-to-back in one action. O(scenes × nodes) per step, repeated.
- **Fix:** Build a reverse instance index (componentId → scene/node ids), cached like
  `sceneDependencyIndexCache` and invalidated on the scenes subscription; compute usages once.

### SAVE-6 — [Medium] `replaceTable` re-stringifies every row twice to diff (over large blobs at seed)
- **Category:** Performance · **Location:** `src/lib/storage/recordStore.ts:126-132`
- **Problem:** Per row it does `JSON.stringify(row)` and `JSON.stringify(prev)` again to compare;
  the seed routes scenes/thumbnails (large base64/graph blobs) through this, re-serializing the very
  blob cost the new architecture set out to remove.
- **Fix:** Cache the last-serialized JSON alongside the cached row, or use `putRecord` per row for
  scene/thumbnail tables (as the file comment already recommends).

### SAVE-7 — [Medium] Duplicated scene-row construction (`upsertScene` vs `upsertSceneRowWithoutPropagation`)
- **Category:** Duplication · **Location:** `scenes.repo.ts:73-108` and `235-259`
- **Problem:** Byte-for-byte identical row build + `putRecord` + `scheduleThumbnailRefresh` +
  `notifyInvalidation`, differing only in the propagation call. Also a name collision: a local
  `removeComponentSubtreeInGraph` (line 447) shadows the imported one.
- **Fix:** Extract `buildSceneRow`/`writeSceneRow`; rename the local shadow.

### SAVE-8 — [Medium] Two structurally identical debounce-coalesce queues; fragile `while`-drain
- **Category:** Duplication · **Location:** `propagationQueue.ts`, `src/application/thumbnails/thumbnailQueue.ts`
- **Problem:** `pendingJobs`/`timers`/`writeChain`/`activeFlush`/`flushXJobs`/`ownerKey` are duplicated
  between the two queues; the `while (pendingJobs.size > 0)` drain over a mutating map is fragile.
- **Fix:** Extract `createOwnerDebounceQueue({ delayMs, run })` and instantiate twice.

### SAVE-9 — [Low] `getVariantDepth` memo can cache wrong depth on cyclic graphs
- **Category:** Bug · **Location:** `src/application/scenes/dependencyIndex.ts:67-80`
- **Problem:** Global memo mixed with per-call cycle `seen`; a depth computed through a cycle
  (returns 0 early) gets cached for ancestors, so later queries read a too-small depth.
- **Fix:** Don't cache results computed along a path that hit a cycle.

### SAVE-10 — [Low] Retry backoff sleeps inside the single flush, stalling all later writes
- **Category:** Performance · **Location:** `saveQueue.ts:75-130`
- **Problem:** `flush()` is single-flight; on failure `drain` awaits up to 30s backoff inside the
  same flushing promise, so newer (possibly-succeeding) edits can't flush for up to 30s.
- **Fix:** Gate only the failing batch; allow non-conflicting newer flushes; cap backoff lower.

### SAVE-11 — [Low] Delete-vs-upsert coalescing ordering is correct only by Map insertion order
- **Category:** Bug · **Location:** `src/domain/persistence/mutations.ts:23-30`
- **Problem:** Delete and upsert of the same id get different keys (`del:`/`up:`) and both persist;
  final state depends on `Array.from(map.values())` insertion order, with no documented invariant.
- **Fix:** Coalesce delete+upsert of the same `(table,id)` to a single latest-op-wins entry.

### SAVE-12 — [Low] `peekTable` returns un-hydrated `[]` with no loaded-vs-empty signal
- **Category:** Improvement · **Location:** `recordStore.ts:78-80`
- **Problem:** Callers before hydration silently get `[]` (used at canvas seed for instance
  resolution, where empty changes rendering).
- **Fix:** Track a per-table `hydrated` flag; warn or return `null` when not hydrated.

---

## Canvas — Engine & Stage

### ENG-1 — [High] No-op commit replaces `state.document` reference
- **Category:** Bug / Performance · **Location:** `src/canvas/engine/store.tsx:402-404`
- **Problem:** When `documentsEqual(before, action.document)`, the reducer still returns
  `{ ...state, document: action.document }` — a new reference for an unchanged document.
- **Why real:** The persistence/`onDocumentChange` effect keys on `document` identity, so an
  equal-but-new ref re-fires draft writes/publishes and breaks downstream memoization for a no-op.
- **Fix:** On equality, preserve the existing `state.document` reference.

### ENG-2 — [High] `getInitialZoomForSubjectSize` ignores the viewport, floors to `MIN_ZOOM`
- **Category:** Bug · **Location:** `src/canvas/engine/viewport.ts:114-130` (used at `store.tsx:178,356`)
- **Problem:** Computes initial zoom from hardcoded `720`/`AUTO_ZOOM_SHORT_SIDE_MIN` with no
  `containerSize`; any subject with `longSide ≥ 720` yields `MIN_ZOOM`. The sibling
  `getInitialZoomForCanvas` does proper viewport-aware fitting.
- **Why real:** This is *initial framing*, not the `1×` zoom-out law; the two helpers diverged.
- **Fix:** Compute initial zoom via the viewport-aware path once `viewportSize` is known; converge both.
- **Verification: FALSE POSITIVE.** This helper only *seeds* zoom before the viewport is measured;
  `useViewportControls` overwrites it with the viewport-aware `getInitialZoomForCanvas` before paint, so
  frame-mode subjects do not open at `1×`. The two helpers are intentionally different callers.
  **Likely not a real bug — verify before acting.**

### ENG-3 — [High] Module-global clipboard shared across split editors
- **Category:** Architecture / Bug · **Location:** `src/canvas/engine/clipboard.ts:10,106`
- **Problem:** A single module-level `clipboard` singleton; with split canvases (multiple
  `EditorProvider`s) both editors share it, leaking ids/positions across documents; paste also
  overwrites the copied payload with the just-pasted clones.
- **Fix:** Scope the clipboard per editor; track the cascade offset separately.

### STAGE-1 — [High] Render-diff reads a ref mutated in a layout effect → missed repaints
- **Category:** Bug / Performance · **Location:** `src/canvas/stage/CanvasStage.tsx:95-97,321-327`
- **Problem:** `affectedElementIds` is memoized from `previousRenderDocumentRef.current`, but that
  ref is advanced in a post-commit `useLayoutEffect`. Across re-render passes the memo can run with
  `prev === next`, diffing a document against itself → empty change set → subtrees don't repaint.
- **Fix:** Capture `{prev, computed}` keyed on document identity within the same render, not via a
  separately-timed layout effect.
- **Verification: FALSE POSITIVE.** The memo runs during render and the ref lags by exactly one committed
  document, so the diff is always (prev-doc, current-doc); the `prev===next → empty` path is not reachable
  under React's render/commit ordering. **Likely not a real bug — verify before acting.**

### STAGE-2 — [Medium] `findChildAtPoint` recurses into every subtree regardless of hit
- **Category:** Bug / Performance · **Location:** `src/canvas/stage/canvasHitTesting.ts:23-35`
- **Problem:** `walk(node.children)` runs even when the point isn't inside the parent, so every
  pointer-down scans all descendants, and a child clipped outside its parent can be returned.
- **Fix:** Only recurse into children when `isPointInElement(parent)` is true (as `findElementsInMarquee` does).

### STAGE-3 — [Medium] `getCanvasPoint` rebuilds the viewport transform every pointer event
- **Category:** Performance · **Location:** `src/canvas/stage/hooks/useCanvasPointerEvents.ts:153-166`
- **Problem:** Each `pointermove` calls `buildViewportTransform(...)` even though `CanvasStage`
  already memoizes the identical transform from the same inputs (60–120 Hz redundant matrix work).
- **Fix:** Pass the memoized `viewportTransform` into the hook.

### STAGE-4 — [Medium] Escape doesn't cancel an in-progress drag/resize/rotate
- **Category:** Bug · **Location:** `src/canvas/stage/hooks/useKeyboardShortcuts.ts` (+ `useCanvasPointerEvents.ts:487-496`)
- **Problem:** The Escape cancel path covers pen/anchor/draw but not drag/resize/rotate/radius;
  `commandModeRef`/`dropTargetRef` can stay set, leaving a stale reparent drop-target highlight.
- **Fix:** Handle drag/resize/rotate/radius in the Escape branch: revert to `beforeDocument`, clear refs.

### ENG-4 — [Medium] Storage read (I/O) inside the reducer's `reset`
- **Category:** Architecture · **Location:** `src/canvas/engine/store.tsx:457-458`
- **Problem:** `reset` calls `createInitialState(..., persistStorage=true, ...)` which reads the
  draft-cache port, then discards the result. Reducers must be pure; React may invoke them twice.
- **Fix:** Add a pure `createResetState(viewportMode)` that doesn't touch the port.

### ENG-5 — [Medium] `buildSnapCandidates` allocates all elements even when scoped to a parent
- **Category:** Performance · **Location:** `src/canvas/engine/snapping.ts:74`
- **Problem:** `Object.values(document.elements)` runs unconditionally but is only used in the
  `parentId === undefined` branch; the common drag path never needs it (per-move allocation).
- **Fix:** Compute `allNodes` lazily inside the branch that uses it.

### ENG-6 — [Medium] Same scene `graphJSON` re-parsed 3–4× per render
- **Category:** Performance · **Location:** `src/canvas/canvasUtils.ts:226-270`, `Canvas.tsx:191-260`
- **Problem:** `isFactoryMockGraphJSON`, `shouldUseMockGraph`, and `currentDocument` each
  independently `JSON.parse` the full scene document on the render hot path.
- **Fix:** Parse once (memoized) into a `CanvasDocument` and pass the object to all three.

### ENG-7 — [Medium] `O(n²)` subcomponent resolution
- **Category:** Performance · **Location:** `src/canvas/canvasUtils.ts:549-570`
- **Problem:** `subcomponentsForVariantScene` scans every node and does a linear `components.find`
  per owned node — O(nodes × components) for the screen-detail "Sub Components" list.
- **Fix:** Pre-index components by `sourceNodeId` into a Map once, then O(1) lookup per node.

### ENG-8 — [Low] Three near-duplicate ancestor-walk loops with copy-pasted cycle guards
- **Category:** Duplication · **Location:** `canvasUtils.ts:307-329,373-416,472-481`
- **Problem:** `componentPathFromRoot`, `computeComponentAncestorFrames`,
  `componentNamePathFromDocument` each re-implement the same guarded parent walk.
- **Fix:** Extract one `walkComponentAncestors(start, stepFn)` and build path/frames on top.

### ENG-9 — [Low] `currentDocument` memo lists `component` as a dep but doesn't use it
- **Category:** Clean code / Performance · **Location:** `Canvas.tsx:252-260`
- **Problem:** With an `eslint-disable`, a new `component` object identity recomputes the document
  (re-parsing the graph) even when the graph is unchanged.
- **Fix:** Remove `component` from the dep list and drop the disable.

### ENG-10 — [Low] `shellBackground` applied twice (seed memo + effect)
- **Category:** Clean code · **Location:** `Canvas.tsx:258` and `370-379`
- **Problem:** `currentDocument` already seeds `shellBackground`, and a separate effect also
  dispatches `updateShellBackground` — two sources of truth, an extra commit/history entry.
- **Fix:** Pick one owner.

---

## Canvas — Shell, Tools, Inspector

### SHELL-1 — [Medium] Outside-click/dismiss logic duplicated across ~9 components
- **Category:** Duplication · **Location:** `shell/Tree.tsx:429-441`, `Toolbar.tsx:73-82,224-232`,
  `ZoomControl.tsx:32-41`, `ContextMenu.tsx:24-39`, `CanvasTabs.tsx:117-132`,
  `actions/LibraryPanel.tsx`, `PreviewLauncher.tsx`, `tree/LayersFooter.tsx`, `inspector/InsComponents.tsx`
- **Problem:** Hand-rolled capture-phase `pointerdown` + optional Escape close, with inconsistent
  capture/Escape handling between popovers. (A `useDismissable` hook already exists — see UI-14.)
- **Fix:** Route all sites through one `useDismissable(ref, open, onClose, { escape?, capture? })`.

### SHELL-2 — [Medium] `Tree` mutates `localSelectedId` even in controlled mode
- **Category:** Bug · **Location:** `shell/Tree.tsx:231,283-289,351-354`
- **Problem:** `selectLayer` always sets `localSelectedId` and calls `onSelectNode`, even when
  controlled via `selectedNodeId(s)`; the dual source of truth can diverge if partially controlled.
- **Fix:** Only update `localSelectedId` when uncontrolled, or drop it and require controlled selection.

### SHELL-3 — [Medium] `selectedIdSet`/reveal memo keyed on `JSON.stringify(selectedIds)`
- **Category:** Clean code · **Location:** `shell/Tree.tsx:290-291,339`
- **Problem:** Serializing the selection array every render purely to drive memo identity (brittle to
  ordering, wasteful).
- **Fix:** Depend on `selectedIds` directly, or compare with the existing `stringArraysEqual` helper.

### SHELL-4 — [Medium] `useDeferredPersistence` duplicates `useVersionScenePersistence`
- **Category:** Duplication / Architecture · **Location:** `canvas/hooks/useDeferredPersistence.ts:58-141`
  vs `canvas/hooks/useVersionScenePersistence.ts:48-88`
- **Problem:** Both implement the same debounce-300ms → graph-JSON → skip-if-unchanged → `saveScene`
  → materialize pipeline with identical skip/flush ref dances, differing only in the materializer.
- **Fix:** Extract `useDebouncedScenePersistence(pendingFactory, { delay, persist })`.

### SHELL-5 — [Low] `TreeRow` recurses without `React.memo` → full visible subtree re-renders per drag frame
- **Category:** Performance · **Location:** `shell/tree/TreeRow.tsx:11,269-294`
- **Problem:** `dropTargetId`/`dropMode`/`dragActive` thread to every descendant; every pointer move
  during a drag re-renders the entire visible tree.
- **Fix:** Wrap `TreeRow` in `React.memo`; compute per-row drop state in the parent and pass narrow props.

### SHELL-6 — [Low] `DropdownToolButton` render-mode pill toggles state nobody reads
- **Category:** Architecture · **Location:** `shell/Toolbar.tsx:191,287`
- **Problem:** Local `renderMode` ("SVG"/"DIV") state toggled on click but never consumed — dead or
  half-wired control.
- **Fix:** Wire it to the actual render setting or remove it.

### SHELL-7 — [Low] `dispatchAncestor` casts away action type safety
- **Category:** Clean code · **Location:** `shell/Inspector.tsx:136-153`
- **Problem:** `action: { type: string } & Record<string, unknown>` widens the typed dispatch, so
  typos/wrong payloads aren't caught at compile time.
- **Fix:** Type the parameter as the editor's action union.

### SHELL-8 — [Low] `resolveMaster` memos key on the wrong dependency
- **Category:** Clean code / Performance · **Location:** `canvas/hooks/useSubjectCanvasWindow.ts:45-48`,
  `useVersionsWindow.ts:131-134`
- **Problem:** `buildMasterResolver(getScenesSnapshot())` is keyed on the local `graphJSON`, but reads
  the global scenes snapshot — a referenced master's change won't rebuild; unrelated local edits do.
- **Fix:** Key the resolver on a scenes-snapshot revision (subscribe to `TABLES.scenes`).

### SHELL-9 — [Low] `CanvasRender.draftsFallbackDoc` reads `window` size once (`useMemo(...,[])`)
- **Category:** Bug · **Location:** `shell/CanvasRender.tsx:135-144`
- **Problem:** Stale viewport extent for a brand-new draft after any resize before first draft creation.
- **Fix:** Recompute lazily at the moment a draft is seeded, or listen to window size.

### SHELL-10 — [Low] `removeExtraCurrent`/`closePreview` decide split mode from stale `splitWindows`
- **Category:** Bug · **Location:** `canvas/hooks/useCanvasWindows.ts:109-120,172-178`
- **Problem:** Functional `setSplitWindows` updater is correct, but the subsequent `setSplit("none")`
  decision reads the closure-captured (pre-update) `splitWindows`; correct only by luck, breaks if batched.
- **Fix:** Derive both the next windows and the split decision from one computed `next` value.

### SHELL-11 — [Low] `Tree` declares unused props (`onTabChange`, `enabledTabs`, often `onReorderNode`)
- **Category:** Clean code · **Location:** `shell/Tree.tsx:113,131-132`
- **Problem:** Dead API surface on an ~880-line, ~60-prop component.
- **Fix:** Remove unused props; consider splitting picker/back-footer/context-menu into their own files.

### SHELL-12 — [Low] Unsound cast at the window-surface fan-out
- **Category:** Clean code · **Location:** `shell/CanvasRender.tsx:298`
- **Problem:** `windowTypeOfKey(windowKey) as CanvasFeatureWindowType` assumes anything remaining is a
  feature window; a new `CanvasWindowKey` variant would silently mis-render.
- **Fix:** Narrow with a type guard / exhaustive switch with a `never` default.

---

## Versioning

> The core laws were verified upheld (see "found CORRECT" above). These are the genuine gaps.

### VER-1 — [High] `deleteVariant` silently breaks linked instances placed elsewhere
- **Category:** Bug · **Location:** `src/lib/storage/repos/variants.repo.ts:84-157`; callers
  `application/component-detail/useComponentDetail.ts:359-370`, `application/screen-detail/useScreenDetail.ts`
- **Problem:** `deleteVariant` removes the variant plus every component with
  `parentVariantId === variantId` and their scenes — with **no usage check and no
  `instanceStrategy`**. A version routinely owns components (Copy clones, or content materialized via
  `materializeVersionScene`/`materializeVersionNodeAsComponent`, which calls `markComponentsLinkable`),
  and those masters can be linked elsewhere. Deleting the version deletes them outright, leaving
  dangling `instanceOf` nodes that resolve to nothing — without ever asking the user.
- **Why real:** Violates `Product.md` Law 5 ("Removing a linkable item that is used elsewhere" — must
  ask per-instance keep-a-copy-or-delete). `deleteScreen`/`deleteComponentTree` honor an
  `instanceStrategy` for exactly this; `deleteVariant` is the one master-deleting path that doesn't.
- **Fix:** Give `deleteVariant` the same `instanceStrategy`, route version-owned ids through
  `detachInstancesOfComponents`/`removeInstancesOfComponents`, and have the handlers count usages
  (`countInstanceUsages`) and open the per-instance dialog when > 0.

### VER-2 — [Medium] Version creation is a no-op on children when the source has no scene
- **Category:** Bug · **Location:** `variants.repo.ts:240-273`
- **Problem:** Child cloning (copy) / linkifying (linked) only runs `if (sourceScene)`. For a
  freshly-created, never-saved subject, a "Copy" version owns **none** of the parent's children and a
  "Linked" version references none — silently diverging from what the user asked for.
- **Why real:** `Product.md` Versioning [LAW]: the components inside become the version's own (Copy)
  or linked instances (Linked). Capturing zero children when children exist breaks that.
- **Fix:** Move child-handling out of the `if (sourceScene)` guard, or materialize the source scene first.

### VER-3 — [Low] Linked-version creation permanently flips source masters to `linkable` with no revert
- **Category:** Architecture · **Location:** `variants.repo.ts:243-258`, `components.repo.ts:156-169`
- **Problem:** Creating a Linked version flips captured child masters to `linkable:true`; deleting that
  version never reverts them, so screen-/nested-scoped components stay permanently pickable project-wide.
- **Why real:** Linkability is a deliberate state (Law 11 / unlink semantics); it drifts from actual usage.
- **Fix:** When the last instance of a master disappears, recompute linkability; track
  auto-flipped-for-version masters distinctly from user-opted ones.

### VER-4 — [Low] Linked-promote linkifies the old main with `propagate:false` → stale ancestor thumbnails
- **Category:** Bug · **Location:** `variants.repo.ts:429-461`
- **Problem:** On linked promote, the new main is re-embedded with `propagate:true` but the demoted old
  main is linkified with `propagate:false`, even though its rendered content materially changed.
- **Why real:** Against `Versioning.md` §11 (ancestor thumbnails regenerate when a child's composition changes).
- **Fix:** Use `propagate:true` for the old-main linkify upsert.

---

## UI Layer (components / pages / routes)

### UI-1 — [Critical] FastEdit edits are never persisted — silent data loss
- **Category:** Bug · **Location:** `src/components/screen/FastEditModal.tsx:124-127,152`
- **Problem:** `updateSelected` only calls `setScene(...)` (local state). There is no
  `saveScene`/`putRecord`/`onSaved` anywhere; close just does `setIsOpen(false)`. Every text/color/
  border/radius edit is discarded on close.
- **Why real:** FastEdit is a `[NOW]` feature; the modal loads a real scene via `getSceneByOwner` and
  presents functional editable inputs. Losing edits is not the isolation/mock model.
- **Fix:** Persist edits via `saveScene`/`getSaveQueue().enqueue` (debounced) per edit, or add an explicit
  Save + `onSaved`; at minimum guard close with an unsaved-changes prompt.
- **Verification:** the no-persistence claim is **accurate**. `UX.md:1237` currently documents FastEdit
  as ephemeral ("all edits applied directly to the scene state held by the modal"), so the verification
  pass first marked this "not a bug" — but `UX.md` is **not law**, only `Product.md` is. If FastEdit is
  meant to keep edits, this is **real data loss**; treat it as a product decision (update `UX.md` +
  persist), not a closed false-positive. **Do not silently drop it.**

### UI-2 — [High] `Date.now()` section IDs collide → duplicate keys + corrupted assignment
- **Category:** Bug · **Location:** `src/routes/Gallery/shared/SectionedGrid.tsx:83`
- **Problem:** `id: \`section-${Date.now()}\`` — two sections created in the same ms get identical IDs,
  used as React `key` and `sectionById` key → duplicate-key warnings + corrupted item→section mapping.
- **Fix:** `crypto.randomUUID()` or a monotonic counter.

### UI-3 — [High] Delete-screen modal flips branch mid-async; first-frame confirm skips cascade
- **Category:** Bug · **Location:** `src/pages/GalleryPage.tsx:84-96,200-221`
- **Problem:** `screenDeleteUsage` is fetched after `pendingScreenDelete` is set (defaults to 0). The plain
  `ConfirmActionModal` renders first, then swaps to `InstanceDeleteModal`; confirming in the first frame
  deletes a linked master without the detach/cascade strategy.
- **Why real:** Bypasses the per-instance keep-or-delete law on heavily-linked screens.
- **Fix:** Resolve the usage count before showing the modal (loading state), or disable confirm until known.

### UI-4 — [High] Object-URL leak in `AddReferenceModal` `ScreenThumb`
- **Category:** Bug · **Location:** `src/components/modals/AddReferenceModal.tsx:680-701`
- **Problem:** The effect creates a new object URL per dep change but cleanup only flips `cancelled` —
  the created URL is never revoked; URLs accumulate (holding Blobs) until the modal closes.
- **Fix:** Track the created URL and `URL.revokeObjectURL` it in cleanup.

### UI-5 — [High] Side effects (file deletion) inside `setState` updaters in `ImportModal`
- **Category:** Bug · **Location:** `src/routes/references/components/ImportModal.tsx:140-141,72-79,95-96`
- **Problem:** `setStaged((prev) => { for (item of prev) discardReferenceItem(item); return next; })` does
  I/O (`removeReferenceFile`) + `revokeObjectURL` inside an updater; React 19 may invoke updaters twice,
  double-firing file deletion.
- **Fix:** Compute the discard list, run `discardReferenceItem` outside the updater, then `setStaged(next)`.

### UI-6 — [Medium] 24 PNG encodings per render in `ProjectEditPanel` emoji picker
- **Category:** Performance · **Location:** `src/routes/Gallery/ProjectEditPanel.tsx:188-190`
- **Problem:** `ICON_EMOJIS.map(emojiToDataUrl)` allocates a canvas + `toDataURL("image/png")` 24× on
  every render, and the panel re-renders on every keystroke in name/description.
- **Fix:** `useMemo(() => ICON_EMOJIS.map(e => [e, emojiToDataUrl(e)]), [])`; key selection by the char.

### UI-7 — [Medium] O(N·M) source-badge work + unmemoized cards in Gallery tabs
- **Category:** Performance · **Location:** `src/routes/Gallery/ComponentsTab.tsx` (~:747; cards not memoized);
  same in `ScreensTab.tsx`
- **Problem:** Each card does unmemoized `screens.find/filter`; cards aren't `React.memo` and get fresh
  inline callbacks → every component re-renders on each search keystroke. `ReferencesTab` already
  precomputes a `screenById` map (:53-56), proving the intended pattern.
- **Fix:** Pass a precomputed `screenById`, `React.memo` the cards, stabilize callbacks with `useCallback`.

### UI-8 — [Medium] CompareVersions Panel key includes slot index → remounts expensive Snapshot
- **Category:** Performance · **Location:** `src/components/modals/CompareVersionsModal.tsx:275`
- **Problem:** `key={\`${id}-${slotIdx}\`}` — changing a slot's selected version changes the key, forcing a
  full remount of `Panel`→`Snapshot` instead of an in-place update.
- **Fix:** `key={\`slot-${slotIdx}\`}`.

### UI-9 — [Medium] `findSceneNode` tree-walk runs every render on the pan/zoom path
- **Category:** Performance · **Location:** `src/components/screen/FastEditModal.tsx:122`
- **Problem:** `findSceneNode(scene.root, selectedId)` walks the tree on every render, including the many
  fired while panning/zooming updates `zoomCtl.transform`.
- **Fix:** `useMemo(..., [scene, selectedId])`.

### UI-10 — [Medium] "Move to" / "Make global" menu items wired to no-op stubs
- **Category:** Bug (dead UI) · **Location:** `src/components/screen/ComponentSideCard.tsx:98-99`;
  callers `ScreenContent.tsx:154-155`, `ComponentContent.tsx:191-192`
- **Problem:** Real-looking menu items; every caller passes `onMoveTo={() => {}}` / `onMakeGlobal={() => {}}`.
- **Fix:** Implement the handlers or hide the items until implemented.

### UI-11 — [Medium] `ReferenceCard` subtitle prints raw bytes as "KB" and unformatted duration
- **Category:** Bug · **Location:** `src/components/references/ReferenceCard.tsx:104-105`
- **Problem:** `\`${item.size||0} KB\`` and `\`${item.duration}s\``; elsewhere uses `formatSize`/
  `formatDuration`. A 1 MB file shows "1048576 KB".
- **Fix:** Use the shared `formatSize`/`formatDuration`.

### UI-12 — [Medium] Duplicated `KIND_BY_MEDIA` + payload assembly in `AddReferenceModal`
- **Category:** Duplication / Architecture · **Location:** `AddReferenceModal.tsx:334-373`
  vs `application/references/addReferencesFromFiles.ts:8-12`
- **Problem:** Re-declares the media→kind map already exported as `KIND_BY_MEDIA` and assembles the
  `createOrAttachReference` payload (thumbnail baking, source string) inline in the component.
- **Fix:** Reuse `KIND_BY_MEDIA`; extract `addReferenceFromLibraryPick(...)` into `application/references`.

### UI-13 — [Medium] Double-revoke: two effects both own `stackPreview` URL lifecycle
- **Category:** Bug · **Location:** `src/routes/references/components/ReferenceDetailModal.tsx:113-132`
- **Problem:** Effect-1 releases + nulls `stackPreview`; that state change triggers effect-2's cleanup to
  release the same object again. Harmless unless `releaseStackUrls` is reference-counted (then over-release).
- **Fix:** Give one effect sole ownership of `stackPreview` URL release.

### UI-14 — [Medium] Gallery dropdowns reimplement the existing `useDismissable` hook
- **Category:** Duplication · **Location:** `ComponentsTab.tsx` (~:260-275,478-493), `ScreensTab.tsx`
  (~:144-159), `components/screen/CardMenu.tsx:136-160`
- **Problem:** The outside-pointerdown+Escape close is hand-rolled in ~4 places despite
  `src/lib/hooks/useDismissable.ts` existing and being used elsewhere; `CreateDropdown`/`CreateScreenDropdown`
  are near-identical. (Same theme as SHELL-1.)
- **Fix:** Replace with `useDismissable`; extract one shared `CreateDropdown`.

### UI-15 — [Medium] Raw `event.metaKey`/`ctrlKey` in canvas zoom instead of settings helpers
- **Category:** Architecture (guardrail) · **Location:** `src/components/screen/useStepZoom.ts:118,144`
- **Problem:** Cmd/Ctrl+wheel and Cmd/Ctrl+`=`/`-`/`0` read modifiers directly; the guardrail requires
  `matchesKeyCommand`/`isModifierCommandActive`. User keybinding settings don't apply here.
- **Fix:** Route through the resolver with the appropriate command IDs.

### UI-16 — [Low] "Create project" button not disabled while creating
- **Category:** Bug · **Location:** `src/pages/NewProjectPage.tsx:133-136`
- **Problem:** Primary uses `disabled={!canNext}` while the sibling uses `disabled={creating}`. A true
  double-submit is already prevented by `useNewProject` guards, but the asymmetry is fragile.
- **Fix:** `disabled={!canNext || creating}`.

### UI-17 — [Low] Duplicated card/grid + `DeviceMock` + selectable-card markup across pages
- **Category:** Duplication · **Location:** `HomePage.tsx:401-447`, `LandingPage.tsx:366-376`,
  `NewProjectPage.tsx:444-471` vs `NewDraftPage.tsx:313-333`
- **Fix:** Extract `ProjectGrid`, a single `DeviceMock`, and a shared `SelectableCard`.

### UI-18 — [Low] Dead orphaned CSS var in `NewProjectPage` `DeviceMock`
- **Category:** Dead code · **Location:** `NewProjectPage.tsx:449-454`
- **Problem:** Sets `--after-bg` that nothing consumes; the sibling renders identically without it.
- **Fix:** Remove the `style` prop.

---

## Builder (`/generate`)

### BLD-1 — [High] `onWheel` `preventDefault()` on React's passive wheel listener
- **Category:** Bug · **Location:** `generate/ToolsEditorView.tsx:368` (handler `hooks/useBuilderViewport.ts:70-72`)
- **Problem:** Zoom/pan is wired through synthetic `onWheel` and calls `preventDefault()`; in React 19
  `wheel` is passive, so it's ignored (logs a warning) and native page scroll isn't suppressed while zooming.
- **Fix:** Attach a manual non-passive `wheel` listener via `ref`/`useEffect` `{ passive:false }`.

### BLD-2 — [High] Stack-save is non-atomic — partial disk/localStorage state on failure
- **Category:** Bug · **Location:** `generate/hooks/useStackPersist.ts:36-52`
- **Problem:** `persistReferenceStack` writes N PNGs + meta, then removes the local draft. A mid-batch
  failure leaves some files/meta written while showing only "Failed to save stack" — inconsistent state,
  no rollback.
- **Fix:** Make `writeReferenceStackBatch` atomic (temp + swap) or roll back meta/files on failure.

### BLD-3 — [Medium] `handleRemoveComponent` built and threaded but never called; view reimplements inline
- **Category:** Duplication · **Location:** `hooks/useBuilderCutOperations.ts:238-258` vs `ToolsEditorView.tsx:787-798`
- **Problem:** The hook's removal logic (destructured at `ToolsEditorView.tsx:168`) is never invoked; the
  view re-implements the subtree-removal + reselect inline.
- **Fix:** Pass `handleRemoveComponent` to `ComponentTreeItem`, delete the inline body.

### BLD-4 — [Medium] Two entire UI modules are dead code (`OriginalSlideshow`, `ScreensPanel`)
- **Category:** Dead code · **Location:** `ui/OriginalSlideshow.tsx`, `ui/ScreensPanel.tsx` (whole files)
- **Problem:** Neither imported anywhere (`ScreensPanel` superseded by `RootSwitcher`); both ship unused
  object-URL caches.
- **Fix:** Delete both files and their orphaned helpers.

### BLD-5 — [Medium] `useToolsEditor` returns a ~110-key bag rebuilt every render, zero memoization
- **Category:** Architecture / Performance · **Location:** `hooks/useToolsEditor.ts:698-830` (type 71-215)
- **Problem:** One giant flat state/setter/handler object recreated each render; defeats `React.memo` and
  forces full-bag recreation on any state change (god-hook anti-pattern).
- **Fix:** Group into memoized sub-objects (`selection`/`viewport`/`navigation`/`components`) or a context.

### BLD-6 — [Medium] `IconButton` defined twice, identically
- **Category:** Duplication · **Location:** `ui/ComponentTreeItem.tsx:5-21`, `ui/RailTools.tsx:147-163`
- **Fix:** Import the exported one from `RailTools`.

### BLD-7 — [Medium] Mixed-language UI copy
- **Category:** Clean code · **Location:** `ToolsEditorView.tsx:275-296,437,474,569,576`, `ui/ConfirmModal.tsx:27`
- **Problem:** PT ("Mover"/"Recortar"/"Cancelar") beside EN ("Save"/"Apply"/"Clear"). (Cross-cutting theme.)
- **Fix:** Pick one interface language for the Builder.

### BLD-8 — [Medium] Tree/variant rows are non-keyboard-accessible clickable `div`s
- **Category:** Bug (a11y) · **Location:** `ui/ComponentTreeItem.tsx:68-81`, `ui/VariantsPanel.tsx:59-69`
- **Problem:** `<div onClick>` with no `role`/`tabIndex`/key handler — not focusable or keyboard-activatable.
- **Fix:** Use `<button>` or add `role="button"`, `tabIndex={0}`, Enter/Space handling.

### BLD-9 — [Medium] `ElementInfoCard` type badge `text-[4.5px]` + dangling separator dot
- **Category:** Bug · **Location:** `ui/ElementInfoCard.tsx:35,32`
- **Problem:** Sub-legible 4.5px label (siblings are 11–11.5px; almost certainly a typo); orphan `·` span.
- **Fix:** `text-[11.5px]`; remove the orphan separator.

### BLD-10 — [Low] Stage-load effect depends only on `[item.id]` while reading derived ids
- **Category:** Bug (latent) · **Location:** `hooks/useToolsEditor.ts:567-642`
- **Problem:** Reads `referenceId`/`componentKey`/`rootComponentId` but re-runs only on `item.id`; safe
  today (all derive from `item.id`) but fragile (suppressed lint hides the invariant).
- **Fix:** Key the editor by `componentKey` (remount), or include the independent inputs.

### BLD-11 — [Low] Object-URL session caches grow monotonically, never revoked
- **Category:** Performance (bounded leak) · **Location:** `ui/RootSwitcher.tsx:318,336-343`
- **Fix:** LRU cap or revoke on unmount/group-change; or a shared thumbnail hook. (Cross-cutting theme.)

### BLD-12 — [Low] `GallerySlider` keydown effect re-binds per keystroke; index-as-key
- **Category:** Performance / Clean code · **Location:** `ui/GallerySlider.tsx:46-55,144-151`
- **Fix:** `setIndex(i => clamp(i±1))` so the effect depends only on `[cuts.length]`; key swatches stably.

### BLD-13 — [Low] `confirmationDialogCopy` non-exhaustive over its union
- **Category:** Clean code · **Location:** `ui/ConfirmModal.tsx:42-60`
- **Problem:** Only `"delete-root"` handled; other variants fall through to "Reset stack" copy.
- **Fix:** `switch` with a `never`-typed default.

---

## Domain & System-Design

### DOM-1 — [High] Domain layer imports `lib/` (storage schema + canvas) — layering inversion
- **Category:** Architecture · **Location:** `src/domain/canvas/graphTransforms.ts:1-7`
- **Problem:** Imports `htmlCanvasDocumentFromJSON`/`serializeHtmlCanvasDocument`/`HtmlCanvas*` from
  `@/lib/canvas/htmlScene` and `ComponentRow` from `@/lib/storage/schema`. `domain/` is "pure, zero I/O";
  the sibling type modules (`canvas/types.ts`, `system-design/types.ts`) were created precisely to invert
  this (domain owns the type, `lib` re-exports). This file points the arrow the wrong way.
- **Fix:** Move the pure `HtmlCanvas*` types + JSON helpers into `domain/canvas/` and re-export from `lib`;
  replace `ComponentRow` with a minimal structural type (`findChildTargetNode` is already structural).

### DOM-2 — [High] `"+"` zoom-in keybinding is effectively dead (shift-modifier gap)
- **Category:** Bug · **Location:** `src/domain/settings/resolve.ts:79-97`, `defaults.ts:28-31`
- **Problem:** Default zoom-in is `{ mod:true, key:"=" }` and `{ mod:true, key:"+" }`. "+" is produced by
  Shift+`=`, so the event is `{ key:"+", shiftKey:true }`; the matcher requires
  `event.shiftKey === Boolean(binding.shift)` (undefined→false), so the `"+"` binding can never fire, and
  `Cmd+Shift+=` (the natural zoom-in keystroke) matches neither `"="` nor `"+"`.
- **Fix:** Set `shift:true` on the `"+"` binding, relax the matcher for intrinsically-shifted symbols, or
  match by `event.code` (`Equal`).

### DOM-3 — [High] `isMacLike()` relies on deprecated/empty `navigator.platform`
- **Category:** Bug · **Location:** `src/domain/settings/resolve.ts:129-132`
- **Problem:** `mod` resolution in `isModifierCommandActive` (the mandated helper) and the `⌘`/`Ctrl`
  labels hinge on `isMacLike()`, which reads only `navigator.platform` — deprecated and empty in some
  webview/test contexts, where a Mac user's `mod` silently resolves to `ctrlKey`, breaking ⌘-shortcuts.
- **Fix:** Prefer `navigator.userAgentData?.platform`, fall back to `platform`, then a UA regex; cache;
  ideally have the Tauri shell inject the real OS.

### DOM-4 — [Medium] `subjectNodeForDocument` (+ helpers) duplicated verbatim between domain and infra
- **Category:** Duplication · **Location:** `domain/canvas/graphTransforms.ts:206-222` and
  `lib/canvas/htmlScene/resolveInstances.ts:152-168`
- **Problem:** Byte-identical `subjectNodeForDocument`; `groupNodesByParent`, `collectDescendantIds`,
  `uniqueNodeId` also near-duplicated. A change to the subject heuristic must touch both or the graph
  transforms and live resolver disagree on the subject, corrupting embeds.
- **Fix:** Export from one shared pure module (naturally `domain/canvas/`) and import in the other.

### DOM-5 — [Medium] `mergeDeep`/`resolveSettingsLayers` deep-clone via `JSON.stringify` per layer & recursion
- **Category:** Performance · **Location:** `resolve.ts:20-39,47-67`
- **Problem:** `clone = JSON.parse(JSON.stringify(...))` invoked O(depth×nodes) over the full settings tree
  on an interactive path (changing a binding, opening a project that adds a layer).
- **Fix:** Clone once at leaves (or `structuredClone`); don't re-clone `base` per recursion; memoize by layer.

### DOM-6 — [Medium] `findChildTargetNode`/linkify loop rebuilds the parent map per child (quadratic)
- **Category:** Performance · **Location:** `graphTransforms.ts:104-136,243-273`
- **Problem:** `linkifyChildComponentsInGraph` calls `collectDescendantIds` per child, which rebuilds
  `groupNodesByParent` (O(nodes)) each time → O(C·N). `materializeInstancesInGraph` similarly does
  `nodes.map` per target.
- **Fix:** Build `groupNodesByParent` once and pass it in; accumulate a single final pass.

### DOM-7 — [Low] Command palette embeds React Router paths/`navigate` in domain
- **Category:** Architecture · **Location:** `src/domain/search/commandPalette.ts:18-23,38-97`,
  `searchTypes.ts:43-44`
- **Problem:** `CommandContext.navigate` and hard-coded route strings couple the "pure" layer to the router.
- **Fix:** Represent navigation as data (typed target); map to `navigate(path)` in the application layer.

### DOM-8 — [Low] `uniqueNodeId` falls back to a colliding/unchecked id after 10000 retries
- **Category:** Bug · **Location:** `graphTransforms.ts:275-282` (twin `resolveInstances.ts:226-233`)
- **Problem:** After 9999 collisions returns `${preferred}-${Date.now()}` (or `-${usedIds.size}`) without
  checking `usedIds` — can return an in-use id, defeating its purpose.
- **Fix:** Loop without a fixed ceiling (the used set is finite), re-checking membership before returning.

### DOM-9 — [Low] `updateKeyCommand` collapses multi-binding commands to a single binding (data loss)
- **Category:** Bug · **Location:** `resolve.ts:28-40`
- **Problem:** `mergeDeep` whole-replaces arrays (fine as policy), but `updateKeyCommand` always writes
  `[binding]`, so rebinding redo/zoom-in drops their shipped alternate binding (e.g. `Ctrl+Y`).
- **Fix:** Append/replace within the existing array, or document that rebinding resets to one binding.

### DOM-10 — [Low] `clampPanAxis` overflow bound ignores viewport, diverging from `clampAxisOffset`
- **Category:** Improvement · **Location:** `src/domain/zoom.ts:46-57`
- **Problem:** Overflow limit `scaled/2` ignores `available`/viewport, while the canvas counterpart
  (`viewport.ts:185`) factors `containerLength/2`; the "shared feel" docstring contract isn't met.
- **Fix:** Derive the overflow bound from the viewport like `clampAxisOffset`, or update the docstring.

### DOM-11 — [Low] `resolveSystemDesign` builds empty per-category Maps on the no-parent path
- **Category:** Performance · **Location:** `src/domain/system-design/resolve.ts:45-78`
- **Problem:** Constructs `parentById` (7 maps) per call even when `parent` is null; this feeds
  `resolveTokenRef`, called while painting bound elements.
- **Fix:** Short-circuit when `parent` is null; build `parentById` lazily only when a token has `instanceOf`.

---

## Rust / Tauri Backend (`src-tauri`)

### RUST-1 — [High] Mutex poisoning permanently bricks the single DB connection
- **Category:** Bug / Architecture · **Location:** `src-tauri/src/db.rs:82,124,141`
- **Problem:** All three DB commands do `db.lock().map_err(|_| "db mutex poisoned")`. One panic while
  holding the lock poisons the `Mutex`, so *every* subsequent `db_apply`/`db_get_record`/`db_list_records`
  fails forever — and since the DB is the source of truth, the app is unusable until restart. Writes are
  transactional, so recovering the guard is safe.
- **Fix:** `let mut conn = db.lock().unwrap_or_else(|e| e.into_inner());`.

### RUST-2 — [High] `db_apply` recompiles prepared statements per row inside the transaction
- **Category:** Performance · **Location:** `src-tauri/src/db.rs:86-107`
- **Problem:** The batch loop calls `tx.execute(<SQL literal>, ...)` per upsert/delete, so SQLite re-parses
  the same INSERT/DELETE once per row while holding the global DB mutex — defeating the "one IPC = one txn"
  amortization the command exists for.
- **Fix:** Hoist two `tx.prepare_cached(...)` statements before the loop and bind+execute per mutation.

### RUST-3 — [Medium] `db_apply` reports `applied` as `batch.len()`, not rows actually changed
- **Category:** Bug · **Location:** `db.rs:84,97-105,110`
- **Problem:** Counts mutations, not affected rows; a `DeleteRecords` with N ids counts as 1, deletes of
  non-existent ids still count. Misleading if the frontend trims its pending set by `applied`.
- **Fix:** Accumulate the real affected-row total, or rename/redocument the field.

### RUST-4 — [Medium] `db_list_records` materializes the whole table (scenes + base64 thumbnails) under lock
- **Category:** Performance · **Location:** `db.rs:138-156`
- **Problem:** Collects every row's `json` (large for scene/thumbnail tables) into one `Vec<String>` and
  ships it over IPC while holding the DB mutex for the entire scan, blocking concurrent saves.
- **Fix:** Add id-only listing/pagination; fetch large-blob tables per-id; consider not co-locating big
  base64 thumbnails in the bulk-listed `records` table.

### RUST-5 — [Medium] Per-pixel `ndarray` indexing dominates inference pre/post-processing
- **Category:** Performance · **Location:** `src-tauri/src/models.rs` (e.g. 380-387,446-453,522-531,713-732)
- **Problem:** Builds NCHW input with `input[[0,c,y,x]]=...` in nested loops — millions of bounds-checked,
  stride-computed index writes per image on the inference path.
- **Fix:** Fill a contiguous `Vec<f32>` linearly (or `Zip`/`as_slice_mut`) and `Array4::from_shape_vec`.

### RUST-6 — [Medium] Massive duplication of image→NCHW preprocessing across every model
- **Category:** Duplication · **Location:** `models.rs` (8 near-identical blocks, e.g. 379-387 … 1424-1434)
- **Problem:** The ImageNet-normalize-into-NCHW loop (and `/255` variant) is copy-pasted across BiRefNet,
  Real-ESRGAN, DBNet, CRAFT, LaMa, OmniParser, font-classify, Florence-2 — same off-by-one surface ×8.
- **Fix:** One `rgb_to_nchw(img, normalize, pad)` helper + a `run_single(session, input, tensor)` helper.

### RUST-7 — [Medium] BPE merge search is O(n²·merges) and clones every symbol pair
- **Category:** Performance · **Location:** `models.rs:1261-1286`
- **Problem:** Rescans all adjacent pairs per merge and clones both symbols per pair lookup. Small impact
  today (short Florence-2 prompts) but gratuitously allocation-heavy.
- **Fix:** Look up merges with borrowed `&str` keys; track only the affected region after each merge.

### RUST-8 — [Medium] `florence2_decode_text` reloads all 5 ONNX sessions from disk on every call
- **Category:** Performance / Architecture · **Location:** `models.rs:1416,1437,1459,1480,1510`
- **Problem:** Each invocation re-parses/JIT-initializes hundreds of MB of immutable ONNX graphs + rebuilds
  the tokenizer; no `Session` is cached anywhere (true for other models via `load_session` too).
- **Fix:** Lazily cached session map in `tauri::State` keyed by model id, invalidated on install/uninstall.

### RUST-9 — [Low] `config_path` `.expect()` and `now_ms()` `0`-fallback
- **Category:** Clean code · **Location:** `src-tauri/src/lib.rs:39-44,146-151`
- **Problem:** `config_path` is the lone `expect` on a fallible Tauri path call (can panic a command, unlike
  every sibling that returns `Result`); `now_ms` silently writes `savedAt: 0` on clock error.
- **Fix:** Make `config_path` return `Result<PathBuf, String>` and propagate; comment/propagate `now_ms`.

### RUST-10 — [Low] Florence-2 file list duplicated (install spec vs inference presence-check)
- **Category:** Duplication · **Location:** `models.rs:182-188` vs `1404-1414`
- **Problem:** `model_file_specs` and `florence2_decode_text` both hard-code the same 5 filenames; adding/
  renaming a file silently desyncs install vs inference.
- **Fix:** Have the presence-check reuse `model_file_specs`/`model_is_installed`.

### RUST-11 — [Low] `extract_video_frames` discards per-frame dimension errors as `(0,0)`
- **Category:** Clean code · **Location:** `src-tauri/src/lib.rs:531`
- **Problem:** `image_dimensions(path).unwrap_or((0,0))` emits a `0×0` frame on a corrupt read instead of
  skipping/reporting.
- **Fix:** Skip (`filter_map` → `None`) or propagate.

### RUST-12 — [Low] `read_config` re-reads + re-parses `workspace-config.json` on every command
- **Category:** Performance · **Location:** `src-tauri/src/lib.rs:98-106` (called by ~12 commands)
- **Problem:** Each reference/export command re-reads and re-parses the config from disk on hot paths,
  though it only changes via `set_workspace_folder`.
- **Fix:** Cache `WorkspaceConfig` in `tauri::State` (`Mutex`/`RwLock`), refreshed on `set_workspace_folder`.

---

## Additional findings (verification pass)

New defects surfaced by the second pass that were not in the original sweep. Verdicts already applied
(each re-opened in the real source).

### REF-1 — [High, LAW gap] References lack the per-instance "copy-or-delete" flow
- **Category:** Bug (law) · **Location:** `application/references/*`,
  `routes/references/components/GroupDialogs.tsx` (`DeleteReferenceModal`),
  `lib/storage/repos/references.repo.ts:317` (`removeReferenceLinksForLibraryId`).
- **Problem:** `Product.md` "Removing a linkable item that is used elsewhere" requires the per-place
  keep-a-copy-or-delete choice for **all three** linkable capabilities (components, tokens, references).
  Components (`UnlinkComponentModal` + `applyInstanceDecisions`) and tokens (`applyTokenLinkDecisions`)
  have it; references only offer "Delete everywhere" and silently drop the links. `detachReference` (the
  "keep a copy" half) already exists — only the per-instance dialog is missing.
- **Verdict:** CONFIRMED. The one genuine LAW violation the verification pass found; closely tied to
  VER-1. Not a one-liner (needs a per-instance modal + decision applier mirroring the component flow).
  Update `UX.md` before building.

### META-1 — [Medium-High] Hardcoded "updated 1 hour ago"
- **Category:** Bug · **Location:** `pages/detail/ScreenContent.tsx:96` (literal
  `<span>updated 1 hour ago</span>`).
- **Verdict:** CONFIRMED. Sits next to real derived fields; this is the `updatedAt` field that should be
  wired. LAW 5 covers content *inside* a mock screen, not always-false chrome metadata.

### META-2 — [Low-Medium] Hardcoded author "You"/"VC" on every version chip
- **Category:** Bug · **Location:** `pages/detail/ComponentContent.tsx:59-60`.
- **Verdict:** CONFIRMED. Real attribution fields stubbed; lower impact than META-1.

### VID-1 — [Medium] VideoFramePicker conflates "empty" and "error"
- **Category:** Bug · **Location:** `routes/import/VideoFramePicker.tsx:38-64`.
- **Verdict:** CONFIRMED. A successful extraction returning 0 frames and an ffmpeg-missing failure
  collapse into the same blank state. Distinguish them.

### BLD-14 — [Low] RootSwitcher leaks one object URL on the cancelled path
- **Category:** Bug (bounded leak) · **Location:** `generate/ui/RootSwitcher.tsx:338-341`.
- **Verdict:** CONFIRMED. Sibling loaders revoke on the cached branch; this one drops a fresh `blob:` URL
  when the effect is cancelled after load. One-line fix (revoke `loaded` when cancelled).

## Safe cleanups (behavior-neutral, no law risk)

Confirmed by the verification pass — pure hygiene.

- **Mixed-language UI copy (PT in an English UI)** — confirmed across `Inspector.tsx`, `ElementTab.tsx`,
  `ShellTab.tsx`, `CanvasTab.tsx`, `Tree.tsx`, `LayersFooter.tsx`, `TreeRow.tsx`, `CanvasSurfaces.tsx`,
  `treeHelpers.ts` (`"elipse"`→`"ellipse"`), `useNewProject.ts`, `"Projeto"` fallbacks, and the Builder
  (`ToolsEditorView.tsx`, `ConfirmModal.tsx`). Interface language is clearly English. (Same theme as the
  cross-cutting mixed-language note and BLD-7.)
- **Truly duplicated code:** `cloneDocument` (4×) + `clampNodeToParentBounds` (2×); `normalizedVector`
  (2×); `arrayValuesEqual` (2×); the `byOwner`+`applyInstanceDecisions` block in
  `useUnlinkComponent`/`useDeleteComponent`; `KIND_BY_MEDIA`+payload in
  `linkReferenceToOwner`/`addReferencesFromFiles`; crop→canvas rasterization in
  `useBuilderCutOperations`/`useAutoDetect`; `IconButton` (2×, see BLD-6).
- **Divergent duplication (higher value):** two reference URL caches used together in `ReferenceCard.tsx`;
  `stackHelpers.ts` vs `stackViewHelpers.ts`; two `CardMenu` implementations; three near-identical Builder
  thumbnail loaders (unifying fixes BLD-14).
- **Dead code:** `routes/NewProject.tsx` (14KB, unimported, missing the token step); dead 2D tooling
  drawers in `canvasToolingRenderer.ts` (~160 lines; renderer is Skia — also touches one test);
  fully-unrendered mock panels (`Chat.tsx`, `GalleryPanel`); dead placeholder controls ("Formas" toggles,
  render-mode pill — see SHELL-6).
- **`useDismissable` exists but has ~0 adopters** — ~10–13 hand-rolled outside-click/Escape effects could
  use it (same theme as SHELL-1 / UI-14).

## Real but minor (perf / optional)

- `deleteProject` (and `deleteScreen`) use `replaceTable` (re-stringifies the whole table) where
  `deleteComponentTree`/`deleteVariant` already use the cheaper `removeRecords`. Real, but an infrequent
  op, not a hot path.
- Builder: base64 char-by-char + synchronous canvas raster (`modelCommands.ts:129`) → jank on large
  images (Medium, not High); `rebuildAllRoots` O(n²) per edit; `measureImage` has no timeout.
- Grid overlay re-renders per frame (fresh `canvasRect` object in deps) and is not DPR-scaled (blurry at
  zoom ≥ 4). `reset` reducer wastes a localStorage hydration. `useCanvasWindows` split-collapse reads a
  stale closure (self-corrects on the next effect).

## Suggested sequencing

1. **Stop the bleeding (data loss / corruption):** UI-1, SAVE-1, SAVE-2, VER-1, RUST-1, UI-5, UI-3.
2. **Correctness bugs with user-visible impact:** ENG-1/2/3, STAGE-1/2/4, DOM-2/3, BLD-1/2, UI-2/4/10/11.
3. **Performance cliffs:** RUST-2/4/8, ENG-6/7, STAGE-3, SHELL-5, UI-6/7, SAVE-5/6, DOM-5/6.
4. **Architecture & layering:** DOM-1, ENG-4, BLD-5, UI-12/15, DOM-7.
5. **Duplication & dead code sweep (cross-cutting):** the `useDismissable` consolidation (SHELL-1/UI-14),
   mixed-language copy (BLD-7 + UI-13-style strings), object-URL lifecycle (UI-4/13, BLD-11), and the
   dead modules/props (BLD-3/4, SHELL-11, UI-18).

> Each item is independently shippable; none requires a `Product.md` change. Where a fix touches UX
> (e.g. UI-1's save flow, VER-1's delete dialog, REF-1's delete dialog), update `UX.md` before
> committing, per the project rule.
>
> From the verification pass: **REF-1** (references copy-or-delete) is the one confirmed `Product.md`
> LAW gap — finish verifying **VER-1** first, since they share the per-instance delete machinery. And
> **do not spend effort on ENG-2 / STAGE-1** — both were re-checked and judged FALSE POSITIVE.
