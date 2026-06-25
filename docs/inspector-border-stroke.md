# Inspector — Border / Stroke (Outline, Underline, text Stroke, shape Stroke)

Status: **v1 shipped** — the type-aware Border / Stroke panel. Still planned/deferred:
**Center** alignment, **per-side** widths/colors, a separate **Outline (offset)** control,
exact **SVG dashes on rounded corners** / **mixed corners** (the SVG render-target promotion),
**stroke alignment on vector shapes** (inside/outside), and **endpoint markers** for
lines/arrows.

**What shipped (v1):**
- Data: box `borderStyle` / `borderAlign`, text `textStroke*` + `underline*` in
  `src/domain/canvas/types.ts`. The SVG `stroke*` family already existed. Persists via
  `HtmlCanvasStyle` round-tripped through `styleFromElement` / `stylesFromHtmlNode`
  (additive/optional — no version bump).
- Compile: pure `src/domain/canvas/border.ts` (`compileBorder`, `borderTargetForType`) →
  type-aware `border` (Inside) / `outline` (Outside) / `-webkit-text-stroke` + `paint-order` /
  `text-decoration-*`. **Outside uses `outline`, not a `box-shadow` ring** — so it keeps
  dashes, follows the radius, and never collides with the Effects `box-shadow` list.
- Render: `borderStyleFor()` spread into both `nodeStyle` and `detachedNodeStyle` in
  `src/canvas/stage/ElementRenderer.tsx`; clip-path shapes suppress the CSS border (defer to SVG).
- UI: `src/canvas/shell/inspector/BorderSection.tsx`, mounted after Appearance in
  `ElementTab.tsx`; vector stroke controls moved here out of the Vector section. Border/stroke
  colors bind to System Design color tokens.

Inspector spec derived from **paper.design** (Border / Stroke /
Outline / Underline) and **Figma** (one unified "Stroke" with alignment + per-side +
dash + endpoints), re-grounded for this product's **DOM-native** canvas and verified
against WebKit/Safari support (this app runs in a Tauri **WKWebView**, not Chromium).
One doc for the **Border/Stroke** panel group.

## The merge (read first)

paper.design splits this capability into **four panels named by what they actually
are in CSS** — and each name is a **distinct CSS property**, which is exactly the
honest, DOM-native thing to do:

| paper name | element type | CSS/SVG mechanism |
|---|---|---|
| **Border** | Frame / Rectangle (boxes) | `border` (on the box edge) |
| **Outline** | Frame / Rectangle (boxes) | `outline` + `outline-offset` |
| **Stroke** (text) | Text | `-webkit-text-stroke` + `paint-order` |
| **Underline** | Text | `text-decoration` |

Figma instead calls everything **"Stroke"** and adds the richness: **alignment**
(Inside/Outside/Center), **per-side** (All/Top/Bottom/Left/Right/Custom), **dash
style**, **caps/joins**, and **endpoint decorations** (arrowheads) for lines/arrows.

**This product takes both:** keep paper's CSS-honest, per-type naming (so the panel
header reads Border / Outline / Underline / Stroke depending on what's selected and
maps to a real, distinct CSS property), **and** fold in Figma's full control set —
applied through whichever mechanism is correct for that element type. For **vector
shapes, lines and arrows**, behave like Figma's stroke, because those render as SVG and
SVG `stroke` is the right primitive.

## ⚠ The mappings that do NOT map cleanly (decide these up front)

These are why the panel is type-aware and why some controls force an SVG render:

1. **Center stroke alignment has no native CSS** on an HTML box. The inset+outset
   `box-shadow` hack **breaks on rounded corners** in WebKit. → A true Center stroke
   requires rendering the element as **SVG** (SVG stroke is center by default).
2. **Custom dash length/gap is impossible with `border-style: dashed`** — the pattern
   is UA-defined and differs from Chromium. → Exact Figma dashes (esp. on rounded
   corners) require **SVG `stroke-dasharray`**.
3. **Per-side mixed widths/colors + `border-radius`**: where one side hands off to the
   next along the corner arc is implementation-defined. → Pixel-exact mixed corners
   require **SVG**.
4. **Text stroke is fixed center** (`-webkit-text-stroke`); only ~half the set width is
   visible. True inside/outside on text has no clean CSS — `paint-order` only fakes
   above/below fill. Roughly **double** the value to match Figma's visible width.
5. **`outline` follows `border-radius` only since Safari 16.4** → prefer `box-shadow`
   for outside strokes to avoid the version dependence.

**Net rule:** boxes use CSS (Inside = `border`+`border-box`, Outside = `box-shadow`,
plus all underline/text-stroke). The moment you need **Center, exact dashes on rounded
corners, mixed corners, or any vector shape / line / arrow**, drop to **inline SVG** —
the clean, version-stable path in WKWebView. (Per project memory: inline `<svg>` in the
DOM is fine; only `<img>`-delivered SVG data-URIs must avoid `foreignObject`.)

## Today (what already exists)

`ElementStyles` has `borderWidth?: number` and `borderColor?: string` (uniform border
only). Not present and added by this spec: border **style**, **per-side**, **stroke
alignment**, color **opacity**, **outline**, **text stroke** + paint-order,
**underline**, and the whole **SVG stroke family** (dash, caps, joins, markers).

## Controls → CSS/SVG by element type

### Boxes — Rectangle / Wrapper / Image / a div that has children ("Frame")

**Border** (the on-edge stroke):

| Control | CSS | Note / WebKit floor |
|---|---|---|
| Width | `border-width` (per side: `border-top-width`…) | — |
| Color + opacity % | `border-color` as `#RRGGBBAA` | 8-digit hex Safari 10+. "100%" = alpha. |
| Style | `border-style: solid \| dashed \| dotted \| double` | ⚠ dashed/dotted dash length **not controllable** — see dash note. |
| **Alignment: Inside** | `border` + `box-sizing: border-box` | No layout growth. Follows radius. |
| **Alignment: Outside** | `box-shadow: 0 0 0 Npx color` | Follows radius on all WebKit; supports **multiple** stacked strokes; ⚠ no dashed. Use `outline` instead only if you need dashed-outside (Safari ≥16.4 for radius). |
| **Alignment: Center** | **render as SVG** `<rect>` stroke | No clean CSS; box-shadow center-hack breaks on radius. |
| **Per-side**: All/Top/Bottom/Left/Right/Custom | side longhands (`border-top/right/bottom/left-*`) | Each side independent width/color/style. ⚠ mixed widths + radius corner is implementation-defined → SVG for pixel-exact. |
| Multiple borders (+ button) | stacked `box-shadow` layers (outside) or nested elements | Figma allows several strokes; box-shadow stacks cleanly. |

**Outline** (the offset stroke, paper's separate panel):

| Control | CSS | WebKit |
|---|---|---|
| Width / color / style | `outline-width` / `outline-color` / `outline-style` | — |
| **Offset** (the "0") | `outline-offset` (negative pulls it inside) | Baseline. |
| Follows `border-radius` | yes | **Safari 16.4+** only (square corners before) — or use `box-shadow`. |

**Dashed/dotted with exact dash+gap:** `border-style` can't do it. Best path = **SVG
`<rect rx ry>` + `stroke-dasharray="dash gap"`** (`+ stroke-dashoffset` phase,
`stroke-linecap`), which follows rounded corners. Avoid `repeating-linear-gradient`
(breaks at corners) and `border-image` (ignores `border-radius`).

### Vector shapes — Ellipse / Triangle / Star / Polygon (inline SVG)

Full SVG stroke family (all universal in WebKit unless noted):

| Control | SVG | Note |
|---|---|---|
| Color / opacity | `stroke`, `stroke-opacity` (0–1) | `stroke-opacity` independent of color alpha. |
| Width | `stroke-width` | — |
| Dash | `stroke-dasharray` (+ `stroke-dashoffset`) | Exact dash/gap control. |
| Caps | `stroke-linecap: butt \| round \| square` | For open paths / line ends. |
| Joins | `stroke-linejoin: miter \| round \| bevel` (+ `stroke-miterlimit`) | ⚠ never emit `arcs`/`miter-clip` (unsupported everywhere) — fall back to `miter`. |
| Paint order | `paint-order: fill stroke markers` | Default; reorder for stroke under/over fill. |
| **Alignment: Center** | default (SVG stroke straddles the path) | — |
| **Alignment: Inside** | 2× `stroke-width` + `clip-path` to the shape | Outer half clipped away. |
| **Alignment: Outside** | `<mask>` keeping the outer half, or JS offset path | clip-path can't invert; harder — note as v2. |

### Lines / Arrows (inline SVG)

| Control | SVG | Note |
|---|---|---|
| Color / width / opacity / dash | `stroke*` as above | — |
| End cap | `stroke-linecap` | For ends without a marker. |
| **Endpoint decorations** (arrow, triangle, circle, diamond, line) | `marker-start` / `marker-end` → `<marker orient="auto" markerUnits="strokeWidth">` | Scales with stroke width; rotates to path. |
| **Flip / swap-ends button** | swap `marker-start` ↔ `marker-end` (or reverse the path) | ⚠ `orient="auto-start-reverse"` only spec-conformant **Safari 26.2+** → use two explicitly-oriented markers + swap for older WKWebView. |
| Constant stroke under zoom | `vector-effect: non-scaling-stroke` | Safari 5.1+. Only this value is implemented; verify against the app's zoom model (CSS transform vs viewBox). |

### Text — Stroke and Underline

**Text Stroke** (paper "Stroke" on Text, with Above/Below fill):

```css
/* Below fill (clean outline, fill covers inner half — recommended default) */
-webkit-text-stroke: 6px #000; paint-order: stroke fill;
/* Above fill (stroke over fill = browser default, heavier interior) */
-webkit-text-stroke: 6px #000; paint-order: fill stroke;
```

- `paint-order` applies to HTML text in **WebKit since Safari 11** (Chromium ignores it
  — but this app is WebKit, the supported path). ⚠ Visible width ≈ half the set value →
  roughly double Figma's number. Single stroke only.

**Underline** (paper "Underline" on Text):

| Control | CSS | WebKit floor |
|---|---|---|
| On + color | `text-decoration-line: underline` / `text-decoration-color` | universal |
| Style | `text-decoration-style: solid \| double \| dotted \| dashed \| wavy` | Safari 8+ |
| Thickness (the "1") | `text-decoration-thickness: 1px` | Safari 12.1+ (emit `px`, unitless invalid) |
| Offset (the "Auto") | `text-underline-offset: auto` (or px/%) | Safari 12.1+ |
| Continuous underline | `text-decoration-skip-ink: none` | Safari 15.4+ (default `auto` skips descenders) |

## Stroke opacity

The "100 %" next to the color = alpha. Boxes → `#RRGGBBAA` on the border/outline/shadow
color (Safari 10+). SVG → `stroke-opacity: 1` (independent of color alpha).

## Product ties

- **System Design color tokens:** a stroke/border color can bind to a color token
  (linkable/detach model, same as components). A linked token is read-only at the
  instance, editable at its master. The panel reflects a binding when present.
- **Appearance overlap:** whether stroke counts in the element's box size is the
  **Strokes Included/Excluded** setting documented in
  [`inspector-appearance.md`](./inspector-appearance.md) (`box-sizing` / border vs
  outline). Inside-aligned border = part of the box; outside/outline/shadow = not.
- **SVG render switching:** Center alignment, exact dashes on rounded corners, mixed
  corners, and any vector/line/arrow promote the element to an **SVG render target** —
  the same HTML↔SVG unification as [`inspector-appearance.md`](./inspector-appearance.md)
  (squircle) and the shipped vector editing ([`UX.md`](../UX.md), "Vector editing").

## Respecting the laws

- **Frame is just a div** (laws 7–8): Border/Outline controls appear on any box element,
  including a div that has children; no separate Frame entity.
- **Ownership/origin unambiguous** (law 11): token-bound or linked-instance strokes show
  read-only values from the master; raw editing happens at the master.
- **Edit in isolation** (law 9): strokes edit the opened subject's element in its frame.

## Not in scope (here)

- **Fill** (solid/gradient/image fills) — separate Fill panel doc; stroke color reuses
  the same color/token picker but fill is its own capability.
- **Effects** (shadow as a blur effect, not a stroke) — separate Effects doc. Note:
  outside stroke uses `box-shadow` mechanically, but the *Effects* shadow (offset+blur)
  is a different control.
- The **SVG offset-path geometry** for true outside stroke on concave shapes, and the
  **render-target switching**, are implementation tasks this spec authorizes.

## Open questions

- Default stroke alignment per type (boxes → Inside like Figma's default? shapes →
  Center?).
- Whether to always render dashed strokes via SVG (consistent, exact) or only when the
  user customizes dash length.
- Outside stroke on concave SVG shapes (mask vs offset path) — ship Inside+Center first,
  Outside as v2.
- Multiple strokes on text (Figma allows; CSS text-stroke is single) — defer or layer.

## Sources

- MDN: [box-sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing),
  [box-shadow](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow),
  [outline-offset](https://developer.mozilla.org/en-US/docs/Web/CSS/outline-offset),
  [border-image](https://developer.mozilla.org/en-US/docs/Web/CSS/border-image),
  [paint-order](https://developer.mozilla.org/en-US/docs/Web/CSS/paint-order),
  [-webkit-text-stroke](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-text-stroke),
  [stroke-dasharray](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray),
  [stroke-linejoin](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-linejoin),
  [marker orient](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/orient).
- WebKit: [Safari 16.4 (outline follows radius)](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/),
  [Safari 26.2 (auto-start-reverse)](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/),
  [Introducing text-stroke](https://webkit.org/blog/85/introducing-text-stroke/).
- Support: [caniuse paint-order](https://caniuse.com/mdn-css_properties_paint-order),
  [caniuse vector-effect](https://caniuse.com/vector-effect),
  [caniuse #rrggbbaa](https://caniuse.com/css-rrggbbaa),
  [caniuse text-decoration-thickness](https://caniuse.com/mdn-css_properties_text-decoration-thickness),
  [caniuse skip-ink](https://caniuse.com/mdn-css_properties_text-decoration-skip-ink).
- [Inner/outer strokes in SVG (alexwlchan)](https://alexwlchan.net/2021/inner-outer-strokes-svg/).
