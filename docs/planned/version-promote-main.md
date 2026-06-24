# Promote a version to main

Status: planned. Extracted from `Product.md` (Screen → Versions). When built,
fold back into `Product.md` as `[NOW]`.

## Behavior (how it must work)

A screen has one **main** version (the one shown for the screen in the project)
plus any number of other versions. The planned capability:

- **Promote any version to be the main** — the chosen version becomes the one
  shown for the screen in the project.
- The **previously-main becomes a normal version** — nothing is lost, the roles
  swap.

## Implementation note (already half-there)

`VariantRow.order` already encodes main-vs-version (order ≤ 0 = main, > 0 =
version) and the Versions window sorts by it. What's missing is the UI plus the
mutation to reorder/promote. See `Versioning.md` for the full version model.
