# Inspector — Layout & Position

Status: planned. Inspector spec derived from **Figma** + **paper.design**,
re-grounded for this product's **DOM-native** canvas and verified against both
tools' actual behavior (sources at the end). When built, fold the shipped behavior
into `Product.md` as `[NOW]` and trim this entry. This is the **Layout** panel group
of the element inspector; it absorbs what Figma splits into two panels (**Layout** +
**Position**) into one paper-style panel.

## Why this panel is different here (read first)

Figma has a **Frame** that is its own special entity with its own constraint solver.
**This product does not** — and, importantly, **neither does paper.design.** Research
confirms paper has *no* Frame object type: "a container is just an element (a div)
that has children and a `display` value." That is exactly this product's model
(`Product.md` laws 7–8): a frame is **a div that has children**, any element with a
child **is** a component, and the frame is simply the highest node of that
component/screen. So building on paper's model — not Figma's — is the correct call,
and it is consistent with the locked idea.

The consequence: the Layout panel is **not** a generic transform editor over an
abstract scene. It is, honestly, a **CSS layout editor** — box model + flexbox +
grid + transforms — where **every control writes a real CSS property**. There is no
second constraint engine to reconcile with the DOM, because the DOM *is* the model.

This also means a freedom Figma does not have: because we render real CSS, we are
**not bound by Figma's limitations** (Figma grid has no `repeat()`/`minmax()`/
subgrid; Figma wrap is horizontal-only). We can match Figma's control *set* for
familiarity while quietly doing it *better* in CSS where it helps.

## Is "auto layout" the same as flex? (the question to settle)

**Same idea, not identical.** Figma's Auto Layout was modeled on CSS flexbox — a
container that lays children along an axis with gap, padding, and alignment — and in
a DOM-native tool the container literally **is** `display: flex`. So we get
"auto layout" for free and should call it what it is: **flex**. But Auto Layout adds
behaviors that do **not** map 1:1 to naive flexbox; these are the traps to get right:

1. **The 9-point alignment pad is ONE control that becomes TWO CSS props** —
   `justify-content` (primary axis) + `align-items` (counter axis) — **and which dot
   maps to which prop flips when direction flips** (row vs column). You cannot emit
   correct CSS without knowing the flow direction.
2. **"Auto" gap ≠ `gap: auto`.** Figma's gap = Auto means
   `justify-content: space-between` (and no `gap`). Never emit `gap: auto`.
3. **"Fill" is two different CSS mechanisms.** Fill on the **primary** axis =
   `flex-grow: 1`; Fill on the **counter** axis = `align-self: stretch`. Same label,
   pick by direction.
4. **"Hug" can silently become Fixed.** If a child Fills an axis, Figma downgrades the
   parent's Hug on that axis to Fixed. Don't emit `fit-content` blindly.
5. **Wrap.** Figma wrap is horizontal-only and does **not** stretch rows by default
   (CSS `align-content` defaults differ) — emit `align-content` explicitly. In CSS we
   may allow wrap on either axis.
6. **Rotation sign is inverted** (Figma positive = counter-clockwise; CSS `rotate()`
   positive = clockwise). Our own UI can pick either convention, but be consistent and
   note it for any Figma import.
7. **"Canvas stacking: First on top" ≠ `flex-direction: *-reverse`** (reverse also
   moves geometry). It is a paint-order change → reversed `z-index` only.
8. **Strokes Included/Excluded** = `box-sizing: border-box` with a real `border`
   (Included) vs behaving like `outline` (Excluded; no layout impact).
9. **Constraints** (for absolute/free children) are a separate system; "Stretch" is
   the both-edges-pinned case, "Scale" needs %-based sizing.
10. **Text resize (Auto-width / Auto-height / Fixed) is its own enum**, separate from
    Fixed/Hug/Fill — it needs its own mapping path.

The rest of this doc is written so each control lands on the **right** CSS, avoiding
these traps.

## Today (what already exists in code)

`canvas/shell/inspector/ElementTab.tsx` already exposes a Layout-ish block:

- Position: **X, Y** (relative to parent) + a read-only absolute X/Y readout.
- Size: **W, H**; text-only sizing mode `fixed | fit`.
- **Rotation** (degrees).
- Flex: `display: block | flex`, `justifyContent`, `alignItems`, `gap`, `padding`.
- `overflow: visible | hidden` (clip content).

Engine type: `ElementNode` (`canvas/engine/types.ts`) with `x, y, width, height,
rotation, styles, sizing`; `ElementStyles` (`domain/canvas/types.ts`).
`wrapElements()` (`canvas/engine/mutations/elementHierarchy.ts`) wraps a selection in
a plain rect.

**The central gap to resolve:** today the renderer positions *every* element with
`position: absolute; left/top/width/height` (`ElementRenderer.tsx`), even when its
parent is `display: flex`. That is a contradiction — a real flex/grid child must
**flow**, with no x/y of its own. This panel forces the model to be honest. (paper
went through the same realization: its toggle was first named **"Ignore flex
layout"**, then renamed **"Absolute position"** — proof the in-flow/absolute split is
the right backbone.)

Not present today and added by this spec: alignment row, distribute, flip, rotate
90°, lock aspect ratio, sizing modes Hug/Fill, min/max size, grid layout, individual
padding, wrap, the "Wrap in flex" / "Absolute position" toggles, constraint anchors,
the advanced flex settings (strokes/stacking/baseline).

## The model: in-flow vs absolute **(the core decision)**

An element is in exactly one of two positioning states relative to its parent:

1. **In-flow** — the parent lays it out (parent is `flex` or `grid`, or normal block
   flow). The child has **no free X/Y**; its place is decided by the parent's layout
   (direction, gap, padding) plus the child's **alignment**, **sizing** (Fixed/Hug/
   Fill), and **order**. X/Y become a read-only readout.
2. **Absolute** — the child is `position: absolute` within the frame. It has **free
   X/Y** (offsets inside the frame bounds) and optional **constraint anchors** (which
   edges it pins to when the frame resizes).

The **"Absolute position"** checkbox switches between them (paper's exact control,
confirmed; was literally "Ignore flex layout"). When a child of a flex/grid parent is
made absolute, the parent gets `position: relative` and the child is removed from flow
(siblings reflow as if it were absent) but stays clipped/stacked inside the frame. The
frame-bounds law still holds: even absolute X/Y live **inside the opened frame** —
there is no free infinite plane (`Product.md` law 10).

## Controls → CSS (with the caveats baked in)

| Control | CSS it writes | Caveat / note |
|---|---|---|
| **X, Y** | `left` / `top` (absolute only) | Editable only when absolute; read-only readout when in-flow. Relative to the frame. With rotation set `transform-origin` or precompute, since `rotate()` pivots around center. |
| **W, H** | `width` / `height` | Each axis carries a **sizing mode** (below). |
| **Sizing: Fixed** | `width/height: <px>` | Typing a number implies Fixed. |
| **Sizing: Hug** *(paper "Hug"; text shows "Fit")* | `fit-content` / `auto` | Containers only. ⚠ Downgrades to Fixed if a child Fills that axis. |
| **Sizing: Fill — primary axis** | `flex-grow: 1` | Shares free space by weight among primary-Fill siblings. |
| **Sizing: Fill — counter axis** | `align-self: stretch` | Stretch, not grow — no proportional share. Children only. |
| **Min / Max size** | `min-/max-width`, `min-/max-height` | Stacks on top of the sizing mode and clamps it. |
| **Lock aspect ratio** | constrains W↔H edits | UI-side ratio lock, not a CSS prop. |
| **Rotation** | `transform: rotate()` | Pick a sign convention; note Figma's is inverted vs CSS. |
| **Rotate 90°** | quarter-turn `rotate()` | Quick action (not a documented Figma button — our own affordance). |
| **Flip H / Flip V** | `scaleX(-1)` / `scaleY(-1)` | Compose with rotation in one transform; order matters. |
| **Clip content** | `overflow: hidden` | On the div. |
| **Add flex / Wrap in flex** | `display: flex` | Call it **flex**, not "auto layout" — it is literally flexbox. See flex block. |
| **Direction** | `flex-direction: row \| column` | paper vertical/horizontal. |
| **Gap (number)** | `gap` | Splits to `row-gap`/`column-gap` under wrap. |
| **Gap = Auto / Space between** | `justify-content: space-between` | ⚠ Never `gap: auto`. Collapses the primary-axis alignment to 3 options. |
| **Padding (uniform)** | `padding` | — |
| **Padding (individual)** | `padding-top/right/bottom/left` | Toggle to split into 4. |
| **Alignment pad (9-pt)** | `justify-content` + `align-items` | ⚠ One control → two props; mapping flips with direction. |
| **Align text baseline** | `align-items: baseline` | Row flow only; mutually exclusive with the counter-axis dot. |
| **Wrap** | `flex-wrap: wrap` | Emit explicit `align-content` to match no-stretch default. |
| **Grid** | `display: grid` | See grid block — we can exceed Figma here. |
| **Absolute position** | `position: absolute` ↔ in-flow | The core toggle above. |
| **Constraint anchors** | `left`/`right`/both/`center`/stretch (+ vertical) | Absolute/free children only — see constraints. |

### Min / max sizing (important — the "Add min/max width/height" menu)

Each axis can carry **min and max constraints on top of its sizing mode** (Fixed,
Hug, or Fill). In Figma this is the **"Add min width… / Add max width… / Add min
height… / Add max height…"** dropdown next to the W/H field (visible in the
screenshots). Direct CSS:

- min width → `min-width`, max width → `max-width`
- **min height → `min-height`, max height → `max-height`**

Why they matter (the real use cases):

- **`min-height` on a Hug container** — the box hugs its content but never collapses
  below a floor (e.g. a card that shrinks to its text but stays ≥ 64px).
- **`max-width` on a Fill child** — fills available space but stops growing past a
  readable measure (e.g. text column capped at 720px while still centering).
- **`max-height` + clip** — caps a container and, combined with `overflow: hidden`
  (or scroll), prevents runaway growth; for text, a max-height interacts with line
  clamping (no perfectly faithful CSS prop — `-webkit-line-clamp` is the nearest).
- **`min-width` on a flex row child** — keeps an item from being squeezed below a
  usable width when siblings compete for space.

Behavior rules: min/max **stack on** the sizing mode and **clamp** the computed size;
`min` wins over `max` if they conflict (CSS resolution order); they apply per axis,
independently. Surface them as optional add-ons per axis, exactly like the Figma menu,
not as always-visible fields.

### Advanced flex settings (Figma's popover)

- **Strokes: Included** → `box-sizing: border-box` + a real `border` (Figma states
  this verbatim). **Excluded** (default) → treat stroke like `outline` (no layout
  impact). Decide per-element how stroke participates in sizing.
- **Canvas stacking: Last on top** (default) → natural DOM paint order. **First on
  top** → reversed `z-index` (⚠ **not** `flex-direction: *-reverse`, which moves
  geometry too).
- **Align text baseline** → `align-items: baseline` (row only).

## Per element type

The panel adapts to what the element **is** (has children? is it text?):

- **A div that has children (= a component/screen "frame"):** full authoring —
  position (if itself absolute in its parent), size, rotation, flip, **flex**
  (direction, gap, padding incl. individual, alignment pad, space-between, baseline,
  wrap, advanced settings) **or grid**, clip content. There is **no separate Frame
  entity** — these controls appear on **any** element with children.
- **A leaf element (Rectangle/Wrapper, no children):** position, size, rotation,
  flip, **Wrap in flex** (wraps it in a *new* flex div and reparents it — the
  successor to today's `wrapElements()`, but the wrapper is born `display: flex`),
  **Absolute position** toggle, and — when its parent is flex — alignment/sizing for
  how it sits in that parent.
- **Text:** position, rotation, **Wrap in flex**, and W/H with the **Fit/Hug** sizing
  prominent. ⚠ Text resize is its own enum: **Auto-width** (`width: max-content`),
  **Auto-height** (fixed width, `height: auto`, wraps), **Fixed** (fixed W+H, clip) —
  do not conflate with the Fixed/Hug/Fill container modes.

## Grid

`display: grid`, with **Columns** and **Rows** as ordered tracks; each track sized
**Fill** (`1fr`/`Nfr`), **Auto** (⚠ Figma's "Auto" = `1fr`, but in real CSS we can
also offer true content sizing via `auto`/`min-content`), or **Fixed** (`<px>`), plus
`row-gap`/`column-gap`. Map straight to `grid-template-columns` / `-rows`. Child
placement = `grid-column`/`grid-row: span N`; cell alignment = `justify-self`/
`align-self`. **DOM advantage:** unlike Figma we can later expose `repeat()`,
`minmax()`, and named lines — out of scope for v1 but unblocked by the model.

## Alignment, distribute, tidy up

A row of align controls — **align left / h-center / right** and **align top / v-center
/ bottom** — plus **Distribute horizontal spacing**, **Distribute vertical spacing**,
and **Tidy up**. Context-dependent:

- Single in-flow child → sets its alignment within the flex/grid parent.
- Multi-selection → aligns/distributes the selected elements relative to each other
  (or the frame); distribute needs 3+. These are editor actions that mutate
  X/Y/alignment, not a persisted style. (These are the Figma Position-panel controls
  paper is missing — fold them in.)

## Constraint anchors (absolute / free children only)

Horizontal **Left / Right / Left+Right / Center / Stretch** and vertical **Top /
Bottom / Top+Bottom / Center / Stretch** (the dropdowns in both tools). DOM mapping:

- Left → `left`; Right → `right`; **Left+Right / Stretch** → both `left`+`right` set
  (width tracks the frame); Center → `left: 50%; translateX(-50%)` (or
  `margin-inline: auto`); same on the vertical axis with `top`/`bottom`.
- Figma also has **Scale** (position + size in %) — `left: P%; width: Q%`; no single
  CSS prop, needs %-based sizing. Optional for v1.

These describe how a child reflows when its **frame** resizes — honest CSS
positioning, not a Figma-only solver. (paper added a "Constraints panel" for the same
purpose: "control element layout during parent resize.")

## Respecting the laws

- **No free canvas / 1× floor** (law 10): absolute X/Y and constraints live **inside
  the opened frame**; the panel never implies an infinite plane.
- **Frame is just a div** (laws 7–8): every "frame" control appears on any element
  with children; no separate Frame entity is introduced (matches paper).
- **Edit in isolation** (law 9): the panel edits the opened subject's elements within
  its fixed frame.

## Not in scope (here)

- Fills, strokes/border styling, effects/shadows/blur, opacity — other inspector
  panels (separate planned docs). This doc only touches stroke *insofar as it affects
  layout sizing* (the Included/Excluded setting).
- Typography beyond sizing behavior — separate Typography panel doc.
- Responsive breakpoints / multi-size screens — see `project-screen-types.md`.
- The renderer rewrite that makes in-flow children stop being `position: absolute` is
  an **implementation** task this spec authorizes but does not detail; it must land
  before flex/grid sizing can be honest.

## Open questions

- Default sizing per type (text → Fit/Hug both axes? container → Hug? leaf → Fixed?).
- Confirm the **exact** mechanics of paper's "Wrap in flex" by using the app (research
  could only infer it wraps-in-a-new-container; that is the assumption above).
- Whether to unify the sizing vocabulary to **Fixed / Hug / Fill** with "Fit" shown
  only as the text alias (today's code already stores text `sizing: "fit"`).
- How the in-flow/absolute toggle reads when the parent is plain block flow (likely
  "Absolute position" off = normal block child).

## Sources

- Figma: [Guide to auto layout](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout),
  [horizontal/vertical flows](https://help.figma.com/hc/en-us/articles/31289464393751-Use-the-horizontal-and-vertical-flows-in-auto-layout),
  [grid auto layout flow](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow),
  [apply constraints](https://help.figma.com/hc/en-us/articles/360039957734-Apply-constraints-to-define-how-layers-resize),
  [`strokesIncludedInLayout`](https://developers.figma.com/docs/plugins/api/properties/nodes-strokesincludedinlayout/),
  [`layoutGrow`](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutgrow/) /
  [`layoutAlign`](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutalign/).
- paper.design: [build log](https://paper.design/build-log) (the "Ignore flex layout"
  → "Absolute position" rename; "Wrap in flex"; on-canvas gap/padding handles),
  [roadmap](https://paper.design/roadmap) (CSS Grid planned), [docs/MCP](https://paper.design/docs/mcp)
  (flex layouts + containers; no Frame entity).
