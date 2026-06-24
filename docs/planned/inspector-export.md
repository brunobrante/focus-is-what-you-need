# Inspector — Export (PNG, JPEG, WebP, PDF, SVG, HTML + device mock)

Status: planned. Inspector spec derived from **paper.design** and **Figma** (Export
panel) plus this product's own differentiators, re-grounded for the **DOM-native**
canvas in a Tauri v2 + **WKWebView** app (WebKit, not Chromium) and verified against
native WebKit/Tauri/Rust capabilities. When built, fold the shipped behavior into
`Product.md` as `[NOW]` and trim this entry. One doc for the **Export** panel group.

## What this is (and isn't)

The Export panel exports a **selected element / screen** to image/PDF/HTML — distinct
from the project-level `.figx` file (export-only artefact per `Product.md` storage
rules). The core is standard (scale + format + Export button, multiple entries via `+`),
but this product adds real value because it is DOM-native:

- **HTML export** — emit real, standalone HTML/CSS (Figma can't faithfully; we author
  real CSS, so this is honest output — the differentiator).
- **Device mock** — wrap a **screen** export in a device shell with the whole HTML at
  the right viewport; position a **component** correctly within a device/context mock.
- Formats **PNG / JPEG / WebP / AVIF / PDF / SVG**, scale @1x/@2x/@3x/arbitrary,
  transparent vs colored background, per-element multiple export entries.

## ⚠ The WKWebView reality (decides the architecture)

The usual JS DOM-to-image libraries (**html-to-image, dom-to-image, html2canvas**)
serialize HTML into `<svg><foreignObject>` and load it through `<img>` — and
**WebKit renders `foreignObject` HTML unreliably** (confirmed; matches this project's
`[[project_wkwebview_no_foreignobject]]` memory and WebKit bug 23113). So raster export
**must be native**, not JS-canvas based.

**Architecture: rasterize natively in WebKit, encode in Rust, author HTML/SVG in JS.**

| Output | Produced where | Mechanism |
|---|---|---|
| PNG / JPEG / WebP / AVIF | Native → Rust | `WKWebView.takeSnapshot` → bitmap → Rust `image`/`webp`/`ravif` encode |
| PDF | Native (WebKit) | `WKWebView.createPDF` (vector) |
| SVG | Webview (JS) | serialize **already-vector** subtree only; raster fallback for HTML boxes |
| HTML | Webview (JS) | emit standalone HTML/CSS from the element's style objects |
| Device mock | Composite | HTML shell (HTML export) or frame-PNG composite in Rust (raster) |

WebKit is the only thing that can faithfully rasterize the live HTML/CSS/SVG; Rust's
`image` crate is the only thing that reliably encodes WebP/AVIF and zips a batch.

## Today (what already exists)

No per-element image/HTML/PDF export exists yet. (`.figx` project export is unrelated.)
Everything here is new, and most of it lives in the **Rust backend**, not the webview.

## Core panel (the standard part)

Per element, a list of export entries (Figma/paper model) — add/remove via `+`/`−`:

- **Scale**: 0.5×/1×/2×/3× + arbitrary.
- **Format**: PNG / JPEG / WebP / AVIF / PDF / SVG / **HTML**.
- **Suffix** (advanced): `@2x`, etc. → `"{name}{suffix}.{ext}"`.
- **Export** button (⇧⌘E). Multiple entries export together; Rust zips the batch
  (`zip` crate) and returns one archive.

## Raster export (PNG/JPEG/WebP/AVIF) — native

- **`WKWebView.takeSnapshot(with: WKSnapshotConfiguration)`** (macOS 10.13+): captures a
  `rect` (the element's `getBoundingClientRect()`, in CSS points) to an `NSImage`.
- **Scale via `snapshotWidth = rect.width * scale`** — WebKit re-rasterizes from the live
  render tree at that resolution (true supersampling → crisp text/vectors). ⚠ **Do not**
  use CSS `transform: scale()` (reflows/blurs) or try to change `devicePixelRatio`.
- **Encode in Rust, not in the webview:** `NSImage → CGImage → RGBA8 → image::RgbaImage`
  → PNG/JPEG/WebP/AVIF. One bitmap, N formats (makes multiple-entry export cheap).
  ⚠ **Canvas `toBlob('image/webp')` is unreliable in WebKit** (silently falls back to
  PNG) — that's why encoding is Rust-side.
- ⚠ The software snapshot **does not capture WebGL/`<video>`/some accelerated layers**
  (they come back blank). Pure HTML/CSS + inline SVG (our case) is fine; a **video fill**
  ([`inspector-fill.md`](./inspector-fill.md)) won't snapshot — flag/flatten it.
- **Tauri bridge:** `webview.with_webview(|w| …)` + `objc2-web-kit` to reach the raw
  `WKWebView`; the snapshot is an **async completion handler** — wrap in a Rust oneshot,
  marshal off the main thread. Pin Tauri's minor version (objc bindings can shift).

## PDF export — native, vector

- **`WKWebView.createPDF(configuration: WKPDFConfiguration)`** (macOS 11+): renders a
  `rect` of web content to a **real vector PDF** (selectable text, vector paths). Returns
  `Data` → write to file in Rust, no re-encoding. Preferred over the print path
  (`NSPrintOperation`), which adds pagination/margins; keep print only as a pre-11
  fallback.

## SVG export — vector subtrees only

⚠ Serializing arbitrary HTML/CSS to SVG needs `foreignObject` → broken in WebKit. So:

- **SVG-native element** (inline `<svg>` shapes/paths/text/gradients) → **true vector
  SVG** via `XMLSerializer` of the subtree (normalize namespaces, inline defs/`<use>`,
  embed referenced fonts/images as data-URLs **in the SVG's own elements**, not
  foreignObject).
- **HTML box** (divs, CSS backgrounds, filters) → SVG export **unavailable**; either
  gray it out in the UI (what Figma effectively does for effect-heavy frames) or wrap a
  raster snapshot in `<svg><image>`. This ties to the HTML↔SVG render model in the
  Appearance/Border/Effects/Fill docs.

## HTML export — the differentiator

The element is stored as **style objects**, so the emitter is fully controlled (no
scraping the live DOM). Modes:

- **Standalone single file** (inline styles or embedded `<style>`, base64 fonts/images)
  — portable.
- **Bundle** (semantic HTML + external CSS + `assets/` for fonts/images) — cleaner,
  cacheable.

"Production-faithful" checklist (the pitfalls — most matter *because* the rest of the
inspector uses WebKit-specific CSS):

- **UA reset** (`*{margin:0;padding:0;box-sizing:border-box}`) so the consumer browser's
  defaults don't leak in; emit the exact box model.
- **Cross-engine prefixes:** emit **both** standard and prefixed for the WebKit features
  the other panels rely on — `-webkit-backdrop-filter`+`backdrop-filter`
  ([effects](./inspector-effects.md)), `-webkit-background-clip:text`+`background-clip`
  ([fill](./inspector-fill.md)/[typography](./inspector-typography.md)),
  `-webkit-text-stroke` ([border-stroke](./inspector-border-stroke.md)). Run the emitted
  CSS through an autoprefixer step.
- **Color fallbacks:** emit sRGB first, then the wide-gamut override
  (`color:#ff0040; color:color(display-p3 1 0 0.25)`) so non-P3 browsers don't drop it
  ([fill](./inspector-fill.md) wide-gamut).
- **Fonts:** `@font-face` with woff2 (base64 for single-file, `assets/fonts/` for
  bundle), explicit weight/style + `font-display:swap` to avoid faux bold/italic.
- **Validate the export in Chrome, not just our WKWebView** — WebKit renders things
  other engines won't.

(paper.design's `get_jsx` offers React+Tailwind *or* inline-style output — a future
**code-export** mode beyond plain HTML; track separately.)

## Device mock

Drive both paths from **one device definition**: viewport size + screen inset rect +
frame art.

- **HTML export → HTML device shell** (e.g. a pure-CSS device-frame component like
  `marvelapp/devices.css`): set `.screen` to the device viewport and drop the exported
  HTML inside. For a **screen**, the screen size already equals the device viewport
  (`Product.md`: screen device size is fixed at project creation) — the whole HTML fills
  it. For a **component**, place it at its real coordinates inside a screen shell (or pad
  to a context).
- **Raster export → composite a device-frame PNG** (transparent center) around the
  snapshot in Rust (`image::imageops::overlay`) using the known screen-inset rect; or
  render the HTML shell live and snapshot that region (reuses one code path).

⚠ Law 4 (`A snapshot is the node at its true, intrinsic size`): the device mock must not
distort the content's aspect ratio or rewrite its dimensions — the frame is decoration
around a true-size render, never a meaning-changing crop/scale.

## Background & transparency

- `takeSnapshot` honors the content's own background → transparent alpha when the root
  has no opaque background. Export UI: **Background: Transparent / Color / Flatten**.
- For a chosen color, composite over it in Rust before encoding. ⚠ **JPEG has no
  alpha — always flatten** (default white) or alpha drops to garbage.

## Color profile

⚠ Rust's `image` crate is color-space-agnostic — a P3 bitmap saved without a profile is
read as sRGB (colors shift). Read the `CGImage` color space; if Display P3, either
**convert to sRGB** (safe default) or **embed a compact Display-P3 ICC profile**
(`iCCP` chunk). Offer **Export color profile: sRGB (compatible) / Display P3 (wide
gamut)**. `createPDF` preserves color spaces through the PDF model — verify in Preview.

## Product ties

- **`.figx` is separate** — project export-only file; this panel is per-element
  image/HTML/PDF/SVG.
- **Snapshot/thumbnail system:** the canvas already computes node snapshots
  (`Architecture.md`); export at @Nx should reuse/extend that native snapshot path
  rather than a second mechanism.
- **References / Builder:** exported assets are not auto-fed back into References (that's
  the Builder's job); export is a terminal user action.

## Respecting the laws

- **Snapshot at true intrinsic size** (law 4): all scales are clean supersamples of the
  node's real size; the device mock never distorts it.
- **Frame is just a div** (laws 7–8): export works on any element, incl. a div with
  children; a "screen" export is just the top-level component exported with its device
  mock.
- **Edit/act in isolation** (law 9): export targets the selected subject.

## Not in scope (here)

- **Code export** (React/JSX/Tailwind à la paper `get_jsx`) — a richer future mode beyond
  plain HTML; track separately.
- **AI image tools** on export — Builder's domain.
- The **native bridges** (`takeSnapshot`/`createPDF` via `objc2-web-kit`), **Rust
  encoders** (`image`/`webp`/`ravif`/`zip`), and **device-frame assets** are
  implementation tasks this spec authorizes.

## Open questions

- Default format/scale per element type (PNG @2x? HTML for screens?).
- Whether AVIF/WebP ship in v1 (encode cost) or PNG/JPEG/PDF/HTML first.
- Device-mock asset source/licensing (Apple Design Resources bezels vs a CSS frame set).
- Whether HTML export defaults to single-file (data-URLs) or bundle (assets folder).

## Sources

- Apple: [`WKSnapshotConfiguration`](https://developer.apple.com/documentation/webkit/wksnapshotconfiguration/afterscreenupdates),
  [`createPDF(configuration:completionHandler:)`](https://developer.apple.com/documentation/webkit/wkwebview/createpdf(configuration:completionhandler:)),
  [Get Started with Display P3 (embed ICC)](https://developer.apple.com/videos/play/wwdc2017/821/).
- [WebKit bug 23113 — foreignObject HTML mis-renders](https://bugs.webkit.org/show_bug.cgi?id=23113),
  [foreignObject→image limitations](https://semisignal.com/rendering-web-content-to-image-with-svg-foreign-object/).
- [Tauri `with_webview`](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindow.html),
  [`image-rs/image` (WebP/AVIF encode)](https://github.com/image-rs/image),
  [MDN `toDataURL` (WebP→PNG fallback)](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL),
  [marvelapp/devices.css](https://github.com/marvelapp/devices.css/),
  [Compact Display-P3 ICC profiles](https://github.com/saucecontrol/Compact-ICC-Profiles).
