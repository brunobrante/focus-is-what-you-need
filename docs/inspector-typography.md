# Inspector — Typography (Text)

Status: **v1 shipped.** Inspector spec derived from **paper.design** ("Text") and **Figma**
("Typography"), re-grounded for this product's **DOM-native** canvas and verified
against WebKit/Safari support (this app runs in a Tauri **WKWebView**, not Chromium).
One doc for the **Typography** panel — shown only when the selected element is **Text**.

**v1 shipped** (the `TypographySection` panel + `compileTypography`): font family, size,
continuous variable **weight** (1–1000), **style** (italic), color (token-bindable), **line
height** (Auto/Custom unitless), **letter-spacing** (% → em), horizontal **align** (incl.
justify), **vertical align** (flex column), **case** (`text-transform`), **strikethrough**,
and **tight box** (`text-box-trim`, opt-in). Round-trips through the htmlScene adapter. **Not
yet built:** paragraph spacing/indent, OpenType features, truncation/line-clamp, wrap quality,
variable axes beyond `wght`, the pre-18.2 `text-box-trim` metrics fallback, and typography
token binding (only color binds today).

## Scope note

This panel is **mostly standard** — both tools expose the same fields and they map
cleanly to CSS text properties. The value here is getting the **non-obvious
conversions** right (letter-spacing %, variable-font weight, vertical alignment, tight
text bounds) and flagging the **WebKit-specific** gaps, rather than reinventing the
panel. It applies to **Text elements only** (a leaf element whose content is text).

## Today (what already exists)

`ElementStyles` (`domain/canvas/types.ts`) already has `fontFamily`, `fontSize`,
`fontWeight`, `textAlign`, `color`; text elements also carry `sizing: fixed | fit`
(see [`inspector-layout.md`](./inspector-layout.md) for W/H Fit). Missing and added by
this spec: font **style/italic**, **line-height**, **letter-spacing**, **vertical
align**, paragraph spacing/indent, text decoration, text case, OpenType features,
truncation, and variable-font axes.

## Controls → CSS (WebKit-verified)

| Panel control | CSS | Note / WebKit |
|---|---|---|
| Font family | `font-family` | Universal. Default reads paper's "System Sans-Serif" (system stack). |
| Weight / style dropdown ("Regular / Bold / Italic") | **decompose** into `font-weight` + `font-style: normal\|italic` | "Bold Italic" → `font-weight:700; font-style:italic`. |
| Font size | `font-size` (px) | Universal. |
| **Variable weight** (e.g. "250") | `font-weight: 250` | `font-weight` accepts any number 1–1000 and drives the `wght` axis; **preferred** over `font-variation-settings:"wght"` (cascades, inherits, animates). Safari 11+. |
| Other variable axes (slant/optical/width) | `font-optical-sizing`, `font-width`/`font-stretch`, else `font-variation-settings: "slnt"/"opsz"/"wdth"` | Use the high-level prop where one exists; `font-variation-settings` for custom axes (must re-emit all axes to change one). |
| **Letter spacing %** | `letter-spacing` in **`em`** | 5% → `0.05em` (Figma's own rule: 1% = 0.01em). Prefer `em` over precomputed px so it survives font-size changes. |
| **Line height: Auto** | `line-height: normal` | `normal` = font-metric ratio (~1.0–1.2), **not** `1.0`. Only use for "Auto". |
| Line height: fixed / % | unitless (`1.5`) preferred over `%`/px | Unitless inherits as the raw number (recomputed per child); `%`/px freeze the computed length and break nested sizes. |
| Horizontal align (left/center/right/**justify**) | `text-align: left\|center\|right\|justify` | Figma adds **justify** (4th button) — include it. |
| **Vertical align (top/middle/bottom)** | flex column on the text box: `display:flex; flex-direction:column; justify-content: flex-start\|center\|flex-end` | ⚠ **Not** `vertical-align` (that only moves inline/table-cell boxes). Only meaningful when the text box height > content (i.e. H is Fixed, not Fit). |
| Paragraph spacing | `gap` on the flex column (between paragraphs) or `margin-block` | `gap` is cleanest — no leading/trailing margin. |
| Paragraph indent | `text-indent` | First-line indent. |
| Text decoration (underline / strike) | `text-decoration-line: underline \| line-through` | Combine for both. |
| Text case (UPPER / lower / Title) | `text-transform: uppercase \| lowercase \| capitalize` | ⚠ `capitalize` ≠ true title case (doesn't lowercase the rest or skip minor words) — for exact title case, transform the string in JS. |
| OpenType (ligatures, tabular nums, fractions) | prefer `font-variant-*`, else `font-feature-settings` | ⚠ **Safari cannot *disable* default ligatures** — "ligatures off" from a design is unhonored; enabling features works. |

### Advanced (behind the sliders icon)

The advanced popover holds paragraph spacing/indent, decoration, case, OpenType
features, and truncation:

- **Truncation:** single line → `text-overflow: ellipsis` (+ `overflow:hidden;
  white-space:nowrap`); multi-line → `-webkit-line-clamp: N` (+ `display:-webkit-box;
  -webkit-box-orient:vertical; overflow:hidden`) — the WebKit-origin property, best
  supported here. Ties to `max-height` from [`inspector-layout.md`](./inspector-layout.md).
- **Wrap quality:** `text-wrap: balance` (Safari 17.5+) / `pretty` (Safari 26+) —
  degrade gracefully to `auto`, safe to emit.

## Tight text bounds — `text-box-trim` (the one that matters)

Figma reports a text node's box **tight to cap-height / baseline**, trimming the
line-box half-leading. A plain DOM text box **includes** that half-leading above the
cap and below the baseline — so positioning text from design coordinates is visually
**off by the leading** unless trimmed. Reproduce Figma's tight bounds with:

```css
text-box-trim: trim-both;
text-box-edge: cap alphabetic;
```

⚠ **WebKit support: Safari 18.2+** (WebKit shipped it first; no flag). On older macOS
WKWebView it **silently no-ops** and text sits offset by the leading. Provide a
fallback (negative margins computed from font metrics) if older WKWebView must be
supported, and gate with `@supports (text-box-trim: trim-both)`. (The old name
`leading-trim` is dead — do not emit it.) This single property is the biggest lever for
making DOM text bounds match what the design tool draws.

## Product ties

- **System Design typography tokens** (`Product.md` → System Design): font, size,
  weight, line-height, etc. can come from a **typography token**. A linked token is
  read-only at the instance and editable at its master (workspace/project) — the same
  linkable/detach model as components. When a text element binds to a token, the panel
  reflects that binding rather than raw values. (Token UI is its own concern; this doc
  just notes the binding point.)
- **Vertical align needs a real box:** it only does something when H is **Fixed**
  (taller than the text). With H = **Fit/Hug** the box equals the content, so vertical
  align is inert — keep the control but reflect that state.

## Respecting the laws

- **Edit in isolation** (law 9): typography edits the opened subject's text element
  within its fixed frame.
- **Ownership/origin unambiguous** (law 11): a token-bound or linked-instance text
  element shows read-only values sourced from the master; raw editing happens at the
  master.

## Not in scope (here)

- **Fill/color of text** beyond the existing `color` — text fill (solid/gradient/image)
  belongs with the Fill panel doc.
- **Text-on-path, rich inline styling spans** (mixed styles within one text node) —
  future; this panel styles the text element as a whole.
- The **renderer's text-bounds/metrics fallback** for pre-18.2 WebKit is an
  implementation task this spec authorizes but does not detail.

## Open questions

- Whether to apply `text-box-trim` by default (match Figma bounds) or as an opt-in,
  given the 18.2 floor and the metrics fallback cost.
- Default line-height: `normal` (Auto) vs a fixed ratio.
- How rich is the weight/style dropdown for variable fonts — named instances only, or a
  continuous weight slider (since `font-weight` is continuous)?

## Sources

- MDN: [variable fonts guide](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide),
  [`font-weight`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-weight),
  [`line-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/line-height),
  [`text-transform`](https://developer.mozilla.org/en-US/docs/Web/CSS/text-transform),
  [`text-box-trim`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-box-trim),
  [`-webkit-line-clamp`](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-line-clamp).
- Support: [WebKit Safari 18.2 (text-box-trim)](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/),
  [caniuse variable-fonts](https://caniuse.com/variable-fonts),
  [caniuse text-box-trim](https://caniuse.com/css-text-box-trim),
  [caniuse text-wrap balance](https://caniuse.com/css-text-wrap-balance).
- [Figma letter-spacing → em](https://forum.figma.com/suggest-a-feature-11/percentage-based-letter-spacing-should-convert-to-em-value-in-dev-mode-41443).
