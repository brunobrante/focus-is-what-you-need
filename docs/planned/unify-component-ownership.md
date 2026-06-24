# Unify component ownership — drop the screen-main `screenId` special case

Status: planned. Pure cleanup / refactor — **no business-rule change, no bug**. Safe to do
whenever; not required for correctness (version promote-to-main already ships and works:
`7eb1c13` / `4bc1150` / `afbb307`). This is the "step 2 / Camada 2" follow-up that was
deliberately deferred.

## The problem

There are two ways a top-level component is "owned" today, and they are asymmetric:

- **Screen's main** → its top-level components are `screenId`-owned (`screenId` set,
  `parentVariantId === null`).
- **Everything else** (screen *versions*, every component variant) → top-level components are
  **variant**-owned (`parentVariantId = <that variant>`).

The screen-main is the only `screenId`-owned case. That asymmetry forces the
`screenId ↔ parentVariantId` re-home inside `promoteVariantToMain` (`variants.repo.ts`, the
screen branch with `promotedClones` / `keepOnOldIds`) and is a recurring source of
"is this the screen's main" special-casing across the storage and canvas layers.

## The goal

Make **every** top-level component variant-owned: a screen's main top-level components are
parented to the screen's **main variant** (`parentVariantId = mainVariant`), exactly like a
screen version or a component variant. Then ownership is uniform across the whole graph
(`component → parentVariant → (owned by) master`), and `promoteVariantToMain` becomes a pure
reorder + embed/instance swap with **no** re-home.

## Why it's safe re: the "casal" model

This touches only the **component → scene** axis. The **variant → master** axis (the "casal"
model — a screen/component owns its variant chain; versions belong to the master, never the
project; `Versioning.md` §3.1) is untouched. A top-level component parented to the screen's
main variant still belongs to the screen. The change actually *reinforces* the casal model by
making ownership uniform.

## The real cost (bigger than it looks)

`componentScope` (`src/lib/storage/defaults.ts`) is a **pure, field-only** function on the hot
path (runs in `normalizeComponentRow`, on every row load):

```ts
if (row.parentVariantId) return "nested";
if (row.screenId)       return "screen";
if (row.projectId)      return "project";
if (row.workspaceId)    return "workspace";
```

Once a screen-main top-level component carries `parentVariantId = mainVariant`, the
`parentVariantId` check would wrongly classify it as `"nested"`. To fix it, `componentScope`
must inspect the parent **variant's owner** (`ownerKind: "screen"` → screen-level;
`"component"` → nested), i.e. become **variant-aware** (needs the variants table) instead of a
pure field check — so `variants` must be threaded to every caller of `componentScope` /
`normalizeComponentRow`. There is no way to drop the promote re-home **without** this change —
the `screenId` model requires the re-home by definition.

## Call-sites that assume `screenId` + `parentVariantId === null` for a screen top-level

(from a `grep` of `screenId === … && parentVariantId === null`, excluding draft markers)

- `src/lib/storage/defaults.ts` — `componentScope` (the crux; must become variant-aware).
- `src/lib/storage/repos/components.repo.ts` — `listTopLevelByScreen` / `listTopLevelByScreenId`,
  `findComponentBySourceNode` (screen scope), `createComponent` (screen-parent branch sets
  `screenId` + `parentVariantId: null` → would set `parentVariantId: mainVariant`).
- `src/canvas/canvasUtils.ts` — `findComponentBySourceNodeInList` (screen scope, ~line 514) and
  the subcomponents derivation (~line 490).
- `src/lib/storage/repos/screens.repo.ts` — `collectScreenComponentIds` (~line 194).
- `src/lib/storage/repos/variants.repo.ts` — `promoteVariantToMain` screen branch (the re-home
  this refactor deletes) and `ownedChildren` resolution.
- `src/application/canvas/canvasMaterializer.ts` — top-level parent resolution
  (`{ kind: "screen", screenId }`) becomes the screen's main variant uniformly. The `rootOwner`
  option added for version materialization already points the way.
- `src/application/scenes/dependencyIndex.ts` — already resolves `screenId → mainVariant`
  (`mainVariantByScreenId`), so propagation needs little/no change; good reference for the model.
- The seed (`src/lib/storage/seed.ts` + mock builders) — must produce screen top-level
  components parented to the screen's main variant. Local-only → bump `SCHEMA_VERSION`, reseed,
  no migration.

## Suggested staging (one commit per step, tests each)

1. `componentScope` becomes variant-aware (accepts `variants`; resolves parent variant's owner).
   Update `normalizeComponentRow` and callers. Unit tests per scope.
2. `createComponent` screen-parent → parent to the screen's main variant. Update
   `listTopLevelByScreen` / `findComponentBySourceNode` / `collectScreenComponentIds` and the
   materializer's top-level `rootOwner`.
3. Seed produces the new shape; bump `SCHEMA_VERSION`.
4. Simplify `promoteVariantToMain`: delete the screen re-home — promotion is now just reorder +
   embed/instance swap for shared children. Keep the dropped-child handling (`Versioning.md` §7c).
5. Update `Versioning.md` (§3.1 ownership note).

## Payoff

`promoteVariantToMain` loses its screen-specific re-home; `componentScope` and the materializer
stop special-casing the screen main; one uniform ownership rule. No business-rule change.
