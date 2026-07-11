# Screen pages — follow-ups (editor polish + preview/outputs)

Status: **planned** — the core feature shipped @ `6748b38` (Product.md law
"Screen pages — fixed window, scrollable content"; UI spec in `UX.md` → Canvas
Page → "Screen pages"). Persistence, both axes, components, and in-context
clipping are done. What remains splits into two groups: editor polish (known
debts, none blocking) and preview/outputs. Items are independent — pick one,
verify, commit, next.

## Editor polish

### Auto-scroll at the window edge while dragging

Dragging an element toward the window edge just clips it — the object vanishes
into the cut until you scroll manually, so moving something to page 2 is a
blind two-step (drag, scroll, drag again). Standard fix: while a drag/resize is
active and the pointer holds near the window's leading/trailing edge (content
axis only), advance `contentScroll` at a ramped rate. The gesture already runs
in content coordinates, so only the scroll dispatch is new; the content
transform keeps the element under the cursor.
Files: `useCanvasPointerEvents.ts` (move loop), `store.tsx` (`setContentScroll`).

### Tooling overlays are not clipped to the window

Selection handles / hover outlines of an element sitting outside the visible
window slice float over the stage background (the scene clips; the tooling
layer doesn't). Clip the tooling render to the frame's on-screen rect when
`contentPages > 1` — or suppress chrome for elements wholly outside the window.
Files: `CanvasToolingLayer.tsx`, `canvasToolingRenderer.ts`.

### Canvas rotation + scroll misalignment

The DOM slides the content along the frame's **local** axis (translate inside
the rotated stage), but `contentViewportTransform` shifts `offsetX/offsetY` in
**screen** space — with `canvas.rotation ≠ 0` and scroll ≠ 0, hit-testing and
handles drift off the render. Either rotate the scroll vector before applying
it to the offsets, or refuse pages on rotated frames. Low priority (rotated
frames are rare); decide before preview work multiplies the render paths.
Files: `CanvasStage.tsx` (`contentViewportTransform`), `viewport.ts`
(`createViewportMatrix`).

### Paste / align are not window-aware

SVG/clipboard paste centers on `canvas.width/2, height/2` — page 1 — even while
the user is looking at page 3. Align-to-frame has the same blind spot. Center
pastes on the **visible window** (`contentScroll` + half a device) and decide
whether "align to frame" means the window slice (probably) or the whole
content.
Files: `useCanvasPointerEvents.ts` (paste effect), `clipboard.ts`,
`elementAlign.ts`.

### Scroll snap-to-page

Expansion is quantized in pages but the scroll is continuous, so the rail can
rest half-page. Optional polish: on scrub release (and modifier+wheel settle),
ease `contentScroll` to the nearest page boundary; keep free scroll during the
gesture. Possibly a PageUp/PageDown-style key command
(`canvas.viewport.pageJump`?) to step pages.
Files: `ScreenPagesPreview.tsx`, `useViewportControls.ts`,
`domain/settings/*` if the key command lands.

### Zoom anchor drift while scrolled

Cursor-anchored wheel zoom pivots on the window-space point; the content point
under the cursor drifts slightly because the scroll offset scales with zoom.
Cosmetic — fold the content scroll into the zoom anchor math if it ever
bothers.
Files: `useViewportControls.ts` (`onWheel` zoom branch).

## Preview & outputs

### Preview mode scrolls pages

The payoff of vertical pages is simulating a scrollable screen — the Preview
launcher should render the full content (device width × N pages) inside the
device viewport and let it scroll naturally (wheel/drag), instead of showing
page 1 only. Horizontal pages likewise (carousel-style). Preview renders from
the persisted scene, which already carries `contentPages`/`contentAxis` on the
subject node — the work is in the preview renderer, not the format.
Files: `PreviewShell` / preview snapshot pipeline (see UX.md → PreviewShell).

### Thumbnails of paged scenes

Project/screen thumbnails should show the **window** (page 1), clipped — decide
and verify; today overflowing content may leak into the thumbnail render.
Files: `application/thumbnails/projectThumbnail.ts`.

### .figx export

Export is scene-JSON based, so `contentPages`/`contentAxis` ride along
automatically — but verify a paged scene round-trips through export/import, and
that the SVG renderer (`svgForHtmlCanvasDocument`) clips to the window (or
grows to the content — decide which is the truthful export).
Files: `lib/canvas/export/*`, `domain/canvas/htmlScene/svgRenderer.ts`.
