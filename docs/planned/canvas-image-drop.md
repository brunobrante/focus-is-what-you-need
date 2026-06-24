# Drag a photo/file onto the canvas → Image

Status: planned. Extracted from `Product.md` ("Image and Icon are mock by
default"). When built, fold back into `Product.md` as `[NOW]`.

## Behavior (how it must work)

Today an **Image** element starts as a **mock placeholder**, and the user points
it at real content by setting its `src`. The planned addition is a second, direct
path:

- The user can **drop a photo / image file directly onto the canvas frame** and
  it becomes an Image element holding that file — with no separate "set `src`"
  step afterward.
- The drop must respect the frame-bounds law: the image lands **inside the opened
  frame** (the surface you paint on), like any other created element.
- The mock-placeholder path stays — this is an addition, not a replacement.

## Not in scope

- Does not change the Icon or SVG placeholder behavior.
- Does not introduce a free canvas — the drop target is the opened frame.
