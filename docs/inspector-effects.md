# Inspector — Effects (Filters, Shadow, Inner Shadow, Blur)

Status: **v1 shipped** — shadows + blur + filters (the unified Effects panel). Still
planned/deferred: **Noise, Texture, Glass**, the non-box inner-shadow *tricks* (text
`background-clip` + SVG inverted-alpha), and `feMorphology` spread dilation on
image/SVG/text. Drag-reorder is shipped as **up/down** buttons for now.

**What shipped (v1):**
- Data: `Effect` / `EffectType` + `ElementStyles.effects?: Effect[]` in
  `src/domain/canvas/types.ts`. Persists via `HtmlCanvasStyle.effects` round-tripped
  through `styleFromElement` / `stylesFromHtmlNode` (additive/optional — no version bump).
- Compile: pure `src/domain/canvas/effects.ts` (`compileEffects`, `effectTargetForType`,
  `effectTypeAvailable`, `effectSpreadHonored`) → type-aware `box-shadow` /
  `text-shadow` / `filter` / `backdrop-filter` (+ `-webkit-` twin).
- Render: `effectStyle()` spread into both `nodeStyle` and `detachedNodeStyle` in
  `src/canvas/stage/ElementRenderer.tsx` (effects show in-frame *and* detached).
- UI: `src/canvas/shell/inspector/EffectsSection.tsx`, mounted after Appearance in
  `ElementTab.tsx`. Inner shadow + spread are box-only; shadow color binds to tokens.

Inspector spec derived from **Figma** ("Effects", one list) and
**paper.design** (split into "Filters" / "Inner Shadow" / "Shadow" by element type),
re-grounded for this product's **DOM-native** canvas and verified against WebKit/Safari
support (this app runs in a Tauri **WKWebView**, not Chromium). When built, fold the
shipped behavior into `Product.md` as `[NOW]` and trim this entry. One doc for the
**Effects** panel group.

## The merge (read first)

The user is right that these are one family. **Figma** already unifies them into a
single **"Effects"** list where each entry has a type dropdown: Inner shadow, Drop
shadow, Layer blur, Background blur, Noise, Texture, Glass. **paper** splits the same
capability into separate panels (**Filters** with the CSS filter functions; **Shadow**;
**Inner Shadow**) shown by element type.

**This product takes Figma's unified list** — one **Effects** panel with a per-entry
type dropdown and add/remove/reorder (`+` / `−`, drag) — because that matches the
mental model and the reorder maps to a real CSS pipeline. But the **CSS mechanism is
type-aware** (paper's honesty): the *same* "Drop shadow" entry compiles to
`box-shadow` on a box, `filter: drop-shadow()` on an image/SVG shape, and `text-shadow`
on text. The panel hides the plumbing; the doc nails it.

## ⚠ The things that do NOT map cleanly (decide up front)

1. **Spread exists only on `box-shadow`** (boxes). A Figma shadow with **spread ≠ 0** is
   pixel-exact **only for rectangles/rounded-rects**. On image/SVG/text you must dilate
   the alpha (`feMorphology dilate`) — never exact.
2. **Inner shadow is native only on boxes** (`box-shadow: inset`, has spread). Text and
   SVG inner shadows are tricks (below) with **no spread**.
3. **Background blur needs the `-webkit-backdrop-filter` prefix** for any WebKit < Safari
   18 (unprefixed only since Sept 2024). Always emit **both**, prefixed first, and use a
   **literal length, not `var()`** on the prefixed line (a known WebKit bug). Watch that
   the build doesn't strip the prefix.
4. **Refractive "Glass" (Liquid Glass) is NOT feasible in WebKit** — SVG filters inside
   `backdrop-filter` do nothing (WebKit bug 245510, open). Glass = **frosted blur only**
   on this platform; mark refraction as Chromium-only/experimental.
5. **`filter` chain order is load-bearing** (left-to-right pipeline; chained
   `drop-shadow()` = shadow-of-a-shadow), but a **`box-shadow` comma list is
   independent** (first listed paints on top). A Figma multi-shadow layer maps to the
   **comma `box-shadow` list**, not chained filters.

## Today (what already exists)

No effects exist in `ElementStyles` yet (only `opacity`, from the Appearance panel).
Everything in this doc is new.

## Effect types → CSS/SVG

### Filters (paper's "Filters" — the CSS `filter` functions)

A filter entry with a function dropdown + value. Map straight to `filter`:

| Filter | `filter` function | Range / units | Note |
|---|---|---|---|
| Blur (= "Layer blur") | `blur(<px>)` | ≥ 0, no `%` | Gaussian std-dev; blurs the element itself. |
| Brightness | `brightness()` | number/%, 0=black, 1=identity, **>1 ok** | no upper clamp |
| Contrast | `contrast()` | number/%, 0=grey, 1=identity, **>1 ok** | no upper clamp |
| Saturation | `saturate()` | number/%, 0=grey, 1=identity, **>1 ok** | supersaturate >1 |
| Grayscale | `grayscale()` | 0–1 (clamped) | |
| Invert | `invert()` | 0–1 (clamped) | |
| Sepia | `sepia()` | 0–1 (clamped) | (Figma/paper may omit) |
| Hue rotate | `hue-rotate(<deg>)` | any angle, not normalized | |

⚠ **Order matters** — a reorderable filter list **is** the CSS pipeline; each function
takes the previous one's output. Two value families to model: multiplicative/no-ceiling
(brightness/contrast/saturate) vs 0–1 clamped (grayscale/invert/sepia). Unprefixed
`filter` since Safari 9.1. (paper's **"Layer"** entry is almost certainly **layer
blur** — `filter: blur()` on the element — named to contrast with Background blur;
confirm against the live UI.)

### Drop shadow (type-aware)

| Element | CSS | Spread | Inset |
|---|---|---|---|
| **Box** (rect / wrapper / image-box / div-with-children) | `box-shadow: x y blur spread color` | ✅ native | ✅ |
| **Image / PNG with alpha** | `filter: drop-shadow(x y blur color)` (follows alpha) | ❌ → `feMorphology dilate` | ❌ |
| **SVG shape** (star/ellipse/triangle) | `filter: drop-shadow()` or SVG `feDropShadow` | ❌ → `feMorphology dilate` | ❌ |
| **Text** | `text-shadow: x y blur color` (per glyph) | ❌ | ❌ |

⚠ `drop-shadow()` blur is a Gaussian std-dev — numerically **different** from
`box-shadow`'s blur radius for the same number. `box-shadow` does **not** apply to
images/SVG-shapes/text — that's why the mechanism switches by type.

### Inner shadow (type-aware)

- **Box** → `box-shadow: inset x y blur spread color` (native, has spread, follows
  radius — the only first-class inner shadow).
- **Text** → transparent fill + `-webkit-background-clip: text` + a blurred
  `text-shadow` showing through the glyphs (no spread; needs the `-webkit-` prefix for
  WebKit < 15.5).
- **SVG shape** → SVG `<filter>` with inverted source alpha clipped inside the shape
  (`feComponentTransfer` invert → `feGaussianBlur` → `feOffset` → `feFlood` →
  `feComposite in=SourceAlpha`); no spread. **Inline the `<filter>` in the DOM** —
  external `url(file.svg#id)` refs are broken in Safari.

### Layer blur vs Background blur

- **Layer blur** → `filter: blur(N)` (blurs the element + content). Unprefixed, fine.
- **Background blur** (glassmorphism) → `backdrop-filter: blur(N)`. ⚠ Emit both lines,
  prefixed first; literal length (no `var()`) on the prefixed line:
  ```css
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  ```
  Requires the element to be **translucent** (e.g. `rgba(...)` background). Creates a
  stacking context. WebKit quirks: rounded-corner clipping artifacts (bugs 158807 /
  98538) — mitigate with `isolation: isolate`, `transform: translateZ(0)`, or a
  `mask-image`.

### Noise

SVG `<feTurbulence type="fractalNoise">` as a low-opacity `background-image` overlay
(inline data-URL), optionally `mix-blend-mode: overlay`. `baseFrequency` ~0.6–0.9 = fine
grain; `stitchTiles="stitch"` hides seams. ⚠ Keep grain **static** on WebKit —
animating `baseFrequency` is buggy on Safari/iOS; output isn't pixel-identical across
engines.

### Texture

A tiling material image overlaid with a blend mode + opacity → tiled `background-image`
+ `mix-blend-mode` (or `background-blend-mode` for stacked backgrounds within one
element); usual modes `multiply` / `overlay` / `soft-light`. (Shares the blend-mode
machinery documented in [`inspector-appearance.md`](./inspector-appearance.md).)

### Glass

⚠ **Frosted only on WebKit.** True refractive/distortion glass (`feDisplacementMap` via
`backdrop-filter`) is broken in Safari (bug 245510). Implement Glass as
`-webkit-backdrop-filter: blur(N) saturate(180%)` + translucent tint + a subtle inset
border highlight; degrade refraction gracefully. Mark refractive Glass as
Chromium-only/experimental in the UI.

## Ordering, stacking, and interactions

- **Multiple shadows** in one Effects list → `box-shadow: a, b, c` (independent; **first
  = on top**), **not** chained `drop-shadow()`.
- **Multiple filters** → one `filter:` chain in list order (functional pipeline).
- **Paint order on one element** (bottom→top): `backdrop-filter` (behind) → box (outer
  box-shadow → bg → border → inset box-shadow → content) → **`filter` applied LAST to
  the whole group**. ⚠ Consequence: `filter: blur()` **also blurs the element's own
  `box-shadow`**.
- **Stacking/isolation:** `filter`, `backdrop-filter`, `opacity<1`, `mix-blend-mode`,
  transforms, masks all create a stacking context **and isolate the group** — so an
  Effect on an ancestor confines descendants' blend modes within the group. This is the
  same isolation discussed in [`inspector-appearance.md`](./inspector-appearance.md)
  (Pass-through/Normal) — Effects and Blending interact; surface that.
- ⚠ Figma's documented cross-category order (layer blur → stroke → inner shadow → fill →
  drop shadow → background blur) and "does layer blur blur its own drop shadow" are not
  guaranteed to match CSS — **render-test** rather than assume.

## SVG element effects

For inline SVG shapes, CSS `filter: drop-shadow()`/`blur()` **work**, but `box-shadow`
does **not**. Use `filter` for simple cases, or an inline SVG `<filter>`
(`feDropShadow`, `feGaussianBlur`, `feColorMatrix`, `feMorphology` for spread,
`feTurbulence` for noise) when you need primitive composition CSS can't express
(inner shadow, spread, multi-step pipelines). `feDropShadow` is baseline since 2020,
no spread. This is the same HTML↔SVG render switching as the Appearance and
Border/Stroke docs.

## By-element-type cheat sheet

| Element | Outer shadow | Spread | Inner shadow | Blur (self) |
|---|---|---|---|---|
| Box / rect / frame | `box-shadow` (radius) | ✅ | `box-shadow: inset` (✅ spread) | `filter: blur()` · bg: `backdrop-filter` |
| Image / PNG | `filter: drop-shadow()` | ❌ dilate | SVG inverted-alpha (no spread) | `filter: blur()` |
| SVG shape | `drop-shadow()` / `feDropShadow` | ❌ dilate | SVG inverted-alpha (no spread) | `filter: blur()` / `feGaussianBlur` |
| Text | `text-shadow` | ❌ | `background-clip:text` + `text-shadow` (no spread) | `filter: blur()` |

## Performance notes

- Blur cost scales with radius (Gaussian std-dev) — large blurs are expensive.
- `backdrop-filter` is the costliest (extra render passes; WebKit blog says "use only
  where most necessary"); re-samples when the backdrop changes (scroll).
- Only `transform`/`opacity` are compositor-only; too many filtered layers exhaust GPU.
  Mitigate blur jank with `transform: translateZ(0)` on the blurred element.

## Product ties

- **System Design color tokens:** shadow/effect colors can bind to color tokens
  (linkable/detach), read-only at the instance, editable at the master.
- **Blending overlap:** Effects create the same stacking/isolation that the
  Pass-through/Normal control in [`inspector-appearance.md`](./inspector-appearance.md)
  governs — keep the two consistent.
- **Stroke overlap:** outside *stroke* mechanically uses `box-shadow` too
  ([`inspector-border-stroke.md`](./inspector-border-stroke.md)); an Effects *shadow*
  is a different control (offset + blur). Don't let them collide in the compiled
  `box-shadow` list — both write `box-shadow`, so the renderer must merge them into one
  comma list in the right order.

## Respecting the laws

- **Frame is just a div** (laws 7–8): Effects apply to any element, including a div with
  children; no separate Frame entity.
- **Ownership/origin unambiguous** (law 11): token-bound/linked-instance effects show
  read-only values from the master.
- **Edit in isolation** (law 9): effects edit the opened subject's element in its frame.

## Not in scope (here)

- **Fill** (the element's own background/gradient/image) — separate Fill panel doc.
- The **renderer's `box-shadow` merge** (stroke + effect shadows into one list) and
  **SVG `<filter>` generation** are implementation tasks this spec authorizes.

## Open questions

- Confirm paper's **"Layer"** filter entry (layer blur vs a grouping header).
- Whether to expose **Texture/Glass/Noise** in v1 or ship shadows+blur+filters first.
- Default Drop-shadow values and whether spread is shown on non-box elements (it can't
  be honored without alpha dilation) — likely hide spread when the element isn't a box.
- How `filter`-blurring-its-own-`box-shadow` should behave vs Figma — render-test.

## Sources

- Specs: [Filter Effects L1](https://www.w3.org/TR/filter-effects-1/),
  [CSS Backgrounds 3 §6 (shadow order)](https://www.w3.org/TR/css-backgrounds-3/#shadow-layers),
  [Compositing & Blending 1](https://www.w3.org/TR/compositing-1/).
- MDN: [`filter-function`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function),
  [`backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter),
  [`box-shadow`](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow),
  [`feTurbulence`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence),
  [`feDropShadow`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDropShadow),
  [`background-clip`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-clip).
- Support/bugs: [caniuse backdrop-filter](https://caniuse.com/css-backdrop-filter),
  [caniuse css-filters](https://caniuse.com/css-filters),
  [WebKit bug 245510 (glass/backdrop SVG, open)](https://bugs.webkit.org/show_bug.cgi?id=245510),
  [WebKit: backdrop-filter](https://webkit.org/blog/3632/introducing-backdrop-filters/).
