# Canvas & Inspector Audit — July 2026

Status: **in progress** — produced by a four-agent deep audit (inspector vs
docs, engine core, stage/interaction, Figma/paper.design gap analysis) on
2026-07-05. Every finding was verified against the actual code before being
listed; file:line references were correct at audit time.

Work one item at a time: fix, verify, commit, next. Do not batch unrelated
items into one commit.

Paths are relative to `apps/desktop/` unless noted.

## Progress (2026-07-08)

Items marked **✅ DONE** below were fixed one-per-commit (typechecked, and
unit-tested where tests exist). Completed so far:

- **High:** H1, H2, H3 — all done.
- **Medium:** M1–M14 — all done.
- **Low:** L1–L15, L17–L22 done; L16 deferred (needs new rebindable commands);
  L23 reviewed, no change.
- **Perf:** P3, P5, P7, P8, P10.
- **Doc-divergence:** D1 (decided: store radius verbatim, clamp at render —
  closed L7, unblocked F4), D2 (with M12), D8 (with M13).
- **Fidelity:** F1, F2 (shadows half), F5, F6.
- **Parity:** G1 (context menu; toolbar/inspector surfaces pending), G2, G6
  (shared clipboard + active-pane shortcut gating), G7, G15 (with M11).

Full-audit pass (2026-07-08, fix-order): resuming from step 6 leftovers.
Completions this pass:
- **Bugs:** M11 (no-fill state; closes G15), M13 (tile motif from natural size ×
  scale%; closes D8), M1 (resize/radius honor ancestor rotation), M2 (path-edit +
  vector coords through the full element transform), M8 (text-editing layout honors
  full typography), M9 (rotated text-editing overlay + pointer mapping), L22 (paste
  into source parent).
- **Perf:** P5 (grid buffer), P10 (draft scrollbar rescan), P7 (per-word text-fit
  wrapping), P8 (shared commit listener).
- **Fidelity:** F6 (toolbar vertical clamp), F5 (adaptive path tessellation), F1
  (resize flip/mirror), F2-shadows (drop-shadow on clip-path shapes).
- New shared geometry helpers in `bounds.ts`: `canvasPointToParentContentSpace`,
  `elementLocalToCanvas`, `canvasToElementLocal`.

NB: the canvas geometry/overlay/resize changes are typechecked + unit-tested but
NOT runtime-verified here (no `bun`); verify nested/rotated resize, radius,
path-edit, rotated text editing, and resize-flip in-app.

**Remaining (2026-07-10, after the P1 pass):**
- **Architecture perf (need runtime measurement):** P4's selector-subscription
  refactor (partially done — see the item), P9 (spatial index — audit says not
  urgent). P1 landed 2026-07-10 (gesture-scoped projection).
- **Blocked on the SVG render target:** F3, G13, F2-borders.
- **Deferred (needs new rebindable commands):** L16.
- **Parity features:** G3 (font management — needs queryLocalFonts/Rust
  verification), G9 (full color picker), G10 (rich text — its own multi-phase
  effort).
- Done in the 2026-07-09 pass: G1 (fully), G4, G5, G6, G8, G11, G12, G14, F4,
  D3–D7, P2, P6, P4-partial — see the item entries. All typechecked and
  unit-tested where tests exist, but NOT runtime-verified here; verify
  cross-pane paste, constraints-on-resize, alt-drag duplicate, endpoint
  editing, the gradient overlay, and token binding in-app.

## Scope and intentional exclusions

- **Auto-layout and grid application are intentionally not wired up** (waiting
  on UX decisions). Do not treat that as a gap and do not wire them.
  Constraint *authoring* UI exists; only H-class item G5 (applying constraints
  on frame resize) is in scope because it is distinct from auto-layout.
- **Linked instances are read-only by product law** (edit the master or
  detach). The absence of per-instance overrides is not a bug.
- The product deliberately rejects the free infinite canvas (`Product.md`):
  one frame at a time, zoom floor 1×. Do not add zoom-out-to-infinity or
  multi-frame canvas.

## Product.md conformance

- **G6 (per-pane clipboard)** is the only finding that *violates* Product.md:
  the Sketch → Current copy-paste flow is a **[NOW]** behavior ("copy-paste
  anything good back in") and is currently impossible because each
  `EditorProvider` owns an isolated in-memory clipboard. Fixing it is
  mandatory, not optional.
- No other fix below conflicts with any [LAW]/[NOW]. All fall under "What is
  explicitly free to change".

## Constraints to respect while fixing

- Any fix that adds or changes UI (align tools, font picker, color picker,
  gradient handles, etc.) must update `docs/UX.md` **before committing**, and
  should read `Design.md` first for control conventions.
- Keyboard/modifier behavior must go through `matchesKeyCommand` /
  `isModifierCommandActive` from `src/domain/settings/resolve.ts` — never raw
  `event.metaKey/altKey/shiftKey`. Several existing violations are listed in
  L16; do not add new ones.
- React 19 **StrictMode** is on: setState updaters are double-invoked and must
  stay pure (no ref mutation, no nested setState, no side effects inside
  updaters). The audit found the codebase currently clean — keep it that way.
- `saveScene` is fire-and-forget `void`; never `await` it, never block UI on
  persistence. All writes go through the save queue / `putRecord`.
- New UI copy must be in English (see L14 — existing Portuguese strings).
- WKWebView: SVG shown via `<img>`/data-URL must be native SVG, no
  `foreignObject`.

## Verified-good — do NOT "fix" these

The audit explicitly confirmed these are correct; leave them alone:

- StrictMode purity across the canvas (prior M14-class fixes hold; side
  effects hoisted out of updaters in `useTextEditingSession.ts:73-87`).
- Hot interaction paths are well-engineered: transient frames use shallow
  clones + `changedIds` render sets; snap candidates and reparent-exclude
  sets are cached per drag (`engine/types.ts:320-327`); hover lives in an
  external store; the bridge supports selectors.
- The Skia tooling layer: memoized `renderData`, `framesEqual` early-out,
  paint pool, cached fonts, DPR-snapped outside-drawn selection outlines,
  oriented selection outlines, screen-size-based handle culling,
  `SkiaToolingAdapter.destroy` cleanup (WebGL release, mid-load race).
- Event-listener hygiene in the stage: every `addEventListener` has matching
  cleanup.
- Fill/effects/blend stack is genuinely at paper.design level: multi-fill
  with per-fill opacity/blend, image fill modes + adjustments, ordered
  token-bindable effects, full `mix-blend-mode` set + group isolation,
  `-webkit-backdrop-filter` twin emitted.
- Undo/redo structural-diff dedup, layers-tree DnD reorder/reparent, color
  and gradient token binding, per-element PNG/JPEG/WebP/SVG/HTML export via
  Rust, sanitized SVG import, boolean ops (polygon-approximate is documented
  and accepted for now).
- The DB-backed surface passes `persistStorage={false}`, so draft-cache
  issues (M14, L11) are confined to the sketch canvas.

---

# 1. High-severity bugs (state/history corruption)

## ✅ DONE — H1 — Global document shortcuts are not gated on an in-flight pointer gesture

`src/canvas/stage/hooks/useKeyboardShortcuts.ts:117-156`.

Undo/redo/paste/duplicate/delete dispatch unconditionally while
`interactionRef.current` is an active drag/resize/rotate.

- **Scenario A (undo mid-drag):** Cmd+Z pops `past` and pushes the current
  *transient* frame onto `future`; the very next pointermove overwrites the
  undone document with a frame rebuilt from `interaction.beforeDocument`, and
  pointerup's `commitDocument` clears `future` — one undo step is permanently
  destroyed, plus a visible flicker.
- **Scenario B (paste/delete mid-drag):** the commit lands on a transient
  frame; `finishMovedInteraction`
  (`src/canvas/stage/canvasInteractionHandlers.ts:390-415`) then rebuilds
  `finalDoc` from `interaction.beforeDocument` — the pasted/deleted change
  silently vanishes on pointerup.

Escape is already correctly guarded (same file, lines 84-115); the
document-mutating commands are not.

**Fix:** early-return undo/redo/paste/duplicate/delete (any command that
commits a document) when `interactionRef.current` is a document-mutating
gesture (drag/resize/rotate/radius/pen/pencil/anchor). Pan/marquee may stay
allowed or be included for simplicity.

## ✅ DONE — H2 — Second pointerdown during an active gesture orphans the drag; move is applied without commit or undo entry

`src/canvas/stage/hooks/useCanvasPointerEvents.ts:345-363` (pan branch),
`:518-539` (drag move), `:599-603` (pointerId guard in `finishInteraction`).

`onPointerDown` never checks `interactionRef.current`. The pan branch
(`event.button === 1 || …`) unconditionally overwrites the ref via
`startPanInteraction`.

**Scenario:** hold a left-button element drag (element already moved via
repeated `setDocumentTransient`), press the middle button → the drag
interaction is replaced by a pan with the same pointerId; releasing middle
ends the pan and nulls the ref; releasing left hits `!interaction → return`.
The moved element stays at its transient position but `commitDocument` never
fires — no history entry, undo cannot revert the move. `commandModeRef` /
drop-target state also survives if the reparent modifier was held. The same
clobbering applies to resize/rotate/radius gestures and, on touch/pen
hardware, to any second concurrent pointer.

**Fix:** in `onPointerDown`, if `interactionRef.current` exists, either
ignore the new pointer entirely or finish/cancel the current interaction
first (finish = commit, matching pointerup semantics). Also consider keying
move/up handlers strictly by the originating pointerId (partially present at
`:599-603`).

## ✅ DONE — H3 — Every slider tick / native color-input tick is a full undoable commit; one drag can wipe the entire undo history

- `src/canvas/shell/inspector/InsComponents.tsx:448-456` — `InsSlider` is a
  native range input calling `onChange` on every `input` event.
- `src/canvas/shell/inspector/FillColorField.tsx:74-77` — native
  `<input type="color">` fires per tick as well.
- Consumers: `AppearanceSection.tsx:94-102` (opacity), `:192-201` (radius),
  `FillSection.tsx:202-211` (fill opacity), `:395-406` (7 image-adjustment
  sliders).
- Path: `Inspector.tsx:205-207` `commitStyle` → `updateElementStyles` →
  `cloneDocument` (full `structuredClone`,
  `src/canvas/engine/mutations/elementGeometry.ts:60-66`) → `commitDocument`
  reducer `src/canvas/engine/store.tsx:412-435`, which pushes `past`
  unconditionally per commit, capped at 80
  (`src/canvas/engine/history.ts:63-68`).

**Scenario:** drag the Appearance opacity slider 100→0 (~100 input events) →
~100 independent deep clones of the whole document + ~100 history entries;
the 80-cap silently discards **all prior undo steps**, and undoing the drag
takes dozens of ⌘Z presses. Figma coalesces a scrub into one undo step.

**Fix:** transient-while-scrubbing / commit-on-release, mirroring what canvas
drags already do: while the slider is being dragged dispatch
`setDocumentTransient` (with `changedIds: [elementId]`); commit once on
pointerup/change-end. Apply the same pattern to `FillColorField`'s color
input (`change` event = commit, `input` event = transient). Text inputs are
already fine (`InsInput` defers to blur/Enter).

---

# 2. Medium-severity bugs

## Geometry / interaction

## ✅ DONE — M1 — Resize/radius/rotate math ignores ancestor rotation while handles are drawn with it

Handles/hit geometry use `getElementTransformedCorners` (full ancestor
rotation chain, `src/canvas/engine/geometry/bounds.ts:194-212`), but:

- `resizeSingleElement`
  (`src/canvas/stage/canvasDocumentMutations.ts:231-243`) counter-rotates by
  `source.rotation` only and treats `getAbsoluteRect` (a rotation-blind
  offset sum, `bounds.ts:26-47`) as the true frame;
- `radiusDocument` (`canvasDocumentMutations.ts:552-560`) un-rotates the
  cursor by `element.rotation` only;
- `computePathEditGeometry` (`src/canvas/stage/pathEditGeometry.ts:30-36`)
  applies `node.rotation` only.

**Scenario:** rect inside a parent rotated 45°, select the child → its
box/handles draw rotated 45°, but dragging a resize handle applies the delta
in an unrotated frame: the element grows along the wrong axes. Radius-ball
drags move in a wrong/inverted direction. A path nested under a rotated
parent shows edit anchors displaced from the rendered curve.

Drag/move is **correct** (`computeDragMoveFromWorldDelta` uses
`getEffectiveRotation`) — the inconsistency is contained to
resize/radius/rotate/path-edit. **Fix:** use the effective (ancestor-chain)
rotation and the transformed frame in all four paths, same as move does.

## ✅ DONE — M2 — Path-edit coordinate math ignores ancestors and (for drags) the element's own rotation

- `src/canvas/engine/vector/vectorGeometry.ts:16-25` —
  `canvasToPathSpace`/`pathSpaceToCanvas` treat `node.x/y` as
  canvas-absolute. For a path nested in any parent (reachable: a path dragged
  into a frame, or an svg container's child path — `enterPathEdit` accepts
  any `type === "path"`), pen anchor placement
  (`src/canvas/stage/canvasVectorInteraction.ts:91`) and handle drags
  (`canvasVectorInteraction.ts:364-366`) are offset by the parent's origin.
- `src/canvas/stage/pathEditGeometry.ts:29-35` — the overlay compensates the
  element's own rotation but no ancestor offset/rotation, so overlay and
  hit-test also land wrong for nested paths.
- `canvasVectorInteraction.ts:358` — `anchorEditMove` maps the drag delta
  with scale only, no rotation: dragging an anchor of a rotated path moves it
  along unrotated axes while the overlay renders rotated — cursor and anchor
  diverge at any rotation ≠ 0.

**Fix:** build a proper element→canvas transform (accumulated ancestor
translation + rotation, incl. the element's own rotation) and use it in both
directions in `vectorGeometry.ts`, `pathEditGeometry.ts`, and the anchor drag
delta mapping. Overlaps M1's path-edit bullet — fix together.

## ✅ DONE — M3 — Snap tolerance is world-space, so snapping strength varies with zoom

`src/canvas/engine/snapping.ts:12` (`SNAP_DISTANCE = 6`) is compared against
world-space deltas (`src/canvas/stage/canvasDocumentMutations.ts:76`, deltas
from `screenDeltaToWorldDelta`). At displayZoom 4× the snap radius is 24
screen px (magnetic); at 0.25× it is 1.5 px (effectively dead). The
tooling-layer hit tests correctly use viewport px, making the inconsistency
visible. **Fix:** divide the tolerance by `displayZoom` at the call site
(constant screen-px tolerance, Figma behavior).

## ✅ DONE — M4 — Escape does not cancel a pencil stroke

`src/canvas/stage/hooks/useKeyboardShortcuts.ts:84-115` handles `pen`,
`anchor-edit`, `draw`; `cancelActiveInteraction`
(`src/canvas/stage/hooks/useCanvasPointerEvents.ts:646-657`) explicitly
excludes `pencil` (and `marquee`, `pan`).

**Scenario:** while dragging a pencil stroke, press Escape → the handler
falls through to `setTool("select")`, but the interaction stays live (pointer
still captured), `pencilMove` keeps appending points with the Select tool
active, and pointerup commits the stroke via `finishPencil`. The stroke
cannot be aborted. **Fix:** include `pencil` in the cancellable set (revert
to `beforeDocument`, release capture, clear interaction).

## ✅ DONE — M5 — Space-pan state sticks after window blur

`src/canvas/stage/hooks/useKeyboardShortcuts.ts:192-201` — space-down sets
`spacePressedRef` and the `is-space-panning` class; the only reset is the
keyup listener. No `blur` handler (contrast:
`src/canvas/stage/CanvasToolingLayer.tsx:212-215` resets its modifier state
on blur). **Scenario:** hold Space, Cmd+Tab away, release Space, come back →
next left-click starts a pan instead of a selection until Space is tapped
again. **Fix:** reset on `window` `blur` like the tooling layer does.

## ✅ DONE — M6 — Marquee selects locked elements and uses rotation-inflated AABBs

`src/canvas/stage/canvasToolingUtils.ts:106-127` — `findElementsInMarquee`
skips `visible === false` but never checks `node.locked` (click paths do:
`findChildAtPoint` `src/canvas/stage/canvasHitTesting.ts:27`,
`computeTransformIds` `CanvasToolingLayer.tsx:71-78`). A marquee across a
locked element puts it in `selectedIds` with a selection outline, but
transforms silently exclude it. Additionally the intersection test uses
`getElementAABB` (bbox of rotated corners): a 45°-rotated element is selected
by a marquee touching only the empty corner of its AABB (Figma tests the
oriented box). **Fix:** skip `locked` nodes; test the oriented box (corner
polygon vs marquee rect) instead of the AABB.

## ✅ DONE — M7 — pointercancel commits partial gestures instead of reverting

`src/canvas/stage/CanvasStage.tsx:444` wires
`onPointerCancel={finishInteraction}`, which runs `finishMovedInteraction`
(= commit) for moved drags/resizes. An OS gesture interruption mid-drag
commits a half-finished move; the Escape path (`cancelActiveInteraction`)
shows revert-to-`beforeDocument` is the intended abort semantics. **Fix:**
wire `onPointerCancel` to the cancel path.

## Text editing

## ✅ DONE — M8 — Caret/selection/hit-testing desync for every typography style beyond weight/size/family

`src/canvas/stage/textEditingLayout.ts:32-38` (`fontForNode` omits
`fontStyle`), `:56-57` (`lineHeight = fontSize * 1.12` hardcoded), `:140-150`
(`layoutKey` omits `lineHeight`, `letterSpacing`, `textTransform`,
`verticalAlign`) — while the DOM render honors all of them via
`compileTypography` (`src/domain/canvas/typography.ts:42-77`);
`.text-element { line-height: 1.12 }` is only the default.

**Scenario:** set line-height 2 (or letter-spacing 5%, or uppercase
transform, or vertical-align middle) on a text node, double-click to edit →
selection rectangles and the caret drift per line/character from the
rendered glyphs; click-to-caret (`getIndexFromPoint`) lands on the wrong
index; with `verticalAlign: middle` the caret pins to the box top while text
renders centered.

**Fix:** thread the full compiled typography (font style, real line-height,
letter-spacing, transform, vertical offset) through `fontForNode` /
layout measurement, and include those inputs in `layoutKey`.

## ✅ DONE — M9 — Editing a rotated text element draws the overlay unrotated over the AABB

`src/canvas/stage/TextEditingOverlay.tsx:20-55` and
`src/canvas/stage/canvasStageHelpers.ts:124-144` (`localPointForTextNode`)
both use `elementToPaintViewportRect` — the axis-aligned bounding box of the
rotated element — with no rotation transform, and derive `scaleX/scaleY`
from AABB dimensions (wrong scale for a rotated box).

**Scenario:** rotate a text node 30°, enter editing → blue selection/caret
render axis-aligned across the AABB, nowhere near the glyphs; click-to-index
maps through the wrong frame; the hidden textarea position (IME candidate
window) is off for the same reason. **Fix:** apply the element's effective
rotation as a CSS transform on the overlay and inverse-rotate pointer input
in `localPointForTextNode`; derive scale from the unrotated element size.

## Inspector / domain

## ✅ DONE — M10 — Switching an effect's type keeps a stale `amount` across unit families

`src/canvas/shell/inspector/EffectsSection.tsx:53-57` — `seedForType` resets
params only for shadow/blur types; `amount` survives a switch between color
filters. `hue-rotate` stores degrees in `amount`
(`src/domain/canvas/effects.ts:136-141` emits `${amount}deg` vs raw), while
grayscale/invert/sepia are 0–1 and brightness/contrast/saturate are
multipliers.

**Scenario:** create Hue rotate 90° (`amount: 90`), switch dropdown to
Grayscale → input shows "9000%" (`EffectsSection.tsx:212`) and the compiler
emits `grayscale(90)`. Reverse: Brightness 150% (`amount: 1.5`) → Hue rotate
shows "2°". **Fix:** reset `amount` to the target type's default on every
type switch (extend `seedForType` to all types).

## ✅ DONE — M11 — Removing the last fill stores `fills: []`; the panel resurrects a phantom white fill that doesn't match the render

`src/canvas/shell/inspector/FillSection.tsx:510` (`remove` can yield `[]`) →
`src/domain/canvas/fill.ts:285-321` `fillsToWritePatch([], …)` hits neither
collapse case, writing `fills: []`, `background: undefined`. Next render
`normalizeFills` (`fill.ts:225-229`) sees a defined-but-empty array as
"no fills" and synthesizes `synthSolidFill(undefined)` = white `#FFFFFF`.

**Scenario:** rect with one solid red fill → trash → element paints nothing,
but the panel shows a white Solid card. On an image element, deleting the
fill is a visual no-op (node `src` untouched, legacy `<img>` path keeps
rendering) while the panel shows a fresh image card.

**Fix:** decide and implement a real "no fill" state (Figma allows an empty
fills list): make `normalizeFills` treat `fills: []` as an explicit empty
list (panel shows empty state + Add button), and make the renderer paint
nothing. Ties into G-list item "no zero-fill state".

## ✅ DONE — M12 — Text fill semantics flip between one fill and two

`src/domain/canvas/fill.ts:289-292` — the plain-solid collapse
(`elementType !== "image"`) also applies to `text`, writing
`styles.background`, which paints the text **box** background
(`src/canvas/stage/ElementRenderer.tsx:148`). Any non-trivial fills list on
text compiles with `background-clip: text`
(`src/domain/canvas/fillCompile.ts:305-310`), painting the **glyphs**.

**Scenario:** text element → Fill → Solid red → red rectangle behind black
glyphs. Add a second fill (or set fill opacity 99%) → paint now clips to the
glyphs. Also contradicts `docs/inspector-fill.md` (text solid → `color`), see
D2. **Fix:** for `text`, collapse a single solid to `styles.color` (per the
doc), never to `background`.

## ✅ DONE — M13 — Tile pattern treats `scale` (a percentage) as pixels

`src/domain/canvas/fillCompile.ts:276` —
`motif: fill.scale && fill.scale > 0 ? fill.scale : 64`, consumed as px in
`src/canvas/stage/FillDefs.tsx:76-90` (`width={motif}`). `ImageFill.scale` is
documented as "percentage of natural size (100 = natural)"
(`src/domain/canvas/fill.ts:121-122`), and the plain-CSS tile path uses it as
a percentage (`fillCompile.ts:174` → `background-size: ${scale}%`).

**Scenario:** image fill, Fit=Tile, Scale=100, Tile gap 0 → natural-size
tiles; set Tile gap=1 → the render switches to the SVG pattern path and the
motif becomes a fixed 100 px square regardless of natural size. **Fix:**
resolve the motif from the image's natural size × scale% (needs natural
dimensions available at compile or in `FillDefs`). Also fixes D8.

## ✅ DONE — M14 — Sketch canvas: panel/window resize can revert recent edits and wipe undo history

`src/canvas/engine/store.tsx:531-552` — the hydrate effect depends on
`fallbackDocument` identity. The sketch surface passes `draftsFallbackDoc`,
memoized on `[windowExtent, treeWidth, inspectorWidth]`
(`src/canvas/shell/CanvasRender.tsx:181-190`), with `persistStorage`
defaulting to true. Resizing the tree/inspector panel creates a new
`fallbackDocument` → the effect re-runs → re-reads the localStorage draft
(written on a 250 ms debounce, `store.tsx:565-575`) → dispatches
`hydrateDocument`, which resets `past`/`future`/selection/zoom and can
silently discard up to ~250 ms of edits.

**Fix:** hydrate exactly once per storage key (guard with a ref keyed by
`storageKey`), not on every `fallbackDocument` identity change; or memoize
the fallback doc independently of panel widths.

---

# 3. Low-severity bugs

- ✅ **DONE — L1 — New drop-shadow default color mismatch.**
  `EffectsSection.tsx:46` seeds `color: "#000000"` (opaque black); the
  compile-side fallback is `rgba(0,0,0,0.25)`
  (`src/domain/canvas/effects.ts:27`). Every added shadow is harsh solid
  black. Seed with the 25% black (needs alpha support in the seed / picker,
  see G9).
- ✅ **DONE — L2 — Add conventions disagree:** new fill is prepended
  (`FillSection.tsx:511`, lands on top) but new effect is appended
  (`EffectsSection.tsx:253`, lands at the bottom = *under* existing shadows,
  since first = on top). Make effects prepend like fills (Figma behavior).
- ✅ **DONE — L3 — Typography weight shows "NaN" for keyword weights.**
  `TypographySection.tsx:75` — `String(Number(styles.fontWeight ?? 400))`;
  `fontWeight` is typed `string` (`src/domain/canvas/types.ts:148`), so
  `"bold"` renders "NaN". Map keywords (`bold`→700, `normal`→400) before
  numeric conversion.
- ✅ **DONE — L4 — `InsColor` hex field accepts junk with no validation/revert.**
  `InsComponents.tsx:298-301` — `onChange("#" + v.replace("#",""))` returns
  void (never `false`), so the deferred-commit revert contract
  (`InsComponents.tsx:47-50`) never fires. Typing "red" stores `"#red"`; the
  border/underline/shadow silently disappears while the field shows "RED".
  Validate 3/6/8-digit hex and return `false` otherwise.
- ✅ **DONE — L5 — Layout min/max inputs coerce invalid input to 0.**
  `LayoutSection.tsx:391-400` — `clamp(Number(v) || 0, 0, Infinity)` and the
  handler returns void, so "abc" commits `minWidth: 0` instead of reverting.
  Use the same `updateNumber` pattern as every other numeric field.
- ✅ **DONE — L6 — `clampW`/`clampH` invert lo/hi when the typed value is below min.**
  `ElementTab.tsx:120-121` — `clamp(w, c.width.min, c.width.max ?? w)`; for
  `w < min`, hi (=w) < lo. Harmless today only because
  `updateElementGeometry` re-clamps
  (`src/canvas/engine/mutations/elementGeometry.ts:42-43`), but the helper is
  logically wrong. Use a real max fallback (`Infinity`).
- ✅ **DONE — L7 — Per-corner radii are not clamped at write** (uniform radius is):
  resolved with D1 — uniform radius no longer clamps at write either, so both
  uniform and per-corner now store `Math.max(0, value)` and clamp only at render.
- ✅ **DONE — L8 — Clipboard/duplicate id generation is 32 bits and unchecked.**
  `src/canvas/engine/mutations/coreUtils.ts:5-10` slices the UUID to 8 hex
  chars; `src/canvas/engine/clipboard.ts:83` and `duplicateElements` never
  check for an existing key — a collision silently overwrites a live element
  and corrupts `children` arrays. Also `clipboard.ts:81`:
  `idMap.get(childId) ?? childId` keeps a stale foreign id when a copied
  child was missing at copy time. Use full UUIDs or regenerate on collision;
  drop unmapped children.
- ✅ **DONE — L9 — Missing-parent crashes.**
  `src/canvas/engine/mutations/elementHierarchy.ts:63`
  (`next.elements[parentId].children.push(...)` unchecked) and
  `duplicateElements`'s `cloneTree` (`elementHierarchy.ts:241-242`,
  `document.elements[sourceId]` unchecked) throw on a stale id instead of
  no-oping.
- ✅ **DONE — L10 — `constrainAll` is order-dependent.**
  `elementHierarchy.ts:43-57` clamps in `Object.keys` order; lines 29-30
  clamp child size against the parent's **pre-clamp** size when the child is
  processed before its oversized parent. Process parents before children
  (topological order).
- ✅ **DONE — L11 — Draft-cache write starvation (sketch).** The persistence effect's
  cleanup (`store.tsx:578-581`) cancels the pending 250 ms draft write when a
  new gesture starts inside the window; a commit followed quickly by a new
  gesture never lands in the draft cache until a later commit settles. Flush
  instead of cancel on cleanup.
- ✅ **DONE — L12 — Escape-cancel of a canvas resize restores the document but not the
  viewport.** `handleCanvasResizeMove` shifts the origin per frame for w/n
  handles (`canvasInteractionHandlers.ts:267-281`), but
  `cancelActiveInteraction` (`useCanvasPointerEvents.ts:646-674`) only
  restores `beforeDocument` — after Escape the camera stays shifted. Snapshot
  and restore the viewport too.
- ✅ **DONE — L13 — `LiveInstanceRefresh` mid-gesture refresh is silently lost.**
  `src/canvas/shell/surfaces/LiveInstanceRefresh.tsx:34-48` guards only
  `editingTextId`. If a referenced master changes during a drag,
  `refreshInstances` swaps the document, the next transient frame (built from
  `interaction.beforeDocument`) clobbers it, and `signatureRef` was already
  advanced — stale instance content persists until the master changes again.
  Defer the refresh while an interaction is active (retry on idle).
- ✅ **DONE — L14 — Mixed UI language.** `EffectsSection.tsx:258-260` empty-state copy
  is Portuguese ("Sombras, blur e filtros…"), `Inspector.tsx:257`
  `aria-label="Inspetor"`, `Inspector.tsx:378` "elementos selecionados".
  Decide the product interface language and make it consistent (all other
  inspector copy is English).
- ✅ **DONE — L15 — Grid overlay is not devicePixelRatio-aware.**
  `src/canvas/stage/CanvasGridOverlay.tsx:136-137` sets
  `canvas.width = width` in CSS px (no DPR scaling, unlike the Skia
  adapter's `getResolution()`), so pixel-grid lines render blurry on Retina
  and the `Math.round(x)+0.5` crispness trick operates on the wrong grid.
- **L16 — DEFERRED (needs new rebindable commands) — Raw modifier checks bypass the
  settings command layer.** Routing these through the registry requires *new*
  command ids that don't exist yet: a wheel-zoom modifier command (only the
  `metaKey` half is a policy choice — `ctrlKey` on wheel is WebKit's pinch
  encoding and must stay raw), a path-commit key command for Enter, and
  selection/caret key commands for the textarea editing keys — each with settings
  type + defaults + rebinding-UI plumbing. That is a disproportionate, unverifiable
  (no runtime here) expansion for a low-severity hygiene item, so it is deferred
  rather than done badly. Original references:
  `src/canvas/stage/hooks/useViewportControls.ts:237`
  (`event.ctrlKey || event.metaKey` for wheel-zoom vs pan — caveat: `ctrlKey`
  on wheel is also WebKit's pinch encoding, so only the `metaKey` half is a
  policy choice); `useKeyboardShortcuts.ts:62` (raw
  `!event.metaKey && !event.ctrlKey` on Enter for pen commit);
  `src/canvas/stage/TextEditingTextarea.tsx:203-246` (raw
  `shiftKey`/`metaKey` for editing keys — arguably text-editing scope, but it
  is interaction code per the project rule). Route through
  `matchesKeyCommand`/`isModifierCommandActive`.
- ✅ **DONE — L17 — Gradient stops keyed by index.** `FillSection.tsx:296` — removing a
  middle stop shifts the color-field drafts of all following stops into the
  wrong rows. Key by a stable stop id.
- ✅ **DONE — L18 — Section open/collapse state doesn't react to selection.**
  `defaultOpen={width > 0}` etc. (`BorderSection.tsx:40`,
  `EffectsSection.tsx:256`) only applies on first mount at that tree
  position: selecting a bordered element after a borderless one keeps Border
  collapsed. Key the section (or lift open state) by selected element id, or
  derive open state from the current selection.
- ✅ **DONE — L19 — `ExportSection` state leaks across selections.**
  `ExportSection.tsx:100-102` — local entries state silently carries one
  element's export entries over to the next selected element. Reset on
  selection change (or persist per element, see the doc's deferred list).
- ✅ **DONE — L20 — Free-space cursor in path-edit mode is the pen cursor even with the
  Select tool.** `src/canvas/stage/canvasHitTesting.ts:463-468` returns
  `{type:"path-empty", cursor: PEN_CURSOR}` for every miss whenever
  `pathEdit` geometry exists; `useCanvasPointerEvents.ts:552-567` applies it.
  With Select active, clicking empty space *exits* edit mode rather than
  placing an anchor — show the default cursor unless the pen tool is active.
- ✅ **DONE — L21 — Stale `settings` closure in the Alt-cursor effect.**
  `useCanvasPointerEvents.ts:263-286` — the effect reads `settings`
  (`isModifierCommandActive`) but omits it from the dependency array; a
  settings change during a path-edit session keeps the old binding.
- ✅ **DONE — L22 — Paste always lands at root with a +24 cascade.**
  `clipboard.ts` now pastes each top-level clone back into its **original parent**
  when that parent still exists in the target document (offset +24px, clamped by
  `constrainAll`, cascading on repeat), matching Figma; cross-document/split-pane
  paste (original parent absent) falls back to the frame root. Cursor-anchored
  paste is intentionally not added (would need pointer coords threaded into
  `paste()`); the same-parent behavior removes the surprise. UX.md updated.
- ✅ **REVIEWED (no change) — L23 — Render-phase ref writes (benign, watch only).**
  `InsComponents.tsx` (`useDeferredCommitField`) and `CanvasStage.tsx` write refs
  during render — idempotent and safe under StrictMode double-render; confirmed
  still idempotent. No code change; flagged to not add non-idempotent writes there.

---

# 4. Performance

Ordered by impact.

## ✅ DONE — P1 — Scaled DOM projection re-styles and re-lays-out the entire scene on every zoom frame across most of the zoom range

Took fix direction (a): `shouldUseScaledDomProjection` gained a
`zoomGestureActive` input, and `useViewportControls` now raises that flag on each
wheel/pinch zoom event, lowering it 140 ms after the last one. While the gesture
streams, the stage stays on the CSS-transform projection (`renderScale = 1`), so
the compositor scales an already-rasterized layer and **no** element restyles or
relayouts; on settle the scene re-projects once at device resolution. Text is
soft mid-zoom and snaps crisp on release — the Figma behavior, now documented in
`UX.md`.

The `MAX_SAFE_TRANSFORMED_STAGE_SIDE` guard still wins over the gesture flag: a
deep zoom whose scaled frame would exceed the browser's safe layer size stays on
the scaled DOM throughout. Fix direction (b) (rAF-coalescing wheel events) turned
out to be unnecessary: with `renderScale` pinned during the gesture, every
`ElementRenderer`/`RenderedScene` memo holds, so a wheel event only restyles the
single stage div.

Also fixed on the way: `gridCanvasRect` derived its clip region from
`projectedStageWidth` (= `size × renderScale`), which is the unscaled size
whenever the CSS-transform projection is active — it now uses `size ×
displayZoom`, which is what the viewport-space grid overlay always needed. Latent
before (the grid only draws at ≥4× where the projection was always scaled-DOM);
a live bug the moment the gesture flips the projection.

Unit-tested (`viewport.test.ts`); NOT runtime-verified here — check that a
trackpad pinch/wheel zoom over a dense frame stays smooth and re-sharpens on
release, and that the pixel grid (≥4×) still clips to the frame while zooming.

Original note:

`src/canvas/engine/viewport.ts:347-362` — `shouldUseScaledDomProjection`
returns true whenever `displayZoom >= SCALED_DOM_PROJECTION_MIN_ZOOM`
= `MIN_ZOOM` = `USER_MIN_ZOOM` = **1** (`src/domain/zoom.ts:11`). Above
~fit-zoom, `renderScale = displayZoom` (`CanvasStage.tsx:396`) is threaded
into every `ElementRenderer`, whose memo comparator bails on any
`renderScale` change (`ElementRenderer.tsx:618-623`).

**Scenario:** wheel/pinch zoom past 1× → every wheel event recomputes inline
styles (left/top/width/font-size/borders/shadows) for **every element** and
forces a full browser relayout, per event, with no rAF coalescing. Below 1×
the same gesture is a cheap CSS-transform update. This is the dominant
interaction cost on large scenes and it kicks in exactly where users spend
their time (≥100%).

**Fix directions (pick after measuring):** (a) during an active zoom
gesture, keep the cheap CSS-transform projection and re-project at the
scaled DOM resolution only on gesture end (debounced); (b) rAF-coalesce
wheel events so at most one re-projection runs per frame; (c) raise the
scaled-projection threshold. (a)+(b) together match what Figma-class editors
do (blurry-during-zoom, crisp-on-settle).

## ✅ DONE — P2 — MEDIUM — No rAF batching / coalescing for pointermove-driven document mutation

The gesture branch of `onPointerMove` now stores only the newest event and
processes it once per animation frame (deltas are absolute from gesture
start, so dropped intermediates are lossless); pointerup flushes the pending
move first, Escape-cancel drops it. The reparent preview's per-frame
`structuredClone` cost is now paid at most once per display frame; making it
incremental remains a possible follow-up if profiling still shows it hot.

Original note:

`useCanvasPointerEvents.ts:542-597` dispatches `setDocumentTransient`
synchronously per pointermove; a 120 Hz+ mouse produces more document clones
+ React commits than display frames. Worst branch: the Cmd-reparent drag
runs `computeDragMoveCommandFromScreenDelta` + `commitDragMove` +
`findDropTarget` (full tree walk with 4 ancestor-walking corner transforms
per node) + `reparentElements` — which starts with a **full
`structuredClone`** (`cloneDocument`) — **every frame** while the modifier is
held (`canvasInteractionHandlers.ts:216-248`).

**Fix:** gate the move path behind rAF (store latest event, process once per
frame; optionally fold `getCoalescedEvents`). Make the reparent preview
incremental (shallow clone + touched-subtree copy) or defer the actual
reparent to pointerup, previewing only the drop-target highlight per frame.

## ✅ DONE — P3 — LOW effort / MEDIUM win — Text-editing keystrokes violate the transient contract (one-line fix)

`src/canvas/stage/hooks/useTextEditingSession.ts:77-79` dispatches
`setDocumentTransient` **without** `changedIds`, so `transientChangedIds` is
null and every keystroke triggers: full O(N) deep diff
(`getAffectedElementRenderIds` → `deepEqual` per element pair,
`canvasStageHelpers.ts:58-87`), the 250 ms `JSON.stringify` draft write, and
`onDocumentChange` → debounced `saveScene` of mid-edit text
(`store.tsx:554-582`). Every other hot path passes `changedIds`. **Fix:**
pass `changedIds: [current.nodeId]`.

## ✅ DONE — P4 — Whole-inspector re-render on every document change, including 60 Hz transient drags

Landed in two passes. Earlier: `normalizeFills` memoized on its fill inputs, and
P2's rAF coalescing capping the re-render rate at the display refresh.

This pass closed the selector-based subscription refactor. The blocker was that
every commit callback closed over the subscribed `document`, so narrowing the
subscription would have committed from a stale snapshot. Fixed by inverting the
dependency: `readDocument()` (over the existing `useEditorBridgeReader`) reads the
LIVE document at event time, and every callback now builds its mutation from that
instead of from a render-time value. With no callback depending on it, the
whole-document subscription could go.

The Inspector now subscribes only to the slices its body renders — the selected
node, its absolute `rect` (ancestor-walking, so it needs its own selector), its
parent's styles, the instance-root/locked-variant ids, the multi-select node list,
and `canvas`/`shellBackground`/`shellGrid` — with value equality (`sameRect`,
`sameRefs`) where a selector builds a fresh object per call, so the bridge's
identity cache can bail. Dragging an element that is *not* selected now publishes
a frame the panel ignores completely.

`ElementTab` takes `rect`/`parentStyles`/`getDocument` instead of the document;
`MultiSelectTab` and `ExportSection` take `getDocument` (both only ever read it in
handlers). Two pieces of dead code fell out and were removed: the `editor` prop on
`Inspector` (an alternate document source no call site ever passed, and the reason
the callbacks were tangled), and `ElementTab`'s unused `getParentSize` call.

NOT runtime-verified: profile a drag of a non-selected element to confirm the
panel no longer re-renders, and check that a slider scrub, a multi-select batch
edit, and an element export still commit against the live document.

Original note:

`src/canvas/shell/Inspector.tsx:123` subscribes to the entire `document`;
`setDocumentTransient` (`store.tsx:390-410`) publishes a new document per
drag frame, so while dragging any element on canvas the full inspector body
re-renders each frame. Nothing bails: `ElementTab` and all sections are
unmemoized, `normalizeFills` fabricates a new fills array every render
(`ElementTab.tsx:228-235`), and every section receives fresh inline
closures. Note: memoization alone is defeated by `cloneDocument` giving
fresh `styles` identities each commit — a selector-based subscription (the
bridge already supports selectors) on the selected element(s) + value
equality is the fix shape.

## ✅ DONE — P5 — Grid overlay reallocs a viewport-sized canvas buffer on every CanvasStage render — even when the grid is disabled

`CanvasStage.tsx:506-511` passes `canvasRect={{…}}` as a fresh object
literal each render; `CanvasGridOverlay.tsx:130-140`'s effect lists it as a
dep and executes `canvas.width = width` (buffer realloc + clear) **before**
the `enabled`/zoom early-return. **Fix:** early-return before touching the
canvas; memoize `canvasRect`.

## ✅ DONE — P6 — MEDIUM (memory) — History is 80 full document snapshots

Every single-node mutation (geometry, rotation, styles, text sizing/content,
image src, rename, lock/visible) now shallow-clones the document and copies
only the touched node, so history snapshots share untouched nodes with each
other — matching what the interaction paths already did. `detachInstance`
keeps its deep clone (it mutates a whole subtree).

Original note:

`history.ts:63` caps length, but each Inspector-path entry is an independent
`structuredClone` of the whole scene (H3 path); ceiling is 80 × scene size.
Interaction-path commits at least share untouched nodes via
`shallowCloneDocument`. H3's transient-scrub fix removes the flood; consider
also routing inspector commits through the shallow-clone path so snapshots
share unchanged nodes.

## ✅ DONE — P7 — Text-fit wrapping is O(len²) per line per keystroke

`elementGeometry.ts:86-117` (`wrapLineCount`) re-measures a growing prefix
per character via canvas `measureText`; runs on every keystroke for
fit-sized text. Use per-word measurement with cumulative widths.

## ✅ DONE — P8 — Global capture listener per input

Every `InsInput`/`InsTextarea` registers a capture-phase
`document.pointerdown` + `window.blur` listener
(`InsComponents.tsx:62-86`). A text element's tab mounts ~30 inputs → ~30
capture listeners run on every pointerdown anywhere in the app. Use one
shared listener with a registry.

## ✅ DONE (as a bounds cache, not an index) — P9 — No spatial index anywhere

Investigated before building: the four scans the audit names are **already pruned**
tree walks, not flat linear scans — marquee never descends into a matched subtree
(`canvasToolingUtils.ts`), `findChildAtPoint`/`findDropTarget` only descend into
subtrees containing the point, and snap candidates are siblings-only in the common
case AND already cached per drag (`DragInteraction.snapCandidates`, `types.ts`).
Real scenes are ~40–100 nodes (per screen/variant, not one giant document).

So a grid/R-tree would have bought nothing and cost real invalidation complexity:
because `transformElementPointToCanvas` applies every ancestor's rotation, a node's
AABB changes when any ancestor moves, which an index would have to track.

What *actually* cost per frame was recomputing those ancestor chains — one node's
corners is 4 × depth point-rotations, and there was no bounds cache anywhere. Fixed
with a `WeakMap<CanvasDocument, Map<id, corners>>` memo inside
`getElementTransformedCorners`, which `getElementAABB` and `isPointInElement` both
route through. Keying on the **document** (not the node) is what makes it correct:
a published document is immutable — every mutation shallow- or deep-clones before
touching a node — and a node whose ancestor moved keeps its own object identity, so
a node-keyed cache would go stale. The WeakMap frees each map with its document.

Where it wins: a marquee drag never mutates the document, so after the first frame
every candidate is a map lookup; likewise tooling redraws and hover hit-tests
between commits. During a transient drag each frame is a new document, so it is
neutral there (one compute per node per frame, as before).

Corners are now typed `readonly` and shared between callers — do not mutate the
returned array. Unit-tested, including that moving/rotating an ancestor re-derives
a child's corners on the new document while the old one keeps its old geometry.

Revisit an actual spatial index only if scenes reach thousands of nodes.

## ✅ DONE — P10 — Draft-mode scrollbars recompute `getSelectionAABB` over all roots on every document change

`CanvasStage.tsx:382-385` depends on `state.document`, including 60 Hz
transient frames. Memoize on the settled document or on `changedIds`.

---

# 5. Doc-vs-code divergences (`docs/inspector-*.md`)

- ✅ **DONE — D1 — Radius clamping / "Full" contradict the doc.** Implemented the
  doc/Figma behavior: corner radius is stored verbatim (no write/resize/scale
  clamp), "Full" writes 9999, and the value is clamped only at render (CSS caps
  border-radius at 50%). A pill now stays a pill across resizes. Resolves L7 too
  (uniform + per-corner are now consistent: both store `max(0, value)` and clamp at
  render). Unblocks F4.
  `docs/inspector-appearance.md` §Corner radius: "Keep the stored value
  (e.g. 9999 for a pill) … don't 'correct' the user's number"; "Full →
  border-radius: 9999px". Code: typed radius is clamped to min(w,h)/2 at
  write (`elementGeometry.ts:70-77`) and Full writes the current min(w,h)/2,
  not 9999 (`AppearanceSection.tsx:163`). **Scenario:** click Full on a
  100×40 rect (stores 20), resize to 100×80 → corners stay r=20, no longer a
  pill. Decide: either implement the doc (store user value, clamp only at
  compile) — recommended, it is the Figma behavior — or update the doc.
- ✅ **DONE — D2 — Text solid fill target.** `docs/inspector-fill.md` §Solid +
  cheat-sheet: text solid → `color`. Code wrote `background`
  (`fill.ts:289-292`) — same defect as M12; fixed there (text single solid now
  routes to `styles.color`/`colorRef`).
- ✅ **DONE — D3 — Border color opacity control missing.** Opacity % rows under
  the box Border and Text stroke colors compose into the stored hex's alpha
  (`#RRGGBBAA`), shown while the color is a plain hex literal with no token
  bound; shared `hexAlphaPercent`/`hexWithAlphaPercent` helpers in
  InsComponents.
- ✅ **DONE — D4 — Min/max gating.** Min/Max W/H moved out of the
  flex/grid-child block — authorable on every element, per axis.
- ✅ **DONE — D5 — Constraint anchors scope.** Pin X / Pin Y now gate on
  `!isRoot && !parentIsFlow` (absolute/free children only), matching the G5
  resize reflow which skips flex/grid children.
- ✅ **DONE — D6 — Engine fields with no authoring UI.** Added Row/Col gap
  per-axis overrides, Rows align (`align-content`, wrap only), Baseline (row
  flow), and grid-cell Justify self + Col/Row span. TextResize was removed by
  G4 rather than authored.
- ✅ **DONE — D7 — Export scale.** Free 0.1×–10× numeric field beside the
  0.5/1/2/3 preset select (which lists an arbitrary current value so it never
  shows blank).
- ✅ **DONE — D8 — Tile-gap formula.** `docs/inspector-fill.md` §Pattern documents
  "gap = patternWidth − motifWidth" with the motif at its real pixel size;
  the compiled motif was the `scale` number reinterpreted as px, so the
  documented semantics only held accidentally. Fixed by M13 (the overlay now
  measures the image and sizes the motif at natural × scale%).

Checked and consistent (no action): Plus Darker omitted / Plus Lighter kept;
isolation only on divs with children; radius slider max = min(w,h)/2; spread
hidden off-box; inner-shadow box-only; outside border via `outline` is the
documented shipped decision; `-webkit-backdrop-filter` twin
(`ElementRenderer.tsx:76-77`); line/arrow fill panel hidden; letter-spacing
% → em; each doc's deferred list matches what's absent.

---

# 6. Rendering fidelity gaps (renderer/tooling, not new features)

- ✅ **DONE — F1 — No flip/mirror when a resize crosses its anchor.**
  `src/canvas/engine/geometry/transforms.ts:236-240` — `resizeBoxFromHandle`
  clamps at `minSize`; dragging the E handle past the W edge pins at min
  size instead of flipping (Figma mirrors and swaps the handle). Draw-tool
  rubber-banding is fine (`Math.abs`); only resize sticks.
- ✅ **DONE (shadows) — F2 — Shadows on clip-path shapes are clipped away.**
  `ElementRenderer.tsx:127-171` — `polygon`/`star`/`arrow` get `clipPath`,
  and `effectTargetForType` returns `"box"` for them
  (`src/domain/canvas/effects.ts:155-160`), so effects compile to
  `box-shadow` on the same element the clip-path clips: a drop shadow on a
  star/arrow/polygon paints nothing. Route these shapes to
  `filter: drop-shadow` (the vector target). Borders on the same shapes are
  knowingly suppressed (`ElementRenderer.tsx:93-95`) — both are gaps of the
  documented "clip-path shapes defer to an SVG render target (v2)" plan.
- **F3 — Stroke alignment: no "center" for boxes, no alignment at all for
  vectors.** `src/domain/canvas/border.ts` supports
  `borderAlign: "inside" | "outside"` only (CSS `border` vs `outline`);
  Figma's default center alignment is unavailable. Vector `<path>` strokes
  (`ElementRenderer.tsx:520-531`) are always SVG-centered with no
  inside/outside emulation. Depends on the HTML→SVG render-target promotion
  (`docs/inspector-border-stroke.md`).
- ✅ **DONE — F4 — Radius drag is uniform-only.** Alt-drag (new rebindable
  modifier `canvas.radius.perCorner`) rounds only the grabbed ball, writing
  `styles.cornerRadii` seeded from the uniform radius; balls render at their own
  corner offsets and the drag label shows the dragged corner's value. A plain
  drag stays uniform and clears a per-corner override; per-corner values that
  re-equalize collapse back to `borderRadius`. Scale-resize now scales
  `cornerRadii` alongside the other scalable styles. UX.md updated; unit-tested.
- ✅ **DONE — F5 — Path-edit overlay faceting.** `pathEditGeometry.ts:11` — fixed
  `SEGMENT_SAMPLES = 12` per segment; long curves at high zoom show a
  visibly faceted blue skeleton (render + hit-test polyline). Sample
  adaptively by on-screen segment length.
- ✅ **DONE — F6 — Context toolbar can be unreachable at extreme zoom.**
  `src/canvas/stage/ContextToolbar.tsx:357-390` — `top` derives from the
  selection's viewport box; zoomed far into an element larger than the
  screen (rect.y ≪ 0, bottom ≫ viewport height), both "above" and the
  fallback "below" placements are off-screen; only horizontal placement is
  clamped (`clampToolbarCenter`). Add a vertical clamp like the size label
  has (`CanvasToolingLayer.tsx:566-569`).

---

# 7. Parity roadmap — what's missing to design a real interface

Inventory verdicts (EXISTS/PARTIAL/MISSING) were checked against the scene
model and code, not file names. Ordered by how much each blocks designing a
realistic app screen. Items that add UI **must update `docs/UX.md` first**.

## ✅ DONE — G1 — Align & distribute (MISSING entirely)

Engine module `mutations/elementAlign.ts` (`alignElements` 6 ways + `distributeElements`
H/V), aligning by each element's AABB with the delta translated into parent-local
space (rotated-parent safe), locked elements act as anchors but don't move. Surfaced
via `useCanvasCommands.align/distribute` in BOTH right-click context menus (stage +
layers tree; multi-select, distribute needs 3+) and in the Inspector via the shared
`AlignRow` (lucide icons): the multi-selection panel aligns to the selection's shared
bounds, and the single-element Transform section aligns within the parent's content
box. A ContextToolbar surface was deliberately skipped — the toolbar is single-node,
transient chrome, and the menu + inspector cover both entry points. UX.md updated;
unit-tested.

Original note:

No align-left/center/right/top/middle/bottom or distribute anywhere (grep
across canvas: zero hits). The single biggest daily-workflow hole. Build an
engine mutation module beside `src/canvas/engine/mutations/elementOrder.ts`
(align 6 ways + distribute H/V, within selection bounds or parent when
single-selected), surfaced in the Inspector Element tab, ContextToolbar, and
context menu.

## ✅ DONE — G2 — Arrow-key nudge (MISSING)

Added rebindable `canvas.nudge.up/down/left/right` key commands (default arrows,
Shift = ×10), settings-backed amounts (`canvas.nudge.small`/`.large`), moving
`selectedIds` via `nudgeElements` (canvas-delta → parent-local, `constrainElementInPlace`
clamp, locked skipped). A burst coalesces into one undo entry (transient frames +
400ms settle commit; flushed on unmount). UX.md updated; engine unit-tested.

Original note:

Arrow keys currently move nothing; precision layout is impossible. Add to
`useKeyboardShortcuts.ts` via the rebindable command registry
(`src/domain/settings/commands.ts`): ±1, Shift ±10 (make the amounts
settings-backed), moving `selectedIds` with the existing `constrainElement`
clamp, coalescing repeats into one undo entry (hold-to-repeat should not
flood history — same coalescing need as H3).

## G3 — Real font management (MISSING)

`TypographySection.tsx` font family is a **free-text input**; ContextToolbar
has 5 hardcoded stacks; weight is a raw 1–1000 number input. Ship a font
picker: bundled webfonts + `queryLocalFonts` on desktop (Tauri/WKWebView —
verify API availability, else a Rust-side font enumeration command), with
per-family weight lists feeding `fontFamily`/`fontWeight`; ensure the
renderer loads chosen faces before measuring (text-fit and M8 both depend on
correct metrics).

## ✅ DONE — G4 — Wire text auto-resize (PARTIAL: modeled, dead)

Since the audit, the per-axis `node.sizing` model ("fit"/"fixed") had already
superseded the dead `TextResize` enum: `applyTextFitSizingInPlace` runs on every
content/style/typography change (including per-keystroke via
`updateElementTextShallow`), and the Inspector Transform section exposes
Fixed/Fit toggles per axis. This pass closed the remaining gaps: **new
click-created text defaults to auto-width** (fit × fit, sized to content and
centered on the click), **drag-drawn text commits as drawn-width + fit-height**
(Figma), and the never-wired `TextResize` enum / `styles.textResize` /
`compileTextResize` were deleted (also closes D6's TextResize bullet). UX.md
updated; unit-tested.

Original note:

`TextResize` enum exists in the domain but is unused by renderer/engine;
text boxes don't grow while typing — only the manual "Fit width and height"
button (`fitTextElementToContent`). Apply auto-width/auto-height in
`ElementRenderer` sizing + on text-edit commit (reuse
`fitTextElementToContent`), defaulting new text elements to auto-width.
Expose the three modes in TypographySection.

## ✅ DONE — G5 — Apply constraints on frame/container resize (PARTIAL: compiled, zero callers)

New `engine/mutations/elementConstraints.ts#applyChildConstraintsInPlace` — the
geometry twin of `compileConstraints` (same per-axis semantics, baked into px
geometry): right/bottom keep the far inset, left-right/top-bottom stretch,
center keeps the relative center, scale scales position+size; resized children
cascade into their own pinned children; flex/grid children excluded. Wired into
canvas resize, element resize (plain + rotated-ancestor branches), and Inspector
W/H commits; the Scale tool keeps its scale-everything behavior. D4/D5
(authoring scope) remain separate items. UX.md updated; unit-tested.

Original note:

`compileConstraints` (`src/domain/canvas/layout.ts`) is implemented and
tested but has **no callers outside tests**; resizing the canvas or a
wrapper leaves children stranded. Hook it into the canvas-resize and
element-resize commit paths in `src/canvas/stage/canvasDocumentMutations.ts`.
This is constraint *application* — distinct from the deliberately-deferred
auto-layout wiring. Fix D4/D5 (authoring scope) in the same effort.

## ✅ DONE — G6 — Cross-window clipboard: Sketch → Current (**violates Product.md [NOW]**)

`CanvasRender` now owns ONE shared `createClipboard()` instance passed to every
pane's `EditorProvider` (Current, Sketch, Versions, extra Currents) via a new
optional `clipboard` prop — copy in Sketch pastes in Current, and the buffer
survives tab switches (in tab mode only one surface is mounted at a time, so a
per-provider buffer died with the pane). Per-pane paste semantics kept: paste
targets the pane's own document with full id remap (L8 already fixed the id
weaknesses). Required companion fix: window-level keyboard shortcuts are now
gated on the **active** pane (`CanvasStage.shortcutsEnabled` ←
`CanvasSurface.active`) — every mounted stage listens on `window`, so in split
view a shared clipboard would have double-pasted (and undo/zoom/tools already
double-fired — a latent split-view bug this closes too). UX.md updated.

Original note:

`src/canvas/engine/clipboard.ts` is an in-memory buffer **per
EditorProvider**, and each pane gets its own provider
(`src/canvas/shell/surfaces/CanvasSurfaces.tsx:325`), so copying in the
Sketch pane and pasting in Current cannot work. Lift the element-clipboard
buffer to a canvas-shell-level service shared by all EditorProviders
(keeping per-pane paste semantics: target document, id remap via existing
`clipboard.ts` machinery), or serialize elements into the system clipboard
with a custom MIME type (also unlocks cross-project paste). Fix L8's id
weaknesses while in there.

## ✅ DONE — G7 — Ungroup/unwrap (MISSING; wrap exists)

`unwrapElement` (inverse of `wrapElements`): reparents children to the grandparent
via `reparentElements` (absolute position + rotation preserved), re-inserts them at
the container's sibling slot, removes the empty container, selects the children.
Wired to `useCanvasCommands.unwrap`, the layers/canvas context menu (shown for a
single container with children), and a rebindable `canvas.selection.ungroup` command
(default ⌘⇧G). UX.md updated; round-trip unit-tested.

Original note:

`wrapElements` exists (`elementHierarchy.ts`); its inverse doesn't —
restructuring is one-way. Add `unwrapElement`: reparent children to the
grandparent preserving absolute positions (account for parent rotation),
remove the empty wrapper, select the children. Menu + shortcut via the
command registry.

## ✅ DONE (minimum viable) — G8 — Multi-selection editing in the inspector (MISSING)

New `MultiSelectTab`: shared X/Y/W/H and Opacity % fields (common value or a
"Mixed" placeholder; commits fold `updateElementGeometry`/`updateElementStyles`
over every editable selected element) plus a solid-fill batch apply using the
same write-patch translation as ElementTab (text → glyph color). Linked
instances/descendants and locked nodes are skipped. Boolean ops stay below.
Full per-section mixed editing (typography, borders, effects…) remains a
follow-up. UX.md updated.

Original note:

`Inspector.tsx:376-399`: >1 selected shows an empty state + Boolean ops
only. No mixed-value display ("Mixed" placeholder), no batch apply. Minimum
viable: shared X/Y/W/H + opacity + fill batch-apply with mixed indicators;
sections read from the first element and write to all selected.

## G9 — Real color picker with alpha (native input only today)

No popover picker (saturation square, hue + alpha sliders, recent colors,
eyedropper); only the OS `<input type=color>` (sRGB 6-hex) + a hex text
field. No alpha control on any `InsColor` consumer (border, underline, text
stroke, shadow, typography color) — which is why L1 seeds opaque black.
Eyedropper exists only on `FillColorField`, not on `InsColor` consumers.
Build one shared picker popover used by both `FillColorField` and
`InsColor`, with 8-digit-hex/alpha support end-to-end.

## G10 — Rich text spans (MISSING; largest structural item)

`content?: string` — one style per text element; mixed weight/color inside a
paragraph ("Already have an account? **Sign in**") forces multi-element
hacks. Requires `content` → styled-runs model in the domain scene format,
`TextEditing*` (selection-aware style application), `compileTypography`
per-run, and export. Floor requirement for real product copy; schedule as
its own multi-phase effort. `SCHEMA_VERSION` bump + reseed is acceptable
(local-only, no migrations).

## ✅ DONE — G11 — On-canvas gradient editing (panel-only today)

New `GradientEditOverlay` (a DOM overlay like TextEditingOverlay, not a Skia
tooling command): toggled per gradient card via "Edit on canvas" (editor state
`activeGradientEdit`, cleared on selection change). Draws the rotation-aware
gradient axis + a ball per stop + endpoint handles; drag a stop to move it,
drag an endpoint to re-angle (Shift snaps 15°), double-click the axis to
insert a stop seeded with the nearest stop's color. Drags are transient
frames committed once on release. Radial shows its stops along a radius
(no angle handles). UX.md updated.

Original note:

Stops/angle are numeric-panel-only (`FillSection`). Draw the gradient axis +
stop handles in `CanvasToolingLayer` when a gradient fill row is active in
`FillSection`; drag stops on canvas, double-click axis to add a stop.

## ✅ DONE — G12 — Workflow small-unlocks bundle

All six landed, one commit each (plus a stage/tree context-menu unification
that closed a G1/G7 doc-code divergence found on the way):

- **Alt-drag duplicate** — new `canvas.drag.duplicate` modifier (default Alt);
  the first moved frame clones in place via `duplicateElements({offset: 0})`
  and drags the clones; `historyBeforeDocument` keeps commit/undo/Escape
  clone-free. Body drags only — Alt on handles stays resize-from-center.
- **Click-collapse** — a no-drag click on an element of a multi-selection
  collapses the selection to it on mouseup.
- **Multi-select z-order** — `bringElementsToFront` / `sendElementsToBack` /
  `reorderElements` preserve relative order per sibling list; both context
  menus gate on any selection; single-id functions are wrappers.
- **Free two-point lines/arrows** — end handles now edit the ENDPOINT (pin the
  opposite end, re-derive length + angle; Shift snaps 15°); draw already
  followed the drag angle. Arrowheads deferred to the SVG target (F3/G13).
- **Select-all / cut / zoom-to-selection** — `canvas.selection.selectAll`
  (mod+A, isolation-aware, skips locked/hidden), `canvas.clipboard.cut`
  (mod+X), `canvas.viewport.zoomToSelection` (Shift+2 by physical code; frames
  the selection union via a one-shot `requestSelectionFocus`).
- **Hover measurement** — with the parent-distances modifier held, hovering a
  non-selected element measures selection↔hovered (`getRectDistanceSegments`:
  per-axis gap lines when disjoint, four insets on containment; union bounds
  for multi-selections); no eligible hover falls back to parent distances.

UX.md updated per item; engine changes unit-tested.

## G13 — Per-side borders + stroke center (blocked on SVG render target)

Real UIs are full of bottom-only dividers and tab underlines; currently only
uniform border or a hacked line element. Requires the documented HTML↔SVG
render-target promotion (`docs/inspector-border-stroke.md`); F2/F3 land with
the same work. Sequence after the higher items unless the SVG target is
pulled forward.

## ✅ DONE — G14 — Bind typography/spacing/radius tokens (colors only today)

New `ElementStyles` refs: `radiusRef` (→ borderRadius), `gapRef`/`paddingRef`
(→ spacing), `typeStyleRef` (→ font family/weight/size). Binding writes the
ref plus the token's concrete value(s) as fallbacks; the renderer overlays the
LIVE token values (`withTokenBoundStyles` in ElementRenderer, using the
existing resolveTokenRef + new `resolveTypeStyleTokenRef`), so master changes
re-render bound elements immediately — same contract as colorRef. Any manual
edit of the concrete field (inspector inputs/sliders, the canvas radius-ball
drag) clears the ref. Bind UI: `InsTokenBind` selects in Typography ("Style
token"), Appearance ("Token" under Radius), Layout ("Gap token" / "Pad
token"). Known limit (documented in types.ts): text-fit measurement reads the
fallbacks, so a live typography-token change re-renders but does not
re-measure fit boxes until the element is next edited. UX.md updated.

Original note:

`TypeStyleToken`, `SpacingToken`, `RadiusToken` exist in System Design
(`src/domain/system-design/types.ts`) but are not bindable from the canvas —
`ElementStyles` has no typography/spacing/radius refs (only
`allowedFontSizes`/`defaultFontFamily` at creation). Add
`typeStyleRef`/spacing/radius refs to `ElementStyles`, resolve like
`colorRef`, bind UI in Typography/Layout sections. Without it, "design
system" only covers colors/gradients on canvas.

## G15 — Explicit "no fill" state

Figma allows an empty fills list; this app resurrects a phantom fill (M11).
Covered by M11's fix; listed here because it is also a parity item.

---

# 8. Suggested fix order

1. **H1 → H2** — the two history-corruption paths; both are small guards.
2. **H3** — transient scrubbing for sliders/color inputs (also collapses P6's
   memory ceiling and most of P4's per-tick cost).
3. **P3** — one-line `changedIds` for text editing.
4. **P1** — zoom projection strategy (measure first; biggest felt win on
   real scenes).
5. **M3, M4, M5, M7** — small interaction-correctness fixes, independent.
6. **M10–M14 + L1–L7, L17–L19** — inspector correctness batch (still one
   item per commit).
7. **M1 + M2** — ancestor-rotation transform work (shared helper), then
   M8 + M9 (text overlay).
8. **G1 (align/distribute) + G2 (nudge)** — the two items that most change
   "can I actually design here".
9. **G4, G5, G7, G12** — small parity unlocks.
10. **G6** — clipboard service (Product.md conformance).
11. **G3 (fonts), G9 (color picker), G8 (multi-select inspector)** — bigger
    UI efforts, UX.md updates required.
12. **G11, G14, F-items, G13, G10** — larger/blocked-on-SVG-target items;
    G10 (rich text) last as its own multi-phase effort.
