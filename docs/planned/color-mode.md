# Color Mode (Dark / Light)

## What it is

A per-screen, per-component color mode system. Each screen has a **dark/light toggle** that switches its color mode in place — not a version, not a variant, but an inline state of the same screen. The user manually assigns a dark and a light value to each color property on each element. The toggle just switches which set is active.

## How it works

Every color property on an element (background, text, border, etc.) can hold **two values**: one for light mode and one for dark mode. By default only one is set (the element has no mode awareness). The user opts in per property by expanding it and setting both values.

The screen-level toggle switches all mode-aware properties simultaneously. Elements that only have one value set are unaffected by the toggle — they stay as-is.

## UX

- A **Light / Dark toggle** in the screen header (or canvas toolbar when a screen is open)
- Per-property: a color field can be expanded to reveal a light slot and a dark slot side by side
- Unset slots inherit the single value (no breakage for elements that ignore the system)
- The toggle is a **preview/authoring tool** — it lets the designer switch modes while building to check both states

## Scope

- Lives at the screen level, propagates down to its components while the toggle is on
- A component can also have its own local toggle for isolated editing
- Not shared via the linkable/instance system — color mode is a property of the design, not a separate entity

## What it is not

- Not a version — both modes live in the same scene, not separate scene copies
- Not a variant — it does not fork the component tree
- Not automatic — the app never infers dark colors; the user sets them explicitly
