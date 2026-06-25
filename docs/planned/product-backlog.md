# Product backlog — planned features (kept out of Product.md)

`Product.md` is the locked bible of how the app **works today and must work**
(`[NOW]` / `[LAW]`). Anything planned-but-not-built was moved **out** of it and
lives here, one feature per file. When a feature ships, fold its behavior back
into `Product.md` as `[NOW]` and trim or delete its backlog entry.

This file is the index; the detail lives in the linked docs.

## Inspector (canvas element properties)

The properties panel for a selected canvas element. Specs merge Figma + paper.design
controls, re-grounded for this product's **DOM-native** canvas (a frame is just a
div with children; every control writes real CSS). One doc per panel/group.

- [Layout & Position](./inspector-layout.md) — the unified Layout panel (paper-style,
  absorbing Figma's separate Position panel): in-flow vs absolute positioning,
  X/Y/W/H with Fixed/Hug/Fill sizing, rotation/flip, flex ("auto layout"), grid,
  padding/gap, alignment/distribute/tidy-up, constraint anchors, clip content.
- [Appearance (Radius, Opacity, Blending)](./inspector-appearance.md) — paper's
  "Radius"+"Blending" and Figma's "Appearance" unified: opacity, blend mode
  (`mix-blend-mode`), group Pass-through/Normal (`isolation`), corner radius
  (uniform slider + per-corner + Full), and corner smoothing (squircle via SVG
  fallback — `corner-shape` is not in WebKit). Type-aware: `border-radius` on boxes
  vs path-vertex rounding on SVG shapes.
- [Typography (Text)](./inspector-typography.md) — paper's "Text" and Figma's
  "Typography": family, weight/style, size, variable-font weight, letter-spacing
  (%→em), line-height, horizontal + vertical align (flexbox), paragraph spacing,
  decoration/case, OpenType, truncation, and `text-box-trim` for tight Figma-matching
  bounds (Safari 18.2+).
- [Border / Stroke](./inspector-border-stroke.md) — paper's Border/Outline/Underline/
  text-Stroke (each a distinct CSS property) merged with Figma's unified Stroke
  richness (alignment Inside/Outside/Center, per-side, dash, caps/joins, arrowheads).
  Type-aware: boxes use `border`/`box-shadow`/`outline`; vector shapes/lines/arrows use
  inline SVG `stroke*` + markers; text uses `-webkit-text-stroke`+`paint-order` and
  `text-decoration`. Flags the no-clean-CSS cases (center align, exact dashes on
  rounded corners) that force an SVG render.
- [Effects (Filters, Shadow, Inner Shadow, Blur)](./inspector-effects.md) — Figma's
  unified "Effects" list over paper's Filters/Shadow/Inner-Shadow split: CSS `filter`
  functions, drop/inner shadow (type-aware: `box-shadow` vs `filter: drop-shadow()` vs
  `text-shadow`), layer blur (`filter: blur`) vs background blur (`backdrop-filter`,
  `-webkit-` prefix), noise (`feTurbulence`), texture, glass (frosted only — refraction
  broken in WebKit). Spread/inset only on boxes; flags the WebKit gotchas.
- [Fill (Solid, Gradient, Image, Pattern, Video)](../inspector-fill.md) — **v1 shipped.**
  paper's Solid/Gradient/Image plus Figma's Pattern/Video/multiple-fills/blend/adjustments.
  Type-aware: `background-*` on boxes, `background-clip:text` on text, the dual render path
  (img ↔ background-div ↔ `<video>`) on the Image element so Pattern/Tile works; exact tile
  gaps via inline SVG `<pattern>`; gradient interpolation spaces (OKLAB/OKLCH, Safari 16.2);
  wide-gamut P3/OKLCH (typeable color field); image adjustments (CSS `filter` + inline SVG
  filter for temp/tint/highlights/shadows); a native macOS `NSColorSampler` eyedropper
  fallback (no `EyeDropper` in WebKit). Lines/arrows take no fill. *Deferred: `path`/`svg`
  SVG paint-servers (they use the Vector section), image-token binding, per-layer image
  opacity, an HSV/gamut slider UI.*
- [Export (PNG/JPEG/WebP/PDF/SVG/HTML + device mock)](./inspector-export.md) — per-element
  export. Native rasterization (`WKWebView.takeSnapshot` for raster, `createPDF` for
  vector PDF) because JS DOM-to-image (`foreignObject`) is broken in WebKit; encoding +
  zip in Rust (`image`/`webp`/`ravif`). HTML export (the DOM-native differentiator) with
  cross-engine prefixes + sRGB/P3 fallbacks; device-mock wrapper (one definition driving
  an HTML shell or a Rust frame composite). Distinct from the `.figx` project file.
- [Guides (grid / layout guides)](./inspector-guides.md) — **placeholder, empty.** To be
  defined later (ties to `Product.md` "Parent grid guidance").

## Collaboration

- [Sync protocol — "the git"](./collaboration-sync-protocol.md) — frame-level
  async commits, structured operations, conflict resolution via the Versions
  canvas. The core model shared by all tiers.
- [Sync transport — adapters](./collaboration-transport.md) — four pluggable
  tiers: Local (solo), P2P via WebRTC (small teams), Self-hosted (enterprise
  Docker image), Cloud (Bruno's servers). The app never knows which is active.

## Entities & scope

- [Workspace people & permissions](./workspace-people-permissions.md) — invite
  members to a workspace and manage who can edit what.
- [Richer project screen types](./project-screen-types.md) — more than one screen
  type per project (tablet + mobile together) and predefined types not locked to
  a fixed width×height.
- [Standalone screen / component](./standalone-screen-component.md) — create a
  screen or component with no project or workspace above it.

## Versioning

- [Promote a version to main](./version-promote-main.md) — make any version the
  screen's main; the previous main becomes a normal version.

## Linkable

- **Screen becomes linkable** — today a Screen cannot be linkable (it makes no
  sense yet). This may change for a specific future feature. No spec yet; tracked
  here so the `[NOW]` rule in `Product.md` stays clean.

## Builder

- [Builder future](./builder-future.md) — data window for training-data
  generation + image↔reconstruction sync, background-remove quality tooling, and
  the long-term image→component model-training direction.

## Architecture / refactor (deferred)

- [Canvas surface adapter / policy framework](./canvas-surface-adapter-framework.md)
  — generic `CanvasSurfacePolicy` + `CanvasEngineAdapter` so Main/Drafts/Versions/
  References/Fast Edit become policies over one scene engine. **Deliberately parked**
  — don't build until a second scene surface needs it; revisit criterion in the doc.
- [Unify component ownership — drop the screen-main `screenId` special case](./unify-component-ownership.md)
  — make a screen's main top-level components variant-owned (`parentVariantId = mainVariant`)
  like every other variant, so ownership is uniform and `promoteVariantToMain` loses its
  `screenId ↔ parentVariantId` re-home. Pure cleanup, no behavior change; safe re: the "casal"
  model. Real cost: `componentScope` must become variant-aware (full detail + staging in the doc).

## Already shipped — folded back into Product.md as `[NOW]`

These were tagged `[PLANNED]` but are in fact built; they now live in `Product.md`
as current behavior:

- **Back button round-trip** — return to exactly where you were after opening a
  linked master. (`canvas/Canvas.tsx` → `canvas/shell/tree/BackFooter.tsx`.)
- **Video frames → screens** — extract frames from an imported video and turn
  them into screens. (`routes/references/References.tsx` → `VideoFramePicker` →
  `application/references/createFrameGroup.ts`.)
