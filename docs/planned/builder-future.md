# Builder — planned features & long-term direction

Status: planned. Extracted from `Product.md` (The Builder → "Builder — planned"
and "Why the Builder exists"). When a piece ships, fold it back into `Product.md`
as `[NOW]`.

Builder architecture context: [`./canvas-surface-adapter-framework.md`](./canvas-surface-adapter-framework.md)
(keeps Builder a separate model). (Reference stack groups are already shipped — see the
code under `src/lib/references`.)

## 1. Data window (training data + reconstruction sync)

A **data window** beside the Builder that:

- generates **training data** from the cut/stack work, and
- **syncs** between the static source image and its reconstruction (the stack of
  cuts that rebuilds it).

## 2. Background-remove quality & image processing

Quality tooling on top of the per-cut AI tools that already exist today
(background remove, upscale, remove element):

- **Background-remove quality** improvements, and
- other **image processing** to improve cut quality.

## 3. Long-term direction — image→component models

Beyond producing references, the long-term goal is to **accumulate labeled
image→component data to train UX/UI models** — eventually turning a static UI
image into HTML/CSS automatically.

This is *why* the Builder is intentionally **not hard-wired to References only**:
it may feed other features (references **and** data). Keep that decoupling when
evolving the Builder.
