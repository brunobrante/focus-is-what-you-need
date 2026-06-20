# BETTER.md — Improvement Backlog for `apps/desktop`

> Audit of the whole `apps/desktop` codebase (~74k LOC, React 19 + TypeScript + Tauri + Skia).
> Findings are grouped **by type**: Bugs, Performance, Gambiarras (hacky workarounds that
> "work" but mask the real problem), Inconsistencies, Organization / Clean Architecture, and
> Code Duplication across the multiple canvases (main editor, builder, references viewer,
> snapshot viewers).
>
> Each item cites a concrete `file:line` so it can be acted on directly. Severity tags:
> 🔴 high (correctness / data loss / user-visible regression), 🟠 medium, 🟡 low / cleanup.

---

## Resolved (2026-06-20)

These items have been fixed or deliberately dropped and were removed from the backlog below:

- **BUG-01** ✅ FastEdit on the component-detail view now uses the imperative
  `ref.open(...)` API (`DetailPage` `ComponentContent`); the orphaned `fastEditOpen` state was
  removed from `useComponentDetail`. (`ConfirmActionModal` was already fixed with a dual API.)
- **BUG-03 / BUG-04** ✅ The deferred-persistence hooks no longer drop the previous owner's
  pending edit on a fast owner switch: `useDeferredPersistence` flushes in a layout effect (not
  during render), and `useHtmlCanvasDocument` keeps a `pendingRef` flushed on owner-change/unmount.
- **BUG-05** ✅ `commitDocument` now clears `editingTextId` in both branches.
- **BUG-13** ⛔ **Won't fix — by design.** The app is local-only and pre-release with no data to
  preserve, so nuke-and-reseed on a schema bump is the intended behavior. No migrations. (See the
  "Data Lifecycle & Migrations" section in `CLAUDE.md`.)
- **ARCH-01 / PERF-ARCH-01 / INC-ARCH-1** ✅ The dead typed-delta SQLite path (the
  `scenes`/`nodes`/`thumbnails` tables, the `upsert_scene`/`upsert_node`/`upsert_thumbnail` Rust
  arms, `db_get_scene`/`db_load_scene_nodes`/`db_get_thumbnail`, and the `scene_versions` ack
  field) was **deleted**. Scenes/thumbnails are JSON/base64 rows in `records`; the backend only
  implements `upsert_record` / `delete_records`. `CLAUDE.md` was corrected to match.
- **ORG-12** ✅ The ~1300 lines of dead reference-viewer UI (`Lightbox`, `Inspector`,
  `InspectorPanel`) and the orphaned `lightboxItem` state were deleted.
- **BUG-ARCH-2** ✅ Scene/thumbnail rows are now keyed deterministically by
  `ownerType:ownerId` (`sceneRecordId`/`thumbnailRecordId`), so `getSceneByOwner`/
  `getThumbnailByOwner` are an O(1) `getRecordById` cache hit instead of a full table scan.
  `SCHEMA_VERSION` 17 → 18 (reseed handles old random-id rows).
- **PERF-ARCH-02** ✅ Ancestor propagation no longer runs on the save critical path: `saveScene`
  writes the row with `{ propagate: false }` and enqueues the walk on a new idle
  `propagationQueue` (coalesced per owner, mirrors `thumbnailQueue`).
- **PERF-ARCH-04** ✅ The scene dependency index is memoized (`sceneDependencyIndexCache`),
  dropped only when the variants/components tables change, instead of being rebuilt from full
  table scans on every propagation.
- **BUG-ARCH-4** ⛔ Moot — the typed node upsert path (the `>=` vs `>` guard asymmetry) was
  deleted with the rest of the dead typed-delta machinery (see ARCH-01 above).
- **PERF-08** ✅ `useCanvasHistory.sameDocumentShape` no longer `JSON.stringify`s the whole
  document twice per edit; it walks the fields with a short-circuiting, allocation-free
  `deepEqual` that ignores `updatedAt` (mirrors the Skia engine's `documentsEqual`). Covered by a
  new unit test. The other two cited spots were already fine: the Skia engine's `documentsEqual`
  is already structural, and the `store.tsx` localStorage draft already skips transient frames and
  debounces (one stringify per settled commit, not per frame).
- **BUG-15** ✅ `ReferencesModal` keydown effect now has a `[open, total]` deps array (and inlines
  the `setIdx` logic so it no longer closes over unstable `next`/`prev`).
- **BUG-16** ✅ The `LandingPage` export-toast timer is stored in a ref, cleared per export and on
  unmount, so it can't fire after unmount or stack across exports.
- **BUG-ARCH-3** ✅ `setMeta` now calls `notify(META_TABLE)` like `putRecord`, so meta-driven UI
  re-reads instead of going stale.
- **BUG-11** ✅ `waitForImage` now rejects on `error` and on an already-`complete` broken image
  (`naturalWidth === 0`), so a broken crop image can't hang the Builder save (the caller already
  falls back to the original URL on rejection).
- **BUG-01b** ✅ Found in passing: the `ProjectSettingsModal` on `LandingPage` was a forwardRef
  imperative modal rendered with `open`/`project`/… props (all silently dropped — the same class
  as BUG-01), so project settings could not be opened from the Landing page. Fixed to use a `ref`
  + `.open(project, screens, onSaved)`.
- **PERF-02** ✅ `drawParentDistances` no longer allocates + frees a WASM `Font` every frame; it
  uses a cached `parentDistanceFont` field (mirrors `valueLabelFont`).
- **PERF-03** ✅ `drawValuePill` takes the caller's already-measured `textWidth` instead of
  re-running `measureTextWidth` (two array allocations) for the same text+font each frame.
- **PERF-04** ✅ The `renderData` memo now depends on `selectedIdsKey` (joined content string)
  instead of the `props.selectedIds` array ref, so a same-contents selection no longer rebuilds
  all outline geometry. (`viewportTransform` was already memoized in `CanvasStage`, so PERF-04's
  "fresh viewportTransform" no longer applied.)
- **PERF-ARCH-03** ✅ `deleteTree`/`deleteVariant` delete scene/thumbnail rows with
  `removeRecords([ids])` and `recordHistoryEntry` appends with `putRecord`, instead of
  `replaceTable(survivors)` which re-stringified every surviving large blob to diff.
  (`bulkInsertHistory` was found to be dead code — left untouched.)
- **BUG-06** ✅ `pasteElements` runs the result through `constrainAll` before re-copying and
  returning, so the `+24` offset clamps back inside the frame instead of cascading off-canvas on
  repeated pastes. (Also removed two dead imports in the file.)
- **BUG-09** ✅ `handleContextLost` resets `this.size` so `ensureSurface` rebuilds the backing
  dimensions after a same-size context restore.
- **BUG-10** ✅ Both `mount()` early-returns (destroyed mid-load) route through `destroy()`, so the
  context-loss listeners and the canvas are always removed/detached (the loaded-but-unassigned
  typeface is freed first).
- **BUG-17** ✅ `useStepZoom` clears `justPannedRef` at the top of `onPointerDown` (before the
  guards), so a pan whose trailing click never fired can't swallow the next legitimate click.
- **BUG-18** ✅ The `SceneCanvasViewer` stored-image `<img>` got the sibling's
  `max-h-[60vh] max-w-full object-contain` clamp.
- **BUG-08** ✅ `useCanvasPointerEvents` clears `viewport.style.cursor` unconditionally at the top
  of the no-interaction branch, so a `RADIUS_CURSOR` doesn't stick when text editing begins
  mid-hover (which skips the tooling branch).
- **BUG-Bld-1** ✅ `selectStackComponent` and the duplicate inline `onSelectStackComponent` are
  collapsed into one (using the stable `cancelSelectionStable` forward-ref, no eslint-disable).
- **BUG-Ref-3** ✅ `measureImage`/`measureVideo` capture the size then release the element
  (clear handlers, drop `src`, `video.load()`) so a multi-file import doesn't hold decodes alive.
- **PERF-09** ✅ `effectiveSceneGraphJSON` is memoized, so `isFactoryMockGraphJSON` parses the
  graph only when it changes (not every Canvas render), which also stabilizes the ref feeding the
  `resolvedSceneGraphJSON` memo.
- **PERF-UI-04** ✅ `ReferenceGrid`'s grid CSS string is hoisted to a module constant (no longer
  rebuilt per render).
- **PERF-UI-06** ✅ Resolved by the BUG-01b fix — the `allScreens.filter` moved out of JSX into the
  `onRequestEdit` callback, so it only runs when the user opens project settings, not every render.
- **ORG-23** ✅ (partial — see ORG-23b for the leftover) The five click-outside+Escape dismiss
  reimplementations (`CardMenu`, `TopBar` ×2, `FilterButton`, `PreviewShell`) now share one
  `useDismissable(enabled, onDismiss, refs)` hook (`src/lib/hooks/useDismissable.ts`);
  `ReferencesModal` was Escape-only (no outside-click) so it was left as-is. The byte-identical
  empty-state placeholder in `Snapshot` + `SceneCanvasViewer` was extracted to a shared
  `EmptyPreviewPlaceholder`. The two remaining presentational dedups (dashed add tile,
  `useConfirmDelete`) are tracked as ORG-23b.
- **ORG-10** ✅ The 67 dominant 24×24 stroke icons in `icons/index.tsx` now share a single
  `BaseIcon` wrapper instead of each repeating the identical `<svg>` boilerplate (the 22 icons with
  a different viewBox/fill/stroke setup keep their own raw `<svg>`). The conversion was verified by
  snapshotting every icon's `renderToStaticMarkup` output with two prop sets before and after — the
  diff is byte-identical, so no icon's rendering changed.
- **ORG-16** ✅ The engine's text-fit measurement is now injectable. A new
  `engine/mutations/textMeasurement.ts` owns the measurer (`measureTextWidth` + `fontForNode`)
  with a `defaultTextWidthMeasurer` (cached offscreen `<canvas>` when a DOM exists, else the
  character-width heuristic) and a `setTextWidthMeasurer` seam so tests get deterministic widths
  instead of silently diverging from the browser. `elementGeometry.ts` consumes it; the mutation
  signatures are unchanged (no caller ripple).
- **ORG-22** ✅ Gallery section layout no longer writes straight to `localStorage`: it persists
  through the records layer via a new `galleryLayout.repo.ts` (`getGalleryLayout`/
  `saveGalleryLayout`, `gallery_layout` table keyed by `projectId:kind`, read through
  `getRecordById`/`putRecord`). The async load is guarded by a `loadedKeyRef` so the empty initial
  state can't clobber stored layout. Also fixed the stale `useStepZoom` doc comment ("1x..25x" →
  the real `USER_MIN_ZOOM`..`USER_MAX_ZOOM` = 1x..256x).
- **ORG-19** ✅ The `SaveQueue` singleton now lives in `application/persistence/saveQueueProvider.ts`
  (`getSaveQueue` + outbox/runtime wiring + `resetPersistenceSingletons`); infrastructure's
  `createPersistence.ts` only provides the port (`createPersistencePort`/`getPersistencePort` +
  `resetPersistencePort`). `recordStore.ts` and the test seams import from the application provider.
  Dependency direction is now one-way (application → infrastructure), no cycle.
- **ORG-13** ✅ Dead code removed: the `CatalogGrid` one-line re-export was deleted and
  `References.tsx` imports `ReferenceGrid` directly; the unused `previewOpen`/`projectSettingsOpen`
  state (+ setters and the no-op `setProjectSettingsOpen(false)` call) was dropped from
  `useGallery`; and `domain/persistence/contracts.ts` (aspirational `*Repository`/`UnitOfWork`/
  `ScenePatch`/`DependencyEdge` interfaces nothing implemented) was deleted — its only live export,
  `PersistenceRuntime`, now lives in `infrastructure/persistence/runtime.ts` beside
  `detectPersistenceRuntime`.
- **GAMB-03** ✅ The legacy data coercions were removed from the per-node hot constrain path:
  `constrainAll` no longer rewrites the hardcoded `"#e9edf3"` shell background or coerces the
  removed `"container"` type → `"rect"` on every hydrate/undo. Per CLAUDE.md (local-only, no
  migrations) `SCHEMA_VERSION` was bumped 18 → 19 so any stale rows carrying those shapes are
  nuke-and-reseeded. The genuinely-defensive `!shellBackground` default (a missing field, not a
  value migration) was kept.
- **GAMB-05** ✅ The Tree's double-rAF "scroll-after-open-set-flush" is now two layout effects: a
  reveal effect that scrolls synchronously when the node is already visible, else expands ancestors
  and arms a ref; and a second layout effect (keyed on the open set) that scrolls once the
  expansion is committed to the DOM — no rAF needed. (The `CanvasStage` double-rAF is debug-only
  and *correctly* post-paint — it measures rendered DOM rects for alignment logging — so it was
  kept and documented as intentional, not a hack.)
- **GAMB-06** ✅ The context toolbar no longer remounts via a stringified-boolean `key` to replay
  its entrance animation (which threw away the rename field's focus/state). The CSS `animation` +
  `@keyframes context-toolbar-in` were removed; the entrance is driven through the Web Animations
  API in `CanvasToolingLayer.tsx`, replayed on appear / rename-mode swap while keeping the element
  (and its focus) intact.
- **GAMB-09** ✅ Hardcoded layout magic numbers were hoisted to named constants. `CanvasRender.tsx`
  derives the draft-fallback size from `TREE_WIDTH`/`INSPECTOR_WIDTH`/`GAP`/`PANEL_MARGIN`/
  `HEADER_HEIGHT`/new `BOTTOM_BAR_HEIGHT` instead of `window.innerWidth - 320 - 280 - 100`; the
  `bottom = 88` literal now uses `BOTTOM_BAR_HEIGHT`. `CanvasToolingLayer.tsx`'s scattered offsets
  (`36`, `126`/`150`, `38`, `8`, `10`, `4`) are now module-level `CONTEXT_TOOLBAR_*` /
  `SIZE_LABEL_EDGE_MARGIN` / `TOOLBAR_VIEWPORT_PAD` constants (the height no longer redeclared
  inside render).
- **DUP-01** ✅ The blob→data-URL helpers (byte-identical `blobToDataUrl` in
  `generate/engine/image.ts` + `referenceThumbnails.ts`, `readFileAsDataUrl` in `lib/utils.ts`,
  `blobToBase64` in `blobStore/codec.ts`, and the inline reader in `ProjectEditPanel`) now all
  route through a single `src/lib/image/dataUrl.ts`; the old export names are preserved as
  re-exports/delegations so no call site changed. (`image.ts`'s `canvasToBlob`/`measureImage`/etc.
  left in place — builder-adjacent, lower value to move.)

---

## 0. Top Priorities (read this first)

If only a handful of things get fixed, fix these:

1. 🟠 **`draftContentBounds` recomputes a full-document AABB every transient drag frame** (scroll
   indicators only) — depend on a content-bounds signal or skip while interacting. — `PERF-05`
2. 🟠 **`useToolsEditor` returns a fresh 100+-key object every render** — memoize derived values. — `PERF-Bld-1`
3. 🟡 **`findChildAtPoint` recurses into non-containing branches** — inelegant but currently
   returns the correct (deepest containing) child, so low priority. — `BUG-02`

---

## 1. Bugs

### Canvas editor
- 🟡 **BUG-02 — `findChildAtPoint` recurses into non-containing branches.**
  `src/canvas/stage/canvasHitTesting.ts:14-34`. `walk` recurses into all children
  unconditionally instead of gating `walk(node.children)` behind the `isPointInElement` check
  (as `findDropTarget` does). In practice the deepest *containing* child still wins, so this is a
  cleanliness issue, not an active wrong-click bug — low priority.
- 🟠 **BUG-07 — `setZoom` early-return can skip a needed recenter/clamp.**
  `src/canvas/engine/store.tsx:~210-213`. `if (state.zoom === zoom) return state;` returns before
  `zoomViewportAroundCenter` re-clamps offsets, leaving offsets unclamped at min/max while panned.
  Short-circuit only when zoom **and** offsets are unchanged.
### Builder (`generate`)
- 🟠 **BUG-12 — Radius coordinate conversion inconsistent across the three transforms.**
  Edit-projection divides radius by average scale `(sx+sy)/2`
  (`useBuilderInteraction.ts:200-208`), `selectionToSubjectCoords` multiplies by `(sx+sy)/2`
  (`:241-245`), but `paintCropsCanvas` uses only the X-axis ratio (`drawing.ts:237-240`). On a
  non-uniformly scaled image the painted radius won't match the saved one. Use one shared radius
  helper.
- 🟡 **BUG-Bld-2 — Stale-closure `referenceId` in the loader effect.**
  `useToolsEditor.ts:1177-1252`, deps `[item.id]` only (eslint-disabled). If `referenceId`
  changes without `item.id`, the stale value is used for the whole async load. Add it to deps.

### References / blobs
- 🟠 **BUG-Ref-1 — Object-URL lifecycle split across two effects → double-revoke / transient
  broken images.** `Lightbox.tsx:52-54` & `:29-50`, `ReferenceDetailModal.tsx:152`,
  `useReferenceLibrary.ts:147-205`. The same URLs can be revoked twice (harmless) and a replaced
  cover URL can be revoked while an `<img>` still points at it for a frame. Own each URL's
  lifecycle in one place; defer revocation of replaced URLs by a microtask.
- 🟠 **BUG-13b — `useReferenceUrl` never revokes; relies on a session cache cleared only on route
  exit → unbounded memory growth.** `useReferenceUrl.ts` + `referenceUrlCache.ts:75`. Add an LRU
  cap that revokes least-recently-used URLs past N entries.
- 🟡 **BUG-Ref-2 — `IntersectionObserver` observes a possibly-null element captured at effect
  time.** `useReferenceUrl.ts:62-83`. Ref callbacks fire during commit, effects after; first
  render falls back to eager load. Use `useLayoutEffect` keyed on the element, or store it in state.

### Architecture / persistence
- 🟡 **BUG-ARCH-5 — IndexedDB `listRecords` upper bound is fragile.**
  `src/infrastructure/persistence/indexedDbPersistence.ts:42`. `IDBKeyRange.bound([table],
  [table, []])` relies on array-sorts-after-string key ordering — works today, undocumented,
  breaks on any non-string id. Use an explicit `"￿"` sentinel and add a conformance test.

---

## 2. Performance

### Canvas Skia render / drag loop (hottest path)
- 🟡 **PERF-01 — `framesEqual` compares the rebuilt fields by reference.**
  `src/canvas/stage/skiaToolingAdapter.ts:85-103` (used `:224`). Deliberately left as a cheap
  reference-comparison safety net: now that `renderData` keeps a stable ref when its content is
  unchanged (PERF-04), the render effect doesn't fire on unrelated re-renders, so the guard is
  effective without a deep-value comparison (which would add cost on every drag frame).
- 🟠 **PERF-05 — `draftContentBounds` recomputes a full-document AABB every transient drag
  frame.** `CanvasStage.tsx:359-362`, deps `[draftMode, state.document]` (changes ~60fps via
  `setDocumentTransient`) — purely for scroll indicators. Depend on `rootIds` + a content-bounds
  signal, or skip while interacting.

### Canvas tree / inspector / equality
- 🟠 **PERF-06 — Tree re-serializes selection + whole structure every render.**
  `src/canvas/shell/Tree.tsx:266` (`JSON.stringify(selectedIds)` per render) and `:200-204` +
  `treeHelpers.ts:241-292` (`structureKey` serializes the entire tree as effect deps), on
  drag-hover and every search keystroke. Use reference comparison for selection; a cheap
  incremental structural hash for structure.
- 🟠 **PERF-07 — `TreeRow` recursive component is not memoized + gets fresh inline closures.**
  `src/canvas/shell/tree/TreeRow.tsx:10`, `Tree.tsx:318,536`. Every `Tree` render re-renders the
  whole visible subtree. `React.memo` + `useCallback` the row callbacks.
- 🟠 **PERF-10 — `Inspector` registers six separate bridge subscriptions.**
  `src/canvas/shell/Inspector.tsx:81-86`. Six `useEditorBridge` selectors each run equality on
  every ~60Hz publish during drag. Collapse into one selector returning a stable tuple with a
  custom `isEqual`.
- 🟡 **PERF-11 — `buildSnapCandidates` scans all nodes when `parentId` is undefined.**
  `engine/snapping.ts:74-83`. Computes an AABB (ancestor walk) per node, O(n) per snap build.
  Require an explicit parent scope or memoize AABBs.
- 🟠 **PERF-12 — Materialization does an awaited DB scene read per component node on the editing
  path.** `canvasMaterializer.ts:19-28,159-170` + `useDeferredPersistence.ts:87-94`.
  `flushPendingSave` always re-materializes (no structure-key guard) and awaits
  `readSceneByOwner` sequentially per node. Batch-load or compare against the synchronous
  `recordStore` cache; drop materialization from `flushPendingSave`.

### Architecture / storage
- 🟡 **PERF-ARCH-05 — Redundant `idx_records_tbl` index.** `db.rs:72-78`. The PK `(tbl,id)`
  already covers the `tbl` prefix; the extra index is write amplification.

### Shared UI / pages
- 🟠 **PERF-UI-01 — No route-level code splitting.** `src/App.tsx:3-12`. Every page (canvas,
  builder, system-design…) is statically imported; their engine trees load on the Landing page.
  `React.lazy` + `Suspense`; canvas and Generate are the highest-value splits.
- 🟠 **PERF-UI-02 — ~2000-line mock-data builder ships in the runtime bundle.**
  `canvasMocks.ts` (480) statically imports `screenMockHierarchy.ts` (1043), pulled in by
  `seed.ts`, `useMockScene.ts`, `CompareVersionsModal`, `VersionSideCard`. Dynamic `import()` to
  keep it out of the editing runtime.
- 🟠 **PERF-UI-03 — Project thumbnail rasterization runs on the main thread, sequentially.**
  `projectThumbnail.ts:39-43,88-93`. `renderProjectThumbnailDataUrl` (`toDataURL`) is sync and
  looped with `await` per project — a settings toggle stalls the UI proportional to project
  count. OffscreenCanvas/worker or at least `requestIdleCallback` between projects.
- 🟠 **PERF-UI-05 — `CanvasScrollbars` rAF settle loop re-measures for 220ms every pan frame.**
  `CanvasScrollbars.tsx:101-111`. `signal` changes each frame during pan, restarting the loop —
  a permanent measure loop. Only run on zoom-step changes.

### Builder / references
- 🟠 **PERF-Bld-1 — `useToolsEditor` returns a fresh 100+-key object every render.**
  `useToolsEditor.ts:1308-1440` + unmemoized derived values (`:1293-1304`). Any state change
  re-runs the whole view. Memoize derived values; consider splitting the returned surface.
- 🟠 **PERF-Bld-2 — Painter effects depend on `toolPan` but read pan from the DOM.**
  `useBuilderCanvasPainter.ts:128-148,168-182` vs `drawing.ts:154-182` (`getBoundingClientRect`).
  Every pan tick triggers a full repaint of both canvases. Drive repaint off a resize signal.
- 🟡 **PERF-Bld-3 — Component image cache compares full base64 `dataUrl` strings.**
  `useBuilderCanvasPainter.ts:85-103`. Key by a cheap version token (`id+variantId`) instead.
- 🟡 **PERF-Ref-1 — No virtualization on the catalog grid.** `ReferenceGrid.tsx:51-84`. Every
  `ReferenceCard` (458-line component) mounts. Virtualize / render-on-visible.
- 🟡 **PERF-Ref-2 — Stack preview decodes every cut blob up-front.**
  `ReferenceDetailModal.tsx:1223-1250`, `Lightbox.tsx:238-254`. N blob reads before anything
  shows. Load background + selected cut first; lazy-load the rest.

---

## 3. Gambiarras (hacky workarounds that mask the real problem)

- 🟠 **GAMB-01 — Dead Canvas2D tooling-draw functions hand-synced with the Skia path.**
  `canvasToolingRenderer.ts:293-381` (`drawOutlineRect`, `drawOutline`, `drawResizeHandles`,
  `drawRadiusHandles`). The factory only ever builds Skia (`toolingRendererFactory.ts` ignores its
  `_kind` and returns `createSkiaToolingAdapter()`; `ToolingRendererKind` is single-member
  `"skia"`), and `skiaToolingAdapter.ts` has its own `drawOutline`/`drawResizeHandles`/
  `drawRadiusHandles`. The Canvas2D draw fns are referenced only by their own unit test — they have
  drifted from the live Skia ones. **Note:** the *geometry* helpers in the same file
  (`getRadiusHandlePositions`, `elementToViewportBox`, etc.) ARE live and shared — delete only the
  dead `draw*` functions (and their test), not the whole file. (See also DUP-04, INC-03.)
- 🟠 **GAMB-02 — `canContainChildren` hardcodes `type === "rect"` instead of element-definition
  capabilities.** `canvasHitTesting.ts:36-38` (and the drop logic in `canvasToolingRenderer`).
  Bypasses `getElementDefinition(type).capabilities` used elsewhere; any new container type
  silently can't accept drops.
- 🟠 **GAMB-04 — DOM querying by `data-*` instead of a ref registry (+ reimplemented
  `CSS.escape`).** `Tree.tsx:88-103` (`querySelector('[data-tree-node-id=…]')` +
  `escapeCssAttributeValue`) and `canvasAlignmentLog.ts:94-99` (`querySelectorAll` linear scan +
  `getComputedStyle` per element). Maintain a `Map<id, HTMLElement>` ref registry.
- 🟠 **GAMB-07 — Hand-rolled color parser silently returns black on unrecognized input.**
  `skiaToolingAdapter.ts:1118-1142`. Ignores hsl/named/8-digit hex, paints wrong-colored chrome
  rather than failing. Use `ck.parseColorString`.
- 🟠 **GAMB-08 — Unpersisted "render mode" UI toggles disconnected from settings.**
  `Toolbar.tsx:193,287-296` and `inspector/ShellTab.tsx:75-77,193-205` (`shapeRenderModes`) are
  throwaway local state that write nowhere; per CLAUDE.md they belong in `canvas.toolDefaults`.
  Wire to settings or remove.
- 🟡 **GAMB-10 — Unmemoized inline search-source closures + non-`useCallback` zoom setter.**
  `Canvas.tsx:597-617,620-640,660-665`. Rebuild the entire element/tool search list and recreate
  `setActiveZoom` each render. Memoize.
- 🟡 **GAMB-Bld-1 — Magic zoom multiplier `1.14` hardcoded.** `useBuilderViewport.ts:57`. The main
  canvas drives zoom steps from settings; extract a named constant at minimum.
- 🟡 **GAMB-Bld-2 — `setTimeout(250)` persist debounce + `4000`ms message timer as raw
  literals.** `useBuilderComponents.ts:116`, `useToolsEditor.ts:1012`. The 250ms debounce
  reimplements the coalescing-save concept `SaveQueue` already solves. Name the constants;
  consider `requestIdleCallback`.
- 🟡 **GAMB-Bld-3 — Inline SVG data-URL cursors with magic hotspots.**
  `ToolsEditorView.tsx:71-76` (`LAMA_BRUSH_CURSOR`), `useBuilderInteraction.ts:45`
  (`RADIUS_CURSOR`). Centralize cursor constants (the bend-cursor hotspot is duplicated knowledge
  from the main canvas).
- 🟡 **GAMB-Bld-4 — Inline id generation `Math.random().toString(36).slice(2,9)` ×4.**
  `useToolsEditor.ts:930,1083`, `componentModel.ts:38`, `variants.ts:16`. One `makeId(prefix)`.
- 🟡 **GAMB-Ref-1 — `requestIdle` falls back to `setTimeout(cb,1)` with inline `window` casts in
  two places.** `routes/references/lib/utils.ts:11-22`. One typed `idle.ts` util.
- 🟡 **GAMB-Ref-2 — `'￿'` sentinel for IndexedDB range delete.**
  `indexedDbReferenceBlobStore.ts:148-152`. Classic max-code-unit trick; breaks on higher
  surrogates. (Same class as BUG-ARCH-5.)
- 🟠 **GAMB-Ref-3 — Business logic encoded as a 5-level `??` ladder in the render body.**
  `ReferenceDetailModal.tsx:187-192` (`effectiveStackId`) + `:206-209`. Extract to a pure helper
  in `stackHelpers.ts` (which already has `defaultStackSelectionId`).
- 🟠 **GAMB-UI-1 — Hardcoded `type="desktop"` for every global component (violates the
  snapshot-size rule).** `GlobalComponentsPage.tsx:116,164,173-180`. `canvasHref`, `Snapshot`,
  `FastEditModal` force a desktop frame onto possibly mobile/tablet components. Derive `type`
  from the source project/screen.
- 🟡 **GAMB-UI-2 — Four different focus-delay timers.** `NewComponentModal.tsx:68` (60),
  `NewScreenModal.tsx:47` (60), `ProjectSettingsModal.tsx:52` (80), `AddReferenceModal.tsx:199`
  (rAF). Standardize on a shared `useAutoFocus(ref, isOpen)`.
- 🟡 **GAMB-UI-3 — `FastEditModal` reads `getBoundingClientRect()` during render to position a
  dropdown (+ `zIndex:9999`, hover via `style.background` mutation).**
  `FastEditModal.tsx:394-409,442-447`. Compute position in a layout effect into state; use a
  `hover:` class.
- 🟠 **GAMB-UI-4 — `" Canvas"` name-suffix magic special-case to pick the scene subject.**
  `FastEditModal.tsx:328` and `scenes.repo.ts:532-548` (`subjectNodeForDocument` via
  `root.name.endsWith(" Canvas")`). Propagation correctness hinges on a display-name suffix —
  rename/locale-fragile. Use an explicit structural flag on the node.
- 🟡 **GAMB-UI-5 — `Modal` scroll-lock via module-level mutable globals.**
  `Modal.tsx:5-9,20-46`. Shared `let openModalCount/previousBodyOverflow` + scrollbar-comp magic;
  fragile if two modals mount in the same tick. Guard the 0→1 transition or use a scroll-lock hook.
- 🟡 **GAMB-UI-6 — Dead device-switcher control + unused `mock` field.**
  `PreviewShell.tsx:18-22,42-44` (`deviceId`/`deviceActive` never change the preview size),
  `NewProjectPage.tsx:147-151` (`mock` duplicates `value`, never read). Wire or remove.
- 🟠 **GAMB-ARCH-1 — `setTimeout(120ms)` thumbnail debounce is a second uncoordinated scheduler.**
  `thumbnailQueue.ts:12-33`, `projectThumbnail.ts:19-56`. Parallel to the SaveQueue; can race
  with shutdown and drop a final thumbnail. Reconcile with the single idle drain.
- 🟠 **GAMB-ARCH-2 — Toolbar layout force-overridden inside the settings resolver.**
  `domain/settings/resolve.ts:58-64`. `resolveSettingsLayers` unconditionally replaces
  `canvas.tools.toolbar` with defaults ("never let stale persisted data override it") — silently
  discarding any customized layout the user saved. Migrate stale rows instead of clobbering.

---

## 4. Inconsistencies

- 🟠 **INC-01 — Three divergent scene-persistence hooks with different flush contracts.**
  `useDeferredPersistence.ts`, `useVersionScenePersistence.ts`, `useHtmlCanvasDocument.ts`. Each
  hand-rolls a debounced fire-and-forget `saveScene` with different debounce values (300 vs 350)
  and its own owner-change/flush semantics. BUG-03/BUG-04 (the dropped-edit symptoms) were patched
  individually in two of them, but the duplication remains: consolidate into one parameterized hook
  with a single flush-on-owner-change-and-unmount contract so the third hook
  (`useVersionScenePersistence`, whose own comment calls it "a thin clone of the Current window's
  save path") can't drift again.
- 🟠 **INC-02 — Four copies of `cloneDocument`; reparent geometry duplicated verbatim.**
  `engine/mutations/coreUtils.ts:12` exports it, yet `elementOrder.ts`, `elementContent.ts`,
  `elementGeometry.ts` each redefine a local copy; the "re-derive local center after reparent"
  math is copy-pasted between `reparentElements` and `moveElementToParent`
  (`elementHierarchy.ts`). Import the shared one; extract `computeLocalPositionAfterReparent`.
- 🟠 **INC-03 — Three independent copies of handle-point geometry that must stay in sync.**
  `skiaToolingAdapter.ts:566-578` (`resolveSkiaHandlePoints`), `canvasToolingRenderer.ts:335-347`
  (`resolveHandlePoints`), `canvasHitTesting.ts:240-256` (edge midpoints). If they drift, handles
  render where they can't be grabbed. Extract a single `handlePointsForBox(box)`.
- 🟡 **INC-04 — Inspector prop-or-bridge resolution copied ~14×; rest of shell uses bridge
  only.** `Inspector.tsx:89-95`. Extract a `useResolvedEditor(editorProp)` hook.
- 🟡 **INC-05 — Element-creation options assembled two different ways.**
  `useCanvasPointerEvents.ts:229-244` inlines what `elementCreationOptions()`
  (`canvasInteractionHandlers.ts:79-88`) already builds. Reuse the helper.
- 🟠 **INC-06 — Mixed Portuguese / English UI copy, arbitrary per-string** (across the whole app).
  Canvas: `Inspector.tsx` ("Inspetor"/"Tamanho"), `CanvasRender.tsx:706` ("Carregando cena…"),
  `ElementTab.tsx` flips "Position"/"Tamanho" in one component. References:
  `Inspector.tsx`/`ImportModal.tsx` ("URL de origem", "Voltar", "Manter os dois") vs English in
  `ReferenceDetailModal`. Pages: `NewProjectPage` ("Etapa…", "Como vai se chamar?"),
  `DetailPage` ("Comparar", "Componente"), PT in `aria-label`s (`PreviewShell.tsx`). CLAUDE.md
  permits PT only for **visible** copy and requires consistency. Pick one interface language; keep
  non-visible attributes English.
- 🟡 **INC-07 — `InstanceDeleteModal` still uses the controlled `open`-prop pattern**
  (`InstanceDeleteModal.tsx:24`) while most modals are forwardRef/imperative. Minor: a controlled
  modal is fine; only flagged for consistency. (The previously broken-by-usage `FastEditModal`/
  `ConfirmActionModal` call sites are fixed — see the Resolved section.)
- 🟡 **INC-08 — Two parallel design systems / token sets.** `components/ui/button.tsx` + `card.tsx`
  (shadcn/cva, `bg-card`, `data-slot`) appear unused by feature code; everything else hand-writes
  buttons/cards with `var(--surface)`/raw `rgba`/`text-[12px]`. Pick one; adopt the primitives or
  delete them.
- 🟡 **INC-09 — Icon sourcing split** between the 88-component custom registry
  (`components/icons/index.tsx`) and ad-hoc `lucide-react` imports (`FilterButton`, `TopBar`,
  `ReferenceCard`) and raw inline `<svg>` (`PreviewShell.tsx:132-143`). One icon source.
- 🟡 **INC-10 — `Tab` union missing the used `"elements"` value.**
  `application/gallery/useGallery.ts:30` vs `GalleryPage.tsx:195` branching on `tab ===
  "elements"`. Add it to the union.
- 🟡 **INC-Bld-1 — Pointer handlers are plain functions, viewport handlers are `useCallback`** in
  the same file. `useBuilderInteraction.ts:282-522` vs `cancelSelection`/`toOriginalCoords`. Also
  two different "tool requires crop → fall back to move" implementations
  (`useToolsEditor.ts:503-514` vs `useBuilderInteraction.ts:163-168`).
- 🟡 **INC-Bld-2 — Naming: `toolZoom`/`toolPan` (builder) vs `zoom`/`offsetX/offsetY` (canvas)** for
  the same concept — makes the shared-helper boundary harder to follow.
- 🟡 **INC-Ref-1 — Three parallel "inspector" implementations with divergent draft-reset logic.**
  `Inspector.tsx` & `InspectorPanel.tsx:174-182` (effect keyed on id) vs
  `ReferenceDetailModal.tsx:494-499` (`prevIdRef` guard). One shared `useDraftField` hook.
- 🟡 **INC-ARCH-2 — Adapters have no shared conformance suite; only `memoryPersistence.test.ts`
  exists.** The "reference implementation the other adapters must match" is only spot-checked.
  Add a shared adapter conformance test parameterized over memory/indexeddb/sqlite.
- 🟡 **INC-ARCH-3 — `SceneOwnerType` is `"variant"` only, but `OwnerType` still models
  `"project"|"screen"|"component"`** with dead `if (parentOwner.ownerType !== "variant") return`
  branches. `schema.ts:112-116`, `dependencyIndex.ts:49-65`. Trim the vestigial branches.

---

## 5. Organization / Clean Architecture

### Oversized files mixing responsibilities
- 🟠 **ORG-01 — `Toolbar.tsx` (1294 lines) embeds an entire unrelated "Actions" app.**
  `canvas/shell/Toolbar.tsx:424-1146`. Tool selection + zoom also contains large mock datasets
  (`MOCK_TMB_ASSETS`, `MOCK_IMAGES`, `MOCK_ICONS`, `MOCK_CONVERSATION`), an asset/icon library
  browser, an AI chat panel with voice-recording UI, and a checklist editor. Extract
  `ActionsPanel` + mock data.
- 🟠 **ORG-02 — `CanvasRender.tsx` (1028 lines) bundles 10+ surface variants + the zoom control;
  `ZoomControl` is re-imported back into `Toolbar.tsx`** (near-circular shell dependency). Split
  surfaces into `shell/surfaces/`; move `ZoomControl` out.
- 🟠 **ORG-03 — `skiaToolingAdapter.ts` (1154 lines) is a god-file** mixing WebGL lifecycle,
  surface/paint/font pooling, color parsing, label-geometry constants, and ~15 free draw
  functions. Split pure drawers into `skiaPrimitives.ts` and color into `skiaColor.ts`.
- 🟠 **ORG-04 — `CanvasToolingLayer.tsx` (1154 lines): editor business logic bolted onto the
  geometry/render layer.** `:637-795` embeds the full context-toolbar UI, rename state, and engine
  actions (`duplicateElements`, `deleteElements`, `updateElementStyles`,
  `fitTextElementToContent`). Extract a `ContextToolbar` fed by props.
- 🟠 **ORG-05 — Command/mutation logic lives directly inside the Tree component.**
  `Tree.tsx:702-803` (`TreeContextMenu`) calls engine mutations and dispatches `commitDocument`
  inline. Move behind a `useCanvasCommands(editor)` application hook.
- 🟠 **ORG-06 — `useToolsEditor.ts` (1441 lines) is a god-hook.** Owns navigation, persistence
  orchestration, crop rasterization, auto-detect ML orchestration, upload, keyboard shortcuts, and
  the whole returned surface. Heavy logic (`saveSelection:859-975`, `autoDetect:1024-1133`,
  `promoteToRoot:630-691`) belongs in the engine. Extract `useBuilderNavigation` +
  `useBuilderCutOperations`; keep `useToolsEditor` a thin composition root.
- 🟠 **ORG-07 — `ToolsEditorView.tsx` (932 lines) mixes ML orchestration with layout.**
  `runProcessing`, `applyLamaMask`, `commitDraw` (`:256-306`) are async business logic inside the
  view. Lift into `useBuilderProcessing`.
- 🟠 **ORG-08 — `ReferenceDetailModal.tsx` (1293 lines) does 8 jobs** (modal shell, group gallery,
  carousel, stack composite, roots gallery, tree, 3 detail panels, + pure helpers). Extract
  `StackCompositeView`, `StackRootsGallery`, `StackTreeRows`, the detail panels, and reuse the
  helpers already in `stackHelpers.ts`.
- 🟠 **ORG-09 — `DetailPage.tsx` (839 lines) mixes two pages + 10 sub-components + inline business
  logic** (FastEdit href `:209-214`, canvas-link `:686-688`), and the two views duplicate ~120
  lines of aside/tab/search/grid scaffolding. Extract a shared `DetailSidebar`; split the two
  route bodies; move href building into the hooks.
- 🟠 **ORG-11 — `AppSettingsModal.tsx` (886 lines): 6 tabs + settings-tree reducers in a modal
  file.** `:625-708` (`updateInheritParentBackground`, `updateKeyCommand`…) is domain logic that
  belongs in `src/domain/settings/`. Split tabs; move reducers.


### Layering / boundary violations (vs the clean architecture CLAUDE.md describes)
- 🟠 **ORG-14 — Domain imports framework/UI and storage layers.** `domain/settings/types.ts:1,6`
  & `commands.ts:1` import `@/canvas/tools` + `@/canvas/engine/types`; `domain/persistence/
  contracts.ts:1-10`, `system-design/resolve.ts:4`, `defaults.ts:11` import `@/lib/storage/
  schema`. Domain is supposed to be zero-I/O / no-framework. Move the shared types into `domain`
  and have storage/canvas import **from** domain.
- 🟠 **ORG-15 — Engine store performs `localStorage`/`window` I/O directly inside the
  reducer/effects.** `engine/store.tsx:483-495,509-522` reads/writes `localStorage` +
  `window.dispatchEvent` on hydrate/commit — untestable without a DOM. Inject a draft-cache port.
- 🟠 **ORG-17 — Canvas hook reaches directly into the storage cache; materializer is an
  orchestration use-case living in the UI folder.** `useSubjectCanvasWindow.ts:4,47-50` &
  `Canvas.tsx:283,367` copy the whole scenes table via `peekTable`; `canvasMaterializer.ts`
  orchestrates `saveScene`+`readSceneByOwner`+4 component-repo writes from `canvas/`. Move storage
  access behind an application hook; relocate the materializer to `application/`.
- 🟠 **ORG-18 — Navigation is gated on awaited materialization, contradicting fire-and-forget
  persistence.** `useDeferredPersistence.ts:66-95` returns the materialization promise;
  `useCanvasNavigation.ts:40,117` & `Canvas.tsx:697` do `flushPendingSave().finally(navigate)`,
  delaying route changes behind a tree walk. Navigate immediately; let the queue handle it.
- 🟠 **ORG-20 — Graph subtree merge/linkify/materialize (Versioning.md domain logic) lives in a
  storage repo.** `scenes.repo.ts:234-435` (`replaceComponentSubtreeInGraph`,
  `linkifyChildComponentsInGraph`, `materializeInstancesInGraph`). These are pure graph transforms
  — move into `domain/`, leaving the repo to orchestrate persistence.
- 🟠 **ORG-21 — Business logic in UI components.** `FastEditModal.tsx:311-384`
  (`buildSceneFromHtmlCanvas` scene-graph transform → move to `lib/canvas/`);
  `useReferenceLibrary.ts:332-412` (`createFrameGroup` does file extraction + blob save + measure
  + group construction → move to an application use-case).

### Duplicated UI primitives (shared layer)
- 🟡 **ORG-23b — Remaining shared-UI dedup.** Two presentational duplicates left after the
  `useDismissable` + empty-state extraction (ORG-23, Resolved): the "dashed add tile"
  (`LandingPage` `AddProjectCard` vs `GlobalComponentsPage` `AddComponentCard` — they share the
  inner dashed tile but differ in wrapper `Link`/`button` + caption block) and the duplicated
  delete-confirm copy across DetailPage/Gallery/GlobalComponents (`useConfirmDelete`). Both carry
  visual/behavioral risk, so they're left for a focused pass.

---

## 6. Code Duplication Across the Canvases / Viewers

> Context: the codebase already extracted real shared layers — `@/domain/zoom` (zoom range,
> `zoomToCursorOffset`, `clampPanToCenter`), `@/domain/canvas/geometry` (`clamp`, `intersectBox`,
> `boxFromPoints`, `boundsOfPoints`), and the `useStepZoom` hook shared by all snapshot viewers.
> The builder and snapshot viewers already consume these, so the **core scalar/box/pan math is
> NOT duplicated**. What remains is duplication in the higher-level DOM/canvas layers.

Ranked by code volume × divergence risk:

- 🟡 **DUP-02 (partial) — the generic `buildForest<T>` now lives in `src/lib/tree.ts` and
  `buildComponentTree` uses it.** The other two cited sites are NOT a clean fit and were left as-is:
  `AddReferenceModal.groupCutsByParent`/`collectCuts` carries a `"__root__"` sentinel + rootId
  exclusion, and `SceneCanvasInspector.flattenSceneTree` flattens an already-nested tree (no
  parent grouping, no cycle guard) — forcing them onto `buildForest` would add risk, not clarity.
- 🟠 **DUP-03 — File-extension → format/type parsing reimplemented 4×.**
  `generate/engine/image.ts:54` (`inferType`), `routes/references/lib/utils.ts:66` (`inferType`,
  diverges on return type), `lib/utils.ts:23` (`fileFormatLabel`),
  `lib/references/mediaTypes.ts:19` (`extFromName`). One `extFromName` + one `inferImageType` in
  `mediaTypes.ts`.
- 🟠 **DUP-04 — Canvas-overlay drawing primitives split between two Canvas2D toolkits.**
  `generate/engine/drawing.ts` (`roundedRectPath` hand-rolled, `drawCircleHandle`,
  `drawSquareHandle`, `drawLabelBadge`, `drawSizeBadge`, `hexToRgba`) vs
  `canvas/stage/canvasToolingRenderer.ts:291-381` (`drawResizeHandles` via native `ctx.roundRect`,
  `drawRadiusHandles`, `drawOutlineRect`). Same intent (square/circle handles, rounded rect, size
  badge, stroke ÷ zoom). Share the primitives in `src/lib/canvas2d/draw.ts`; keep styling local.
  (Related: GAMB-01's dead 2D renderer is a third copy.)
- 🟠 **DUP-05 — Selection hit-testing duplicates handle hit logic.**
  `generate/engine/hitTesting.ts:16-59` (`selectionHitTest`: radius→corners→edges→body,
  `HANDLE_HIT_AREA/2/zoom`) mirrors the canvas tooling hit-test order; the handle-center math
  (`geometry.ts:68-93`) overlaps `resolveHandlePoints`/`edgeMidpoint`
  (`canvasToolingRenderer.ts:331-347`). Unify the handle-position model (ties into INC-03).
- 🟠 **DUP-06 — Inline scene-tree DOM renderer duplicated between viewer and inspector.**
  `components/screen/SceneCanvasViewer.tsx` (`SceneView:94`) vs `SceneCanvasInspector.tsx`
  (`SceneRenderer:95`) render the same `SceneNode` tree to absolutely-positioned divs with
  identical style mapping; `StackView`/`StackRenderer` likewise share the `%`-positioned mapping.
  Extract `<SceneNodeBox>` / `<StackLayerBox>` presentational components; the read-only viewer
  composes the interactive one with handlers disabled.
- 🟡 **DUP-07 — `loadStackPreview` / `buildStackTree` / `releaseStackUrls` still duplicated in
  `ReferenceDetailModal`.** `ReferenceDetailModal.tsx:1223-1293` keeps in-file copies of
  preview-loading, tree-build, and URL release that diverge from the canonical
  `stackHelpers.ts:61-168`. Delete the in-file copies; import from `stackHelpers`. (The dead
  `Lightbox` copy was already removed — see Resolved.)
- 🟡 **DUP-08 — Two viewport pan/zoom orchestration hooks over the same shared math.**
  `generate/hooks/useBuilderViewport.ts` (continuous multiplicative) vs
  `components/screen/useStepZoom.ts` (discrete steps) — the main canvas has a third
  (`useViewportControls`/`useCanvasPointerEvents`). Both anchor wheel-zoom at the cursor, gate pan
  on overflow, re-clamp on resize. Extract a `useCursorAnchoredWheelZoom`/`usePanGesture`
  primitive both compose (full hook merge is hard due to the deliberate continuous-vs-discrete
  split).
- 🟡 **DUP-09 — `hexToRgba` / `hexToRgb` hex parsing duplicated.** `generate/engine/drawing.ts:16`
  vs `canvas/stage/CanvasGridOverlay.tsx:24`. Neither handles 3-char shorthand. One
  `parseHexColor` in the shared canvas2d/color module.
- 🟡 **DUP-10 — Rect-intersection / axis-overlap math reimplemented in the canvas engine instead
  of `@/domain/canvas/geometry.intersectBox`.** `canvas/stage/canvasToolingUtils.ts:59`
  (`rectsIntersect`), `canvas/editorEngines.ts:258-262` (`verticalOverlap`/`horizontalOverlap`).
  Blocked by the `{width,height}` vs `{w,h}` shape divide — see DUP-11.
- 🟡 **DUP-11 — Multiple `Rect`/`Box`/`Vec2`/`Point` vocabularies (structural root cause).**
  canvas `Rect{width,height}`, domain `Box{w,h}`, builder `CropBox{w,h,r}`, `HtmlCanvasBounds`.
  This is **why** DUP-01/04/05/10 can't trivially share code — every shared helper must pick a
  vocabulary or convert. Long-term: one canonical `Rect`/`Vec2` in `@/domain/canvas/geometry`
  with thin adapters.

### Explicitly verified NOT duplicated (avoid false positives)
- Viewport **clamp** math is already shared (`clampPanToCenter`, `zoomToCursorOffset` in
  `@/domain/zoom`); the canvas's `clampAxisOffset` is the documented center-origin counterpart.
- Zoom range constants have a single source (`@/domain/zoom`).
- The references **Lightbox is a plain `object-contain` `<img>` viewer** with no pan/zoom canvas —
  it does not duplicate viewport math (only the tree-build pattern, DUP-02).
- Canvas vs builder **hit-testing** share intent but are genuinely different (rotated
  `ToolingBox` + cursor generation vs axis-aligned `CropBox`) — not worth merging.
- Snapshot/thumbnail **propagation** is a single pipeline (the issue there is ARCH, not duplication).

---

## 7. Suggested Sequencing

1. **Correctness first (low effort, high impact):** INC-01 (consolidate the remaining persistence
   hooks into one), BUG-15/16, then BUG-02 (low).
2. **Architecture — finish the save-path cleanup:** PERF-ARCH-03 (`removeRecords`/`putRecord` on
   delete-tree/delete-variant). (Propagation off the critical path + deterministic O(1) lookups +
   memoized index are done — see Resolved.)
3. **Delete remaining dead weight:** ORG-13.
4. **Hot-loop perf:** PERF-01..05 (Skia per-frame allocations). (PERF-08 — stop stringifying whole
   documents — is done; see Resolved.)
5. **Extract shared utilities (mechanical, well-scoped):** DUP-01, DUP-02, DUP-03, then DUP-06,
   DUP-09, ORG-23.
6. **Layering / god-file splits (larger refactors):** ORG-01..11, ORG-14..21.
7. **Polish:** INC-06 (language), GAMB cleanup, the `Rect`-vocabulary unification (DUP-11) that
   unblocks the remaining geometry sharing. (GAMB-03/05/06/09 — legacy migrations in the hot path,
   timing-hack layout effects, the remount-to-replay-animation key, and the hardcoded layout magic
   numbers — are done; see Resolved. Remaining GAMB polish: 04, 07, 08, 10, the Bld/Ref/UI/ARCH
   sub-items.)
