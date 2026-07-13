# Motion (Timeline / Keyframe Animation)

## What it is

A per-element timeline for authoring animation directly on the canvas, in the
spirit of Figma Motion: keyframe properties (position, scale, rotation,
opacity, ...) on existing elements, with easing/spring curves and scrubbable
preview. Not a separate app or mode — it attaches to elements that already
exist on the canvas.

## The authoring vs. runtime split

Researched against Figma Motion (launched open beta June 2026) and the
broader motion-tool landscape (Rive, ProtoPie, Principle, After Effects) plus
the JS/React animation library ecosystem (Motion/motion.dev, GSAP,
react-spring, Lottie, rive-react). Consistent finding across all of them:
**the visual timeline/keyframe editor and the animation runtime are two
separate engineering problems.** No library — not even Rive's own, whose core
product is a lightweight embeddable runtime — ships a timeline UI for free.
Rive had to build its own from scratch despite already owning the runtime.

This project's canvas already renders elements as real DOM/SVG (not a bitmap
canvas), which is the piece that makes the runtime side cheap here:

- **Authoring UI (custom-built, the real effort):** timeline track, scrubber,
  draggable keyframes, easing/spring curve editor, property binding to
  elements. No off-the-shelf editor fits this; at most a scaffold like
  `react-timeline-editor` or `animation-timeline-control` could seed the
  timeline widget.
- **Playback/rendering (leverage existing lib):** since elements are real DOM
  nodes, an existing runtime — Motion (motion.dev) or the native Web
  Animations API — drives the actual interpolation during preview/playback.
  The editor never reimplements interpolation math; it only owns the
  keyframe data and timeline UI, and hands values to the library at
  scrub/play time.

## Data model (sketch)

- Keyframe: `{ elementId, property, value, time, easing }`
- Timeline: ordered keyframes per element, scoped to a frame
- No dependency on a screens/pages/prototyping model. Figma Motion keyframes
  properties on existing vector layers directly — it is not state-to-state
  screen interpolation (that would be a Smart-Animate-like feature, which
  this project also doesn't have and is out of scope here).

## Scope (v1)

- Attaches to existing `ElementNode` properties — no new element type needed
- Position, scale, rotation, opacity keyframing with linear/eased playback
- Scrub + play preview inside the canvas editor

## What it is not

- Not a runtime replacement — Motion/GSAP/WAAPI still do the actual
  interpolation; no hand-rolled render loop
- Not a Figma-Motion-parity target on day one — no state machines, no
  AI-assisted first-pass generation, no dev-mode code export
- Not dependent on components/variants/prototyping links existing first

## Open questions

- Where keyframe data persists — new record type via `putRecord` keyed by
  element, or a field on `ElementNode` itself
- Whether preview mutates the real `ElementNode` props during scrubbing or
  animates a rendered clone/overlay
- Whether to seed the timeline widget from an existing OSS scaffold or build
  fully custom
