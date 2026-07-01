# SVG / Vector Editing — State & Correction Plan

Status: **bug list resolved** (2026-07-01) — the rendering-model flaw (§3) and the
correctness bugs in §4 are fixed (B1–B19; B4 subsumed by B1, B6 partial — see the
tables). Scope: the canvas editor (`apps/desktop/src/canvas`), not the Builder
(`/generate`).

This is a rewrite. The previous version was a greenfield *proposal* that had
already been built past — it described adding types/tools/renderers that now exist,
and it recommended a rendering model (`preserveAspectRatio="none"` over a fixed
intrinsic viewBox) that is the **root cause** of the "stroke gets fat / distorted
on resize" bug. The correct model, proven by the three reference tools, is
documented in §3.

Docs reference code as `src/...`, meaning `apps/desktop/src/...`.

---

## 0. Ground truth from the reference tools

Three tools were researched. They **converge on one answer** for how a
resize must be handled, and it is the opposite of what the old plan proposed.

| Tool | Renderer | How it resizes a path | Stroke on non-uniform resize |
| --- | --- | --- | --- |
| **Penpot** (SVG in the DOM — our exact analog: ClojureScript + React + SVG) | real `<path d>`, coords in canvas space | **bakes**: multiplies the affine matrix into every coordinate (`impl-transform-segment`) | **uniform** — no scale is left on the element; no `vector-effect` |
| **paper.design** (DOM) | real `<svg><path>` | rebakes the `d` (inferred) | uniform |
| **Figma** (canvas / WebGL) | tessellated mesh | geometric offset | uniform; inside/center/outside native |

**None of the three keeps a fixed intrinsic viewBox and stretches it.** Penpot —
which is literally our architecture — proves the pattern: **bake the coordinates on
resize** so the scale never lives on the element (only rotation stays on a
`<g transform>`). Then `stroke-width` is a plain scalar applied in a 1-unit = 1-px
space and can never distort.

Critical web-platform fact (confirmed via MDN + the paper.design research):
`vector-effect="non-scaling-stroke"` only counteracts an **SVG-space transform**,
**not** a CSS/`width`/`height` resize of the element. So it cannot rescue the fixed
viewBox + `preserveAspectRatio="none"` approach.

| Concern | Layer | File |
| --- | --- | --- |
| Vector content | DOM / React | `canvas/stage/ElementRenderer.tsx` |
| Anchors, handles, selection | overlay | `canvas/stage/canvasToolingRenderer.ts` |
| Pan/zoom transform | world layer | `canvas/stage/CanvasStage.tsx` |

Sources:
[Penpot common architecture](https://help.penpot.app/technical-guide/developer/architecture/common/),
[Penpot path perf PR #6263](https://github.com/penpot/penpot/pull/6263),
[Penpot stroke-scale issue #3340](https://github.com/penpot/penpot/issues/3340),
[Figma vector networks (Alex Harri)](https://alexharri.com/blog/vector-networks),
[Figma HandleMirroring](https://developers.figma.com/docs/plugins/api/HandleMirroring/),
[MDN vector-effect](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/vector-effect),
[Inner/outer strokes in SVG](https://alexwlchan.net/2021/inner-outer-strokes-svg/).

---

## 1. What is already implemented

Contrary to the old draft, pen/pencil/svg/path are **wired end-to-end**. Verified
against the code:

- **Tools & toolbar:** `canvas/tools.ts` `INSERT_TOOLS` has `pen`/`pencil`/`svg`;
  `canvas/toolbarConfig.tsx` has the icons and entries (the `svg` entry is labeled
  **"SVG"**, not "Icon"); `domain/settings/commands.ts` `CANVAS_TOOL_COMMANDS`
  maps them to `canvas.tool.*`.
- **Engine types:** `canvas/engine/types.ts` `ElementType` includes `"path"` and
  `"svg"`; `Tool` includes `pen`/`pencil`/`svg`; `ElementNode` has `content?`,
  `viewBox?`, `path?`; `EditorState` has `pathEditId`; the `Interaction` union has
  `PenInteraction` / `PencilInteraction` / `AnchorEditInteraction`.
- **Definitions & creation:** `elementDefinitions.ts` has `path`/`svg` defs +
  `TOOL_TO_ELEMENT_TYPE`; `mutations/elementCreate.ts` maps `pen`/`pencil → "path"`,
  `svg → "svg"`, with `elementTypeLabel` returning "Path"/"SVG".
- **Maps:** `canvas/stage/canvasShellStyle.ts` `TOOLBAR_TOOL_MAP` and
  `EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP` already map `svg → "svg"` and include
  `pen`/`pencil`. (The old plan claimed `svg → "icon"` and no pen/pencil — false.)
- **Styles:** `domain/canvas/types.ts` `ElementStyles` already carries the full
  vector block (`fill`, `fillOpacity`, `fillRule`, `stroke`, `strokeWidth`,
  `strokeOpacity`, `strokeLinecap`, `strokeLinejoin`, `strokeDasharray`,
  `strokeAlign`, `strokeRef`) plus `fills?: Fill[]`.
- **Render branches:** `ElementRenderer.tsx` has dedicated `path-element` (~509)
  and `svg-element` (~547) branches.
- **Vector library (all present):** `canvas/engine/vector/` has `pathData.ts`
  (structured ↔ `d` codec, well-written), `boolean.ts`, `sanitizeSvg.ts`,
  `shapeToPath.ts`, `simplify.ts`, `svgImport.ts`, `vectorGeometry.ts`; mutations
  in `canvas/engine/mutations/vectorPath.ts` and `vectorOps.ts`.
- **Hit-testing:** `canvasHitTesting.ts` `ToolingHit` already has `path-anchor` /
  `path-handle` / `path-segment` / `path-empty` variants; `hitTestTooling` exported.

So the tool-bridging "Phase 0" and most of Phases 1–7 exist. The work that remains
is **correctness** (§4), not scaffolding.

---

## 2. Data model (as built — keep)

`canvas/engine/types.ts`:

```ts
export type VectorAnchor = {
  x: number; y: number;               // path-local space (see §3)
  inX?: number; inY?: number;         // in-handle, relative to anchor (absent = corner)
  outX?: number; outY?: number;       // out-handle, relative to anchor
  handleType?: "corner" | "mirrored" | "asymmetric";
};
export type VectorSubpath = { anchors: VectorAnchor[]; closed: boolean };
export type VectorPath = { subpaths: VectorSubpath[]; fillRule?: "nonzero" | "evenodd" };
```

`handleType` maps cleanly onto Figma's `HandleMirroring`: `corner` = `NONE`,
`mirrored` = `ANGLE_AND_LENGTH` (shared tangent + equal length), `asymmetric` =
`ANGLE` (shared tangent line, independent lengths). This is correct — keep.

Multi-subpath is required (holes, boolean results, multi-`M` imports, `fill-rule`)
and is already modeled. Keep.

---

## 3. The rendering model — the fix (C1)

### 3.1 What the code does today (the bug)

`ElementRenderer.tsx` renders the path as `<svg viewBox="0 0 vb.w vb.h"
preserveAspectRatio="none" width="100%" height="100%">`, and
`vector/vectorGeometry.ts` computes an **anisotropic** scale
(`sx = width / vb.width`, `sy = height / vb.height`, independent). A freshly-drawn
path has `sx = sy = 1`, so it looks fine. The moment the user **resizes the box
non-uniformly**, `sx ≠ sy`, and `preserveAspectRatio="none"` stretches the path
*and its stroke*: a `strokeWidth: 2` renders as `2·sx` horizontally and `2·sy`
vertically → a fat, lopsided line. **This is the "line got too big / weird" bug.**

### 3.2 The correct model (bake — Penpot)

Store anchors in **path-local pixel space where 1 unit = 1 px** and render with a
viewBox that **matches the box**, default `preserveAspectRatio`:

```tsx
// viewBox tracks the box; NO preserveAspectRatio="none".
<svg width="100%" height="100%" viewBox={`0 0 ${node.width} ${node.height}`}
     style={{ overflow: "visible", display: "block" }}>
  <path d={pathToSvgPathData(node.path)} /* fill/stroke as today */ />
</svg>
```

On resize, **do not** leave a scale on the element. Instead **bake** the affine map
into every coordinate:

- `resizeSingleElement` (`canvas/stage/canvasDocumentMutations.ts`) currently sets
  `node.width/height` directly. For a `path` node it must **also** multiply each
  anchor + handle by the box scale ratio (`sx = newW/oldW`, `sy = newH/oldH`),
  keeping the model in a 1-unit = 1-px space (`sx = sy = 1` afterward).
- Because `stroke-width` is a scalar in that space, the stroke stays a **uniform
  width** even when the geometry is stretched — exactly Penpot's behavior with
  "scale stroke" off. (If we ever want Figma's "scale stroke on", multiply
  `strokeWidth` by the scale too — a per-element toggle, not the default.)
- **Rotation** stays as `node.rotation` on the wrapper transform, like every other
  element. Only rotation lives on a matrix; scale/skew are baked.

This deletes `vectorGeometry.ts`'s `sx/sy` split for rendering (it may stay as a
helper for pointer→path-space mapping, but with `sx = sy = 1` it becomes a pure
translate). It also removes `preserveAspectRatio="none"` — the single line that
causes the distortion.

### 3.3 `svg` container

`type === "svg"` renders a transparent positioning box whose child `path` nodes
render through the normal hierarchy (no raw markup injected). This is already
correct — keep. Its children inherit the same baked-coordinate model.

---

## 4. Remaining bug list (the real work)

Full audit of the vector code (render, mutations, import, sanitize, booleans,
overlay, hit-testing, pen state machine). Ordered by severity. The **anisotropic
scale is the root cause of B1/B4/B6** — fixing it (§3.2 bake) resolves all three.

### Critical / high

| # | Status | Where | Bug | Fix / reference |
| --- | --- | --- | --- | --- |
| **B1** *(critical, root)* | ✅ done | `ElementRenderer.tsx` (`preserveAspectRatio="none"`) + `vector/vectorGeometry.ts` (anisotropic `sx/sy`) | Stroke distorts on non-uniform resize — the "fat line". | §3.2: bake coordinates, viewBox = box, drop `preserveAspectRatio="none"`. Penpot `impl-transform-segment`. Baked in `canvasDocumentMutations.ts` (`scaledPath`/`bakePathResize`). |
| **B2** | ✅ done | `mutations/vectorPath.ts` `insertAnchorOnSegment` | No De Casteljau split — drops a point on the curve with ~`0.0001` handles, leaves neighbors' handles untouched → **inserting a point on a curve deforms it**. | `splitSegmentAt(t)` via De Casteljau; re-derive `from.out`/`to.in`. Figma `splitSegmentAt`. |
| **B3** | ✅ done | `mutations/vectorPath.ts` `recomputePathBounds` (~L260) | Ignores rotation: `node.x += b.minX * sx` re-bases in unrotated space → a rotated path **jumps** after an anchor edit. | Offset the origin along the rotated basis (`node.rotation`) — residual `(M−I)·d`. |
| **B4** | ✅ subsumed by B1 | `vector/vectorGeometry.ts` `canvasDeltaToPathSpace` + `mutations/vectorPath.ts` `applyContinuity` | Mirrored/asymmetric continuity is computed in path space; on a non-uniformly scaled path (`sx≠sy`) the opposite handle renders **non-collinear / unequal** — visible asymmetry. | After bake `sx=sy=1`, so continuity is already collinear/equal — no separate change. |
| **B5** | ✅ done | `vector/svgImport.ts` (~L75-152) | Element/group `transform` (`translate/scale/rotate/matrix`) **ignored** on import → shapes land at wrong position/scale/rotation. Very common in real SVGs (Illustrator/Figma nest transformed groups). | Accumulate ancestor transforms; bake into imported anchor coords (points by full affine, handles by linear part). |
| **B6** *(design limitation)* | ⚠️ partial | `vector/boolean.ts` + `mutations/vectorOps.ts` | Booleans flatten curves to 16-seg polygons and return **corner-only** anchors (all curves lost); use only the **largest subpath** per operand (holes/donuts dropped); force open subpaths closed; drop shared-vertex/coincident intersections (Greiner–Hormann degeneracy); `exclude` isn't a real XOR; `toCanvasPath` **ignores rotation**. | Rotation now baked in `toCanvasPath` (fixed). The GH clipper rework on the segment model (Penpot `bool.cljc`) remains a **separate decision** — still approximate. |

### Medium

| # | Status | Where | Bug | Fix |
| --- | --- | --- | --- | --- |
| **B7** | ✅ done | `vector/sanitizeSvg.ts` | Misses `<style>` element text and `url(...)` external refs (in stylesheets and `style=` attrs); prefixed tags (`svg:script`) bypass the tag set. `foreignObject` **is** stripped (good). | Strip `<style>`; reject attrs with external `url()`; match on local name. |
| **B8** | ✅ done | `vector/svgImport.ts` `num()` | `parseFloat` mis-parses `%` and unit suffixes (`50%`→50, physical units ignored) → wrong sizes / bogus 100×100 intrinsic box. | Parse unit suffix: px/unitless pass, absolute units (pt/pc/in/cm/mm/Q) → px @96dpi, `%`/font-relative rejected. |
| **B9** | ✅ done | `vector/shapeToPath.ts` | `rectPath` ignores `borderRadius` (rounded rect flattens to sharp corners); `regularPolygonPath`/`starPath` hardcode **5 sides/points** and use half-box radius (distorts non-square). *(Confirm whether polygon/star nodes store a side count.)* | `rectPath` honors radius (KAPPA corners). Polygon/star are fixed shapes with **no** stored side count → left as-is. |
| **B10** | ✅ done | `canvasHitTesting.ts` (~L429) | Segment split `t` is **quantized to 12 values** (sample midpoints), discarding the exact projection → insert-point snaps coarsely on curves (compounds B2). | Use the exact projected `t` from `projectToSegment`. |
| **B11** | ✅ done | `useCanvasPointerEvents.ts` (~L498-520) | Tool switch **without a pointer move** leaves a stale `PEN_CURSOR` (cursor only rewritten on move). | Reset `viewport.style.cursor` on tool change (effect keyed on `state.tool`). |
| **B12** | ✅ done | `mutations/vectorPath.ts` `deleteAnchor` + edit lifecycle | Alt-removing every anchor leaves an **orphan empty path node** and stays stuck in edit mode. | Delete the node + exit edit when the path becomes empty. |
| **B13** | ✅ done | `mutations/vectorOps.ts` (~L138-155) | Boolean of 3+ selected folds only the **first two**; result reparented to **root**, losing the frame/container parent. | Fold all N in z-order; keep parent + stacking index. |

### Low

| # | Status | Where | Bug |
| --- | --- | --- | --- |
| **B14** | ✅ done | `canvasHitTesting.ts` (~L412-425) | Hit priority is **handle > anchor** (all handles before any anchor) → can't grab an anchor sitting under a knob. Figma/Penpot give the anchor priority. |
| **B15** | ✅ done | `pathEditGeometry.ts:50` | `selected` hardcoded `false` → the active anchor **never renders highlighted**. Now highlights the last-placed anchor of the active open subpath while the pen is active. |
| **B16** | ✅ done | `canvasHitTesting.ts` | The close ring is drawn but **not hit-tested**; clicking the ring's outer annulus (beyond the 4.5px anchor box) doesn't close the subpath. |
| **B17** | ✅ done | `vector/svgImport.ts` | `fill-opacity`/`opacity` = `"inherit"` → stored as `NaN`. |
| **B18** | ✅ done | `canvasVectorInteraction.ts` (~L113) | First pen anchor is pixel-rounded (origin) while later anchors aren't → sub-pixel offset of vertex 0. |
| **B19** | ✅ done | `useCanvasPointerEvents.ts` | Pressing/releasing Alt over an anchor doesn't update the remove-cursor until the pointer moves. |

### Confirmed **not** bugs / already correct

- **C5 (chrome at zoom) — PASS.** The overlay projects anchors/handles to screen
  space and draws with fixed pixel sizes (`ANCHOR_SIZE=7`, `HANDLE_KNOB_RADIUS=3.5`),
  canvas scaled by DPR only — constant on-screen at every zoom (Penpot's outcome).
- **StrictMode** — reducers are pure; interaction state lives on refs in event
  handlers, outside the double-invoke scope. Clean.
- `pathData.ts` codec (incl. arc/quadratic → cubic) — correct; `sampleSegment`
  handles relative handles correctly.
- Pointer capture released on finish/cancel/Escape — no leak. Per-anchor undo works.
- `handleType` mapping (§2); **center-only** stroke recommendation (§8).

**Fix order (all landed 2026-07-01):** B1 (fat line — unlocks B4) → B2 (+B10)
(curve-preserving insert) → B3 (rotation) → B5 (import transforms) → B7 (sanitize)
→ B11/B12 (cursor + orphan) → the rest. Only B6's Greiner–Hormann clipper rework
remains open (a larger, separate decision).

---

## 5. Interaction model (as built — keep, with C2/C3 fixes)

- **Pen** — click = corner anchor; click-drag = symmetric handles; click first
  anchor = close. Lives in `CanvasToolingLayer.tsx`, which branches on
  `interactionType` (`"draw"`/`"drag"`), **not** `isInsertTool` (old plan was
  wrong on this). Each anchor placement is a `commitDocument` (the reducer action
  in `store.tsx`, **not** `history.ts`) for per-anchor undo.
- **Edit mode** — `pathEditId` on `EditorState`; enter on double-click/`Enter`,
  exit on `Esc`/tool switch (mirrors the `editingTextId` lifecycle). Anchors +
  handles drawn on the overlay; hit-tested via `hitTestTooling`.
- **Pencil** — freehand sampling → `vector/simplify.ts` (RDP + curve fit) → same
  `path` type.
- **Mutations** — `mutations/vectorPath.ts`: `appendAnchor`, `updateAnchor`,
  `updateHandle` (with `applyContinuity`), `insertAnchorOnSegment` *(fix C2)*,
  `deleteAnchor`, `closeSubpath`, `setHandleType`, `setFillRule`,
  `recomputePathBounds` *(fix C3)*.

Cursors: four pen states (`cursor-pen*.svg`, all present in `public/`) driven off
`hitTestTooling`, next to `RADIUS_CURSOR` in `useCanvasPointerEvents.ts`.

---

## 6. SVG as a sealed component (planned — still valid)

> **Business rule — "SVG is a sealed component" (planned).** Indexed in
> `docs/planned/product-backlog.md`; fold back into `Product.md` as `[NOW]` when
> built. Consistent with Product.md laws #8 (components form automatically) and #9
> (edit in isolation).

An imported/inserted `svg` is a container node with child `path` nodes, so the
existing `hasChildren → component` rule (`canvas/shell/tree/treeHelpers.ts:245`)
already classifies it as a component. Two behaviors make it *sealed*:

1. **Tree hides internals by default.** In `treeFromCanvasDocument`, treat
   `node.type === "svg"` like a `linked` instance and return `children: []`,
   surfacing the same open/"go to" affordance (`TreeRow.tsx`, `IconOpenCanvas`).
   Overridable by the §6.1 global setting.
2. **Edit only via isolation.** On the main canvas the `svg` shows only its frame;
   paths aren't directly selectable from outside. To edit them you open/isolate the
   svg (`setIsolatedParent`, `useCanvasNavigation.ts → openCanvasForNode`). Pen /
   anchor editing is active **only** when the svg is the isolated subject. **Not**
   affected by §6.1 (that setting is tree visibility only).

### 6.1 Config — reveal SVG internals in the tree

Global canvas setting `canvas.shell.tree.revealSealedComponentChildren: boolean`,
default `false`, alongside the existing `autoRevealSelection`
(`domain/settings/types.ts` `CanvasShellSettings.tree`, `domain/settings/defaults.ts`).
When `true`, `treeFromCanvasDocument` recurses into an svg's `path` children
instead of forcing `children: []`. Changes **tree rendering only** — never the
editing surface (behavior #2 holds regardless, so laws #8/#9 stand).

---

## 7. SVG import & shape conversion (as built)

- **Paste / file import** → `vector/sanitizeSvg.ts` (drops `<script>`, event
  handlers, external refs) → `vector/svgImport.ts` decomposes into one `svg`
  container node + one child `path` per `<path>`/`<rect>`/`<circle>`/… via
  `svgPathDataToPath` / `shapeToPath.ts`. Matches the paper.design container +
  child-path shape and the product's decomposition ethos. Because we build our own
  nodes and never use `dangerouslySetInnerHTML`, there is no live-markup XSS
  surface.
- **Convert shape → path** — `shapeToPath.ts` emits `rect`/`ellipse`/`polygon`/
  `star` geometry as `VectorAnchor[]` (a "Flatten to path" inspector action).

---

## 8. Stroke alignment (deferred)

SVG has no native `stroke-alignment`; strokes are always centered (Figma does
inside/outside because it tessellates on a canvas). Options: (a) ship
**center-only** now (honest, simplest); (b) later, emulate inside/outside by
rendering the stroke on a duplicate path clipped/masked to the fill with doubled
`strokeWidth`; (c) outline the stroke into a fill path at export. **Recommend (a)
now, (b) later.** `strokeAlign` is stored regardless (forward-compatible).

---

## 9. Phase status

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | Bridge tool systems (types, defs, creation, maps, commands) | **done** |
| 1 | `path` data model + DOM render + fill/stroke inspector | **done** (render model fixed — B1 ✅) |
| 2 | Pen tool + overlay anchors/handles + cursors | **done** (B11/B18/B19 ✅) |
| 3 | Edit mode: move/insert/delete anchors, handle types | **done** (B2/B3/B4/B10/B12 ✅) |
| 4 | Snapping (pixel grid, anchor snap, angle constraint) | present; chrome-at-zoom **PASS** (C5) |
| 5 | Pencil (freehand → simplified path) | **done** (`simplify.ts`) |
| 6 | SVG import + convert shape → path | **done** (B5/B7/B8/B9 ✅) |
| 7 | Boolean ops (multi-subpath results) | **done** (B13 ✅, B6 rotation ✅); GH clipper still lossy → B6 rework separate |
| 8 | Stroke alignment, flip/mirror, dash presets | deferred (§8) |

**Priority order (all landed 2026-07-01):** B1 (fat line, unlocks B4) → B2/B10
(curve-preserving insert) → B3 (rotation) → B5 (import transforms) → B7 (sanitize)
→ B11/B12 → rest. Only B6's boolean-clipper rework remains open (separate decision).

---

## 10. Risks & decisions

- **Resize semantics.** Baking (§3.2) means resize **stretches geometry** but keeps
  **uniform stroke** (Penpot default). A per-element "scale stroke with resize"
  toggle can be added later (multiply `strokeWidth` by the bake scale).
- **`svg` vs legacy `icon`.** The `svg` tool is now vector import/container; the
  legacy fixed-star `icon` element still exists on its own entry. Decide whether to
  retire `icon` eventually.
- **Boolean ops.** `boolean.ts` is hand-rolled (like Penpot's `bool.cljc`, which
  uses no external lib). Audit its intersection/split correctness before relying on
  it in production.
- **Cursor hotspot.** `4 4` nib estimate for the `0 0 33 32` art; tune by eye (all
  four pen cursors must share it).
</content>
