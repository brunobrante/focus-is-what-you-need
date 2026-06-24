# SVG / Vector Editing — Implementation Plan

Status: proposal (revised)
Scope: the canvas editor (`apps/desktop/src/canvas`), not the Builder (`/generate`).
References: https://paper.design/docs/svg — and the real paper.design DOM (below).

This plan adds first-class **vector path editing** (pen/pencil, anchor/handle
editing, fill + stroke, SVG import, boolean ops) to the canvas engine. It is
modeled on paper.design because they use the same **Canvas + DOM hybrid** this
project already uses, so their architecture transfers directly. Every section says
**where** to put code and **how**, with exact files.

---

## 0. Ground truth from the real paper.design DOM

A captured node from paper.design's canvas:

```html
<div style="contain: strict;">                                 <!-- root -->
  <div style="transform: matrix3d(...);">                      <!-- world layer: pan/zoom -->
    <div inert style="background: #282828; transform: matrix3d(...);"></div>
    <svg data-node-id="1P-0" viewBox="0 0 302 256" width="302" height="256"
         style="left:-2189px; top:-1324px; position:absolute;">   <!-- container node -->
      <path data-node-id="1Q-0" fill-rule="evenodd"
            d="M 117.5 209.5 L 147 228 C 156 221 169.5 210.5 173 207 ..."
            fill="none" stroke="#FFFFFF"></path>                  <!-- child path node -->
    </svg>
  </div>
  <canvas aria-hidden="true" width="3284" height="1858"
          style="position:fixed; top:0; left:0; width:1642px; height:929px;"></canvas>
</div>                                                            <!-- tooling overlay -->
```

Four hard facts this proves, which drive the design below:

1. **Content is DOM `<svg><path/></svg>`; tools are a `<canvas>` overlay** (`position:fixed`,
   `aria-hidden`, device-pixel sized = 2× DPR). This is exactly our split:
   `ElementRenderer.tsx` (DOM) + `canvasToolingRenderer.ts` (overlay canvas).
2. **`viewBox` is intrinsic and separate from `width`/`height`.** The `d` lives in
   viewBox space (`0 0 302 256`); resizing changes `width`/`height` and the path
   scales for free. → §3.2 (NOT `viewBox="0 0 ${width} ${height}"`).
3. **SVG is decomposed into nodes**: the `<svg>` is one node (`1P-0`) and the
   `<path>` is its child node (`1Q-0`). → §3.4 (container node + child path nodes,
   reusing our existing parent/child hierarchy — not a raw markup blob).
4. **`fill-rule="evenodd"` is a default attribute on every path.** → §3.3.

| Concern | Layer | File |
| --- | --- | --- |
| Vector content | DOM / React | `canvas/stage/ElementRenderer.tsx` |
| Anchors, handles, snap guides, selection | overlay canvas | `canvas/stage/canvasToolingRenderer.ts` |
| Pan/zoom transform | world layer `matrix3d` | `canvas/stage/CanvasStage.tsx` |

"Edit a vector" = render the path in the DOM layer + draw anchors/handles on the
overlay. No new rendering tech — a new element type + a new overlay pass.

---

## 1. What already exists (scaffolding) — and what's wrong

The **UI tool union is already ahead of the engine**:

- `canvas/tools.ts` → `INSERT_TOOLS` **already lists `"pen"`, `"pencil"`, `"svg"`**.
- `canvas/toolbarConfig.tsx` → `ICONS` + `TOOL_ENTRIES` already have `pen`
  (`IconPen`), `pencil` (`IconPencil`), `svg` (`IconSvgShape`, labeled **"Icon"**).
- `domain/settings/commands.ts` → `CANVAS_TOOL_COMMANDS` already maps
  `pen`/`pencil`/`svg` to `canvas.tool.*` command ids.

But the **engine doesn't know them**, and two maps are wrong:

- `canvas/engine/types.ts` → `ElementType` and `Tool` have **no** `path`/`svg`/`pen`/`pencil`.
- `canvas/engine/mutations/elementCreate.ts` → `TOOL_TYPES` / `DEFAULT_SIZE_RANGES`: no entries.
- `canvas/engine/elementDefinitions.ts` → `DEFINITIONS` / `TOOL_TO_ELEMENT_TYPE`: no entries.
- `canvas/stage/canvasShellStyle.ts` → `TOOLBAR_TOOL_MAP` maps **`svg → "icon"`** (wrong;
  that's the fixed-star icon element) and **has no `pen`/`pencil`**;
  `EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP` likewise. → fix in §7.

So clicking pen/pencil/svg today is a no-op at the engine level. **Phase 0 bridges
the two tool systems**, then the vector element is built on top.

Precedent: the `icon` element already renders inline `<svg viewBox="0 0 24 24"><path/></svg>`
in `ElementRenderer.tsx` (~lines 310–323). The `path` element generalizes that with
editable, persisted data. `ElementNode` already has a `content?: string` field
(`canvas/engine/types.ts`) — reuse it; no new `svgContent` field needed.

---

## 2. Data model

All additions are plain JSON (the persistence layer stringifies `CanvasDocument`;
see `docs/save-architecture.md`). No binary, no circular refs.

### 2.1 New types — `canvas/engine/types.ts`

```ts
export type ElementType =
  | "rect" | "ellipse" | "text" | "image" | "icon"
  | "line" | "arrow" | "polygon" | "star"
  | "path"   // one editable vector node (pen/pencil output, or a child of an svg)
  | "svg";   // an imported SVG container that holds child "path" nodes

export type Tool =
  | "select" | "hand" | "scale" | "wrapper"
  | "rect" | "ellipse" | "text" | "image" | "icon"
  | "line" | "arrow" | "polygon" | "star"
  | "pen" | "pencil" | "svg";
```

### 2.2 Path representation — structured anchors, multi-subpath

Store **structured anchors** (the edit source of truth), not a raw `d` string. The
`d` is derived for rendering. **Critically, a path holds many subpaths** so it can
represent holes (boolean subtract, donuts), multi-`M` imported paths, and
`fill-rule`. A single-subpath model would break Phases 6–7.

```ts
export type VectorAnchor = {
  x: number; y: number;            // position in INTRINSIC viewBox space (see 2.4)
  inX?: number; inY?: number;      // in-handle, relative to anchor (absent = corner)
  outX?: number; outY?: number;    // out-handle, relative to anchor
  handleType?: "corner" | "mirrored" | "asymmetric"; // continuity when dragging a handle
};

export type VectorSubpath = { anchors: VectorAnchor[]; closed: boolean };

export type VectorPath = {
  subpaths: VectorSubpath[];
  fillRule?: "nonzero" | "evenodd";   // default "nonzero"
};
```

Add to `ElementNode` (optional, vector types only):

```ts
viewBox?: { width: number; height: number }; // intrinsic authoring space (see 2.4)
path?: VectorPath;                            // present when type === "path"
```

For `type === "svg"` the node is a **container**: it has no `path`, only a
`viewBox` and child `path` nodes via the existing `children`/`parentId` hierarchy.

### 2.3 Stroke + fill styles — `domain/canvas/types.ts`

> ⚠️ `ElementStyles` lives in **`domain/canvas/types.ts`** (re-exported through the
> engine), not in `canvas/engine/types.ts`. Earlier drafts pointed at the wrong file.

It already has `background`, `borderColor`, `borderWidth`, `opacity`, refs. Add
vector semantics (cheap in SVG, high value — Figma/paper expose all of these):

```ts
fill?: string;            // path fill ("none" allowed); falls back to `background`
fillOpacity?: number;     // 0..1
fillRule?: "nonzero" | "evenodd";   // mirrors VectorPath.fillRule on the inspector
stroke?: string;          // stroke color
strokeWidth?: number;
strokeOpacity?: number;   // 0..1
strokeLinecap?: "butt" | "round" | "square";
strokeLinejoin?: "miter" | "round" | "bevel";
strokeDasharray?: string; // e.g. "4 2" — dashed/dotted strokes
strokeAlign?: "center" | "inside" | "outside"; // see §9 (SVG caveat)
strokeRef?: string;       // design-token ref, like backgroundRef/colorRef
```

For `path`/`svg`, these drive SVG attributes; for every other element type they're
ignored (no behavior change).

### 2.4 Intrinsic viewBox (the resize fix)

Resize changes `node.width`/`node.height` **directly** (`resizeSingleElement`,
`canvas/stage/canvasDocumentMutations.ts:258`). If the rendered `viewBox` were
`0 0 width height`, the path would NOT scale — it would pin top-left at original
size. The paper DOM proves the fix: keep `viewBox` **fixed at the authored intrinsic
size** while `width`/`height` stretch the box.

- Anchors are stored in **intrinsic viewBox coords** (`node.viewBox.width/height`),
  not live element px.
- Render with `viewBox="0 0 ${node.viewBox.width} ${node.viewBox.height}"` and
  `width/height = "100%"`. Resize/rotate then reuse the **existing geometry
  pipeline untouched** and the path scales like paper.design's "scale SVG".
- Only **path edit mode** mutates anchors. `recomputePathBounds` (§5.4) normalizes
  `viewBox` to the anchor bbox and re-bases anchors after structural edits, so the
  box stays tight.

---

## 3. Rendering (DOM layer) — `canvas/stage/ElementRenderer.tsx`

Add branches before the generic `<div>` fallback, mirroring the `icon` branch.

```tsx
if (node.type === "path") {
  const vb = node.viewBox ?? { width: node.width, height: node.height };
  return (
    <div data-element-id={node.id} data-node-type="path"
         className={elementClassName(...)} style={boxStyle}>
      <svg width="100%" height="100%"
           viewBox={`0 0 ${vb.width} ${vb.height}`}
           preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <path d={pathToSvgPathData(node.path)}
              fillRule={node.path?.fillRule ?? node.styles.fillRule}
              fill={node.styles.fill ?? "none"} fillOpacity={node.styles.fillOpacity}
              stroke={node.styles.stroke} strokeWidth={node.styles.strokeWidth}
              strokeOpacity={node.styles.strokeOpacity}
              strokeLinecap={node.styles.strokeLinecap}
              strokeLinejoin={node.styles.strokeLinejoin}
              strokeDasharray={node.styles.strokeDasharray}
              vectorEffect={node.styles.strokeAlign ? undefined : undefined} />
      </svg>
    </div>
  );
}

if (node.type === "svg") {
  // Container: render its own <svg viewBox>, let child path nodes render inside.
  // Children come through the normal hierarchy render — do NOT inject raw markup.
}
```

Details:

- **`pathToSvgPathData(path: VectorPath): string`** — pure fn, new file
  `canvas/engine/vector/pathData.ts`. Walks every subpath: `M` first anchor; each
  `a → b` is `C a.out, b.in, b` when handles exist, else `L b`; emits `Z` when
  `subpath.closed`. Its inverse `svgPathDataToPath(d): VectorPath` parses imported
  `d` (handles `M m L l C c S s Q q H h V v Z`) for §8 import + shape conversion.
- `clipPath` must be `undefined` for path/svg (no polygon clip machinery).
- `renderScale` (thumbnails) needs nothing special — viewBox scales automatically.
- **Sanitize on import only**: when ingesting external SVG (§8), parse to nodes and
  drop `<script>`, event handlers, and external refs in
  `canvas/engine/vector/sanitizeSvg.ts`. Because we decompose into our own nodes
  and never use `dangerouslySetInnerHTML`, there's no live-markup XSS surface.

---

## 4. Cursors (pen / insert / remove / snap)

paper.design and Figma swap the pen cursor by **context**. We already do custom SVG
cursors: `useCanvasPointerEvents.ts:54` has
`const RADIUS_CURSOR = "url(/cursor-bend.svg) 4 3, pointer";` and sets
`viewport.style.cursor`. Same mechanism here.

**Assets (already added to `public/`):** `cursor-pen.svg`, `cursor-pen-insert.svg`
(pen + “＋”), `cursor-pen-remove.svg` (pen + “－”), `cursor-pen-snap.svg`
(pen + target dot). All share the same nib tip → **use one hotspot for all four**
so the tip doesn't jump between states. Nib tip ≈ `(4, 4)` in the `0 0 33 32`
viewBox.

**Where:** add constants next to `RADIUS_CURSOR` in
`canvas/stage/hooks/useCanvasPointerEvents.ts`:

```ts
const PEN_CURSOR        = "url(/cursor-pen.svg) 4 4, crosshair";
const PEN_INSERT_CURSOR = "url(/cursor-pen-insert.svg) 4 4, crosshair";
const PEN_REMOVE_CURSOR = "url(/cursor-pen-remove.svg) 4 4, crosshair";
const PEN_SNAP_CURSOR   = "url(/cursor-pen-snap.svg) 4 4, crosshair";
```

**When (state → cursor):** the hover handler already calls `toolingRef.hitTest(...)`
and sets the cursor from the hit. Extend the pen branch / `hitTestTooling` (§6) to
return one of these:

| Context | Cursor |
| --- | --- |
| `tool === "pen"`, free space | `PEN_CURSOR` |
| pen/edit mode, hovering an existing **segment** (will insert an anchor) | `PEN_INSERT_CURSOR` |
| pen/edit mode, hovering an existing **anchor** (Alt/⌥ will remove it) | `PEN_REMOVE_CURSOR` |
| pen, pointer **snapped** to a guide / anchor / pixel grid | `PEN_SNAP_CURSOR` |

Snap state comes from the snapping pass (§9 Phase 4). Reset to `PEN_CURSOR` when
none apply, and clear on tool switch in the existing cleanup block
(`useCanvasPointerEvents.ts:375`).

---

## 5. Interaction model

Existing creation is **drag-a-bounding-box** (`DrawInteraction`). The pen is
different: **click-to-place anchors**, multi-step, explicit commit. It needs its
own interaction plus a path **edit mode**.

### 5.1 Two gestures (paper.design parity)

1. **Pen (create/extend)** — click = corner anchor; click-drag = symmetric bezier
   handles; click first anchor = close. (paper "P")
2. **Edit mode (modify)** — with a path selected, double-click or `Enter` enters
   edit mode; anchors + handles become draggable on the overlay; double-click a
   segment inserts an anchor; Alt-click an anchor removes it. (paper "M" + double-click/Enter)

### 5.2 New interaction + state — `canvas/engine/types.ts`

```ts
export type PenInteraction = {
  type: "pen"; pointerId: number; elementId: string;
  draggingHandleOfAnchor?: number;
  // + startPoint, beforeDocument, lastDocument, moved (like DrawInteraction)
};
export type AnchorEditInteraction = {
  type: "anchor-edit"; pointerId: number; elementId: string;
  subpathIndex: number; anchorIndex: number;
  target: "anchor" | "in" | "out";
  // + startPoint, beforeDocument, lastDocument, moved
};
```

Add to `EditorState`: `pathEditId?: string | null;` (the path in edit mode; null = off).
Add reducer actions `enterPathEdit` / `exitPathEdit` in `canvas/engine/store.tsx`,
copying the **`editingTextId` lifecycle** (closest existing analog): enter on
double-click/`Enter`, exit on `Esc` / empty-canvas click / tool switch.

### 5.3 Pen lifecycle — `canvas/stage/CanvasToolingLayer.tsx`

The pointer handlers branch on `isInsertTool`. Add a `tool === "pen"` state machine:

- down on empty space, no active path → create a `path` element with one anchor;
  start `pen` interaction; set `pathEditId`.
- drag → pull symmetric handles (`out = delta`, `in = -out`).
- down near first anchor → `closed = true`, commit, exit pen.
- `Enter`/`Esc`/tool switch → commit open path, exit pen.

Each anchor placement is a `commitDocument` (per-anchor undo/redo, matching
`canvas/engine/history.ts`).

**Pencil** (Phase 5) is a thin variant: sample pointer-move points, then run
Ramer–Douglas–Peucker simplify + curve-fit into `VectorAnchor[]` on pointer-up
(`canvas/engine/vector/simplify.ts`). Same `path` type → shares all downstream code.

### 5.4 Mutations — `canvas/engine/mutations/vectorPath.ts`

Pure, immutable, return a new `CanvasDocument` (existing mutation style):

- `appendAnchor(doc, id, subpath, anchor)`
- `updateAnchor(doc, id, subpath, index, patch)`   // move anchor or a handle
- `insertAnchorOnSegment(doc, id, subpath, segIndex, t)` // double-click segment → split
- `deleteAnchor(doc, id, subpath, index)`
- `closeSubpath(doc, id, subpath)`
- `setHandleType(doc, id, subpath, index, type)`   // corner ↔ mirrored ↔ asymmetric
- `recomputePathBounds(doc, id)` — normalize `node.viewBox` to the anchor bbox and
  re-base anchors so move/resize/rotate keep working through the existing pipeline.

---

## 6. Tooling overlay — `canvas/stage/canvasToolingRenderer.ts` + `canvasHitTesting.ts`

The path renders in DOM; the **editing affordances render on the overlay canvas**,
alongside selection handles. Add a path-edit pass that runs when `pathEditId` is set:

- Anchors = small squares (filled = selected, hollow = idle) — reuse the existing
  resize-handle primitives.
- Handles = line anchor→control with a round knob; corner anchors show no handle.
- Highlight hovered/active segment.
- All positions go through the same world→screen matrix the overlay already uses,
  so anchors stay glued during pan/zoom (same property that keeps selection glued).

**Hit-testing** in `canvas/stage/canvasHitTesting.ts` (extend `hitTestTooling` →
`ToolingHit`): when `pathEditId` is set, test anchor knobs and handle knobs first
(top z), and segments second; return a hit descriptor whose `cursor` is one of the
§4 pen cursors and whose `type` lets `CanvasToolingLayer.tsx` start an
`anchor-edit` interaction.

A selected path **not** in edit mode behaves like any element (normal box +
resize/rotate handles) — no special casing.

---

## 7. Toolbar / commands wiring (Phase 0) — exact edits

UI scaffolding already exists (§1). The engine-side gaps:

- **`canvas/stage/canvasShellStyle.ts`**
  - `TOOLBAR_TOOL_MAP`: add `pen: "pen"`, `pencil: "pencil"`; change
    **`svg: "icon"` → `svg: "svg"`** (see decision in §10).
  - `EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP`: add `pen: "pen"`, `pencil: "pencil"`,
    `svg: "svg"` (and keep `icon: ...` only if the legacy icon element stays).
- **`canvas/engine/mutations/elementCreate.ts`**
  - `TOOL_TYPES`: `pen → "path"`, `pencil → "path"`. (svg import is §8, not drag-create.)
  - `DEFAULT_SIZE_RANGES`: `pen`/`pencil` → `{ width: [1, 4000], height: [1, 4000] }`
    (only the pre-first-anchor box).
  - `elementTypeLabel`: `path → "Path"`, `svg → "SVG"`.
- **`canvas/engine/elementDefinitions.ts`**
  - `DEFINITIONS`: add `path` and `svg` — `radius: false`, `radiusRole: "none"`,
    `lockAspectRatio: false`, `resizeHandles: "all"`, `drawMode: "free"`,
    `constraints: { width: { min: 1 }, height: { min: 1 } }`.
  - `TOOL_TO_ELEMENT_TYPE`: `pen → "path"`, `pencil → "path"`, `svg → "svg"`.
- **`domain/settings/defaults.ts`**
  - `canvas.elementDefaults.tools`: add `pen`/`pencil`/`svg` defaults (fill `none`,
    stroke `#000`, `strokeWidth` 2) — `createElementForTool` reads these.
  - Keybindings: `P` → `canvas.tool.pen`, plus `canvas.tool.pencil` / a vector toggle.
    `CANVAS_TOOL_COMMANDS` already has the ids; only defaults are missing.
- **`canvas/stage/hooks/useKeyboardShortcuts.ts`**: `Enter` (enter edit / commit pen),
  `Esc` (exit), `Alt` modifier (remove-anchor cursor/intent).
- **`canvas/engine/store.tsx`**: `setTool` is already generic — no change beyond the
  `enterPathEdit`/`exitPathEdit` actions from §5.2.

No new persistence schema: `path`/`viewBox`/new style fields are plain JSON and flow
through `putRecord` → `SaveQueue` → `applyBatch` (`docs/save-architecture.md`).
Thumbnail/ancestor propagation (`scenes.repo.ts → propagateSceneToParents`) composes
automatically since paths render via DOM like everything else.

---

## 8. SVG import & shape conversion

- **Paste / file import** → parse markup, **sanitize** (`sanitizeSvg.ts`), then
  **decompose** into our nodes: one `svg` container node (carrying the source
  `viewBox`) + one child `path` node per `<path>`/`<rect>`/`<circle>`/… converted via
  `svgPathDataToPath`. This matches the paper DOM (container + child path nodes) and
  the product's decomposition ethos in `CLAUDE.md`. Entry points: clipboard paste
  handler in the canvas, and the `svg` toolbar tool.
- **Convert shape → path**: `rect`/`ellipse`/`polygon`/`star` → `path` by emitting
  their geometry as `VectorAnchor[]` (a "Flatten to path" inspector action).

### 8.1 SVG behaves as a sealed component (tree + isolation)

> **Business rule — "SVG is a sealed component" (planned).** The rule was moved
> out of `Product.md` with the other planned features; until it ships this doc is
> its home (indexed in `docs/planned/product-backlog.md`). This section is both the
> behavior and the implementation mapping. Fold the behavior back into
> `Product.md` as `[NOW]` when built.

An inserted/imported `svg` is a container node with child `path` nodes (§2.4 / §3),
so the existing **`hasChildren → component`** rule (`canvas/shell/tree/treeHelpers.ts:243`,
`nodeTypeFromElement`) already classifies it as a component. Two behaviors make it
*sealed* — both reuse machinery that already exists for linked instances and isolation:

1. **Tree hides the internals (by default).** The `svg` node renders as a **single
   leaf row** with an "open" affordance; its child `path` nodes are **not** expanded.
   Implement exactly like a linked instance: in `treeFromCanvasDocument`
   (`canvas/shell/tree/treeHelpers.ts`), treat `node.type === "svg"` the same way as
   `linked` and return `children: []`. Surface the same open / "go to" button used by
   instances (`canvas/shell/tree/TreeRow.tsx`, the `IconOpenCanvas` button). This
   collapsing is the **default**, but the user can override it with a global canvas
   setting (see §8.2) to expand the SVG's internals in the tree.
2. **Edit only via isolation / its own page.** On the main canvas the `svg` renders
   only its frame; its paths are not directly selectable from outside. To edit them
   you **open/isolate the svg** (enter its page) — reuse the existing
   `isolatedParentId` + open-node flow (`canvas/engine/store.tsx → setIsolatedParent`,
   `canvas/hooks/useCanvasNavigation.ts → openCanvasForNode`). Pen / anchor editing
   (§5–§6) is active **only** when the svg is the isolated/opened subject; otherwise
   the svg behaves like any other element (move / resize / rotate as a whole). This
   is **not** affected by the §8.2 setting — that setting only changes tree
   *visibility*, never where the vectors can be edited.

Net effect: the SVG default-inserts a placeholder (like Image/Icon), reads as one
object in the structure, and exposes its vector internals only when explicitly
focused — consistent with Product.md laws #8 (components form automatically) and
#9 (edit in isolation).

### 8.2 Config — reveal SVG internals in the tree (global canvas setting)

By default the tree treats an SVG as sealed and **hides its internal `path` nodes**;
they only become visible when the SVG is isolated/opened in the canvas (§8.1). The
user can opt out of the collapsing with a **global canvas setting** so the SVG's
vector children are always shown in the tree, even from outside isolation.

- **Where it lives:** `canvas.shell.tree` in the settings model — alongside the
  existing `autoRevealSelection` flag (`domain/settings/types.ts → CanvasShellSettings.tree`,
  `domain/settings/defaults.ts`). Add a boolean, e.g.
  `revealSealedComponentChildren: boolean`, **default `false`**.
- **Scope:** it is a **global** canvas config (the `"global"` settings scope), not
  per-project or per-SVG — one switch for the whole app, like the other
  `canvas.shell` toggles.
- **What it changes:** only the **tree rendering** in §8.1 behavior #1. When `true`,
  `treeFromCanvasDocument` does **not** force `children: []` for `node.type === "svg"`
  and instead recurses into its `path` children like a normal component; when `false`
  (default) it collapses as described above.
- **What it does NOT change:** behavior #2 stays intact regardless of the flag — the
  vectors are still editable **only** when the SVG is the isolated/opened subject.
  The setting is purely about visibility in the tree, never about the editing surface
  (so Product.md laws #8/#9 hold either way).
- **Surfacing:** expose it wherever the other `canvas.shell` settings are edited (the
  canvas settings UI), worded as a reveal/expand toggle for sealed SVG internals.

---

## 9. Maximum feature set — phased (Figma + paper.design parity)

Each phase is independently shippable and leaves the editor working.

| Phase | Deliverable | Figma / paper parallel |
| --- | --- | --- |
| **0** | Bridge tool systems (§7): types, definitions, creation, labels, maps, commands, defaults. No behavior. | groundwork |
| **1** | `path` data model (subpaths + fillRule + intrinsic viewBox) + DOM render + fill/stroke/opacity/dash/linecap/linejoin/fill-rule in the inspector. Render-only. | Layer edits: fill, stroke, thickness |
| **2** | **Pen tool**: click anchors, drag handles, close; per-anchor undo; overlay anchors/handles; **4 context cursors** (§4). | Pen (P), draw segments |
| **3** | **Edit mode**: double-click/`Enter`; move anchors+handles; corner/mirrored/asymmetric; **insert anchor on segment**; **delete anchor** (Alt-click). | Move (M), modify; bend tool; add/remove point |
| **4** | **Snapping**: pixel grid (`⌘⇧'` toggle), anchor snap, angle constraint (Shift) → `PEN_SNAP_CURSOR`; smart guides while editing. | Pixel snapping; snapping/guides |
| **5** | **Pencil** (freehand → simplified path). | Pencil |
| **6** | **SVG import** (paste + file → decomposed nodes); **convert shape → path**. | Import SVG; convert shapes to paths |
| **7** | **Boolean ops** (union / subtract / intersect / exclude / flatten) producing multi-subpath results — relies on §2.2. | Boolean operations |
| **8** | **Stroke alignment** inside/outside (see caveat below); **flip/mirror**; dashed-stroke presets. | Stroke align; mirroring |
| **Later** | Repeating (lines/grids), vector networks (branching paths), anchoring, anneal brush, shape builder. | long-term roadmap |

Phases 0–4 deliver the core editable-vector loop with the full pen UX (cursors
included). 7 depends structurally on the multi-subpath model from Phase 1 — which is
why §2.2 must land first.

**Stroke alignment caveat (HTML/SVG limitation).** SVG has no native
`stroke-alignment`; strokes are always centered. Figma offers inside/center/outside.
Options for Phase 8: (a) ship **center-only** in v1 (simplest, honest); (b) emulate
inside/outside by rendering the stroke on a duplicate path clipped to the fill via
`clipPath` + doubled `strokeWidth`; (c) outline the stroke into a fill path at
export. Recommend (a) now, (b) later. `strokeAlign` is stored regardless so the data
is forward-compatible.

---

## 10. File-change checklist

**New files**
- `canvas/engine/vector/pathData.ts` — `pathToSvgPathData`, `svgPathDataToPath`.
- `canvas/engine/vector/sanitizeSvg.ts` — import sanitizer.
- `canvas/engine/mutations/vectorPath.ts` — anchor/handle mutations + bounds recompute.
- `canvas/engine/vector/simplify.ts` — pencil → anchors (Phase 5).
- `canvas/engine/vector/boolean.ts` — boolean ops (Phase 7).

**Assets (done)**
- `public/cursor-pen.svg`, `public/cursor-pen-insert.svg`,
  `public/cursor-pen-remove.svg`, `public/cursor-pen-snap.svg`.

**Edited files**
- `canvas/engine/types.ts` — `ElementType`, `Tool`, `ElementNode` (`path`,
  `viewBox`), `EditorState.pathEditId`, `Interaction` (`PenInteraction`,
  `AnchorEditInteraction`), `VectorAnchor`/`VectorSubpath`/`VectorPath`.
- `domain/canvas/types.ts` — `ElementStyles` fill/stroke/opacity/dash/align/fill-rule.
- `canvas/engine/elementDefinitions.ts` — `path`/`svg` defs + tool mapping.
- `canvas/engine/mutations/elementCreate.ts` — tool→type, size ranges, labels.
- `canvas/engine/store.tsx` — `enterPathEdit` / `exitPathEdit`.
- `canvas/stage/canvasShellStyle.ts` — `TOOLBAR_TOOL_MAP` / `EDITOR_TOOL_TO_TOOLBAR_TOOL_MAP`
  (`pen`/`pencil`/`svg`; fix `svg → "svg"`).
- `canvas/stage/ElementRenderer.tsx` — `path` and `svg` render branches.
- `canvas/stage/canvasToolingRenderer.ts` — anchor/handle overlay pass.
- `canvas/stage/canvasHitTesting.ts` — anchor/handle/segment hit-testing + pen cursors.
- `canvas/stage/CanvasToolingLayer.tsx` — pen state machine + anchor-edit drags.
- `canvas/stage/hooks/useCanvasPointerEvents.ts` — 4 pen cursor constants + state map.
- `canvas/stage/hooks/useKeyboardShortcuts.ts` — `Enter`/`Esc`/`Alt` lifecycle.
- `domain/settings/defaults.ts` — pen/pencil/svg keybindings + element defaults.
- Inspector panel — fill/stroke/opacity/dash/linecap/linejoin/fill-rule/align controls
  + an "Edit path" affordance + "Flatten to path" + boolean-op buttons (Phase 7).

---

## 11. Risks & decisions to confirm

- **`svg` tool naming.** The toolbar `svg` entry is labeled **"Icon"** today and
  `TOOLBAR_TOOL_MAP` sends it to the fixed-star `icon` element. This plan repurposes
  `svg` → SVG import/vector container. Decide: rename the label to "SVG", and either
  retire the legacy `icon` element or keep it on a separate entry.
- **Resize semantics.** Intrinsic-viewBox means resize **scales** the path (stroke
  scales with it). If Figma's "stroke keeps width on resize" is wanted, add
  `vector-effect="non-scaling-stroke"` — confirm desired behavior.
- **Boolean ops dependency (Phase 7).** Needs a path-clipping algorithm; prefer a
  small dependency-free impl or a vetted lib. Confirm before Phase 7.
- **Cursor hotspot.** `4 4` is the nib estimate for the `0 0 33 32` art; tune by eye
  on first run (all four must share it).
