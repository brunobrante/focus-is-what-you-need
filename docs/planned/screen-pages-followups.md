# Screen pages — follow-ups (editor polish + preview/outputs)

Status: **planned** — the core feature shipped @ `6748b38` (Product.md law
"Screen pages — fixed window, scrollable content"; UI spec in `UX.md` → Canvas
Page → "Screen pages"). Persistence, both axes, components, and in-context
clipping are done. The **editor-polish** group has now shipped too (see below);
what remains is **preview/outputs**. Items are independent — pick one, verify,
commit, next.

## Editor polish — shipped

All six editor-polish debts are done (each its own commit; behavior documented in
`UX.md` → Screen pages):

- **Auto-scroll at the window edge while dragging** — a drag/draw/resize near the
  window's leading/trailing edge ramps `contentScroll` so the object crosses into
  the next page hands-free.
- **Tooling overlays clipped to the window** — with 2+ pages the chrome (handles,
  outlines, guides, tags) clips to the on-screen window rect.
- **Canvas rotation + scroll alignment** — the scroll vector is rotated into
  screen space, so hit-testing/handles track the content on rotated frames.
- **Window-aware paste & align** — SVG/clipboard paste centers on the visible
  window slice; a single root element aligns to it. (Internal Cmd+V paste stays
  position-preserving by design.)
- **Scroll snap-to-page** — the scroll eases to the nearest page boundary on
  scrub release / wheel settle (free during the gesture). A PageUp/PageDown-style
  `canvas.viewport.pageJump` key command was **not** added — still open if wanted.
- **Zoom anchor drift while scrolled** — the cursor-anchored zoom no longer drifts
  when the pages are scrolled (the clamp region follows the scroll fold).

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
