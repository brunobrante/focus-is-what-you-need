# Product.md — The Idea, Set in Stone

This document describes **what the product is and how it must behave** — the
business and UX truth. It is the part of the project that is **not negotiable**.

Everything else is.

## How to read this document

There are two kinds of things in this repository:

1. **The idea** — the product concept, the mental model, and the way the user
   experiences and navigates the app. This document. **Do not change it to make
   the code easier.** If a refactor would break one of the laws below, the
   refactor is wrong, not the law.
2. **The implementation** — the code, the database, the storage model, the
   file/folder structure, the rendering strategy, the performance work, the
   naming. **All of it is free to change**, and should be improved continuously
   for performance, clarity, and organization. None of it is sacred.

So: when in doubt about *what the app does and how it should feel*, this document
wins. When in doubt about *how it is built*, use your best engineering judgment
and make it better. The other docs (`CLAUDE.md`, `UX.md`, `Design.md`,
`Versioning.md`) describe the current implementation and current screens — they
follow the code and may change. This document leads.

Sections are tagged where useful:
- **[LAW]** — invariant. Never break it.
- **[NOW]** — built and shipping today; behavior to preserve.
- **[PLANNED]** — direction, not yet built. Do not treat as a law and do not
  assume it exists.

---

## Why this product exists

This is a canvas design tool in the same family as Figma, Penpot, and
paper.design — but it is built on the opposite philosophy. It is **UX-driven, not
canvas-driven.**

The free, infinite canvas is the thing this product rejects. The free canvas has
fundamental problems:

- **It is disorganized by default.** You spend more time arranging and tidying
  your canvas than actually creating. The tool makes organization *your* job.
- **You cannot truly edit one component in isolation.** To edit a part on its
  own you must first turn it into a shared component, and even then the editing
  model is awkward.
- **It is terrible for finding things.** You scroll and pan endlessly to reach
  the thing you need to touch. Newer "jump to element" features help but the core
  UX is still a hunt.
- **Starting a project is exhausting.** A blank infinite sheet gives you no
  structure to begin from.

The cost of all this is **focus**. When you want to work on one element — really
make one thing, one at a time — a Figma canvas in front of you is a cluttered
mess: things everywhere, much of it not editable from where you are.

This product fixes that by being **organized around componentization** instead of
around an open plane. It follows the atomic-design idea (atoms → molecules →
organisms): structure is the foundation, not an afterthought. You always work on
**one focused subject at a time, inside its own bounds**, and the structure is
created *for* you as you build — not maintained *by* you.

**Focus is what you need.** That is the whole point.

---

## The product in one sentence

A **screen-first, componentization-driven explorer and editor**: you start from a
complete screen, it decomposes into the real components it is made of (formed
automatically as you build), and you drill into and edit each component **in
isolation, at its own true size** — never losing the link back to where it came
from.

---

## The mental model

Every screen is a **tree**.

- The **screen** is the root.
- Its major UI sections are its **direct children** (Header, Hero Banner,
  Featured List, …).
- Each section has its own children (a Header has a Logo, copy, a Search button).
- Those children have children again, as deep as the design goes.

The user navigates that tree **visually, one focused level at a time**. The
product is, in essence, a **visual decomposition tool**:

1. start from the whole screen
2. it splits into meaningful child components
3. preview/edit each child on its own
4. each child reveals its own children
5. never lose the path back to the parent screen

"Parent" is the spine of the product, not optional metadata.

---

## Screen and Component are the same thing **[LAW]**

There is one core abstraction. A **Screen is just the top-level Component** — the
component that has no parent above it. Both are a **frame plus the components
inside it**.

- A **Screen** is always the highest node in its tree. Nothing sits above it. Its
  device size and type (mobile / tablet / desktop) are fixed defaults set when the
  project is created and cannot be edited from inside the canvas.
- A **Component** is the same kind of object at any deeper level.
- The word "Screen" is **nomenclature** for the top frame. Everything else about
  it behaves exactly like a component.

This unification is a product truth and must stay legible (and unconfused) in the
way the app talks about and treats these objects.

---

## Components are formed automatically **[LAW]**

This is the defining difference from Figma and similar tools. **The user does not
manually declare components.** A component comes into being automatically from
structure:

> **If an element has a child, it is a component.**

Example: `<div id="button"><div id="text">Button</div></div>` is automatically a
component — `button` is a component because it contains `text`. It can then be
opened and edited on its own.

An element with **no children** (a lone piece of text, an empty div) is **not** a
component — it is just an element.

This means the component tree is a direct, honest reflection of the structure the
user actually built. There is no separate "componentize this" ceremony.

---

## The Frame — the surface you edit on **[LAW]**

The **frame** is the first/parent element of whatever you opened — the highest
element of that subject:

- editing a **screen** → the frame is the screen background (the top element)
- editing the `button` component above → the frame is `button` itself

The frame is **the surface you paint on**. It is the canvas. The rules:

- You can only create and place elements **inside the frame**. There is nothing
  to edit outside it.
- The frame is fixed in place while open — a component already occupies a fixed
  position inside its parent, so its boundary is fixed.
- **You edit a component by explicitly opening it** ("edit" it on its own), never
  by opening the whole screen and reaching into it. The reason is focus and
  certainty: when you open a component alone, you cannot see or predict what its
  parent contains, so the frame *is* your boundary.
- The exception is the opposite direction: when you are looking at the **parent**
  (e.g. the whole screen), you can see the child's bounds in context, so you do
  not need to isolate it to understand where it can go.

### Parent grid guidance **[NOW]**

When you edit a component in isolation, you can turn on a **grid/guides derived
from its ancestors**, so even alone you can tell how far you can go and stay
aligned with the parent context you cannot currently see.

---

## Elements and content

The canvas tools create real HTML/CSS elements. Two element behaviors are part of
the idea and must be preserved:

### Wrapper **[NOW]**

A **Wrapper** is a plain rectangle element **stripped of a rectangle's default
styling** — it exists literally to be an **HTML wrapper** around other elements.
It starts with no opinionated defaults and is **free to take any property** the
user gives it. It is the neutral container primitive.

### Image and Icon are mock by default **[NOW]**

Inserting an **Image** or an **Icon** drops in a **mock placeholder** — this is
intentional, so structure reads immediately without forcing the user to find real
assets first. The user then points the element at real content (via its `src`).

**[PLANNED]** Sending a photo/file **directly onto the canvas** to become an
image, instead of setting `src` afterward.

### SVG is a sealed component **[PLANNED]**

Inserting an **SVG** drops in a default placeholder (like Image and Icon). An SVG
holds vector elements (paths, shapes) inside it, so by the automatic rule above it
**is a component** — but it is a **sealed** one:

- In the tree it appears as a **single node** with a link to open it on its own;
  its internal vector children (paths, etc.) are **not** surfaced as sub-components.
- On the canvas only the **SVG frame** renders.
- You **cannot edit its internals in place**. To edit the paths inside you must
  **open the SVG on its own** — isolate it / enter its page — exactly like editing
  any component in isolation.

This keeps an imported icon or illustration as **one honest object** in the
structure, while still letting you drill in and edit its vectors when you
explicitly focus on it. It follows the same spine as the laws "any element with a
child is a component" and "you edit inside a frame, in isolation."

---

## The entity model

The product is organized as a strict containment hierarchy:

> **Workspace → Project → Screen → Component → … (nested components)**

Three capabilities recur at multiple levels — **Components**, **System Design**,
and **References** — and flow downward through **one shared mechanism: linkable
instances** (see "Linkable, instances, and detach"). A higher scope marks an item
as *linkable*; a lower scope places it as a *linked instance* that points back to
the master; *detach* turns an instance into an owned local copy. The same three
verbs apply to all three capabilities.

### Workspace **[NOW]**

The top-level home for an organization or product line. *Apple* would be a
workspace; it contains many projects. A workspace owns:

- **Projects** — all the projects under that organization.
- **Components** — **workspace-global** components, usable across **every project
  and screen in that workspace** (and only that workspace). Think shared
  interface buttons, cards, etc.
- **System Design** — the workspace's brand tokens: colors, fonts, and so on. As
  many as needed, saved at the workspace level.
- **References** — UX/UI reference images and videos, global to the workspace and
  shareable into its projects, screens, and components.

**[PLANNED]** People and permissions — inviting members to a workspace and
managing who can edit what.

### Project **[NOW]**

The space that holds screens. Created by choosing a type — **mobile | tablet |
desktop** — which sets the screen size. A project holds the whole workflow for one
effort: e.g. under the *Apple* workspace, "iOS 19" is one mobile project, "macOS
Sonoma" another. A project can **pull from its workspace**, so it has the same
recurring capabilities:

- **Screens** — the project's screens, generated at the type's size. "Screens" is
  just nomenclature.
- **Components** — **project-global** components. These belong to the **project**,
  not to any one screen. A project component can be linked into a screen, but its
  home is the project. The project view also surfaces **all** components anywhere
  inside it — components in screens, components inside components, everything.
- **References** — references added directly to the project, or pulled from the
  workspace's references or from the unattached global library.
- **System Design** — the project can define its own tokens **and/or link
  individual tokens from the workspace**. A workspace token marked *linkable* can
  be placed into the project as a *linked instance* (a live reference to the
  master token, not a copy); the project chooses which tokens to link, one by one.
  A linked token cannot be edited in the project — to change it you edit the master
  in the workspace, or *detach* it to get an independent local copy.

**[PLANNED]** Richer screen definitions: more than one screen type in one project
(e.g. tablet and mobile together), and pre-defined types that are not locked to a
fixed width×height.

### Screen **[NOW]**

The main frame of the tree, sized by the project type (e.g. mobile `390×844`).
You create components inside it; opening it opens that frame in the canvas and you
are free to build anything **inside that specific frame**. A screen has:

- **Sub-components** — the components inside the screen (the elements that have
  children).
- **References** — references specific to this screen (e.g. a reference of a Home
  screen attached to the Home screen). Imported directly, or pulled from the
  project or workspace references.
- **Versions** — multiple versions of that specific screen (see Versioning).

**[PLANNED]** Choosing which version is the **main**: promote any version to be
the main (the one shown for the screen in the project), and the previously-main
becomes a normal version.

### Component **[NOW]**

A component (formed by the automatic rule above) has, like a screen:

- **Sub-components** — its child components. Individual leaf elements (text, a
  childless div) are not components.
- **References** — direct upload, or pulled from the project or workspace.
- **Versions** — as many versions as needed (see Versioning).

A component's **scope** comes from where it was born: workspace-global,
project-global, screen-level, or nested inside another component. Scope decides
where it can be reused, but it always has exactly one owner/origin.

### System Design **[NOW]**

Brand and design tokens (colors, gradients, typography, icons, spacing, radius,
images). Lives at the **workspace** level and at the **project** level. A token is
**linkable** like a component: a workspace token marked linkable can be placed into
a project as a **linked instance** (a live reference to the master), one token at a
time. A project may also define its own tokens. A linked token is not editable in
place — edit the master in the workspace, or **detach** it into an independent
local copy. (This replaces the older per-category inheritance model; the unit of
sharing is now the individual token.)

### References **[NOW]**

A library of UX/UI reference images and videos. A reference is **linkable** like a
component: a linkable reference can be placed into a project, a screen, and/or a
component as a **linked instance** — the same master reference flowing wherever it
is useful. **Detach** turns a linked reference into an independent local copy owned
by the current location. References can be created globally (unattached), created
on a workspace/project, or imported directly onto a screen/component.

References can also hold **stacks** (see the Builder) — a reference image cut into
a tree of pieces — and you can link (and detach) a stack, or a single piece of a
stack, not just a whole flat image.

### Unattached / loose entities

The containment hierarchy is the **default home**, not a hard requirement at every
level. Entities can exist without a parent above them:

- **Projects without a workspace** — **[NOW]** a project can live on its own,
  outside any workspace.
- **References without any attachment** — **[NOW]** the global library holds
  references attached to nothing.
- **Screens and components without a project (or workspace)** — **[PLANNED]**
  create a standalone screen or component directly, with no project/workspace
  above it.

When an entity is loose, it simply loses the capabilities it would have inherited
from a parent scope (e.g. a project with no workspace has no workspace tokens to
inherit) — but it is otherwise a normal entity.

---

## Linkable, instances, and detach

This is **one mechanism shared by Components, System Design tokens, and
References.** Wherever the product shares something downward, it shares it the same
way: mark it *linkable*, place it as a *linked instance*, *detach* it to own a local
copy. The vocabulary below is written for components, but the same three verbs and
the same ownership guarantees apply to tokens and references.

### Linkable **[NOW]**

**Linkable is a state of an item** — it marks the item as shareable to another
location. Without it, you cannot reuse it elsewhere. The "global" scope of each
capability is linkable by default: workspace/project-global components, workspace
tokens, and workspace/gallery references.

When an item is linkable, it can be **placed into a lower scope** as a **linked
instance** — a *live reference* to the master, not a copy:

- a **component** placed into another screen or component;
- a **system-design token** linked from the workspace into a project;
- a **reference** linked into a project, screen, or component.

A linked instance **cannot be edited in place**. To edit it you go to the **master
at its own home (its main/origin)**. For a component you **open it on its own**,
which takes you into the master's flow with the item focused; for a token you edit
it in the workspace System Design; for a reference you edit the master reference.

**[PLANNED]** A back button on that flow that returns you to exactly where you
were, for a smoother round trip.

**[NOW]** A **Screen cannot be linkable** — it makes no sense yet. (**[PLANNED]**
this may change for a specific future feature.)

### Detach **[NOW]**

**Detach removes the link** and **copies the item into the current location** —
turning a linked instance into a local, fully independent copy owned by the current
screen / version / component / project, no longer connected to the master. This
applies identically to components, tokens, and references.

### Removing a linkable item that is used elsewhere **[NOW]**

When you **unlink** a linkable item (turn off its linkable state) **or delete** it
while it still has linked instances placed elsewhere, the product must not silently
break those other places. It asks, **per instance**, what to do with each link —
either **keep a copy** (detach it into an independent local copy, the default) or
**delete** it there too. The same per-place copy-or-delete choice is offered for all
three capabilities (components, tokens, references). The only difference between
unlink and delete is the fate of the item itself: unlink keeps it (just no longer
shareable); delete removes it after the links are resolved.

---

## Versioning **[NOW]**

You can keep many versions of a screen or of a component. Creating a version always
makes **a copy of the frame**; what differs is how the components inside it relate
to the originals. The user chooses one of two modes:

- **Linked** — the inner components become **linked instances** of the originals,
  placed into the copied frame. Editing a master then reflects in the original and in
  this version. This works the same way for **both screens and components**.
- **Copy** — the version becomes **fully independent**. **[LAW]** The moment a Copy
  version is made, the components inside it become **the version's own components**,
  with **no link to the originals** — they are re-created as new owned components under
  the version. Editing or **deleting** one of them must affect **only this version**
  and **never** the component it was copied from. (A "copy" that still secretly shared
  the original master, so that deleting it deleted the original, is a bug — not the
  model.)

(The principle under all reuse: **ownership and origin are never ambiguous.** You
can always tell whether you are looking at a reference or the real thing, and
where the real thing lives. See `Versioning.md` for the full rules.)

---

## How navigation must feel **[LAW]**

This is the heart of the experience.

### Opening a screen

Opening a screen shows the **complete screen** — the full composition, all its
visible children already in place. The user reads the whole layout and recognizes
the sections from this one preview.

### Opening a component

Clicking a component makes **that component the subject**:

- the main view shows **only that component**, at its real size
- it is **not** shown mixed back into the full screen
- its **children appear adjacent** — beside it, ready to be opened next

### The rhythm

> whole screen → one isolated child → that child's children beside it → repeat

A selected node is always shown **alone**, with its children available nearby for
the next step inward. The user should be able to say:

> "I started at Home, saw the whole screen, clicked Header, saw Header by itself,
> then inspected Logo and Header Copy — and I never lost track of where I was."

If that sentence stays true, navigation is correct.

---

## The canvas windows

There is **no free, infinite main canvas**. You edit by frames. Beside the main
canvas, focused side windows serve specific jobs.

### Main canvas **[NOW] [LAW for the bounds rule]**

The opened frame (screen or component) **is** the editing area.

- You **cannot zoom out below 100% (`1×`)** — at `1×` the frame already fills the
  canvas, so there is nothing further to zoom out to. **[LAW]**
- Zooming *in* may **enlarge the navigable region around the frame** to give you
  editing margin, so you are not forced to edit elements jammed into the corners.
  This extra room is a convenience of zoom-in, not a free canvas.
- Pan and zoom stay **clamped to the opened subject's bounds** (or the larger
  navigable region when applicable).

### Versions canvas **[NOW]**

A window that renders a canvas **for versions** — identical in behavior to the
main canvas, but dedicated to versions so you can put a version **side by side**
and focus on comparing/editing them.

### Free canvas — "Drafts" **[NOW]**

A window beside the main canvas that uses the **same tools** but is intentionally
**free**: no fixed frame, edit anywhere, like a giant sheet. Its purpose is
**freedom to experiment** — try out components and ideas without touching the
real frame, which stays intact; then copy-paste anything good back in.

### References canvas **[NOW]**

A window to **load the references** of the current screen/component and view them
**side by side** while you work. It is canvas-like because a reference can be a
**stack of cuts**: you can select a child cut inside a parent cut. When the
reference is a stack, a **tree** of its cuts is shown alongside.

---

## The Builder

The Builder (routes `/generate`, `/tools`) is a **standalone tool**, connected to
References but **not a direct feature of References**, and **outside** the
screen-first component tree. Do not merge it into the canvas/component model.

### The idea **[NOW]**

Turn a **static UI image** (the kind you find on Dribbble / Behance — usually a
screen sitting inside borders and margins) into a **stack of cuts**:

- Cut out the screen → it becomes the **main (screen)** of the stack.
- Keep cutting buttons, texts, sections → each becomes a cut, **positioned where
  it was cut from**.
- Together the cuts form a **Stack** that reconstructs the original image.

Counting rules:

- **1 image = 1 or more screens.** An uploaded image automatically becomes one
  screen (the tool assumes a clean image); if it actually contains several
  screens side by side, you edit and cut additional screens from it.
- **More than one screen → a group.** Adding more than one image also makes a
  group automatically.

Not every image must become a stack — **stacks are a References feature** (image
stacks). Plain images and videos can simply be normal references.

### Sharing from the Builder **[NOW]**

You can share references into components / screens / projects. You can share **a
whole image**, **a stack (screen)**, or **a piece of a stack** (a cut with its
children). You **cannot share groups** — only images, stacks, or stack pieces.

### Builder windows **[NOW]**

- **Builder (cut)** — where you make the cuts, focused on **one cut at a time**.
- **Stack** — the complete element, with the cuts stacked on top of each other.
- **Gallery** — a gallery showing the cuts of the tree, in order.

### AI tools **[NOW]**

Per-cut image tools: **background remove**, **upscale**, **remove element**, and
more. Editing a cut with an AI tool **saves a new variant while keeping the old
one** — each cut can carry a history, so an edited cut and its original both live
in the tree.

### Builder — planned

- **[PLANNED]** **Video import**: extract frames from a video and turn the frames
  into screens. (Video *as a reference* already exists; frame-extraction does
  not.)
- **[PLANNED]** A **data window** beside the Builder to generate training data and
  sync between the static image and its reconstruction.
- **[PLANNED]** Background-remove quality tools and other image processing to
  improve cut quality.

### Why the Builder exists **[PLANNED direction]**

Beyond producing references, the long-term goal is to **accumulate labeled
image→component data to train UX/UI models** — eventually turning a static UI
image into HTML/CSS automatically. Because of this, the Builder is intentionally
**not hard-wired to References only**; it may feed other features (references
**and** data).

---

## What is explicitly free to change

So there is no doubt — improve any of these whenever it makes the project better:

- the database, storage model, and persistence strategy
- how scenes, snapshots, and thumbnails are computed and propagated
- the rendering approach and any performance optimization
- file and folder structure, module boundaries, naming
- the framework-level and infrastructure choices
- the visual styling details, as long as the behavior above is preserved

None of that is sacred. Make it faster, cleaner, and better organized as often as
you can — just never at the cost of a **[LAW]** above.

---

## The laws, in one list **[LAW]**

For quick reference, the invariants:

1. **The screen is the source of truth** — components are derived from screens,
   not invented in isolation and attached later.
2. **Hierarchy is always preserved** — every node knows its screen, its parent,
   and its children.
3. **One hierarchy feeds everything** — previews, detail views, child lists,
   seed data, and navigation all use the same tree.
4. **A snapshot is the node at its true, intrinsic size** — never a generic ratio,
   never a meaning-changing crop. Visual scale-up for legibility must not rewrite
   dimensions or distort aspect ratio.
5. **Mock/preview content communicates real structure** — believable content, not
   empty grey boxes.
6. **A component is screen-derived, not a detached token** — context beats reuse;
   the same pattern may recur with different content.
7. **Screen and Component are one abstraction** — a Screen is the top-level
   Component; the Screen is always the highest node.
8. **Components form automatically** — any element with a child is a component; a
   childless element is not.
9. **You edit inside a frame, in isolation** — open the subject to edit it; the
   frame is the fixed editing surface; you never edit a component by reaching into
   the whole screen.
10. **No free main canvas; `1×` is the floor** — you cannot zoom out past the
    opened frame.
11. **Ownership and origin are never ambiguous** — linked instance vs owned copy
    is always clear, and you can always reach the master at its home.

---

## Definition of success

The product is right when a new person opens it and, with no explanation,
understands:

- what the full screen looks like
- which major children live inside it
- how to click into one child and see it isolated
- how to see that child at its own true size
- how to keep going one level deeper
- and how every node stays anchored to the screen it came from

…and never once feels the urge to *organize the canvas* before they can create.

If that holds, the idea is intact.
