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

This document describes only what the product **is and must do today**. Features
that are planned but not yet built do not live here — they wait in [`docs/`](./docs),
indexed in [`docs/planned/product-backlog.md`](./docs/planned/product-backlog.md), and are folded
back in as `[NOW]` once they ship.

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

As a direct alternative, the user can **drop an image file onto the canvas frame**
and it becomes an Image element holding that file, with no separate "set `src`"
step. The drop respects the frame-bounds law (the image lands inside the opened
frame). By default the dropped image is resized **proportionally to fit the frame**;
a Canvas setting can turn this off to keep the file's natural size (clipped by the
frame). This is an addition — the mock-placeholder path stays.

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
- **Screens / components without a project — "Drafts"** — **[NOW]** loose screens
  and components, created from Home and saved on their own, with no project or
  workspace above them. They are real, persisted entities (not scratch work); they
  simply have no parent to inherit from. See the Drafts note under "Sketch".
- **References without any attachment** — **[NOW]** the global library holds
  references attached to nothing.

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

**[NOW]** A back button on that flow returns you to exactly where you were, for a
smooth round trip back to the instance after editing the master.

**[NOW]** A **Screen cannot be linkable** — it makes no sense yet.

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

### Promoting a version to be the main **[NOW]**

Any version of a screen or component can be **made the main** — the canonical one the
others descend from. **[LAW]** When this happens, **the components move with the crown:
the main is always the owner, and versions only reference it.** Promotion is never a mere
label swap.

- For a **Copy** version this is trivial — it already owns everything, so it just takes
  the crown.
- For a **Linked** version, the linked child components are **re-homed onto the promoted
  version**, which becomes their real owner; the screen/component that *used* to be the
  main becomes an ordinary version holding **linked instances** that point back at the new
  main. The link is preserved (editing the new main still reflects in the old one), but
  the new main is now a true, editable owner — and **deleting the old version can never
  empty the new main.** A promoted main that still secretly depended on the old one for
  its content would be a bug, by the same law that governs Copy above.

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

### Free canvas — "Sketch" **[NOW]**

A window beside the main canvas that uses the **same tools** but is intentionally
**free**: no fixed frame, edit anywhere, like a giant sheet. Its purpose is
**freedom to experiment** — try out components and ideas without touching the
real frame, which stays intact; then copy-paste anything good back in.

**Scope and persistence rules:**
- The Sketch canvas is **per project** — each project has its own scratch space;
  opening a different project shows a different (or empty) sketch.
- It is **local to the device and to the user** — stored in the browser/app's
  local storage, never written to the database, never shared across machines or
  accounts. When multi-user support arrives, each user will have their own sketch
  per project; until then, the device is the user.
- It is **not a persistent artefact**: there is no history, no versions, no
  sync. The user can clear it at any time with an explicit "Clear sketch" action.
  Nothing in the Sketch canvas is ever promoted automatically — the only path out
  is manual copy-paste into the real frame.
- The Sketch window is **not part of the component hierarchy**. Nothing created
  there gains scope, ownership, or linkability until it is pasted into a screen
  or component. It is a scratchpad, not a secondary canvas.

(Not to be confused with **Drafts** — the loose, project-less screens and
components created from Home. "Sketch" is this free scratch window inside the
canvas; "Drafts" are real saved entities that live outside any workspace/project.)

### References canvas **[NOW]**

A window to **load the references** of the current screen/component and view them
**side by side** while you work. It is canvas-like because a reference can be a
**stack of cuts**: you can select a child cut inside a parent cut. When the
reference is a stack, a **tree** of its cuts is shown alongside.

---

## Fast Edit **[NOW]**

**Fast Edit** is a quick, in-place editor for a subject — a **screen** (or a
component, since they are one abstraction) — opened as a modal straight from its
card or detail view, without entering the full canvas. The name is the promise:
it is for *fast*, surface-level edits, and nothing more.

You **select an element and change only its aesthetic properties** — text
content, text color, background, border (color and width), and corner radius.
That is the entire scope.

**[LAW]** Fast Edit **cannot change structure or geometry.** You cannot move,
resize, rotate, reparent, add, or delete elements — you only select an element
and adjust how it looks. Anything structural or more complex is **the canvas's
job**; Fast Edit deliberately stops at cosmetics so it stays fast and
unambiguous. When you need more, you open the subject in the canvas.

Fast Edit is a **real editor, not a preview**: every change is **applied to the
subject's real scene and persisted** — it edits the same scene the canvas edits,
not a throwaway copy. Within Fast Edit, **linked subcomponents are read-only**:
they show their master content for context but cannot be edited here; to change
one you go to its master, exactly as everywhere else.

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

### Video frames → screens **[NOW]**

You can import a **video**, pick frames from it, and turn those frames into
screens — each extracted frame becomes a screen, grouped together. This is a real
input path, alongside importing static images.

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
