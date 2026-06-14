# Versioning — Master / Instance / Detach

This document specifies the versioning model for the canvas editor: how a screen or
component version is created, how child components are **linked** (instances) instead
of copied, how a link is broken (**detach**), and how deletion of a master is handled.

It is the source of truth for the work. `UX.md` is updated per phase as each piece
ships; this file describes the full intended model and the implementation plan.

---

## 1. Mental Model

The system follows the classic **master / instance** model (the same idea as Figma's
main components and instances), expressed over the project's graph database.

- A **master** is the canonical definition of a component. It lives where it was
  created — inside a screen (`screenId`), inside another component (`parentVariantId`),
  or promoted to project/workspace global. A master is **not** required to be global.
- An **instance** is a *usage* of a master inside some parent scene. It is a lightweight
  reference node that points at the master; it does **not** store a copy of the master's
  content.
- **Detach** breaks the link: the instance is materialized into a deep copy of plain,
  editable nodes and stops referencing the master.

Editing the master changes every instance, everywhere. That is the entire point of the
link, and the reason the database is a graph.

---

## 2. Core Invariants

1. **Content is never duplicated in storage.** A parent scene stores only the instance
   node (id, bounds, name, `instanceOf`). The master's subtree is expanded **at render
   time**, never persisted into the parent.
2. **Instances are read-only.** You cannot edit inside a linked instance. To change it
   for everyone, open the master. To change it only here, detach first.
3. **One versioning mechanism for screens and components.** A screen is a special frame
   and is versioned with the same variant chain as a component (see §3). "New version of
   a screen" and "new variant of a component" are the same operation.
4. **The master is owned where it was born.** If a button was created inside `Home`, its
   master is screen-scoped to `Home`. Versions of `Home` reference that master in place;
   it does not become global.
5. **Reference everywhere, not just in versions.** Child components are instances in
   *every* parent scene — the original screen and all its versions alike. This retires
   the old embed-and-resync machinery (see §11).

---

## 3. Data Model

### 3.1 Versioning model (unified — screens own variants)

There is **one** versioning mechanism: every versionable subject (a component **or** a
screen) is a master that **owns a chain of `VariantRow`s**. A version is a variant. This
is the "casal" model — versions belong to their master, never to the project.

- A **`VariantRow`** is owned by exactly one master, identified by
  `ownerKind: "screen" | "component"` + `ownerId`. (It no longer carries `componentId`.)
  `order <= 0` is the original (`"main"`); `order > 0` is `V{order}`.
- A **`ComponentRow`** owns variants via `ownerKind: "component"`; it already had
  `activeVariantId`.
- A **`ScreenRow`** owns variants via `ownerKind: "screen"`; it now also has
  `activeVariantId`. A screen is no longer special-cased — it is a master like any other.
  The old sibling model (`versionGroupId` / `versionIndex` on `ScreenRow`, versions
  living at the project level) is **removed**.
- **Scenes are always variant-owned.** `SceneOwnerType` collapses to a single value:
  `"variant"`. A screen's editable scene lives on its active variant; the screen's *main*
  variant is the scene that embeds its top-level components. Opening a screen opens
  `screen.activeVariantId`.

Parent-owner resolution for snapshot propagation is uniform:

- a screen-owned variant is a **root** (no parent) — propagation stops there;
- a component-owned variant's parent is the parent component's variant
  (`parentVariantId`), or — for a top-level screen component — the screen's **main**
  variant (the embedding scene).

Linked instances are unchanged: an instance node references a master component's active
variant, regardless of whether the parent scene belongs to a screen variant or a
component variant.

The dead `ScreenVersionRow` (`screen_versions` table) and `ComponentPlacementRow`
(`placements` table) are removed — they were unused aspirational code.

### 3.2 The instance reference lives on the live node models

The reference field is added to the models actually used at runtime — **not** to the
dead `BaseNodeDef.componentRef`/`referencedBy` in `schema.ts`, which is unused
aspirational code and should be removed:

```
instanceOf?: { componentId: string; variantId: string } | null
```

added to:

- `HtmlCanvasNode` — `src/lib/canvas/htmlScene/types.ts` (+ (de)serialization in
  `htmlScene/document.ts`)
- `ElementNode` — `src/canvas/engine/types.ts` (+ carried through
  `src/canvas/engine/htmlSceneAdapter.ts`)

An instance node stores **no children** in the parent scene. `variantId` pins the
version of the master being shown (defaults to the master's `activeVariantId`).

---

## 4. Render Resolution

Instance content is expanded only for display, in a single shared resolver so the live
canvas and the thumbnails agree:

```
resolveInstances(document, getMasterScene): document-with-inlined-readonly-subtrees
```

Plugged into both render paths:

- **Live canvas** — `src/canvas/engine/htmlSceneAdapter.ts` (hydration) feeding
  `ElementRenderer`.
- **Thumbnails** — `src/lib/canvas/htmlScene/svgRenderer.ts` (separate SVG path; without
  this, an instance's thumbnail would render empty).

Resolution must guard against **cycles** (A→B→A) with a visited set and a depth cap,
mirroring the existing propagation walk.

Resolved subtrees are tagged as read-only and belonging to the instance.

---

## 5. Editing Rules

- Selecting anywhere inside an instance selects the **instance node**, never an inner
  resolved child (hit-testing in `src/canvas/stage/canvasHitTesting.ts`).
- The instance node itself can be moved, deleted, or detached as a whole. Its internal
  contents cannot be edited, dragged, or restyled.
- To edit the contents for everyone: **go to the master** (§6). To diverge only here:
  **detach** (§8).

---

## 6. Navigation — "Go to component" and Back-to-origin

There is currently **no navigation history**; the back button climbs to the structural
parent via the URL. That is wrong for instances: the master's structural parent is the
screen where the master lives, not the version the user was viewing.

- A tree-row and canvas action **"Go to component"** opens the master for editing.
- Opening a master from an instance carries a **return context** (e.g. `?from=<encoded
  owner>` in `src/canvas/hooks/useCanvasNavigation.ts`).
- The Back control (`Canvas.tsx`, `Toolbar.tsx`) honors `from` when present, returning to
  the exact screen/version the user came from — instead of the master's structural parent.

---

## 7. Creating a Version — "Linked or Copy"

When creating a new version of a screen or component, the user chooses the mode via a
modal (reuse `src/components/modals/Modal.tsx` / `ConfirmActionModal.tsx`):

- **Linked** — the frame and all **non-component** children are copied; every
  **component** child becomes an instance pointing at the original's master. Editing a
  master then reflects in both the original and the new version.
- **Copy** — a full deep copy with no links (today's `duplicateVariant` behavior).

`duplicateVariant({ ownerKind, ownerId, sourceVariantId, name, mode })`
(`src/lib/storage/repos/variants.repo.ts`) is the single entry point for **both** screen
and component versions. `addVariant` (component detail) calls it with
`ownerKind: "component"`; `createScreenVersion` (`screens.repo.ts`) calls it with
`ownerKind: "screen"`, duplicating from the screen's main variant. Both open the
"Linked or Copy" modal before calling it.

---

## 8. Detach

Detach replaces an instance node with a **deep copy** of the resolved master subtree
(fresh node ids) and clears `instanceOf`. The result is plain, editable content that is
solo — it links to nothing and is not promoted to a new master. (Reuses the deep-copy
logic that `duplicateVariant` already performs.)

A **"Detach" button** sits in the instance's tree row, alongside the existing
visibility/lock affordances (`src/canvas/shell/tree/TreeRow.tsx`).

---

## 9. Deleting a Master (screen or component)

Deleting something that owns masters referenced elsewhere prompts a dialog that lists
**where** the master is used, then offers two paths:

- **Detach all** — every instance becomes a local deep copy in place; the master is
  removed but no content is lost anywhere.
- **Cascade delete** — the master and all its instances are removed everywhere.

The dialog must show the usage list ("used in List, Detail, Checkout") so the choice is
informed — the cascade path makes content disappear in other places.

A **reverse index** ("who references this master") powers both the dialog and the count:
extend the existing `ComponentPlacementRow` index, or scan scenes for nodes carrying
`instanceOf`.

---

## 10. Visual States

| State | Tree row (left sidebar) | Canvas selection |
|-------|-------------------------|------------------|
| Linked instance | Purple text + link/diamond icon; read-only | Purple outline |
| Detached / own content | Normal (white/grey) | Blue outline (`#0d99ff`) |
| Master being edited | — | Emphasis: "editing the main component — affects all instances" |

`SELECTION_COLOR` is currently a single blue constant in
`src/canvas/stage/canvasToolingRenderer.ts`; instance selection needs a distinct purple.

---

## 11. What This Retires

The current architecture **embeds** a child component's full subtree inline in the parent
scene and keeps it in sync via `replaceComponentSubtreeInGraph` /
`propagateSceneToParents` (`src/lib/storage/repos/scenes.repo.ts`). Once children are
instances:

- **Content propagation is removed** — there is no duplicated subtree to resync.
- **Thumbnail propagation stays** — a parent's preview is still a visual composition of
  its children, so ancestor thumbnails regenerate as before.

---

## 11b. Implementation Status

Done and verified (`tsc` clean; `resolveInstances` unit tests green; no new test
regressions):

- **Phase 0** — `instanceOf` on the live node models + (de)serialization; dead schema removed.
- **Phase 1** — `resolveInstances` / `stripResolvedInstanceChildren` (with unit tests);
  resolution wired into the canvas load (`buildMasterResolver` + a synchronous scene-cache
  `peekTable`), save-strip via the adapter's `pushChildren` guard, thumbnail SVG path, and
  purple instance selection. Hit-testing already selects the instance (inlined children are
  locked).
- **Phase 2** — purple instance rows + "Go to component" and "Detach" buttons in the layers tree.
- **Phase 4** — `detachInstance` engine action (clears `instanceOf`, unlocks inlined content).
- **Phase 3** — back-to-origin navigation: "Go to component" carries a `from` context so
  Back returns to the version the user came from, not the master's structural parent.
- **Phase 5** — "Linked or Copy" `VersionModeModal`; `duplicateVariant({ mode })` for component versions.
- **Phase 6** — `createScreenVersion({ mode })` + a "New version" action on the screen card menu.
- **Phase 7** — reverse index (`listInstanceUsages` / `countInstanceUsages`) +
  `InstanceDeleteModal`: deleting a master that has instances offers **detach-all**
  (`materializeInstancesInGraph` → independent copies) or **cascade**
  (`removeInstancesInGraph` → delete everywhere), wired into `deleteScreen` /
  `deleteComponentTree` via an `instanceStrategy` option (with unit tests).
- **Phase 8 — Versioning unification (done).** The deferred §3.1 unification landed:
  `VariantRow` is now owned by a screen **or** a component (`ownerKind`/`ownerId`);
  screens own a variant chain and carry `activeVariantId`; `SceneOwnerType` collapsed to
  `"variant"` (screen scenes moved onto the screen's variants); the sibling-screen version
  model (`versionGroupId`/`versionIndex`, `screenVersionLabel`, `screenVersionsFromList`)
  and the dead `ScreenVersionRow` / `ComponentPlacementRow` tables were removed. A screen
  version is now a variant, listed in the screen detail Versions tab and selected/opened
  via `setActiveScreenVariant`. Local data is reset by the `SCHEMA_VERSION` bump + reseed.

All phases are complete. Remaining polish (optional): exact "used in <names>" listing
in the delete dialog (currently shows a count), and per-instance overrides.

## 12. Implementation Plan

Phases 0 → 1 are prerequisites for everything. After phase 1, phases 2/3/4 can proceed in
parallel; 5 depends on 4; 6 depends on 5; 7 depends on 1.

- **Phase 0 — Data model + migration.** Add `instanceOf` to the live node models and
  (de)serialization. Unify screens onto the variant chain (`ownerType: "variant"`),
  resetting local data. Remove the dead `componentRef`/`referencedBy`. Migrate existing
  embedded subtrees into instance references (reuse the `sourceNodeId`/name matching from
  propagation). Disable content propagation; keep thumbnail propagation.
- **Phase 1 — Render resolution (read-only).** Write `resolveInstances`; plug into the
  engine adapter and the SVG thumbnail renderer. Cycle guard. Hit-testing selects the
  instance node; resolved children are non-editable. Purple selection outline.
- **Phase 2 — Tree visuals + per-row actions.** Purple rows for instances; "Go to
  component" and "Detach" buttons.
- **Phase 3 — Back-to-origin navigation.** Return context (`from`) on open; Back honors
  it.
- **Phase 4 — Detach.** Materialize master subtree, clear `instanceOf`.
- **Phase 5 — Version creation with Linked/Copy modal.** `duplicateVariant` gains `mode`;
  `addVariant` opens the modal.
- **Phase 6 — Screen versioning.** Same linked/copy path as components, on the unified
  variant chain.
- **Phase 7 — Delete dialog + reverse index.** Usage list; detach-all vs cascade.

Each phase that changes UX updates `UX.md` before its commit, per the project rule.
