# Richer project screen types

Status: planned. Extracted from `Product.md` (Project / Screen). When built, fold
back into `Product.md` as `[NOW]`.

## Today (the constraint this relaxes)

A project is created by choosing exactly one type — **mobile | tablet |
desktop** — which fixes the screen size (e.g. mobile `390×844`). Every screen in
the project is generated at that one type's fixed width×height.

## Behavior (how it must work)

- **More than one screen type in one project** — e.g. a project that holds both
  tablet and mobile screens together, instead of one type per project.
- **Predefined types not locked to a fixed width×height** — types that aren't a
  single hardcoded size.

## Invariant to preserve

A **Screen's** device size/type is still fixed at creation and not editable from
inside the canvas (`Product.md` — "Screen and Component are the same thing").
Multiple types per project means a project can *contain* screens of different
fixed types — not that a screen's own size becomes editable.
