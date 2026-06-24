# Canvas surface adapter / policy framework (deferred)

Status: **deferred** — this is future refactor work that was deliberately parked.
Unlike the other items here, the right action today is **not to build it**; this
doc records *what* it is, *why* it's parked, and the *criterion* for revisiting.

## What it is

A generic shared canvas engine so the multiple canvas surfaces stop being separate
editors with copied viewport/pointer/selection/tooling logic:

- a `CanvasSurfacePolicy` (per-surface capability data: tools, bounds, persistence,
  zoom rules), and
- a `CanvasEngineAdapter<TDocument, TNodeId, TSelection>` with per-surface adapters
  (`sceneCanvasAdapter`, `builderCanvasAdapter`, …),
- plus splitting `canvas/engine/store.tsx` (`EditorProvider`) into pure reducer /
  React provider / persistence-session effects,

so Main / Drafts / Versions / References / Fast Edit become **policies over one
scene engine** instead of forks.

## Why it's deferred

Reality validated parking it: the Builder was cleaned up with plain hooks, and the
Versions Canvas shipped with its own shell + persistence hook — **neither needed the
framework**. Building the generic adapter layer now would be premature abstraction.

## The principles it would serve (keep these even without the framework)

- **Don't fork the scene editor for new scene surfaces.** Versions, Fast Edit, and
  References should reuse the existing scene behavior and **disable** what they don't
  support, rather than copy a second editor.
- **Shared canvas logic stays headless** — pure domain/application primitives
  (`domain/canvas/*`), not a React mega-component. Presentation calls into them.

(The "finite canvas / `1×` floor", "Builder stays separate", and "writes only via the
save queue / settings only via `resolve.ts`" rules are **product laws / guardrails**
and live in `Product.md` and `CLAUDE.md` — not here.)

## When to revisit

Only when there is concrete pain the framework would remove — e.g. two scene
surfaces drifting because they each copy the reducer, or Fast Edit / References
needing real policy gating that conditional flags can't express cleanly.

First step then is the **narrow** one: split `canvas/engine/store.tsx` into pure
reducer / provider / persistence-session effects so scene surfaces can share the
reducer behind a small capability config — *then* consider policies. **Don't** build
the full generic `CanvasEngineAdapter<TDocument>` until a second **scene** surface
genuinely needs it.

---

*Extracted from the former `canvas-engine-architecture.md` (§3 + the two principles
above); the rest of that doc was a current-state snapshot and duplicated product
laws, so it was dropped.*
