# SVG Icons

> **Status: implemented — with one deliberate deviation.** Phases 1–2 (vector
> `IconToken`, seeds, `IconGlyph`, import) shipped as written. The canvas
> authoring path (Phases 3–5) was **not** built as a bespoke ephemeral
> `mode=icon` canvas. Instead, drawing/editing an icon reuses the *normal* canvas
> by `/canvas?variant=…`: the art is a real variant-owned scene, and the token
> caches a serialized `<svg>` refreshed by a save-back keyed on
> `icon=<tokenId>&systemDesign=<designId>` query params. This honors "variants
> own scenes" without a special editor mode. The restricted toolbar / chrome
> gating was dropped (it would fight the "same as the canvas" pattern).
>
> **Ownership — final model (`IconRow` entity).** The art started as an ownerless
> *draft component* (sentinel-hidden), then briefly a *token-owned component*.
> Both made a design **token** masquerade as a **component**, which contradicts
> law 6 ("a component is screen-derived, not a detached token") and risked the
> art leaking into the component browser / "Add components" picker. The art is now
> its own first-class entity: an **`IconRow` master** (`EntityType "icon"`,
> `VariantOwnerKind "icon"`) that owns a variant+scene — parallel to
> `ScreenRow`/`ComponentRow`, per Architecture.md **D2** (a new master is a new
> EntityType, not a discriminator field). It is owned by the design's scope owner
> (workspace/project) via an `owns` edge, so it shares the standard scope/
> lifecycle of a component **without ever being one** (component queries only
> return `ComponentRow`s). The `IconToken` references it by `iconId`; a loose
> `IconRow` (no owner edge) is a Draft icon. Deleting a token or a whole design
> cascade-deletes the master (`deleteIcon`). See `lib/storage/repos/icons.repo.ts`,
> `application/system-design/iconCanvas.ts`, and `docs/UX.md` § 8. The "Authoring
> path 2" section below is retained for history but is **superseded**.

Replace the emoji-glyph icons in the system-design **Icons** tab with real,
vector **SVG icons**. A user can either **import** an existing `.svg` file or
**draw** one in the canvas — but drawing an icon opens the canvas in a
restricted "icon authoring" mode where the only thing being edited is the icon's
vector art, with unrelated tools locked out.

## Why

Today an icon token is a single emoji character. That is fine as a placeholder
but useless as a real design-system asset: it can't be recolored per theme,
can't be exported, can't be placed as crisp vector art, and doesn't match a
"no design system" gap the product is trying to close. The canvas already has a
complete vector pipeline (import, edit, bake-on-resize, native-SVG render); this
feature wires the Icons tab into that pipeline so icons become first-class
vector tokens.

## Current state (what exists today)

**The icon token (the live one).**
`IconToken` in [`domain/system-design/types.ts:41`](../apps/desktop/src/domain/system-design/types.ts) is
`{ id, name, glyph }`, where `glyph` is an emoji string. Seeded with
`🔔 ⭐ ❤️ ✅` in [`domain/system-design/defaults.ts:110`](../apps/desktop/src/domain/system-design/defaults.ts).
It is persisted per-row as a `TokenRow` (category `"icons"`) — not nested — via
the system-design repo.

> Note: a second, **legacy** icon shape `ProjectSystemIcon`
> (`{ id, name, glyph, family }`) exists in
> [`lib/storage/schema.ts:228`](../apps/desktop/src/lib/storage/schema.ts) and is
> seeded in [`lib/storage/defaults.ts:34`](../apps/desktop/src/lib/storage/defaults.ts).
> It is **not** what the Icons tab renders and should be treated as dead/parallel
> — either delete it during this work or leave it untouched. The live path is
> `IconToken`.

**Where the glyph is consumed (every render site to update):**

- [`components/system/CategoryGrid.tsx:174`](../apps/desktop/src/components/system/CategoryGrid.tsx) — the Icons tab grid, renders `{ic.glyph}` as 22px text.
- [`system-design/modals.tsx:137`](../apps/desktop/src/system-design/modals.tsx) — `IconForm` create/edit: a text input (`maxLength=4`, placeholder `🔔`) + a 40px preview.
- [`system-design/modals.tsx:306`](../apps/desktop/src/system-design/modals.tsx) — token picker row, 18px glyph.
- [`pages/NewProjectPage.tsx:294`](../apps/desktop/src/pages/NewProjectPage.tsx) — 15px glyph swatch.

**The canvas vector pipeline (all already built — we reuse it):**

- Element model: an `svg` node is a **container** (a `viewBox` + child `path`
  nodes); a `path` node holds one `VectorPath` (subpaths of bezier anchors).
  [`canvas/engine/types.ts:66`](../apps/desktop/src/canvas/engine/types.ts).
- **Import:** `parseSvg(markup)` → sanitized structured `ImportedSvg`
  ([`canvas/engine/vector/svgImport.ts`](../apps/desktop/src/canvas/engine/vector/svgImport.ts)),
  then `insertSvgDocument()` builds the container + path nodes
  ([`canvas/engine/mutations/vectorOps.ts:16`](../apps/desktop/src/canvas/engine/mutations/vectorOps.ts)).
- **Sanitize:** `sanitizeSvg()` strips `script`/`style`/`foreignObject`/`use`/
  external refs ([`canvas/engine/vector/sanitizeSvg.ts`](../apps/desktop/src/canvas/engine/vector/sanitizeSvg.ts)).
- **Export:** `pathToSvgPathData(path)` → `d` string
  ([`canvas/engine/vector/pathData.ts`](../apps/desktop/src/canvas/engine/vector/pathData.ts));
  `svgForElement(document, nodeId)` → a standalone `<svg>` for a subtree
  ([`lib/canvas/export/svgExport.ts`](../apps/desktop/src/lib/canvas/export/svgExport.ts)).
- **Edit:** pen/pencil, anchor/handle editing, boolean ops, and **bake-on-resize**
  (anchors are scaled in place — no `preserveAspectRatio="none"`, so strokes never
  distort). Path-edit mode (`pathEditId`) and isolation (`isolatedParentId`).
- **Toolbar is injectable:** `<Toolbar config={...} />` takes a `ToolbarConfig`;
  items filtered to `null` disappear ([`canvas/toolbarConfig.tsx:45`](../apps/desktop/src/canvas/toolbarConfig.tsx), [`canvas/shell/Toolbar.tsx`](../apps/desktop/src/canvas/shell/Toolbar.tsx)).
- **Render is WKWebView-safe:** paths render as native inline `<svg><path>`; there
  is no `foreignObject`. (See [[project_wkwebview_no_foreignobject]].)
- **Asset store:** `putAssetText` / `getAssetText` store SVG markup as UTF-8 blobs
  with batched data-URL loading ([`application/persistence/assetStore.ts`](../apps/desktop/src/application/persistence/assetStore.ts)).

**The canvas opens per query param**, and every persisted scene is **owned by a
variant** (`sceneRecordId("variant", id)`). Icons are *not* screens/components,
so they have no variant — see the storage decision below.

## The persisted shape

Extend `IconToken` to carry vector art. The **SVG markup string is the source of
truth** for the token (renderable, exportable, self-contained):

```ts
export type IconToken = LinkableTokenFields & {
  id: string;
  name: string;
  svg: string;              // sanitized, self-contained <svg> markup — the source of truth
  viewBox?: { width: number; height: number };  // intrinsic box (default 24×24)
  glyph?: string;           // legacy/emoji fallback — optional, kept only for render fallback
};
```

Decisions:

- **`svg` replaces `glyph` as the primary field.** `glyph` becomes an optional
  fallback so the renderer degrades gracefully, but new/edited tokens always
  write `svg`. Seed icons are rewritten as tiny inline SVGs (bell/star/heart/
  check as `<path>`s) rather than emoji.
- **Store the markup inline on the row, not as an asset blob.** Icons are small
  (hundreds of bytes to a few KB). Inline keeps them addressable as ordinary
  `TokenRow`s and avoids an asset-lifecycle. (If a pathological huge import shows
  up, cap it — see edge cases — rather than reaching for the asset store.)
- **No canvas scene is created for an icon.** This respects the guardrail
  "variants own scenes; never store a scene under a non-variant id." The canvas,
  when used to draw an icon, runs on an **ephemeral in-memory document** and
  commits its serialized SVG back to the token — nothing is written to the
  `scenes` table. Round-tripping through `parseSvg` on open and `svgForElement`
  on save is lossless for our own output (paths bake cleanly).
- **Local-only, no migration.** Bump `SCHEMA_VERSION`; `ensureSeededAndMigrated`
  nukes and reseeds. (See [[project_local_only_no_migrations]].) Delete the
  emoji seed; no back-compat shim.

## Authoring path 1 — Import an SVG

Reuse the exact file-picker pattern already in `ImageForm`
([`system-design/modals.tsx:208`](../apps/desktop/src/system-design/modals.tsx),
`readFileAsDataUrl`), swapped to read text:

1. `IconForm` gets an **Import SVG** dropzone (`<input type="file" accept=".svg,image/svg+xml">`).
2. On select: read file as text → `sanitizeSvg()` → validate it parses via
   `parseSvg()` (reject files that yield zero paths, with an inline error).
3. Normalize: ensure a `viewBox` (fallback 24×24), strip width/height that would
   fight the box, keep fills/strokes.
4. Preview the sanitized `<svg>` inline in the modal.
5. Save writes `{ svg, viewBox, name }` to the token.

Canvas paste is wired too: pasting raw SVG on an **icon master's canvas**
decomposes it into root-level `path` elements via `insertSvgPathsAsRoot` (the
artboard IS the svg — no sealed container), unlike the normal canvas where paste
creates a sealed `svg` node. File drop of `.svg` still goes the image route.

## Authoring path 2 — Draw in the canvas (restricted "icon" mode)

**Entry.** From `IconForm`, a **Draw icon** button (and an **Edit** action on an
existing SVG icon) navigates to the canvas in icon mode. New param:

```
/canvas?icon=<tokenId>&systemDesign=<designId>&mode=icon
```

`Canvas.tsx` gains a branch: when `mode=icon`, it does **not** resolve a
variant `sceneOwner`. Instead it builds an **ephemeral `CanvasDocument`**:

- A single fixed **icon artboard** frame at the icon's `viewBox` (default 24×24,
  displayed zoomed to a comfortable working size).
- If editing an existing icon, seed the artboard by `parseSvg(token.svg)` →
  `insertSvgDocument` into the artboard.
- The artboard is the only frame; pan/zoom stay centered on it.

**Restricted toolbar.** Pass a **filtered `ToolbarConfig`** built for icon mode —
keep only vector-relevant tools, drop the rest:

- Keep: `cursor`, `pen`, `pencil`, shape tools (`rectangle`, `ellipse`,
  `line`, `polygon`, `star`), and boolean/vector ops.
- Drop: `wrapper`, `text`, `image`, `svg` (import-container), `actions`, `scale`,
  `hand` optional. Nothing that creates non-vector nodes or navigates scenes.

This uses the existing injectable `config` prop — no new toolbar machinery, just
a purpose-built config (and optionally a `disabled` state on `ToolEntry` if we
prefer greying-out over hiding; hiding is the lower-effort default).

**Guardrails inside the mode.** Suppress scene-level affordances that assume a
variant: version chip, Preview launcher, parent-navigator, "open component",
add-reference. Simplest: reuse/extend `CanvasUiVisibility` or gate on
`mode === "icon"` in `Canvas.tsx` chrome. The Layers tree may stay (it helps
manage subpaths) but scoped to the artboard.

**Save.** A **Save icon** action (and Back):

1. Serialize the artboard subtree → `svgForElement(document, artboardId)` (or a
   dedicated `svgForIconArtboard` that emits a clean `viewBox`-normalized `<svg>`
   with no artboard chrome).
2. `sanitizeSvg()` the output (defensive) and write `{ svg, viewBox }` to the
   `IconToken` via the system-design controller (per-row `putRecord` under the
   hood — never touch the persistence port directly).
3. Navigate back to the Icons tab. **Discard** the ephemeral document — nothing
   persists to `scenes`.

## Rendering the icon everywhere

Add one shared component, e.g. `IconGlyph`, used by every consumption site:

```tsx
// Renders vector when svg present, else the legacy emoji, else a placeholder.
function IconGlyph({ icon, size }: { icon: IconToken; size: number }) { … }
```

- When `svg` is present: render **inline** (parse + emit native `<svg>` sized to
  `size`). Inline SVG in the DOM is safe — the `foreignObject`/`<img>` trap only
  bites SVG loaded through `<img>`. Prefer inline for the tab/grid/pickers.
- Where an `<img src>` is structurally required (e.g. reusing `project.icon`'s
  data-URL slot), emit `data:image/svg+xml;utf8,<encoded native svg>` — safe
  because the markup is native SVG with no `foreignObject`.
- Fallback to `glyph` (emoji text) when `svg` is absent, then to a neutral
  placeholder.

Replace the four render sites listed in *Current state* with `IconGlyph`.

**Theming (nice-to-have, note for later).** If icon `<path>`s use `currentColor`,
the tab can tint icons to the surface text color for free. Import can optionally
rewrite hard-coded `fill` to `currentColor` behind a toggle. Not required for v1.

## Consumption downstream (out of scope, note only)

The canvas already has an aspect-locked `icon` element type
([`canvas/engine/elementDefinitions.ts:72`](../apps/desktop/src/canvas/engine/elementDefinitions.ts)).
A natural follow-up is letting a canvas `icon` element *reference an icon token*
and render its SVG (recolorable, crisp). Explicitly **not** part of this feature —
list it in the backlog once icons are vectors.

## Edge cases & decisions

- **Zero-path import** → reject with inline error ("Not a drawable SVG").
- **Oversized / hostile SVG** → `sanitizeSvg` already strips scripts/refs; also
  cap raw markup length (e.g. reject > ~64 KB) to keep rows lean.
- **`currentColor` / gradients on import** → keep gradients (local `url(#…)` are
  allowed by the sanitizer); leave `currentColor` as-is.
- **Round-trip fidelity** → our own exporter emits only `path` + basic styles, so
  open→edit→save is stable. Third-party imports with exotic features degrade to
  their sanitized path form on first save (acceptable, document it).
- **Empty icon saved** → treat as no-op / keep previous `svg`; don't write an
  empty `<svg>`.
- **Leaving icon mode without saving** → confirm-discard if the artboard changed.

## Implementation phases

1. **Data model + render (no canvas):** add `svg`/`viewBox` to `IconToken`,
   rewrite seed icons as inline SVG, bump `SCHEMA_VERSION`, add `IconGlyph`, swap
   the four render sites. Ship the Icons tab showing real SVGs.
2. **Import path:** `IconForm` dropzone → sanitize/parse/preview/save. Now users
   can add SVG icons without the canvas.
3. **Ephemeral canvas document:** teach `Canvas.tsx` the `mode=icon` branch — no
   variant owner, in-memory single-artboard document, seed from `token.svg`.
4. **Restricted toolbar + chrome gating:** icon-mode `ToolbarConfig`, suppress
   scene affordances.
5. **Save-back + navigation:** `svgForIconArtboard` serialize → write token →
   return to tab; discard-on-cancel.
6. **Polish:** `currentColor` tinting toggle, empty/oversize guards, discard
   confirmation.

Phases 1–2 are shippable on their own and unblock the tab immediately; 3–5 add
the "draw it" path; 6 is polish.

## Product laws & docs to respect

- Scenes are owned by variants — the icon editor must **not** create a scene
  ([`CLAUDE.md`](../CLAUDE.md) storage guardrails). Ephemeral document only.
- Persist via `putRecord` / the system-design controller — never the port.
- Native SVG only, no `foreignObject` ([[project_wkwebview_no_foreignobject]]).
- No migrations; bump `SCHEMA_VERSION` and reseed ([[project_local_only_no_migrations]]).
- **Update [`docs/UX.md`](UX.md) before committing** — this adds the icon
  import flow, the Draw/Edit actions, and the restricted `mode=icon` canvas.
- Read [`Design.md`](../Design.md) before building the dropzone/preview in the
  modal and the tab grid cells.

## Testing

- Unit: `IconToken` round-trip (`svg` → `parseSvg` → `svgForIconArtboard` →
  `sanitizeSvg`) is stable; seed reseeds; import rejects zero-path/oversize.
- Render: `IconGlyph` renders inline SVG, falls back to emoji, then placeholder.
- Canvas: `mode=icon` builds an ephemeral document, never writes to `scenes`;
  restricted toolbar exposes only vector tools; save writes the token and
  discards the document.
