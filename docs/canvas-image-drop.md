# Drag a photo/file onto the canvas → Image

Status: built. Shipped behavior; the `[NOW]` summary lives in `Product.md`
("Image and Icon are mock by default") and the interaction detail in
[`UX.md`](./UX.md) (Canvas Page → "Drop a photo/image file onto the canvas").

## Behavior (how it works)

An **Image** element can be created two ways. The original path: insert a **mock
placeholder** and point it at content via its `src`. The direct path added here:

- **Drop an image file** from the OS onto the canvas and it becomes an Image
  element holding that file — read as a **data URL**, centered at the drop point,
  and selected — with no separate "set `src`" step.
- The drop respects the **frame-bounds law**: the image lands **inside the opened
  frame** (the surface you paint on), like any other created element. Elements are
  frame-bounded (`constrainElementInPlace`), so a dropped image can never overflow
  the frame in the document model.
- Only files whose type is `image/*` are accepted; non-image drops are ignored.
- The mock-placeholder path stays — this is an addition, not a replacement.

## Resize-to-frame (config, default on)

Setting: **Settings → Canvas → Shell → "Resize dropped images to frame"**
(`canvas.shell.resizeImageToFrame`, default `true`).

- **On** — the Image element is scaled **proportionally** (aspect ratio preserved)
  to fit within the frame's width × height. It only shrinks when the photo is
  larger than the frame in either axis (`scale = min(1, frameW/imgW, frameH/imgH)`)
  and never upscales. The whole photo is shown, un-cropped.
- **Off** — the element keeps the file's **natural pixel size**. Because elements
  are frame-bounded, the box is still clipped to the frame and the image renders at
  1:1 (`objectFit: none`), so an oversized photo shows a crop of the frame region.

## Implementation

- Drop handler: `apps/desktop/src/canvas/stage/hooks/useCanvasPointerEvents.ts`
  (`onDragOver` / `onDrop`), wired onto the viewport div in `CanvasStage.tsx`. It
  mirrors the system-clipboard SVG-paste flow: build the node with
  `createElementForTool("image", …)`, set `node.src` to the data URL, size it per
  the setting, `insertElement`, then dispatch `commitDocument`.
- Setting plumbed through `domain/settings/{types,defaults,updates}.ts` and the
  Switch row in `components/modals/appSettings/CanvasTab.tsx` (mirrors
  `invisibleDragGhost`).
- Storage: the data URL round-trips for free — `htmlSceneAdapter` maps engine
  `src` ⇄ stored `imageUrl`. No schema change.

## Not in scope

- Does not change the Icon or SVG placeholder behavior.
- Does not introduce a free canvas — the drop target is the opened frame.
