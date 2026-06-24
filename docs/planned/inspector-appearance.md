# Inspector — Appearance (Radius, Opacity, Blending)

Status: planned. Inspector spec derived from **paper.design** ("Radius" + "Blending"
panels) and **Figma** ("Appearance"), re-grounded for this product's **DOM-native**
canvas and verified against WebKit/Safari support (this app runs in a Tauri
**WKWebView**, not Chromium). When built, fold the shipped behavior into `Product.md`
as `[NOW]` and trim this entry. One doc for the **Appearance** panel group: corner
radius, opacity, and blend mode.

## The unification this panel forces (read first)

paper.design has **no element types** — one shape, one appearance for everything.
**This product is like paper (real HTML/CSS render) but, like Figma, it HAS element
types** — rectangle, line, ellipse, star, … — that are separate authoring objects yet
**render to one customized HTML/SVG output** (with the canvas's locks). So Appearance
must behave the **Figma way (type-aware)** while producing the **paper way (honest
HTML/SVG)**. Radius is the sharpest example:

- On a **box-like element** (rectangle, wrapper, image, or a div that has children),
  radius is CSS **`border-radius`**.
- On a **vector/SVG shape** (star, polygon, line), radius is **rounding of the path
  vertices** — a geometry operation on the `d` data, **not** `border-radius`
  (which does literally nothing on an SVG `<path>`/`<polygon>`).

This ties directly to the planned **SVG ↔ HTML** work: a star authored as SVG must be
convertible toward HTML where possible, and Appearance must read the element's render
target to choose the right mechanism. Cross-link: [`svg-vector-editing-plan.md`](./svg-vector-editing-plan.md)
("SVG as a sealed component"). The Appearance panel is **type-aware over a unified
HTML+SVG renderer** — that is the Figma+paper merge for this section.

## Today (what already exists)

`ElementStyles` (`domain/canvas/types.ts`) already has `borderRadius?: number`
(uniform only) and `opacity?: number`. The inspector exposes border-radius and
opacity as plain number inputs.

Not present and added by this spec: a radius **slider** (paper-style), **individual
per-corner** radius, **"Full"/pill**, **corner smoothing** (squircle), **blend mode**,
group **isolation** (Pass through / Normal), and **per-element-type** radius behavior.

## Controls → CSS (WebKit-verified)

### Opacity

- **Opacity %** → `opacity` (0–1). Slider + numeric input. ⚠ `opacity < 1` creates a
  stacking context (relevant to blend isolation below).

### Blend mode

The per-layer blend mode (how the element blends with **what is behind it**) →
**`mix-blend-mode`** (not `background-blend-mode`, which only blends an element's own
background layers). All standard modes map 1:1 in WebKit:

| Menu | `mix-blend-mode` |
|---|---|
| Normal | `normal` |
| Darken / Multiply / Color Burn | `darken` / `multiply` / `color-burn` |
| Lighten / Screen / Color Dodge | `lighten` / `screen` / `color-dodge` |
| Overlay / Soft Light / Hard Light | `overlay` / `soft-light` / `hard-light` |
| Difference / Exclusion | `difference` / `exclusion` |
| Hue / Saturation / Color / Luminosity | `hue` / `saturation` / `color` / `luminosity` |
| Plus Lighter | `plus-lighter` (valid in WebKit; Apple uses it) |

⚠ **"Plus Darker"** appears in paper's menu but maps to `plus-darker`, which is
**non-standard, WebKit-only, and mathematically unstable** (open W3C issue; aliased to
`darken` on some platforms). **Recommendation: omit Plus Darker**, or surface it
clearly as experimental. Everything else is safe.

### Group blending — Pass through vs Normal (frames only)

This applies **only to a div that has children** (our "group"/frame — there is no
separate Frame entity):

- **Pass through** (default) → `isolation: auto` — children's blend modes blend
  through to the backdrop behind the group.
- **Normal** → `isolation: isolate` — the group becomes an isolated stacking context;
  inner blends composite only among siblings, not the backdrop.

⚠ Many props (`opacity<1`, `transform`, `filter`, `mask`, `clip-path`, a non-`normal`
`mix-blend-mode`) **already** force isolation as a side effect. Use explicit
`isolation: isolate` to model "Normal" cleanly without those side effects. WebKit
supported since Safari 8.

### Corner radius

- **Uniform** → `border-radius`. **Slider + input** (paper-style — the user's preferred
  fast control), default range 0…(min dimension / 2).
- **Individual corners** → `border-top-left-radius`, `border-top-right-radius`,
  `border-bottom-right-radius`, `border-bottom-left-radius` (four inputs, toggled open
  by the corner-expand icon).
- **"Full" / pill** → `border-radius: 9999px`.
- ⚠ **Clamping:** CSS clamps any radius to `min(width, height) / 2` at render
  (corner-overlap rule). Keep the stored value (e.g. 9999 for a pill) but show that the
  rendered radius saturates — don't "correct" the user's number.

### Corner smoothing (squircle / superellipse)

A **slider** (the user wants the fast paper-style slider, not Figma's menu), 0–100%,
producing iOS-style continuous corners (~60% ≈ Apple's icon smoothing).

⚠ **No native CSS in WebKit.** The native `corner-shape: squircle / superellipse()`
(CSS Borders L4) shipped in Chromium 139 but is **not in Safari/WebKit** (not even
Technology Preview as of mid-2026). So on this runtime:

- **Fallback: render the shape as an inline SVG superellipse `<path>`** (figma-squircle
  style path generation), so `fill` (background), `stroke` (border), and SVG drop
  shadow **follow the curve**. Do **not** use `clip-path`/`mask` for smoothing —
  those clip content but leave `border`/`box-shadow` computed on the square box.
- **Regenerate the path on resize** (debounced); cache by `(w, h, radius, smoothing)`.
- Gate any future native path behind `@supports (corner-shape: squircle)` so the app
  auto-upgrades if/when WebKit ships it.

This means turning on corner smoothing may **promote a box element's render from a
plain div to an SVG-backed shape** — exactly the HTML↔SVG unification this product
needs, and the reason the renderer must be able to switch targets per element.

## Per element type (the Figma-style matrix)

| Control | Box (rect, wrapper, image, div-with-children) | Vector/SVG shape (star, polygon, line) | Ellipse |
|---|---|---|---|
| Opacity | `opacity` | `opacity` | `opacity` |
| Blend mode | `mix-blend-mode` | `mix-blend-mode` | `mix-blend-mode` |
| Pass through / Normal | only if it has children (group) | n/a (leaf) | n/a |
| Corner radius | `border-radius` (+ smoothing via SVG) | **vertex rounding in the path** (geometry, not CSS) | n/a — already round; or `rx`/`ry` if SVG `<rect>`-based |
| Corner smoothing | SVG superellipse fallback | governed by path generation | n/a |

Notes: `stroke-linejoin: round` rounds only a shape's **stroke** at joins, not its fill
geometry — it is **not** a substitute for true vertex rounding. A line has no radius
(but rounded `stroke-linecap` is a related, separate control for the Stroke panel). The
panel shows each control **only where it is meaningful** for the selected type — the
Figma behavior, achieved over the paper-style HTML/SVG render.

## UX conventions to honor

- **Radius = slider + numeric input** (paper) — the user's preferred fast control;
  keep both, not input-only.
- **Corner smoothing = slider** (paper-style), not Figma's dropdown — speed.
- Individual-corner inputs are revealed by a corner-expand toggle (both tools).

## Respecting the laws

- **Frame is just a div** (laws 7–8): the Pass-through/Normal group control appears on
  any element with children; no separate Frame/Group entity is introduced.
- **Ownership/origin unambiguous** (law 11): blend/opacity/radius are local element
  styles; when the element is a linked instance, the panel is read-only at the
  instance and editable at the master (consistent with the linkable model).

## Not in scope (here)

- **Effects** — drop shadow, inner shadow, layer blur, background blur (the extra
  Appearance rows with the sun/spread icons in the screenshots). Those are a separate
  **Effects** panel doc (shadow → `box-shadow`/SVG `feDropShadow`; blur →
  `filter: blur()` / `backdrop-filter`).
- **Fill, stroke/border styling** — separate Fill and Stroke panel docs. This doc only
  touches stroke insofar as smoothing/SVG affects how the border follows a curve.
- The renderer's **HTML↔SVG target switching** and the **SVG vertex-rounding geometry**
  are implementation tasks this spec authorizes; details live in
  [`svg-vector-editing-plan.md`](./svg-vector-editing-plan.md).

## Open questions

- Default radius slider max — `min(w,h)/2` (clamps naturally) vs a fixed cap with a
  "Full" shortcut.
- Whether corner smoothing is offered on vector shapes (it changes path generation) or
  box-only for v1.
- Whether to expose `plus-lighter` at all, given no Figma counterpart, and definitely
  whether to expose `plus-darker` (recommend: omit).

## Sources

- MDN: [`mix-blend-mode`](https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode),
  [`isolation`](https://developer.mozilla.org/en-US/docs/Web/CSS/isolation),
  [`border-radius`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius),
  [`corner-shape`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape).
- Specs: [Compositing 1 — isolated groups](https://www.w3.org/TR/compositing-1/),
  [Compositing 2 — `plus-lighter`/`plus-darker`](https://drafts.csswg.org/compositing-2/),
  [CSS Backgrounds 3 — corner overlap/clamping](https://drafts.csswg.org/css-backgrounds-3/#corner-overlap),
  [CSS Borders 4 — `corner-shape`](https://www.w3.org/TR/css-borders-4/).
- Support: [caniuse mix-blend-mode](https://caniuse.com/css-mixblendmode) (Safari
  "partial"), [New in Chrome 139 — corner-shape](https://developer.chrome.com/blog/new-in-chrome-139)
  (not in WebKit). Squircle fallback: [figma-squircle](https://github.com/phamfoo/figma-squircle),
  [Figma "Desperately seeking squircles"](https://www.figma.com/blog/desperately-seeking-squircles/).
