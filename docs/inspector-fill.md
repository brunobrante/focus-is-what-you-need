# Inspector — Fill (Solid, Gradient, Image, Pattern, Video)

Status: **v1 shipped** — Solid / Gradient / Image / Video, multiple stacked fills with
per-fill blend + opacity, image adjustments, wide-gamut P3/OKLCH, gradient interpolation
spaces, exact-gap tile patterns, and a native macOS eyedropper. The UX lives in
[`UX.md`](./UX.md) ("Inspector → Fill"). Inspector spec derived from **paper.design**
(Solid / Gradient / Image fills) and **Figma** (adds Pattern, Video, stacked fills,
per-fill blend, image adjustments, wide-gamut picker), re-grounded for this product's
**DOM-native** canvas and verified against WebKit/Safari support (this app runs in a Tauri
**WKWebView**, not Chromium). One doc for the **Fill** panel group.

**What shipped (v1):**
- Data: `Fill` union (solid/gradient/image/video) + `ElementStyles.fills?: Fill[]` in
  `src/domain/canvas/fill.ts`. Additive/optional — a single plain solid (or a single plain
  image on the Image element) stays the simple `background` / `src`; `fills` only
  materializes for non-trivial fills. Round-trips through `HtmlCanvasStyle.fills` via
  `styleFromElement` / `stylesFromHtmlNode` (no version bump, like Effects).
- Compile: pure `src/domain/canvas/fillCompile.ts` (`compileFills`, `fillTargetForType`,
  `gradientToCss`, `adjustmentsToFilter`) — type-aware box/text/image targets, comma-stacked
  `background-image` layers + `background-blend-mode`, `color-mix` opacity baking, the
  img↔background-div↔`<video>` dual render path, and SVG def descriptors (filters/patterns).
- Render: `ElementRenderer` weaves the compiled fill into every box/text/image/icon branch;
  `src/canvas/stage/FillDefs.tsx` inlines the SVG `<filter>` (temp/tint/highlights/shadows)
  and exact-gap `<pattern>` overlays.
- UI: `src/canvas/shell/inspector/FillSection.tsx` (stacked cards, type switch, gradient
  stop editor, image fit/adjustments, video) + `FillColorField.tsx` (CSS-literal color
  field accepting P3/OKLCH, native eyedropper, token binding).
- Eyedropper: web `EyeDropper` with a native macOS `NSColorSampler` Tauri fallback
  (`src-tauri/src/eyedropper.rs` → `pick_screen_color`, bridged by
  `src/infrastructure/eyedropper.ts`).

**Deferred:** SVG paint-servers for `path`/`svg` elements (they fill via the Vector
section; star/ellipse/polygon take fills as clipped-div backgrounds); image-token binding
(`resolveTokenRef` returns null for images today); true per-layer image/video opacity (CSS
has no per-background-layer image opacity — baked for solid/gradient, best-effort for
images); an HSV/gamut slider picker UI (the color field is typeable + native swatch). The
Safari-16.2 `in <space>` gradients and `color-mix` opacity assume a modern WKWebView (no
old-WebKit fallback layer is emitted). The macOS eyedropper objc2 bindings were written but
not `cargo check`ed on this Linux host — a binding-name rename may be needed on a real Mac.

---

## Original spec (for reference)


## The merge (read first)

paper today has **Solid / Gradient / Image** with the controls shown (gradient stops,
interpolation, P3 picker). Figma is fuller: **Pattern (tile)**, **Video**, **multiple
stacked fills** each with its own **blend mode + opacity**, and **image adjustments**.
This product takes the **superset** — but renders it as honest CSS/SVG, type-aware
(the same fill type compiles differently for a box, an `<img>`, an SVG shape, or text).

**Figma note honored:** *lines and arrows take no fill* (open shapes have no interior).
Hide/disable the Fill panel for `line`/`arrow` types — they are styled only via
[`inspector-border-stroke.md`](./planned/inspector-border-stroke.md).

## The user's adendo — Image element default + Pattern (important)

Inserting an image must create the dedicated **Image element** (the mock-by-default
object from `Product.md` → "Image and Icon are mock by default"), and the user can then
**change the fill type/mode in the inspector** — while **Pattern (tile) stays a
first-class option**.

This has a hard technical consequence the research confirmed: **an `<img>` renders
exactly one image instance and can never tile.** Tiling/Pattern is only possible with a
**div + `background-image: repeat`** or an **SVG `<pattern>`**. So the renderer needs a
**dual path** for the Image element:

- **Single-instance** fit (Fill/Fit/Crop) → `<img>` with `object-fit`/`object-position`.
- **Tile/Pattern** fit → a **div with a repeating background** (or inline SVG
  `<pattern>` when exact tile gaps are needed).

Selecting "Pattern" in the inspector therefore **swaps the element's render target**
(img ↔ background-div) under the hood — the same HTML↔SVG/render-switching theme as the
Appearance, Border/Stroke and Effects docs. The Image element keeps whichever mode was
chosen; the inspector flips between them. (Open question below: the default fit mode on
insert — Fill vs Tile.)

## Today (what already exists)

`ElementStyles` has `background` (solid color), `backgroundRef` (color token), `color`
(text), `objectFit`, and elements carry `src`. So **solid fill + a single image** exist
today. New in this spec: **gradient**, **pattern/tile**, **video**, **multiple fills**,
**per-fill blend mode**, **wide-gamut (P3/OKLCH)**, **gradient interpolation spaces**,
**image adjustments**, and the **eyedropper**.

## Fill types → CSS/SVG

### Solid (by element type)

| Element | CSS/SVG | Alpha |
|---|---|---|
| Box | `background-color` | `#RRGGBBAA` (Safari 10) or `rgb(r g b / a)` (Safari 12.1) |
| Text | `color` | same |
| SVG shape | `fill` | `fill-opacity` (0–1) |

⚠ On a **gradient-filled SVG shape**, don't use `fill-opacity` for transparency (macOS
WebKit premultiplied-alpha darkening) — bake alpha into the gradient stops or use
`opacity` on a wrapper.

### Gradient

Types: `linear-gradient()` / `radial-gradient()` (Safari 6.1), **`conic-gradient()`**
(angular, Safari 12.1). Angle (180°), color stops with position % and per-stop alpha
(use an explicit zero-alpha same-color stop, not the `transparent` keyword, to avoid a
gray tint).

**Interpolation color space** (paper's "Average color / OKLAB / Nearest hue / OKLCH"):

| Paper option | CSS | Note |
|---|---|---|
| Average color | default (`in srgb`) | plain sRGB blend (the "muddy middle"); **default is sRGB, not oklab** |
| OKLAB | `in oklab` | perceptual, rectangular |
| OKLCH | `in oklch` | perceptual, polar |
| Nearest hue | `... in oklch shorter hue` | "nearest" = shorter arc; `shorter hue` is the default hue method (also `longer`/`increasing`/`decreasing`) |

⚠ **`in <colorspace>` + hue methods are hard-gated at Safari 16.2** — older WebKit
treats the whole gradient as invalid and drops it. **Always emit a plain-sRGB fallback
`background` first, then the `in …` gradient.**

### Wide gamut / Display P3 (the color picker's sRGB / Display P3)

`color(display-p3 r g b / a)` (Safari 15 safe floor) and `oklch()/oklab()/lab()/lch()`
(Safari 15.4). ⚠ **Store the space-tagged literal** (`color(display-p3 …)` / `oklch(…)`)
— **not** `#RRGGBBAA`, which is sRGB-only and clips chroma. Wide-gamut colors are
gamut-mapped per display, so they're **not pixel-identical** on sRGB vs P3 monitors.
Gate wide-gamut styling with `@media (color-gamut: p3)` + sRGB fallback.

### Image (Fill / Fit / Crop / Tile)

| Fit | as `<img>` element | as div background |
|---|---|---|
| Fill | `object-fit: cover` | `background-size: cover` |
| Fit | `object-fit: contain` | `background-size: contain` |
| Crop | `object-fit: none` + `object-position` | `background-size: <w h>` + position |
| **Tile / Pattern** | **✗ impossible on `<img>`** | `background-repeat: repeat` (or SVG `<pattern>`) |
| Alignment | `object-position` | `background-position` |

`object-fit`/`object-position` fully supported Safari 10+. The Tile row is why the
Image element needs the dual render path (the adendo).

### Pattern / Tile — scale, spacing, alignment

Scale → `background-size`; alignment → `background-position`. ⚠ **CSS has no exact
tile-gap.** `background-repeat: space` is auto-spaced, ignores `background-position`,
and is **buggy/ignored on iOS WebKit**; `round` adds no gap. For **exact spacing** use
**inline SVG `<pattern patternUnits="userSpaceOnUse">`** with a cell larger than the
motif — **gap = patternWidth − motifWidth**, container-independent:

```xml
<pattern id="tile" width="40" height="40" patternUnits="userSpaceOnUse">
  <image href="motif.png" width="25" height="25"/>   <!-- exact 15px gap -->
</pattern>
```

### Video

No CSS "background video" — use a `<video autoplay loop muted playsinline>` behind
content with `object-fit: cover`. ⚠ WKWebView autoplay policy: needs the **full set**
`autoplay loop muted playsinline` (un-muting without a gesture pauses; missing
`playsinline` forces fullscreen on iOS); the video **pauses when scrolled off-screen**.
Heavier than an image fill (decode/GPU/battery).

### Multiple fills + per-fill blend mode

Figma stacks fills (e.g. image + gradient overlay), each with blend + opacity →
comma-separated `background-image` layers + per-layer `background-size/position/repeat`
+ **`background-blend-mode`** (blends layers **within** the element — *not*
`mix-blend-mode`, which is element-vs-backdrop). ⚠ **First listed layer = on top**;
`background-color` is always bottom. Full support Safari 10.1. The non-separable modes
(hue/saturation/color/luminosity) render with slightly different chroma in WebKit —
snapshot-test.

### Text with gradient/image fill

```css
background-image: linear-gradient(45deg, red, blue);
-webkit-background-clip: text; background-clip: text;   /* unprefixed Safari 15.5+ */
-webkit-text-fill-color: transparent; color: transparent;  /* fallback */
```

⚠ **`-webkit-` prefix required** below Safari 15.5; guard with
`@supports (-webkit-background-clip: text)` and a fallback color in case the image fails.

### SVG shape fills (star / ellipse / polygon)

Paint servers only — CSS `background` does **not** fill an SVG geometry element. Solid →
`fill`; gradient → `fill="url(#grad)"` (inline `<linearGradient>`/`<radialGradient>`);
image/pattern → `fill="url(#pat)"` (inline `<pattern><image></pattern>`). ⚠ **All
paint-server refs must be inline/same-document** — WebKit drops external
`url(file.svg#id)` refs and falls back to a plain fill.

## Image adjustments (Figma image fill)

| Adjustment | Maps to | |
|---|---|---|
| Exposure ≈ | `filter: brightness()` | approximation |
| Contrast | `filter: contrast()` | clean |
| Saturation | `filter: saturate()` | clean |
| **Temperature** (blue↔yellow) | `<feColorMatrix>` (R/G/B diagonal) | ⚠ needs SVG filter |
| **Tint** (green↔magenta) | `<feColorMatrix>` | ⚠ needs SVG filter |
| **Highlights / Shadows** | `<feComponentTransfer>` tone curves | ⚠ needs SVG filter |

⚠ Temperature/Tint/Highlights/Shadows have **no CSS-filter equivalent** — compose CSS
`filter` (brightness/contrast/saturate) with an **inline** `filter: url(#id)` SVG chain.
⚠ Safari supports **neither external-file nor data-URL** `filter: url()` refs — keep the
whole filter inline/same-document.

## Eyedropper — needs a native fallback

⚠ The JS **`EyeDropper` API is Chromium-only — absent in WebKit/WKWebView.**
Feature-detect (`'EyeDropper' in window` → false) and fall back to a **native macOS
`NSColorSampler`** invoked from the Rust/Tauri backend (samples any on-screen pixel,
returns an `NSColor`, and notably does **not** trigger the Screen Recording prompt). No
first-party Tauri eyedropper plugin exists — bridge to native via objc on the main
thread and return hex/sRGB to the webview.

## By-element-type cheat sheet

| Fill | box (div) | img-element | svg-shape | text |
|---|---|---|---|---|
| Solid | `background-color` | (tint via filter) | `fill`+`fill-opacity` | `color` |
| Gradient | `background-image:*-gradient()` | ✗ (use bg div) | `fill=url(#grad)` inline | bg-image + clip:text |
| Image Fill/Fit/Crop | `background-image`+`size` | `object-fit`+`position` | `fill=url(#pattern>image)` | bg-image + clip:text |
| Tile / Pattern | `background-repeat:repeat` (no exact gap) | **✗** | **SVG `<pattern>` (exact gaps)** | n/a |
| Video | ✗ | `<video object-fit:cover>` behind | ✗ | ✗ |
| Multiple + blend | comma layers + `background-blend-mode` | ✗ | stacked shapes/opacity | bg layers + clip:text |
| Adjustments | `filter` (+ inline SVG) | `filter` | `filter` | `filter` |

## Product ties

- **System Design tokens:** solid fills bind to **color tokens**; gradients/images can
  bind to **gradient/image tokens** (`Product.md` System Design lists gradients,
  images). Linked token = read-only at the instance, editable at the master
  (linkable/detach). `backgroundRef` already models a color-token binding today.
- **References → image/pattern fills:** an image or a **stack piece** from References
  can become an image/pattern fill (the Builder produces stacks). Cross-link
  [`builder-future.md`](./planned/builder-future.md).
- **Blend overlap:** per-fill blend is `background-blend-mode` (within element); the
  element-vs-backdrop blend is `mix-blend-mode` in
  [`inspector-appearance.md`](./planned/inspector-appearance.md). Keep the two distinct in UI.
- **Render-target switching:** Pattern/Tile and SVG-shape fills switch the element's
  render (img ↔ div ↔ inline SVG) — same theme as Appearance/Border/Effects and the
  shipped vector editing ([`UX.md`](./UX.md), "Vector editing").

## Respecting the laws

- **Frame is just a div** (laws 7–8): fills apply to any element incl. a div with
  children; no separate Frame entity.
- **Mock/preview content communicates real structure** (law 5): the inserted Image is a
  believable mock by default, then pointed at real content — fills must keep that intent.
- **Ownership/origin unambiguous** (law 11): token-bound/linked-instance fills are
  read-only at the instance, editable at the master.

## Not in scope (here)

- **Stroke/border** color (shares the color picker but is its own capability —
  [`inspector-border-stroke.md`](./planned/inspector-border-stroke.md)).
- **AI image tools** ("Make an image", background remove, upscale) — those are the
  Builder's per-cut tools (`Product.md` → Builder / AI tools); fill just consumes the
  result.
- The **renderer's dual img↔background path**, **SVG paint-server generation**, and the
  **native eyedropper bridge** are implementation tasks this spec authorizes.

## Open questions

- **Default fit mode when an image is inserted** — Fill (cover) vs Tile/Pattern. The
  adendo says keep Pattern available and switchable; confirm the *initial* default.
- Whether multiple fills ship in v1 or single-fill first.
- Whether Video fill ships in v1 (autoplay/perf cost) or is deferred.
- Whether to default new gradients to `in oklch` (perceptual) or sRGB ("Average color")
  to match paper's default.

## Sources

- MDN: [`background-blend-mode`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-blend-mode),
  [gradient interpolation / `<color-interpolation-method>`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value),
  [`color()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color),
  [`object-fit`](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit),
  [`background-clip`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-clip),
  [SVG `<pattern>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/pattern),
  [`EyeDropper`](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper).
- Support: [caniuse conic-gradient](https://caniuse.com/css-conic-gradients),
  [caniuse color()](https://caniuse.com/css-color-function),
  [caniuse background-clip-text](https://caniuse.com/background-clip-text),
  [caniuse EyeDropper](https://caniuse.com/mdn-api_eyedropper),
  [WebKit: gradient interpolation / Color 4 (Safari 16.2)](https://webkit.org/blog/13567/web-inspector-and-css-improvements-in-safari-16-2/).
- [Apple `NSColorSampler`](https://developer.apple.com/documentation/appkit/nscolorsampler).
