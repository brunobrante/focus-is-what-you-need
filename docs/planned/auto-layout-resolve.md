# Auto Layout Resolve

## What it is

A single button that analyzes all elements in the open component and converts `absolute` positioning into semantic layout (`flex`, `grid`, `block`) automatically, based on the visual position each element already occupies.

The canvas uses `position: absolute` as its primitive — the user positions everything by coordinates. This tool does the reverse read: it interprets what the user meant with those coordinates and expresses it as real layout.

## How it works

The algorithm walks the component tree and, for each container with absolutely-positioned children, infers the layout intent:

- **Centered** — child is equidistant on both axes (top ≈ bottom, left ≈ right) → parent becomes `display: flex; align-items: center; justify-content: center`
- **Horizontal row** — children aligned on the same Y axis with regular spacing → `flex-direction: row`, gap calculated
- **Vertical column** — children aligned on the same X axis → `flex-direction: column`, gap calculated
- **Grid** — children in regular rows and columns → `display: grid`
- **Not inferrable** — ambiguous positioning → stays `absolute`, no change

The comparison tolerance (how equidistant "equidistant" needs to be) is an internal algorithm parameter.

## UX

- Button in the canvas toolbar: **"Resolve Layout"** (working name)
- Applies to the entire open component at once
- Non-destructive: the user can undo normally
- Optional — the canvas keeps working with absolute for users who don't want it

## What it does not do

- Does not change structure (no moving, reparenting, or wrapper creation)
- Does not run automatically — only when the user triggers it
- Does not guarantee perfect results on complex or irregular layouts — it is a heuristic, not a design compiler
