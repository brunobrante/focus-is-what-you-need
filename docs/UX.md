# UI Specification — Focus Is What You Need

## Overview

Desktop application (Tauri + React) for screen-first component exploration and design tooling. The app lets users start from complete screens, inspect their child components, drill into nested components, and manage design tokens — all while preserving the parent-child hierarchy at every level.

---

## Routing & Pages

| Route | Page | Purpose |
|-------|------|---------|
| _(layout)_ | HomeLayout | The Home shell — one header + sidebar + footer, declared once. `/`, `/drafts`, `/references`, `/settings`, `/news`, `/feedback`, and the `*` catch-all nest under it and render through its `<Outlet />` (no chrome is copied per page) |
| `/` | DashboardPage | Home shell index — workspaces, loose projects, recent items |
| `/workspaces` | WorkspacesPage | Home shell — full grid of every workspace; opening a card activates it and jumps to its project browser (`/workspace/:workspaceId/projects`) |
| `/my-projects` | ProjectsPage | Home shell — individual (loose) projects that belong to no workspace. Distinct from `/workspace/:workspaceId/projects` (the workspace browser) |
| `/settings` | SettingsPage | Standalone Settings inside the Home shell; reuses the same body (`AppSettingsContent`) as the global Settings modal |
| `/workspace/:workspaceId/projects` | LandingPage | Project browser for the workspace (nested under WorkspaceLayout) |
| `/new` | NewProjectPage | Multi-step project creation wizard. Links the project to a workspace only when launched with `?workspace=<id>` (from the workspace project browser); from Home it creates a loose, workspace-less project and skips the token-sharing step |
| `/new-draft` | NewDraftPage | Multi-step draft (loose screen/component/icon) creation wizard |
| `/new-workspace` | NewWorkspacePage | Multi-step workspace creation wizard (name → optional description); on finish it makes the workspace active and opens its project browser |
| `/drafts` | DraftsPage | Loose, project-less screens, components and icons (renders inside the Home shell) |
| `/news` | NewsPage | "What's new" changelog inside the Home shell. A blank shell — heading only — until there are releases to list |
| `/feedback` | FeedbackPage | Bug reports and feature requests inside the Home shell. A blank shell — heading only — until the form exists |
| `*` | NotFoundPage | Catch-all inside the Home shell: a "404 — Page not found" empty state naming the attempted path, with a **Back to Dashboard** link. Lowest-priority match, so every real route still wins |
| `/project/:id` | GalleryPage | Project detail with tabbed sections |
| `/project/:id/screen/:id` | DetailPage (ScreenContent) | Screen inspector and editor |
| `/project/:id/c/:id` | DetailPage (ComponentContent) | Component inspector and editor |
| `/canvas` | CanvasPage | Full-screen visual canvas editor |
| `/references` | HomeReferencesPage | Home's reference library — the user's full global library, rendered `embedded` inside the Home shell (no workspace TopBar). Adding here only touches the library, never a workspace |
| `/workspace/:workspaceId/references` | WorkspaceReferencesPage | Only the references explicitly added to that workspace (workspace-level links), inside the workspace TopBar. "Add reference" picks from the library or uploads via the shared modal's Workspace-global mode |
| `/system-design` | SystemDesignPage | Active workspace's design system (tokens shared with its projects) |
| `/components` | GlobalComponentsPage | Workspace-level global components |
| `/generate` | Generate | AI builder and content generation |

---

## Global Search / Command Palette

A single app-wide search surface (VSCode-style) available on every route, owned
by a top-level `SearchProvider` via React Context. It is mounted once and floats
above all pages.

**Opening**:
- `⌘⇧P` (or `Ctrl+Shift+P`) opens it in **command mode** (input prefilled with `>`).
- `⌘K` / `⌘P` (or `Ctrl+K` / `Ctrl+P`) opens it in **default search mode**.
- The canvas top-left **search toggle button** opens it in default search mode.

**Two modes share one input box**:
- **Search mode** (default): finds entities — canvas elements, screens,
  components, references, and projects.
- **Command mode** (input starts with `>`): finds functions and settings
  (navigation commands, canvas tools, etc.). Typing `>` switches modes live;
  deleting it returns to search mode.

**Location-aware prioritization** — results are boosted by the current scope:
- On the **canvas**: the current scene's elements rank first, then the project's
  screens/components, then projects.
- In a **project**: that project's screens, components, and references rank
  first, then projects.
- In the **workspace**: projects rank first.

**Commands** (`>` mode) come from a declarative registry
(`src/domain/search/commandPalette.ts`) plus context-specific commands
contributed at runtime (e.g. canvas tool selection while editing). Navigation
commands jump to Workspace, Canvas, References, System Design, Components,
Builder, and New Project.

**Interaction**: `↑`/`↓` navigate, `↵` runs the highlighted item and closes the
palette, `Esc` or a backdrop click dismisses it. Each result shows an icon and a
kind badge (Element, Screen, Component, Reference, Project, Command).

## Save status indicator

A quiet, app-wide indicator (`SaveStatusIndicator`, mounted once in `App`) that
stays hidden while saves are healthy. If the save queue exhausts its retries it
shows a small pill in the bottom-right — "Changes aren't saving — retrying…" —
so the user isn't left editing in the belief their work is persisted. The queue
keeps retrying in the background and the pill clears itself once a save succeeds.

---

## Pages

### 0. Home shell (`HomeLayout`) + Dashboard `/`

The Home area is a **persistent shell** (`HomeLayout`) that owns the chrome once
and renders each Home-area page through a React Router `<Outlet />`. The shell's
header + sidebar stay mounted while the content swaps between **Dashboard** (`/`),
**Drafts** (`/drafts`), **Local References** (`/references`), and **Settings**
(`/settings`) — none of those pages re-declares the header or sidebar. The
Dashboard is the index: a shallow hub over the workspace, **not** the project
browser (that is the Landing Page at `/workspace/:workspaceId/projects`).

**Shell layout** (`HomeLayout`):
- A **single header** (`HomeHeader`), deliberately separate from the workspace
  TopBar — product mark on the left (links to `/`) and a primary **Create**
  dropdown on the right. No workspace switcher (workspace selection happens via
  the Dashboard cards). The Create menu lists, each with an icon: **New
  workspace** (→ the `/new-workspace` wizard), **New project** (→ the `/new`
  wizard), and **New draft** (→ the `/new-draft` wizard).
- A left **sidebar** beside the `<Outlet />` content column
- A single page footer with the version string
- The global `AppSettingsModal` stays mounted here too (still openable from the
  workspace TopBar avatar menu); the sidebar's **Settings** now routes to the
  `/settings` page rather than opening the modal.

**Sidebar** (`HomeSidebar`, hidden below `md`): a vertical list of `NavLink`s
that highlight the active route — **Dashboard** (→ `/`), **Workspaces** (→
`/workspaces`), **Projects** (→ `/my-projects`), **Drafts** (→ `/drafts`),
**Local References** (→ `/references`), **Learn** (placeholder), and, below a
divider, **Builder** (→ `/generate`) and **Settings** (→ `/settings`). Learn is
an inert placeholder ("Coming soon") until its feature exists; the others reach
real destinations. Each row is a 36px icon+label row that highlights on hover and
when active. The sidebar is a scrolling column: when the viewport is too short
for the nav plus the promo card below, it scrolls rather than compressing them.

**Sidebar promo card** (`SidebarPromoCard`, `components/home/`): pinned to the
bottom of the sidebar, below the nav. A bordered card with a decorative header —
concentric dashed orbits behind a row of app tiles, the Focus mark centred and
its neighbours fading off both edges — over the title "Focus desktop app", a
one-line description, and two CTAs: **Download** (primary) and **Docs** (ghost,
with a chevron). Both targets are inert placeholders until a public site exists.
A **—** button in the card's top-right dismisses it **for the session only**;
nothing is persisted, so it returns on the next launch. Beneath the card sit two
low-weight links, **What's new** (→ `/news`) and **Feedback** (→ `/feedback`).

The card is **web-only**: it advertises the desktop build, so it would be dead
weight inside it. `HomeLayout` gates it behind `<DevWrapper platform="web">`,
which also owns the `mt-auto` that pins the slot to the bottom (so the slot holds
its position once the card is dismissed). On desktop it renders with the dev
outline in development and disappears entirely in production.

**Dashboard content** (`DashboardPage`, the `/` index): heading "Dashboard" plus
the three sections below. The **Workspaces** and **Projects** pages reuse the
same cards as full-page grids (`WorkspaceTile` / `ProjectCard` from
`HomeCards`).

**Workspaces section**: a grid of light `WorkspaceTile` cards — avatar initial,
name, an **Active** badge on the current workspace, and a project count. A card
is deliberately minimal (the project-focused detail lives in the browser); click
sets that workspace active and navigates to `/workspace/:workspaceId/projects`. Empty copy when none.

**My Projects section**: a card grid of **loose projects** — projects that
belong to no workspace, created from Home. They live only here (never in a
workspace's project browser). Same card as Recent plus a dashed **New project**
add tile (`DashedAddTile` → `/new`, which creates another loose project).

**Recent Items section**: a card grid of the active workspace's projects sorted
by last-updated (capped at 8), each a `ProjectCard` — a thumbnail (type badge
top-left + thumbnail or grid glyph) above name and "{N} screens · updated
{relative}". When a project belongs to a workspace, the thumbnail also carries a
top-right **workspace chip** (grid icon + workspace name, tooltip "In workspace:
{name}") so it reads at a glance as workspace-owned vs. loose. A dashed **New
project** add tile (`DashedAddTile` → `/new`) closes the grid.

---

### 1. Landing Page `/workspace/:workspaceId/projects`

Main project hub.

**Layout**:
- Global TopBar at the top (see Components section)
- Page title "Your projects" with total project count
- Search bar with clear button
- Segmented filter control: All / Desktop / Tablet / Mobile
- "New project" button in the top-right corner
- Responsive grid of project cards
- Page footer with version string

**ProjectCard**:
- Thumbnail showing device frame previews (2 screens for desktop, 3 for tablet, 4 for mobile)
- Project name
- Screen count
- Relative last-updated timestamp (e.g. "3 days ago")
- On hover: `···` button revealing a MoreMenu with options: Edit / Export / Delete

**AddProjectCard**:
- Same size as a regular card
- Dashed border
- Centered `+` icon and "New project" label
- Clicking opens the new project flow

**EmptyState** (no projects exist):
- Centered icon
- Title and description text
- CTA button "Create project"

---

### 2. New Project Page `/new`

Wizard for creating a project. It has **3 or 4 steps**: the design-token sharing
step appears only when the target workspace has a design system with tokens.

**Progress bar** at the top showing current step out of the total.

**Step — Project type**:
- Three TypeCards side by side: Desktop / Tablet / Mobile
- Each card shows a device mockup illustration, type label, dimensions (e.g. `1440 × 900`), and a radio button
- Selected state: highlighted border and background

**Step — Project name**:
- Badge showing the chosen type
- Text input with placeholder
- Info pill below the input

**Step — Share design tokens** (only when a workspace design with tokens exists):
- A checkbox for the global setting "Share workspace tokens with new projects by
  default" (persists immediately, and resets the selection below)
- "{N} tokens shared" count with **Select all** / **Clear all**
- A scrollable list grouped by category (Colors, Gradients, Typography, Icons,
  Spacing, Radius, Images), each with a category select-all checkbox and a
  per-token checkbox + mini preview. The selection seeds which workspace tokens the
  new project starts with; the rest are excluded (re-addable later in the System tab).

**Step — Advanced settings**:
- Drag-and-drop image upload area with dashed border, upload icon, and label "Drag & drop or click"
- Image preview when a file is loaded
- Remove image button

**Footer** (all steps):
- "Back" button on the left
- "Next" / "Create" button on the right, disabled when required fields are empty
- "Save and skip" on the final step

---

### 2a. New Draft Page `/new-draft`

Wizard for creating a **draft** — a loose screen, component, or icon that lives
outside any workspace or project (see the Drafts page below). Mirrors the New
Project wizard's layout (progress bar, centered step, Back/Next footer) with
**3 steps**:

**Step — Kind**: three cards, **Screen** (a top-level frame at a device size),
**Component** (a free-size frame), and **Icon** (a small square artboard for
vector art). The choice reroutes the middle step.

**Step — Device** (Screen only): three device cards (Desktop / Tablet / Mobile),
identical to the project type step; the chosen device fixes the screen's size.

**Step — Size** (Component or Icon): Width × Height number inputs (px) for the
frame. Defaults to `720 × 360` for a component, `24 × 24` for an icon.

**Step — Name**: a badge showing the chosen kind, then a name input.

On **Create**, the draft is persisted as a loose component and the app navigates
straight to the global canvas at `/canvas?variant=<activeVariantId>&type=<device>`
— drafts have no project, so they open by variant alone (the same path global
components use). Close (`×`) returns to `/drafts`.

---

### 2b. New Workspace Page `/new-workspace`

Wizard for creating a **workspace**, mirroring the New Project/Draft layout
(progress bar, centered step, Back/Next footer) with **2 steps**:

**Step — Name**: the workspace name (required).

**Step — Description**: an optional free-text note about the workspace; can be
skipped.

On **Create workspace**, the workspace is persisted, made the active workspace,
and the app opens its (initially empty) project browser at `/workspace/:workspaceId/projects`. Close
(`×`) returns to Home (`/`). Reached from Home's **Create → New workspace**.

---

### 2b. Drafts Page `/drafts`

The home of loose, project-less drafts — reached from the Home sidebar's
**Drafts** link. Renders **inside the Home shell** (`HomeLayout` supplies the
header + sidebar), so the page itself is only the content column.

- Content header: "Drafts" title with a count ("N drafts") on the left and a
  **New draft** button (→ `/new-draft`) on the right.
- A responsive card grid. Screen/component drafts render as `DraftCard`s and icon
  drafts as `IconDraftCard`s — each shows a `Snapshot` of the draft's scene, its
  name, and a meta line (**Screen · {Device}**, **Component**, or **Icon**) with a
  matching glyph. Clicking a card (or its "Open in canvas" menu) opens the global
  canvas; the card menu also offers **Delete draft**, which asks for confirmation
  before removing the draft (screen/component and icon drafts alike). A trailing
  `DashedAddTile` ("New draft") closes the grid.
- Empty state when there are no drafts of any kind.

Screen and component drafts are `ComponentRow`s with every scope owner null (no
workspace, project, screen, or parent variant), tagged with `draftKind` ("screen"
| "component") and a `draftType` device. An **icon draft is a loose `IconRow`**
(its own entity, never a component) with no owner edge — so it, too, never appears
in any component view. A draft icon is just a small icon master edited on the
normal canvas; it is not (yet) a system-design token — pulling a draft icon into a
System Design is a separate, later flow. (Not to be confused with the canvas
**Sketch** window — the free scratch surface inside the editor.)

---

### 3. Gallery Page `/project/:id`

Shows all screens, components, and references inside a project.

**Header**:
- Breadcrumb: Projects > ProjectName. The root crumb is **workspace-aware**: a
  project in a workspace backs out to `Projects` (`/workspace/:workspaceId/projects`); a **loose** project
  (no workspace) backs out to `Home` (`/`) instead, so it never dead-ends in a
  workspace it never belonged to. The same rule drives the screen/component detail
  breadcrumbs (via `useProjectBackTarget`) and the New Project wizard's close.
- Counts: `Screens (N)` | `Components (N)` | `References (N)`
- "Edit project" button

**ProjectOverview section**:
- Project thumbnail on the left
- Right side: editable project name, counts, Preview button, Edit button

**ProjectEditPanel** (Edit mode): clicking **Edit** opens a full-page editor in
place of the ProjectOverview and tab bar — it fills everything below the breadcrumb
header (no routing, just a swapped-in component). It has a sticky action bar (Close
× · "Edit project" · Cancel / Save changes) and a scrollable, centered body with two
stacked sections:
- **Details** — icon picker + thumbnail upload on the left; project name,
  description, preview-screen selector, and read-only platform info on the right.
  Saved by the action bar's **Save changes** button.
- **Element defaults** — the project-scope canvas element defaults editor (same
  `ElementDefaultsEditor` as the global Settings modal). Values inherit from the
  workspace (or Global when there is no workspace); toggling an element to **Custom**
  overrides it for this project only. Changes here persist immediately, independent
  of the Save button.

Closing (Close ×, Cancel, or saving) returns to the ProjectOverview + tabs.

**Tab bar**: Screens | Components | References | System

**Screens / Components / References tabs each contain**:
- "Add" button in the top-right corner
- Search bar
- Kind/type filter dropdown
- Responsive card grid
- EmptyState when no items

**System tab**: the project's design system editor — workspace-shared tokens and
the project's own tokens shown together — see section 8a.

**ScreenMock** (card):
- Screen snapshot preview
- Screen name
- Dimensions label
- On hover: CardMenu with Open / Canvas / Delete

**ComponentMock** (card):
- Component snapshot preview
- Component name + kind badge
- **Source icon** pinned to the preview's upper-right corner, indicating the
  component's owner scope: a **screen** icon (screen-owned), a **folder** icon
  (project-global), a **grid** icon (workspace-global), or a **diamond** icon
  (nested). Hovering it opens a small menu listing where the component lives —
  the owner row tagged **Main**, plus any linked screens (clickable to open the
  screen). (The old "Global"/"em {screen}" text line beneath the name is gone.)
- On hover: CardMenu with actions
- The **Source** filter (in the filter dropdown) narrows the grid by owner scope
  (All / Workspace / Project / Screen), alongside the Type / Screen / Section filters.

**References tab card** (`ReferenceProjectCard`):
- 4:3 image preview only (no caption beneath); on hover, an **open** (eye) button
  appears top-left and the `···` remove menu top-right
- The open button launches `ReferencesModal` — the same lightbox used by the
  screen/component detail References tab — opened at that card's position, with
  prev/next navigation across the filtered references

**Modals triggered from this page**:
- `NewScreenModal` — form with name field and template selector
- `NewComponentModal` — form with name field, optional **Size (W×H)** inputs, and kind selector. When both width and height are filled, the component is seeded with a blank frame at exactly that size; left blank, it uses the project-type default size.
- `ProjectPreviewModal` — full-screen preview of project screens
- `AddReferenceModal` — searchable stack tree for attaching existing library references, plus an **Upload** action that saves brand-new files to the root library and auto-links them to the current target in one gesture. The attach target follows the context: project/screen/component in a project, or a single **Workspace (global)** target on the workspace references page
- `ReferencesModal` — lightbox preview of a project reference (opened from a card)
- `ConfirmActionModal` — confirmation dialog with Cancel / Delete buttons. Works both imperatively (via `ref.open(...)`) and as a controlled component (via `open` + `onConfirm` props).

---

### 4. Screen Detail Page `/project/:id/screen/:id`

Two-column layout for inspecting and editing a screen.

**Left column (≈40%) — Preview**:
- PreviewShell container (see Components section)
- Device mockup wrapping the screen snapshot
- Floating buttons: Open in Canvas, FastEdit. Both **follow the selected version**: when
  a version is previewed (via the version switcher), **Open in Canvas** opens that variant
  (`?screen=…&versionVariant=…`, the Versions window) and **FastEdit** edits that variant's
  scene. In FastEdit a version's **linked** subcomponents are resolved for display but
  **read-only** — selecting one shows a purple "Linked component — read-only" banner and
  disables the property controls (edit the master at its origin instead). On the main both
  buttons target the screen itself.

**Right column (≈60%) — Inspector**:
- Editable screen title with edit icon
- Metadata row: dimensions, template, last updated
- Action buttons: History (clock icon) | Info (pencil icon) | badge showing component count
- **Version switcher** (`VersionSwitcher`, above the tab bar — always visible): a
  segmented row of version chips (Main · V1 · V2 …) with a trailing dashed "+" to add a
  version, and a right-aligned action cluster (Compare · Open in canvas · Make main ·
  Delete) that operates on the **selected** version. Selecting a chip is **preview-only**:
  it drives
  the left preview pane **and** the **Sub Components** grid below — switching versions
  repopulates the subcomponents live (the master/linked children of that variant), so the
  selection is no longer buried next to the cards it changes. It does **not** persist the
  screen's active variant — a single click never changes the screen's main or what the
  projects gallery shows. Main's chip is green; version chips are purple (matching the
  version badge). "Open in canvas" routes the **main** to Current (`?screen=`) and a
  **version** to the Versions window; "Make main" and "Delete" are disabled on the main.
  - **Make main** (star icon) promotes the selected version to be the canonical main, after
    a confirm. A linked version re-homes its child masters onto the promoted version and
    demotes the old main to a linked version of it; a copy version is a plain swap. See
    `Versioning.md` §7c.
  - **Hover preview**: resting the mouse on a **version** chip (never the main) for ~600ms
    reveals a floating card — pinned below the chip via a portal so the chips' scroll
    container can't clip it — showing that version's screen snapshot plus its tag and the
    screen title. Moving off the chip dismisses it. Mirrors the canvas prev/next preview
    tooltips.
  - **Creating a version** ("+") does **not** promote the new version to the screen's
    main/active variant. The freshly created version is only previewed; the screen's main
    and the projects gallery stay unchanged. Promoting a version to main will be a
    separate, explicit action (not yet implemented).
  - **Compare** opens the `CompareVersionsModal`, which renders the versions' **real
    stored snapshots** (`Snapshot`, not template mocks) in two modes, toggled in its
    toolbar:
    - **Grid** — up to **4** panels (you don't render 10 at once); layout is **Columns**
      (one row), **Rows** (one column), or **Grid** (2-column wrap → 2×2 for four, beside
      AND below). Each panel has a version select, open-in-canvas, remove, and a
      green/purple tag badge. A **"+ Add window"** toolbar button **and** the in-grid
      dashed card both open the same **picker dropdown** of the not-yet-shown versions so
      you choose exactly what to add (disabled at 4 / when none are left).
    - **Slider** — a before/after comparison: pick **A** and **B**, then drag the divider
      (pointer-captured) to scrub one version over the other; corner chips label each side.
    - **Open in canvas** opens a version correctly: a panel's button (or the header's, for
      the primary) routes the **main** to `?screen=` and a **version** to
      `?screen=…&versionVariant=…` (the Versions window).
- **Tab bar**: Sub Components | References (the former Versions tab is replaced by the
  top switcher)
  - Each tab: search bar + kind filter + "New" button + card grid
  - `ComponentSideCard`: snapshot, name, kind, CardMenu. The grid shows the **selected
    version's** subcomponents (the screen's own children for the main).
  - **References tab**: a card grid (shared `ReferenceThumbCard`) of references
    attached to this screen/component. A reference can be either a whole library
    image **or** a single cropped component from an image's stack — a stack-node
    card renders just that crop and is titled with the node name. Cards open a
    lightbox; hover reveals a remove action. "New" opens `AddReferenceModal`.
  - EmptyState per tab
- **InlineInfoPanel** (expands below the header when Info is clicked):
  - Template dropdown
  - Device type dropdown
  - ID field (read-only)
  - Save / Cancel buttons

**Screen navigation**:
- Left and right arrows with tooltip showing the adjacent screen name
- Disabled at the first and last screen
- **Hidden while previewing a version**: when a non-main version is shown in the
  preview pane (via a Versions-tab card click), the prev/next screen arrows are
  removed — a previewed version is not a screen you step between. Selecting the
  main version (or none) restores them.

---

### 5. Component Detail Page `/project/:id/c/:id`

The screen detail and component detail pages render through **one shared view**
(`detail/DetailView.tsx`): same frame, header, preview pane, version switcher, tabs,
search/filter row, and References tab. Each subject feeds that view through its own
data hook (`useScreenDetail` / `useComponentDetail`); only the genuinely per-subject
pieces differ (breadcrumb trail data, preview primitive, meta line, info panel, and the
modal set). The breadcrumb itself renders through one shared `detail/DetailBreadcrumb.tsx`
(back chevron + ancestor trail + current label + type badge); each view only supplies its
back target and trail segments. The Sub Components grid uses the same `ComponentSideCard`
in both views (Canvas / Fast edit / More » Make linkable·Unlink · Delete; linked instances
get the purple component-link badge), so the cards never diverge. "Move to" and "Make
global" only appear when a handler is wired — currently neither view wires them, so the
items are hidden rather than shown as no-ops.

Differences from Screen Detail:

- **Full breadcrumb**: Projects > Project > Screen > Component (with the ancestor trail). The
  leading back chevron targets the component's immediate parent — the deepest trail ancestor,
  else the source screen, else the project root (the screen's chevron returns to the project).
- **Preview** shows the active variant snapshot (or the previewed version), zoomed proportionally to the component's intrinsic size; no device frame
- **Inspector** differences:
  - Component name (editable)
  - Metadata: kind, variant count, sub-component count
  - InfoPanel fields: description textarea, kind dropdown, category input
- **Versioning uses the same model as the screen** — a **version switcher above the
  tab bar** (not a Versions tab), with the right-aligned **Compare / Open in canvas /
  Make main / Delete** cluster and a **"+"** to create a version. The tab bar is therefore just
  **Sub Components | References**. Selecting a version is **preview-only**: it shows
  that variant in the preview pane and repopulates the Sub Components grid, but never
  persists it as the component's active/main variant and never changes what the
  projects gallery shows. **Creating a version** also stays preview-only: the new
  version is shown in the preview pane but is not promoted to the main/active variant.

---

### 6. Canvas Page `/canvas`

Full-screen visual editor with floating UI layers.

**Center**: Canvas rendering area with a grid background pattern. When the **top nav
is hidden** (only the Current window enabled) the canvas reaches up to the top margin
and the header/preview chrome floats over it; once the nav is shown (a feature window
enabled) it descends below that top row so the nav never covers a pane's top.

**Right-click (canvas context menu)**: Copy / Paste / Duplicate · ordering (Bring to
Front/Forward, Send Backward/Back — works on a **multi-selection** too: the selected
elements keep their relative order and reorder within their own sibling lists) ·
**Align / Distribute** (shown only for a
multi-selection: Align left / horizontal centers / right / top / vertical centers /
bottom, aligning the selected elements to their shared bounding box; Distribute
horizontally / vertically appears with 3+ elements and equalizes the gaps between
them, keeping the two extremes fixed) · **Ungroup** (shown for a single container
with children — reparents its children to the grandparent, preserving each child's
absolute position/rotation, and removes the container; `⌘⇧G`) · Lock/Hide · Delete ·
**Hide this window** (only
while split, on **any** pane including the primary Current — drops that pane from the
split; with two or more panes left the split keeps going, otherwise it collapses to a
single window) · **Open / Close panels**
(toggles both side panels — Layers + Inspector — together; with them closed the
header chip and Preview launcher collapse to their compact forms) · and a final
**Hide UI** toggle (Figma-style). **Hide UI** collapses **all** floating chrome — the
top-left header chip, the top-center canvas tabs/nav, the Layers sidebar (and its
toggle), the Preview launcher, the Inspector (and its toggle), and the bottom toolbar
— and **forces the canvas to its expanded (full-bleed) state** while hidden, leaving a
bare canvas. The menu remains reachable on right-click, where the item reads **Show
UI** to restore the chrome (panels return to their prior open/closed state, and the
canvas returns to its prior expand state).

Windows without an editable canvas — the **References** window and the **empty
Versions** state — still get a right-click menu (even with no content), but only the
window/UI group: **Hide this window** (when split) · **Open / Close panels** · **Hide
UI**. The editing actions (Copy/Paste/ordering/Delete) are omitted there.

**Paste target**: pasted elements land back into their **original parent container**
when that container still exists in the target document (offset +24px, clamped inside
it, cascading on repeat) — matching Figma. Pasting into a different document/pane
(where the original parent is absent, e.g. Sketch → Current) falls back to the frame
root.

**Clipboard scope**: all canvas panes (Current, Sketch, Versions, extra Current
windows) share **one** element clipboard — copy in Sketch, paste in Current works,
whether the panes are split side-by-side or reached by switching tabs (the buffer
survives tab switches). Ids are regenerated on paste, so cross-pane paste can never
collide with the source pane's elements. Keyboard shortcuts (copy/paste, undo/redo,
zoom, tools, delete…) are handled by the **active pane only** — clicking a pane makes
it active (blue border); an inactive split pane ignores them.

**Arrow-key nudge**: with elements selected, the arrow keys move the selection by 1px
in the canvas axes; **Shift+arrow** moves by 10px. Amounts are settings-backed
(`canvas.nudge.small` / `.large`) and the keys are rebindable
(`canvas.nudge.up/down/left/right`). A rapid burst of nudges coalesces into a single
undo step, and the moved elements stay clamped inside their frame.

**Alt-drag duplicates (G12):** holding the duplicate modifier (Alt by default;
rebindable as `canvas.drag.duplicate`) when a body drag starts moving clones the
selection in place — the originals stay put and the clones follow the cursor,
named "… copy" and selected. The whole gesture is **one undo step** (undo removes
the clones), and **Esc** mid-drag cancels the duplicate entirely. On resize/rotate
handles Alt keeps its transform meaning (resize-from-center); the duplicate
modifier only applies to body drags.

**Click on a multi-selection collapses it (G12):** clicking (without dragging) an
element that is already part of a multi-selection collapses the selection to that
element on mouseup — dragging still moves the whole selection, and a
modifier-click (add/remove from selection) is unaffected. Matches Figma.

**Hold-to-measure distances** (`canvas.overlay.parentDistances`, Ctrl by default):
with the modifier held, a **single selection** shows its four labelled distances to
its parent's content box. **Hovering another (non-selected) element while holding
the modifier measures selection ↔ hovered instead (G12)**: disjoint elements get a
labelled gap line per separated axis (drawn through the middle of their shared
band), and when one contains the other the four inset distances are shown — so any
element can be measured against any other, not just its parent. Works with a
multi-selection (measured from the selection's union bounds).

**Lines & arrows are two-point elements (G12):** drawing a line/arrow follows the
cursor at any angle (the element is a thin box whose rotation is baked from the
drag). Once placed, its two **end handles edit the endpoints**: dragging one end
pins the opposite endpoint and re-derives the length *and* angle from the cursor
(not an axis-locked resize), with **Shift snapping the angle to 15° steps**. The
thickness (height) is untouched by endpoint drags. Arrowhead markers remain
deferred to the SVG render-target work (F3/G13).

**Select all / Cut / Zoom to selection** (rebindable, G12):
- **⌘A** (`canvas.selection.selectAll`) selects every sibling at the current level —
  the frame roots, or the isolated container's children when isolation is active —
  skipping locked and hidden elements (the same exclusions as the marquee).
- **⌘X** (`canvas.clipboard.cut`) copies the selection to the shared clipboard and
  deletes it, as one undo step.
- **⇧2** (`canvas.viewport.zoomToSelection`, matched by physical key so it works on
  any layout) frames the selection: the camera zooms and centers on the union bounds
  of the selected elements, using the same proportional-zoom rule as the layers-tree
  focus button. No-op with nothing selected.

**Top-left**:
- A compact chip: back button · the current subject's name (component / screen /
  project, truncated) · the project-type badge · search toggle (opens the
  [global search / command palette](#global-search--command-palette)). No full
  breadcrumb trail.
- It **tracks the Layers (left) sidebar**: with Layers open the chip matches the
  sidebar's current width (default 300px, resizable) so it lines up above the panel;
  when Layers is **closed** it hugs its content.
- When the canvas has risen to the top (only Current enabled) **and** Layers is closed,
  the chip **drops to the bottom-left corner, beside the "Layers" reopen toggle**, so
  the top stays clear. The Preview launcher does the same on the right (drops beside the
  "Inspector" reopen toggle when the Inspector is closed).

**Top-center**:
- Canvas tabs: Current | Sketch | References (Versions when enabled)
- The whole nav is **hidden when only Current is enabled** (no feature window, no extra
  Current) — there is nothing to switch between. Windows are still enabled from the
  Inspector's always-present **Layout** tab (see Right panel); enabling a feature window
  there brings the nav back.
- The focused window's tab is highlighted. While **split**, every window that is
  currently a pane on the canvas is also marked — the non-focused live panes show a
  small accent dot under their tab and brighter text, so you can see at a glance which
  windows are open versus merely available.
- Split mode selector: None | Vertical | Grid (icon buttons)
- The Current tab always renders the opened screen/component itself; a screen
  **version** is never rendered in Current — it opens in the Versions window.
- **Preview is not a nav tab and not a Features toggle** — it is launched from the
  Preview button above the Inspector (see below). It still appears as a selectable /
  addable pane in the split ("Panels") menu once it is open.
- In the **Panels** menu every pane has a dropdown to swap which window it shows and a
  **×** to remove it — **including the primary Current** (current is no longer forced
  into a split). Only **extra Currents** (`current-2`, …) keep a locked dropdown, since
  they can't be re-typed to a feature window; they are still removable. Removing a pane
  keeps the split alive while ≥2 panes remain, otherwise it collapses to one window.
- **Resizable panes**: split panes are no longer fixed to an equal share — an 8px
  drag strip sits between adjacent panes. **Vertical** split → drag the vertical
  dividers to re-proportion the columns; **Horizontal** → drag the horizontal
  dividers between the stacked rows; **Grid** (2×2 for four panes, full-width bottom
  cell for three) is a row/column mesh — drag the divider **between the two rows**
  to re-proportion vertically and the divider **within a row** to re-proportion its
  columns. Each pane has a 15% minimum. Built on shadcn's `resizable`
  (`react-resizable-panels`). Sizes are session-only — switching layout or
  adding/removing a pane resets panes to an equal split.

**Multiple Current windows**:
- While split, the **Panels** menu offers **Add Current** — it adds another Current
  pane (up to the 4-pane cap) that **mirrors the primary Current's subject** and turns
  on the split if it was off.
- Each extra Current appears in the nav tab bar as **Current +1**, **Current +2**, …
  next to the primary **Current**. Hovering a Current tab shows a small popover —
  *"In this window"* — naming the screen/component currently loaded there.
- Selecting a Current tab (or clicking its pane) **focuses** that window: the layers
  tree, inspector, and shortcuts all reflect it, exactly like switching to any other
  window.
- An extra Current is **independently navigable**: when it is the focused window, the
  layers-tree header's subject picker re-points **that** Current at any screen/component
  (the primary Current is unaffected). Each Current keeps its own viewport (pan/zoom).
- Extra Currents are **session-only** — they are removed via the **×** on their pane in
  the Panels menu, and they do not persist across a reload (the canvas reopens with a
  single Current from the URL). Two Currents may point at the same subject; edits are
  last-writer-wins on that scene.

**Preview window** (a special, view-only window):
- Launched by the **Preview button** (play icon) in the bar above the Inspector,
  not from the canvas tabs or the Features menu.
- Clicking play opens it **side-by-side with Current** (auto vertical split from a
  single canvas; added as a pane when already split). It renders a **live,
  read-only** view of the current screen — non-interactive (no selection/drag) and
  never the active/focused canvas, so there is no need to navigate to or focus it.
- The window has **floating top-right controls**: an **X** to close the preview
  (collapses back to a single Current canvas when it was the only extra pane) and an
  **open-in-new-window** button (present but inert for now).
- Settings live in a **dropdown** next to the play button (Figma-style):
  - **Size**: Fit (scale to the window) or Actual size (1×, scrollable on overflow).
  - **Device frame**: wrap the screen in a device mockup. For **mobile** projects
    this is a realistic phone (`DeviceMockup` from `src/canvas/devices`) and a
    **device picker** appears below the toggle — presets grouped by platform
    (iPhone / Android), each with its resolution; the chosen model's bezel, corner
    radius, camera cutout (notch / Dynamic Island / punch-hole), side buttons, and
    home indicator/button are drawn around the live screen. For **tablet** projects
    it is a simple bezel and for **desktop** it is browser chrome.
  - **Background**: Dark, Light, or Scene (the document's shell background).
- It respects the split/grid like the other windows (selectable in the Panels menu
  and laid out under None/Vertical/Horizontal/Quadrants).

**References window** (a canvas window, like Current/Sketch):
- Shows references attached to the subject currently open in the canvas (a
  component takes precedence over its screen) as a gallery of `ReferenceThumbCard`s.
- Clicking a card enlarges that reference **inline within the canvas window**
  (not a modal) — a **Back** control returns to the gallery and a trash control
  removes it. Card hover also reveals remove.
- **Link model (linked)**: a reference attached here is a **link** to the library
  master — projects/screens/components point at the root library entry (the master
  and its blob are shared by id, so there is no storage duplication). This reuses
  the same linkable engine as components/tokens. In-place there is **no detach
  control** and **no purple "linked" indicator** (detach exists in the data layer
  but is not surfaced as a per-subject control). Removing a reference here only
  drops the link for this subject; the master stays in the library. **Deleting the
  master** from the `/references` library, when it is linked elsewhere, opens the
  **same per-place keep-a-copy-or-delete dialog** as components and tokens
  (`UnlinkComponentModal`): each place may **keep a copy** (the link is detached
  into an independent local copy — the default) or **delete** the link there.
  Keeping any copy preserves the underlying blob on disk so those copies still
  render; deleting everywhere also removes the blob. An unlinked reference is
  removed straight away with no dialog. This satisfies the `Product.md` law
  "Removing a linkable item that is used elsewhere" for all three linkable
  capabilities.
- **Stack references** (a whole stacked image **or** a sub-screen root) open as an
  **interactive composite**, mirroring the Builder Stack tab: the background image
  with its cuts overlaid. Hovering a cut outlines it; clicking selects it; clicking
  the background selects the **parent** screen/root. The **stack tree** lives in the
  **Layers sidebar** (not inside the window) — see the Layers-tree header note below;
  selecting a node there selects+scopes that cut in the references canvas, and
  selecting a cut on the canvas highlights it in the sidebar (one shared selection,
  via the `ReferencesBridge`). The selected node's **preview, name, type, and size**
  show in the **Inspector's Element tab** (`ReferencesElementTab`) — see the Inspector
  note below; there is **no floating card on the canvas**. A reference pinned to a
  single leaf cut, and a plain image with no stack, render as a flat image.
- **Zoom**: every enlarged reference is zoom/pannable (shared step-zoom — wheel +
  drag, edge-to-center over-scroll). The **zoom control sits in the top-left**.
- The window's **Add** button opens the standard `AddReferenceModal`, scoped to
  the current subject, so new references appear here and in the side References tab.
- Empty state prompts to add the first reference.

**Versions window** (a canvas window, like Current/Sketch) — always available:
- A persistent, functional clone of the Current canvas surface — a real, editable
  stage — **decoupled from Current**. It is never created on open; it is part of the
  canvas. It seeds its subject from whatever Current is editing, but the user can then
  point it at **any** screen or component in the project.
- The subject and version are chosen from the **layers-tree header**, which — while the
  Versions window is focused — shows **two stacked selects** (see Left panel): a
  **Screen** select (the full project tree of screens + components, current subject
  highlighted) and a **Version** select (that subject's **real versions only** — `V1`,
  `V2`…, never the main). There is **no in-canvas selector**. Picking a version
  renders+edits that variant here; the Current window is unaffected. Edits in the
  Versions window save to that variant's scene.
- Defaults to the first version (`V1`) of the seeded subject. Switching the subject
  re-defaults the version to that subject's first.
- **Open in canvas** for a selected version (the switcher's open-canvas action, screen
  or component detail) goes to the **main** subject's canvas in Current and focuses the
  Versions window on the chosen variant (URL carries `versionVariant=<variantId>`
  alongside the main `screen=`/`variant=`). The version is therefore never rendered in
  Current.
- **The main is not a version.** The switcher also lists the subject's **main** (the
  original). Opening *it* in canvas goes straight to the subject in **Current** —
  a screen opens via `screen=<id>`, a component via `variant=<mainVariantId>` — with **no**
  `versionVariant` and **no** Versions window. Only `V1+` selections route through the
  Versions window.
- When the selected subject has no real versions (only its main) the Version select
  shows "No versions" and the window shows a "No versions yet" empty state.

**Layers-tree header (Versions window)**: when the focused window is Versions, the
header is a two-select block instead of the single subject row:
- **Screen** select — opens the project-tree picker (screens + components, the current
  subject highlighted); choosing a node re-points the Versions window at that subject.
- **Version** select — shows the selected version's tag (`V1`) + the version's intrinsic
  size, and opens the list of the chosen subject's real versions. The list ends with a
  **New version** action (below the list, or in place of it when there are none) that
  opens the Linked/Copy modal and creates a version of the **selected** subject.
- An **Edit** button (next to the Version select) toggles the Versions stage active; it
  is disabled when the subject has no version to edit.
- A **Link to Current** icon button (next to the Screen select) re-points the Versions
  window at whatever element is open in the **Current** window, so it follows along to
  that element's versions. Because the window is otherwise decoupled, switching Current
  to a child component does **not** auto-update the Versions subject — this button is how
  you re-sync. Disabled when the subject already matches Current.
- The **back footer** ("Voltar para …") in the Versions window operates **within** the
  Versions window: it pops the window's **drill-in history** — returning to the exact
  screen+version (or parent component) you opened the current subject from — rather than
  navigating the Current window. Drilling into a component inside the Versions window (e.g.
  opening a detached copy) pushes the previous subject+version onto that history; the footer
  shows while there is somewhere to go back to (history entry or structural parent), and the
  **Screen** select header shows the **current** drilled-in subject's name. Manually picking a
  subject from the Screen select is a fresh navigation and clears the history.
- **Open in canvas in the Versions window opens a version-owned copy — in the Versions window.**
  A versioned screen is a normal screen, so a nested component row (a node with children that is
  **not** a linked instance — i.e. detached/own content) shows the standard **"open in canvas"**
  icon. Clicking it materializes that node into a new component **owned by the selected version's
  variant** — independent of the master and of every other version (canonical location
  `project/screen/version/component`) — collapses the version's node into a **linked instance** of
  that copy (so the version reflects edits to it), then re-points the **Versions** window's subject
  at the new copy and shows its own scene. It stays on the **Versions** tab — the copy belongs to
  the version, so it is edited there, the same way the Current window opens one of its own
  components. (The Versions window can therefore show a **component** subject's own main variant,
  not only screen versions.) Linked-instance rows instead keep their **"go to master"** link, which
  navigates to the master's own canonical location (shown in **Current**, its origin) regardless of
  where the instance is placed; they are never materialized.

**Layers-tree header (Sketch window)**: the Sketch is a per-project freeform draft with no
single subject, so when it is the focused window the layers panel shows **no subject row** —
the `CurrentSceneTreeRow`/Versions header is suppressed in draft mode. The panel is just the
"Not saved to the database — local to this device" notice followed by the sketch's own layers
(and the clear-sketch trash control in the panel header). It never borrows the Current
screen/component's name or size.

**Layers sidebar (References window)**: the Layers panel is a **host** that renders the right
tree per focused window — for References it shows the open reference's **stack tree** (its
cuts/recortes) instead of a canvas-layer tree, and **suppresses the subject row** (References
has no single screen/component subject, so it never borrows the Current name/size). The body
is the `StackTreePanel`: a "N components" count line then the cut hierarchy; selecting a node
selects+scopes that cut in the references canvas (and vice-versa) through the shared
`ReferencesBridge`. The layer search/filter footer is hidden (it is canvas-layer specific).
On the references **gallery** (no reference open) the panel shows a "Select a reference to see
its layers" hint.

**Binding a color to a System Design token (Appearance / Typography)**: the Fill, Border, and
text Color controls (`InsColor`) each carry a **link button**. Clicking it lists the project's
System Design **color tokens**; picking one **binds** that style to the token (stored as a
`$$ref`, e.g. `colors:c-primary`). A bound control shows the token's swatch + name with a
purple link badge and is read-only, plus an **unlink** button that reverts it to a literal
colour. A bound colour resolves **live**: editing the workspace master token (or detaching it
into a local copy — see System Design) updates every bound element automatically. Choosing a
literal colour from the picker also unbinds. (Live updates while a canvas stays open rely on
the same scenes-table reactivity as linked instances.)

**Inspector → Transform** (shown for every element, the **first** element section — merges the
former **Position** + **Tamanho** blocks): an **Align row** at the top (the six align buttons —
for a single element they align it **within its parent's content box**, or the frame for a root
element; G1), then a compact transform grid in the Framer style —
**X │ Y** on one row, **W │ H** on the next with a trailing **aspect-ratio lock** (session-only;
when on, editing one dimension scales the other by the node's current ratio), then **Rotation**.
Fields carry an in-field glyph (X / Y / W / H / ⟲) instead of an outside label. Secondary metadata
— **Abs X / Abs Y** and the type's **Min/Max W/H** limits — lives behind an inline **More**
disclosure, collapsed by default. **Text** elements also get **Fixed / Fit** width and height
mode toggles (a Fit axis shows a read-only size instead of an input).

**Text auto-resize defaults (G4):** a **click-created** text element starts in
**auto-width** — Fit on both axes, hugging its content and growing while you type
(the box re-fits on every content, font, or typography change). A **drag-drawn**
text box keeps the **width you drew** and hugs its content vertically (Fixed W +
Fit H), matching Figma. Either behavior can be changed per axis with the
Fixed/Fit toggles above; a Fit axis shows a read-only size and ignores
resize-handle drags until switched back to Fixed.

**Inspector → multi-selection (G8):** selecting **2+ elements** shows a compact batch panel
instead of the single-element tabs: an **Align row** (the six align buttons, aligning to the
selection's shared bounds; the two distribute buttons appear with 3+ elements — G1),
**X / Y / W / H** fields (showing the common value, or an
empty field with a **Mixed** placeholder when the elements differ; committing applies to every
editable selected element), an **Opacity %** field (same Mixed convention), and — when any
selected element takes a fill — a **Fill** color swatch that batch-applies a **solid** fill to
all of them (per-type: glyph color on text, background on boxes; the row label reads
"Fill · Mixed" while colors differ). Linked instances (and their descendants) and locked
elements are skipped by batch writes. The **Boolean** ops block (Union / Subtract / Intersect /
Exclude) stays below the batch panel.

**Inspector → Fill** (shown for every fillable element — hidden for **line / arrow** which have
no interior, and for **path / svg** which fill through the Vector section): a stacked **Fill**
list (Figma's model) above Appearance. Each fill is a card with an **eye** enable toggle, a
**type dropdown** (**Solid / Gradient / Image**, plus **Video** on the Image element),
**move up / down** reorder, **remove**, and shared **Opacity** + **Blend mode** controls.
`fills[0]` is the top layer. The CSS/SVG is **type-aware** (hidden from the user) and differs
per element kind — the same fill compiles to a `background-image` layer on a box, a
`background-clip: text` paint on text, and an `<img>` / `<video>` / repeating background on the
Image element:
- **Gradient fills can be edited on canvas (G11):** the gradient card has an **"Edit on
  canvas"** toggle. While on (and the element is the single selection), the canvas draws the
  **gradient axis** across the element — rotation-aware — with a **round handle per stop** and
  **endpoint handles**: drag a stop ball to move that stop (the panel's % field follows), drag
  an endpoint to re-angle the gradient (**Shift** snaps to 15°; linear/conic only — radial shows
  its stops along a radius), and **double-click the axis** to insert a stop there (seeded with
  the nearest stop's color). Each drag is one undo step. The overlay turns off with the toggle,
  or automatically when the selection changes.
- **Solid** — a colour via the Fill color field, whose text input accepts any CSS literal
  (`#RRGGBBAA`, `rgb()`, **Display P3** `color(display-p3 …)`, **OKLCH** `oklch(…)`), whose
  swatch opens the [shared color picker](#color-picker), and which can **bind to a System Design
  color token** (link/unlink) like before.
- **Gradient** — **linear / radial / conic**, angle, an editable **stop list** (colour +
  position, add/remove), and an **interpolation** space (**sRGB (Average)** default, **OKLAB**,
  **OKLCH**, **Nearest hue**). A gradient can **bind to a System Design gradient token**.
- **Image** — a URL and a **fit** mode: **Fill** (cover) / **Fit** (contain) / **Crop** /
  **Tile**. Tile swaps the render target to a repeating background (an `<img>` can never tile);
  an exact **tile gap** renders an inline SVG `<pattern>`. Plus **position**, **scale**, and
  **image adjustments** (Exposure / Contrast / Saturation via CSS `filter`; Temperature / Tint /
  Highlights / Shadows via an inline SVG filter chain).
- **Video** (Image element only) — a `<video autoplay loop muted playsinline>` behind content.

Inserting an Image still defaults to **Fill (cover)**; new gradients default to **sRGB**. A
single plain solid (or a single plain image on the Image element) is stored as the simple
`background` / `src` it always was — `fills` only materializes once a fill becomes non-trivial
(gradient/image/video, a second fill, a per-fill blend/opacity), and the renderer composites
from it then. *Stacked-image per-layer opacity is best-effort (CSS has no per-layer image
opacity); image-token binding and `path` SVG paint-servers are deferred.*

**Inspector → Appearance** (shown for every element type): opacity, blend, group blending,
and corner radius — a **type-aware** panel over the unified HTML/SVG render (paper.design's
CSS-honesty with Figma's per-type behavior). Controls:
- **Opacity** — a **slider + numeric input** (paper-style fast control), `opacity` 0–100%.
  The element now renders at its real opacity on the main canvas too (a text element stays
  fully opaque only while it is being edited).
- **Blend** — `mix-blend-mode` (how the element composites with what is behind it): Normal,
  Darken/Multiply/Color burn, Lighten/Screen/Color dodge, Overlay/Soft light/Hard light,
  Difference/Exclusion, Hue/Saturation/Color/Luminosity, and Plus lighter. *"Plus darker" is
  deliberately omitted — it is non-standard/WebKit-only and mathematically unstable.*
- **Blending** (only on a **div with children** — our group/frame, no separate entity):
  **Pass through** (`isolation: auto`, children blend through to the backdrop) vs **Normal**
  (`isolation: isolate`, inner blends composite only among siblings).
- **Radius** — type-aware. On a **box** (rect / image / div) it is CSS `border-radius`: a
  **slider + numeric input**, a **Full** button (pill — sets the radius to half the shorter
  side), and a **per-corner** toggle (the corner icon) that reveals **Top L / Top R / Bot R /
  Bot L** inputs (`border-*-radius` longhands), plus a **Token** select binding the radius to a
  System Design **radius token** (G14 — live like color refs; any manual radius edit, including
  the canvas radius-ball drag, unbinds). On a **star** it is the inner-radius **%**
  (slider + input). Ellipses are always round; clip-path shapes (polygon / star / arrow) carry
  the radius as path geometry, not CSS. *Corner smoothing (squircle) and vector vertex-rounding
  are deferred — both need the renderer's HTML↔SVG target switch (see inspector-appearance.md).*

The CSS conversions are handled in `compileAppearance`.

**Inspector → Border / Stroke** (below Appearance): a **type-aware** panel whose header and
controls follow the selected element — paper.design's CSS-honest, per-type naming, with one
real CSS property behind each name:
- **Box** (rect / wrapper / image / a div with children) → a **Border** section: **Width**,
  **Color** (binds to a System Design color token like Fill), **Opacity %** (composes into the
  color as an `#RRGGBBAA` alpha; shown while the color is a plain hex literal and no token is
  bound — D3), **Style** (**solid / dashed / dotted / double**), and **Align** (**Inside** =
  CSS `border`; **Center** = the same outline pulled inward by half its width, so the stroke
  straddles the edge with no layout shift; **Outside** = CSS `outline` hugging the edge — both
  keep dashes and follow the corner radius). A **sides button** beside Width switches to
  **per-side widths** (Top / Right / Bottom / Left) — the bottom-only divider, the tab
  underline. Turning it off restores the uniform width. While per-side is on the **Align**
  control is hidden: only the CSS `border` family has per-side widths, so a per-side border
  is always drawn Inside. *A separate Outline-offset control is still deferred.*
- **Text** → an **Underline** section (on/off switch, then **Style** solid/double/dotted/
  dashed/wavy, **Color**, **Thickness**, **Offset** → the `text-decoration-*` family) and a
  **Text stroke** section (**Width**, **Color** + **Opacity %** (same `#RRGGBBAA` composition
  as the box border), and a **Fill** toggle **Above / Below** = `paint-order`, mapping to
  `-webkit-text-stroke`; visible width is ~half the set value on WebKit). Underline and
  text-stroke colors bind to tokens.
- **Vector** (path / svg) → a **Stroke** section: **Color** (token-bindable), **Width**,
  **Opacity**, **Align** (Inside / Center / Outside), **Cap** (butt/round/square), **Join**
  (miter/round/bevel), and **Dash** (e.g. `4 2`), painted directly on the `<path>`. **Align
  only appears on a closed path** — Inside and Outside are defined against an interior, so an
  open path always strokes centered.
- **Clip-path shapes** (polygon / star / arrow) use the **Box** Border section above, but the
  border is painted as an SVG stroke tracing the shape's real outline rather than as a CSS
  border (which a clip-path would cut away). All three alignments work; **Style** maps to a
  dash pattern, and **double** falls back to solid (a single stroke can't draw it). Per-side
  widths are not offered: one outline has no sides.

**Inspector → Effects** (shown for every element type): a single unified **Effects** list
(Figma's model) below Appearance. It starts empty with a one-line hint and an **Add effect**
button; each added entry is a card with an **eye** enable/disable toggle, a **type dropdown**,
**move up / move down** reorder, and a **remove** button. Order is load-bearing — filters chain
left-to-right and shadows stack first-on-top. Effect types: **Drop shadow**, **Inner shadow**,
**Layer blur**, **Background blur**, and the color filters **Brightness / Contrast / Saturation
/ Grayscale / Invert / Sepia / Hue rotate**. The CSS mechanism is **type-aware** (hidden from
the user): a drop shadow compiles to `box-shadow` on a box, `filter: drop-shadow()` on an
image/SVG/path, and `text-shadow` on text; background blur emits both the prefixed and
unprefixed `backdrop-filter` for WebKit. **Inner shadow** and the **Spread** field appear only
for box elements (the only first-class inner shadow); they are hidden on image/SVG/text.
Shadow **Color** is an `InsColor` control, so it can bind to a System Design color token
(link/unlink) like Fill. *Not in v1: Noise, Texture, Glass.*

**Inspector → Layout** (shown for every element type; replaces the old inline Display/Justify/
Align/Gap/Padding block): the paper-style panel that folds Figma's **Layout + Position** into
one and authors the **layout engine** fields. It is **type-adaptive**: a **div with children**
(a "frame") gets the container controls — **Display** (Block / Flex / Grid), **Direction** (Row /
Column), a **9-point alignment pad** (a visual 3×3 — the engine maps it to `justify-content` /
`align-items` and flips the mapping for a column), **Distribute** (Packed / Between / Around —
Between is the "auto gap"), **Stretch**, **Gap** plus optional per-axis **Row gap / Col gap**
overrides (empty = the uniform gap; D6) and a **Gap token** select (binds to a System Design
**spacing token**, G14; Padding gets a matching **Pad token** select while uniform — manual
edits unbind), **Wrap** (when wrapped, a **Rows align**
`align-content` select: start / center / end / stretch / space-between), a **Baseline** switch
(row flow only — `align-items: baseline`), individual **Padding** (a `4` toggle
splits the uniform value into Top/Right/Bottom/Left), a minimal **Columns/Rows** track editor for
Grid (Fill `fr` / Auto / Min / Fixed `px`), and the advanced **Strokes** (Excluded / Included)
and **Stacking** (Last / First on top). A child **inside a grid parent** additionally gets
**Justify self** (auto / start / center / end / stretch) and **Col span / Row span** track spans
(empty = 1 cell; D6). An element **inside a flex/grid parent** also gets **W/H
mode** (Fixed / Hug / Fill), **Align self**, and **Order**. **Min/Max W/H** are
authorable on **every element, per axis independently** (e.g. a min-height on a Hug
container) — not just flex/grid children (D4). Every element gets
**Flip H / Flip V**; **absolute/free children only** (an element with a parent that is NOT a
flex/grid container — D5) get the **Pin X / Pin Y** constraint dropdowns (Left / Right /
Left-Right / Center / Scale). (Text auto-resize lives in the **Transform** section as
per-axis Fixed/Fit toggles — see above.) **Mostly authoring-only for now:** these controls write
real CSS-bound fields compiled by `domain/canvas/layout.ts`, but the flex/grid engine has **no
on-canvas effect yet** — absolute positioning stays the default and the renderer adopts the
engine in a later pass. **Exception — Pin X / Pin Y are live (G5):** when a container, or the
frame itself, is **resized** (canvas handles, element resize handles, or the Inspector W/H
fields), its absolute children reflow by their pins — Left/Top keeps the near inset (default),
Right/Bottom keeps the far inset, Left-Right/Top-Bottom stretches the child, Center keeps the
child's relative center, and Scale scales position and size proportionally. Stretched or scaled
children cascade the reflow into their own pinned children; children of flex/grid containers are
excluded (the layout engine owns them). The Scale **tool** is unchanged (it always scales
everything proportionally).
(X/Y/W/H and rotation remain live in the separate **Transform** section — see above.)

**Inspector → Typography** (shown only for **text** elements, replacing the old "Tipografia"
section): a **Style token** select at the top (binds the element to a System Design
**typography token** — G14: binding writes the token's family/weight/size as concrete
fallbacks plus a live `typeStyleRef`; the render follows the master token, and any manual
Font/Size/Weight edit unbinds), then **Font** (a real font picker — see below), **Size** (px),
**Weight** (a select listing only the weights the chosen family ships, named Thin…Black), **Style**
(Normal / Italic), **Color** (an `InsColor` that can bind to a System Design color token like
Fill), **Line** (Auto / Custom — Auto is `line-height: normal`, Custom reveals a unitless
multiplier field), **Spacing** (letter-spacing in **%**, compiled to `em` so it survives a
size change — Figma's 1% = 0.01em), **Align** (left / center / right / **justify**), **V-align**
(Top / Middle / Bottom — a flex column on the text box; inert when **H = Fit** hugs the
content, with an inline note saying so), **Case** (As typed / UPPERCASE / lowercase /
Capitalize → `text-transform`), **Strike** (a switch — strikethrough; **underline** stays in
the Border panel and the two decorations coexist), and **Tight box** (a switch — `text-box-trim`
for cap/baseline-tight bounds matching the design tool; opt-in, Safari 18.2+, silently no-ops
on older WebKit). The CSS conversions are handled in `compileTypography`.

**The font picker (G3)** is shared by the Typography section and the canvas context toolbar's
**Text style** popover, so both surfaces always offer the same families. It is a grouped
dropdown (type-to-search comes from the native `<select>`):

- **Standard** — the five stacks that ship with the app: Inter, Geist, System, Serif, Mono.
- **Installed** — every font family installed on the machine, sorted by name. Enumerated once
  per app run from the native side (`list_system_fonts`), because WKWebView has no
  `queryLocalFonts`; the web build tries `queryLocalFonts` and silently keeps only the
  Standard group when the permission is denied. Until the list arrives (a moment after the
  panel first opens) only **Standard** is shown.
- **Current** — a first group that appears only when the element's stored font matches no
  entry (a font that was uninstalled, or an old hand-typed value), so switching families is
  never a silent data loss.

Picking a family **snaps the weight** to the closest one that family actually ships (choosing a
Regular-only face from a Bold selection lands on Regular), and the chosen face is fetched
before the next measurement so auto-fit text boxes and the editing caret never size against a
fallback font.

**Styled text runs (G10)** — a single text element can carry mixed styling, so
"Already have an account? **Sign in**" is one element rather than the old
multi-element hack. While editing a text element (double-click to enter), **select a
range of characters and the Typography section retargets to that selection**: Font,
Weight, Style (italic), Color, Spacing and Strike apply to the selected characters
only; every other control (Size, Line, Align, V-align, Case, Tight box) still applies
to the whole element, since those set the line box. The panel shows a one-line note
while a selection is active, and any control whose value differs across the selection
reads blank until you set it. Collapse the selection (a plain caret) and the panel goes
back to editing the whole element. Font **size** is deliberately element-level — runs
never change the line height. Uniform paragraphs store no run data at all; a run's plain
text always equals the element's `content`, so caret math, wrapping, auto-fit, HTML
export and `.figx` all keep working, and a scene whose runs drift out of sync with its
text loads as uniform (styling is lost, text never is). See `domain/canvas/textRuns.ts`.

**Inspector → Export** (shown for every element type, collapsed by default — the **last**
element section): per-element export of the selected node to image / vector / code, distinct
from the project-level `.figx` file (which is export-only and lives in the Landing page menu).
A list of **export entries** (add via **Add export**, remove via the trash icon — at least one
always remains); each entry picks a **Format** (PNG / JPEG / WebP / SVG / HTML), and raster
formats also get a **Scale** — a free numeric field (0.1×–10×) plus the quick presets
0.5× / 1× / 2× / 3× (D7) — and an optional filename **Suffix**
(defaults to `@Nx` for non-1× scales). When any raster entry is present a **Background** toggle
appears (**None** = transparent / **Color** / **Flatten**, with a color swatch for the latter
two; JPEG is always flattened since it has no alpha). When any HTML entry is present an **HTML**
toggle appears (**Single file** = one self-contained `.html` with embedded styles, or
**Bundle** = `index.html` + `styles.css`). The **Export** button (accent-blue, full-width) runs every
entry, then opens a native **"Save As…"** dialog — one file when a single plain file is produced,
or a `.zip` when several entries (or an HTML bundle) are. A status line below reports the result
(`Exported N files.` / `Export cancelled.` / failure). **How it's produced (webview-complete):**
PNG/JPEG/WebP are rasterized from the element's authored SVG onto a 2D canvas at true-size × scale
(a clean supersample — no `foreignObject`, which WebKit mis-renders); SVG reuses the canvas's
own `svgForHtmlCanvasDocument`; HTML is authored from the element's style objects via the same
`compile*` functions the renderer uses (`lib/canvas/export/*`), so the CSS matches what's drawn.
Bytes are written by the Rust `save_export_file` / `save_export_archive` commands. *Deferred to a
native pass (macOS WKWebView): high-fidelity raster of full HTML/CSS (backdrop-filter, complex
gradients) via `takeSnapshot`, vector **PDF** via `createPDF`, **AVIF**, and the **device mock**
— see `docs/inspector-export.md`.*

**Read-only linked instances (Versions window)**: when the Versions window is focused and
the selected element is a **linked instance** (a node referencing a master component), the
Inspector's Element tab still shows every section (Transform, Layout, Appearance, …)
but they are **locked** — fields are dimmed and non-interactive. A purple link banner at the
top reads "Instância linkada — somente leitura. Faça detach para editar." followed by an
inline **"Ou clique aqui"** link that opens the **master component** the instance points to
(navigates to that variant's canvas in the Current window, same as the layers-tree
"go to instance" action). Section headers can still be expanded/collapsed so the values
remain inspectable; only editing is blocked. This mirrors the versioning rule that instances
are read-only (edit the master, or detach first).

**Read-only linked instances (canvas selection)**: elements inside a linked instance stay
**individually selectable** (single-click, drill-in, marquee — exactly like normal nodes),
but they are **read-only**. Their selection outline renders in **purple** (the instance
colour) instead of the usual blue, and they get **no transform handles and cannot be
dragged or resized** — only the instance **root** can be moved/resized/detached as a whole
(Versioning.md §3.2). Selecting any instance descendant also locks the Inspector (same purple
banner + "Ou clique aqui" link to open the master), so editing is blocked from every surface.
To edit the contents, open the master or detach the instance first. Holding **Option**
over a selected linked instance summons the canvas quick toolbar with its **Flex layout**
tool replaced by a purple **Detach instance** action (unlink icon) — clicking it detaches
the instance in place (same effect as the layers-tree unlink button).

**Left panel** (collapsible, resizable):
- **Width is adjustable** by dragging the panel's inner (right) edge — default
  **300px**, clamped **240–480px**. Width is session-only (resets on reload); the
  canvas inset and the top-left chip track it live.
- Layers / tree panel
- Hierarchical list of nodes, each with: type icon, node name
- Per-item controls: visibility toggle (eye icon), lock toggle (padlock icon), drag handle for reordering
- Indentation reflects nesting depth
- **Drag-and-drop reorder + reparent**: dragging a row shows a drop indicator based
  on where the pointer sits within the hovered row:
  - top third → an insertion line **before** the hovered row (reorder as sibling)
  - bottom third → an insertion line **after** the hovered row (reorder as sibling)
  - middle third → a highlight ring on the hovered row, nesting the dragged node
    **inside** it as a child
  Dropping inside another node reparents it (its on-canvas position is preserved).
  Because "component" vs "element" is derived purely from whether a node has
  children, nesting a node into a childless element turns that element into a
  component, and emptying a component's last child turns it back into an element.
  Dropping a node into itself or one of its own descendants is rejected.
- **Footer** (filter bar, above the back-to-parent row):
  - **Search input** — filters layers by name. While any filter is active the tree
    collapses into a **flat list** of every matching node (depth-first order), with
    the parent/child hierarchy discarded — each match is a standalone leaf row.
  - **Expand button** — a single button that cycles three states: expand the whole
    tree → expand to the first hierarchy level (parent → direct children only) →
    close the tree. Tooltip/icon reflect the next action.
  - **Filter button** — opens a small floating menu (upward) with type chips
    (Componente, Div, Texto, Imagem, Ícone, Forma); selecting chips filters the
    tree by node type and shows a count badge on the button.
  - **Active-filter tags** — above the controls, each active filter (the search
    text and every selected type) shows as a removable chip with an `×`.
  - While a filter is active, reordering (drag) is disabled and an empty state
    ("Nenhuma camada encontrada") shows when nothing matches.

**Right panel** (collapsible, resizable):
- **Width is adjustable** by dragging the panel's inner (left) edge — default
  **280px**, clamped **240–420px**. Width is session-only (resets on reload); the
  canvas inset tracks it live.
- **Preview launcher bar** sits above the Inspector (a play button + settings
  dropdown); the Inspector is shortened to make room. See the Preview window
  section above. It **tracks the Inspector**: with the Inspector open it is a full
  280px bar ("Preview"); when the Inspector is **closed** it collapses to an
  icon-only pill (play glyph + caret) so it does not float as a lonely wide bar.
- Inspector panel
- Tabs: Element | Frame | Shell | **Layout**. The Layout tab is always present and
  holds the **Windows** toggles (enable Versions / Sketch / References) — the same
  controls the nav's "…" Features menu offers. It's the only way to enable a window
  while the top nav is hidden (only Current), and it stays available once the nav is
  back too.
- Properties editor: X / Y position, W / H size, rotation, opacity
- Visibility toggles: device, back, zoom, expand
- When nothing is selected: canvas-level properties (background, grid settings)
- **Shell controls are per window type, not global** (`shellControls.ts`): Current,
  Sketch, Versions, and References each keep their own device/back/zoom/expand
  visibility. The Shell tab edits the **focused** window's controls (`shellWindowTypeOf`
  of the active tab); each surface reads its own type's config, and the floating expand
  button reflects the focused window's `expand` setting. Extra Currents share the
  "current" bucket. (Session state; not persisted.)
- **References window**: when the focused window is References the Inspector follows
  it (via `activeCanvasTab`) and shows **Element | Shell** (Frame is hidden). **Element**
  (`ReferencesElementTab`) renders the selected stack node's **preview, name, type, and
  W×H** from the shared `ReferencesBridge` (empty states: "no reference open" / "no layer
  selected"). **Shell** (`ReferencesShellTab`) shows only the **Zoom** and **Expand**
  visibility toggles — References's own per-window controls (no BG/Device/Back/Shapes,
  which don't apply to references).
- **References zoom + expand parity**: the references stage zoom honours
  `shellZoomVisibility` (show/hover/hidden) and only appears when a reference is open.
  Like the canvas windows, when the References window is **expanded** its bottom-left zoom
  hides and the **bottom-center toolbar** drives the zoom instead — the references stage
  publishes its step-zoom to the `ReferencesBridge`, and the toolbar reads it (in place of
  the editor zoom) while References is the focused window. The expand button is the shared
  one; expand toggling and References's own expand visibility work the same as for the
  canvas windows.

**Toolbar** (floating, bottom-center):
- Rounded container with shadow
- Tool groups separated by dividers:
  - Selection tool
  - Text tool
  - Shapes (rectangle, ellipse, etc.) with a dropdown for variants
  - Drawing tools
  - Stroke tool with dropdown
  - Fill tool with dropdown
  - Effects with dropdown
- Divider
- Actions menu button (expands a panel upward)
- Divider
- Zoom controls: `−` | percentage display | `+`
- Back-to-parent control (visible when editing inside a component)

**Toolbar notice** (transient confirmation pill, centered just above the toolbar):
- A small pill with a check icon and a short message appears for ~1.8s, then fades out, to confirm an action whose canvas result is otherwise invisible.
- It currently fires when a **wrapper** is added — both ways of creating one: choosing the Wrapper tool with a selection (which wraps the selection) and drawing a wrapper on an empty area. Because a wrapper has no fill or border, the message ("Wrapper added") is the user's confirmation that the tool worked.

**Canvas zoom & pan model:**
- Minimum zoom is `1x` (100%); maximum is `256x` for screens/components (`2560x` in the freeform sketch canvas). Zoom in/out via the toolbar `±`, `Cmd`+`=` / `Cmd`+`-`, `Cmd`+`0` to reset, or `Cmd`+wheel (rebindable as `canvas.viewport.wheelZoom`). A trackpad pinch always zooms — WebKit reports it as a `Ctrl`+wheel, so that path stays hardwired regardless of the binding. The wheel zooms toward the **cursor**; the toolbar/percentage/keyboard zoom (which have no cursor to pivot on) anchor on the **viewport center**, so the view grows from the middle instead of the canvas top-left corner.
- Panning and zooming clamp to the **navigable region**: by default the edited subject, but when the screen simulator is on it grows to include the whole device frame (see below).
- **At 100% (minimum zoom) the region is always centered — there is no scroll slack**, whether it fits or overflows. Zooming back out to 100% therefore always re-centers the subject/device. The freeform sketch canvas is the exception: it has no meaningful center, so it is **not** force-centered at minimum zoom (doing so would push the user's content, which sits in a tiny corner of the huge canvas, off-screen); its offset stays anchored to wherever you panned/zoomed.
- **Once zoomed in past 100%** (the region overflowing) panning gains over-scroll: the camera can travel until **any edge of the region reaches the viewport center** (≈ half the scaled region in each direction). Panning stops there — the region can never be pushed entirely past center into one half. Pan via space-drag or two-finger/wheel scroll.
- On window resize (or when the overlay/alignment changes) the camera re-centers on the **navigable region's center**.
- **Blurry while zooming, crisp on settle:** while a wheel/pinch zoom is streaming, the scene is scaled as a whole by the compositor rather than re-laid-out at the new zoom, so text and borders can look soft mid-gesture. ~140 ms after the last zoom event the scene re-renders at the zoom's true resolution and everything snaps crisp. This is the Figma-class trade — re-projecting every element per wheel event is what makes zoom stutter on large scenes. A very deep zoom (where the scaled frame exceeds the browser's safe layer size) stays crisp throughout.
- This same **edge-to-center over-scroll** is shared by the Builder stage and the snapshot viewers (Preview, FastEdit, the reference inspector): once the content is zoomed past 100% (or otherwise larger than its stage) it can be **dragged to pan** — or panned with plain wheel/two-finger scroll — until any edge reaches the viewport center, and never past it; when it fits the stage it snaps centered. In the viewers a click still selects the node under the cursor; only a drag past a small threshold pans.
- **Scroll indicators:** every zoom surface (the canvas, the Builder stage, and the snapshot viewers) shows thin, discrete scroll thumbs — bottom edge for horizontal, right edge for vertical, no track background — that appear **only on an axis where the content overflows its viewport** (i.e. once zoomed in). They are non-interactive position indicators that track the pan in real time and disappear when the content fits. The freeform sketch canvas, being effectively infinite, can't measure a fixed stage that way, so its indicators are computed from the drawn elements' **bounding box** projected through the current transform (the Figma/Penpot model): the track is that content box and the thumb is the viewport within it, so the thumb length is **proportional to the window** — `viewport / content` (a 600px window over 1000px of content gives a 60% thumb) — and shrinks as you zoom in. Like the frame canvases it is **hidden whenever the content fits the window** (e.g. at minimum zoom) and appears only once the content overflows the viewport.

**Parent-frames overlay** (bottom-left of the canvas; the phone/monitor button appears only when editing a component that has resolvable ancestors):
- The toggle button draws **all ancestor frames** of the edited component — its parent component, that parent's parent, … up to the screen — behind it as a translucent **visual guide, like a grid**. Each frame is sized to that ancestor's own frame and placed at its **real relative position** (the offset where the component actually lives inside it), so the component still renders 1:1 inside the stack. The navigable region expands to enclose every visible frame, so the whole stack can be scrolled into view; enabling it reframes/centers on that region. There is no alignment menu — frames always sit at their true positions.
- The overlay is **session-only** (resets on reload / when a new subject opens) and never written to the document.
- It is configured in the Inspector → **Shell** tab → **"Elementos pai"** section, which has a master **Ativar** switch (mirrors the canvas button) and, when editing a component, lists every ancestor frame (name + Screen/Componente tag) with:
  - **Herdar cor** — when on (default) the frame uses the parent's **background color value only** (the parent's own alpha is ignored; a transparent parent falls back to a faint near-white). When off, a color picker sets a custom color.
  - **Opacidade** — a per-frame slider (0–100%). This is always user-set, never inherited — it just makes the guide readable. A frame at 0% is not drawn; if **every** frame is at 0% the overlay master switch turns off automatically.
  - **Radius** — when on (default) the frame keeps the parent's corner radius; when off it is square. The border is never inherited or drawn.
- When editing a screen (no ancestors) the section shows an empty state and the canvas button is hidden.

**Selection chrome culls by on-screen size (Figma-style):**
- The selection handles are hidden when the selected element is too small **on screen**, leaving progressively less chrome until only the outline remains. Because this canvas never zooms below 100% — at which point the frame already fills the viewport — an element's on-screen size reflects **how small it is relative to its parent frame**, and it grows as you zoom in, so the handles fade out on small/nested elements and **reappear as you zoom in**.
- Two tiers, gated on the element's smaller on-screen side:
  - **Corner-radius balls** drop out first (below ~40 px on screen) — by then they would overlap and smother the element.
  - The **square resize/rotation handles** survive longer and drop only once the element is so small (below ~12 px on screen) that the handles would blanket it. Below this the element still shows its **selection outline** and can be moved, but to resize/rotate it you zoom in (or use the Inspector size fields).
- The thresholds are screen-pixel constants (`RADIUS_MIN_ELEMENT_SCREEN`, `RESIZE_HANDLE_MIN_ELEMENT_SCREEN` in `canvasToolingRenderer.ts`); hit-testing follows the same gating, so a hidden handle is also not grabbable.

**Corner radius handle:**
- When a single radius-capable element is hovered (or while its handle is being dragged), a small circle appears inset from each corner; hovering it shows a custom "bend" cursor.
- Dragging a handle sets a uniform corner radius for all four corners, clamped to half the shorter side. At the maximum the two handles on the short edge meet and the drag locks there.
- **Alt-drag rounds only the grabbed corner** (Figma behavior; rebindable as the
  `canvas.radius.perCorner` modifier). The other corners keep their values (seeded
  from the uniform radius the first time), and each ball then sits at its own
  corner's offset. The modifier is read live, so pressing/releasing Alt mid-drag
  switches between single-corner and all-corners. If a per-corner drag brings all
  four corners back to the same value, the element collapses back to a uniform
  radius (matching the Inspector's per-corner toggle convention). A plain
  (no-modifier) drag on an element with mixed corners resets all four to the
  dragged value.
- On a merged (maxed) handle the first drag direction commits the corner: the drag can be pulled back to the lock but cannot cross it into the opposite corner. (With per-corner radii the handles no longer stack, so the grabbed ball is always unambiguous.)
- While dragging, a value tag showing the dragged corner's current radius is rendered just beside the dragged handle.

**Escape cancels an in-progress transform:**
- Pressing **Esc** while actively dragging, resizing, rotating, or dragging a corner-radius handle **aborts** the gesture: the element snaps back to where it was when the gesture began (no commit, nothing added to undo history), and any reparent drop-target highlight or alignment guide is cleared. This matches the existing Esc-to-cancel behavior of the pen/draw tools.

**Drag ghost for invisible elements:**
- An element that paints nothing on screen (e.g. an empty **wrapper** — a rect with no fill and no visible border, and whose whole subtree is also empty/hidden) has no visible body to follow while it is being moved.
- While such an element is being dragged, the canvas overlay draws a **ghost** in its place: a soft blue drop shadow under a faint blue surface, framed with a dashed selection-blue outline, following the element's exact bounds (and corner radius / rotation). This lets the user see what they are moving.
- The ghost appears only during a move-drag, only for the invisible dragged elements; visible elements in the same selection still move as themselves. It disappears on drop, where the normal selection outline returns.
- This is toggleable in **Settings → Canvas → "Drag ghost for invisible elements"** (on by default).

**Drop a photo/image file onto the canvas:**
- Dragging an **image file** from the OS onto the canvas creates a new **Image
  element** holding that file (read as a data URL), centered at the drop point and
  selected — no separate "set `src`" step. The drop lands **inside the opened
  frame** (frame-bounds law); only files whose type is `image/*` are accepted, and
  non-image drops are ignored.
- **Resize dropped images to frame** (Settings → Canvas, **on by default**) controls
  sizing:
  - **On** — the Image element is scaled **proportionally** (aspect ratio
    preserved) to fit within the frame's width × height; it only shrinks when the
    photo is larger than the frame, never upscales. The whole photo is shown,
    un-cropped.
  - **Off** — the element keeps the file's **natural pixel size**. Because elements
    are frame-bounded, the box is still clipped to the frame and the image renders
    at 1:1 (`objectFit: none`), so an oversized photo shows a crop of the frame
    region.

**Vector editing (pen / pencil / paths / SVG):**
- The toolbar exposes a **Pen**/**Pencil** dropdown (default keys `P` / `⇧P`) and an **SVG** tool (`G`).
- **Pen** is click-to-place: each click adds a corner anchor; click-drag pulls symmetric bézier handles out of the just-placed anchor; clicking the **first anchor** of the open subpath (highlighted with a ring) closes it and finishes the path. `Enter` finishes the open path; `Esc` cancels the in-flight anchor. The pen shows context cursors — pen, pen-insert (over a segment), pen-remove (Alt over an anchor), pen-snap.
- **Pencil** is freehand: drag to draw; on release the stroke is simplified (Ramer–Douglas–Peucker) and curve-fit into an editable path.
- **Path edit mode:** double-click a selected path (or press `Enter`) to edit it. The overlay draws the path's **skeleton** — selection-blue lines tracing every segment between anchors (sampled through curves) — with anchors as small squares and handles as round knobs on top. `Esc`/`Enter` or clicking empty canvas leaves edit mode. The element's box/resize handles are hidden while editing.
- **Vector edit toolbar:** while a path is in edit mode the bottom-center toolbar is **replaced** by a dedicated vector toolbar (Figma-style): **Move · Lasso · Paint · Bend · Cut**, a **More ▾** overflow (**Shape builder** `M`, **Variable width** `⇧W`), and a **Done** (`✕`) button that leaves edit mode. Sub-tool shortcuts (active only in edit mode): Move `V`, Lasso `Q`, Bend `B`, Cut `C`, Shape builder `M`, Variable width `⇧W`.
- **Move** (default sub-tool): drag an anchor or handle to move it; **double-click a segment** inserts an anchor; **Alt-click an anchor** removes it; double-click an anchor toggles corner ↔ smooth.
- **Bend** (`B`): drag any point on a segment to curve it — the pull is distributed onto the two enclosing anchors' bézier handles so the curve passes under the cursor; a straight segment becomes a curve. Anchors/handles remain directly draggable. `Esc` cancels an in-flight bend.
- **Cut** (`C`): click a segment to sever the path at that point (one-shot, no drag). Cutting a **closed** subpath opens it into a single open subpath that starts and ends at the cut; cutting an **open** subpath splits it into two independent open subpaths. The split point is inserted on the curve first (shape-preserving), so the outline doesn't jump.
- **Inspector → Vector** (shown for `path`/`svg` elements): fill + fill-opacity + fill-rule, stroke + stroke-width + stroke-opacity, line cap / join, and dash. Path elements get an **Edit path** button. (SVG stroke alignment is center-only — SVG has no native inside/outside stroke.)
- **Convert → Flatten to path:** rect/ellipse/polygon/star/line/arrow show a **Flatten to path** action that converts the shape into an editable vector path.
- **Boolean ops:** selecting two or more shapes/paths shows **Union / Subtract / Intersect / Exclude** buttons in the Inspector; the result replaces the operands with a single path.
- **SVG import:** pasting raw SVG markup (clipboard) decomposes it into a sealed **SVG** container node holding one child path per shape (`<path>/<rect>/<circle>/<ellipse>/<line>/<polygon>/<polyline>`); scripts/event handlers/external refs are stripped on import. **Exception — icon canvas:** on an icon master's canvas the artboard IS the svg, so pasted SVG lands as **root-level path elements** (no sealed container); the new paths are selected and show directly in the layers tree, like drawn paths.
- **SVG is a sealed component:** an imported/inserted SVG shows in the layers tree as a **single leaf row** (its internal paths hidden) and on the canvas renders only its frame. To edit its vectors, **double-click it to isolate/open** it; its paths become selectable and editable only inside that isolation. A global **Settings → Canvas → reveal sealed SVG internals** toggle (off by default) expands the SVG's path children in the tree — visibility only; editing still requires isolation.

**Actions panel** (expands above the toolbar):
- Search bar
- Filter tabs: All | Assets | Plugins
- Library mode buttons: Images / Icons / Assets
- **Checklist mode** (opened via the "Checklist" suggestion):
  - A persisted to-do list scoped to the currently-opened canvas subject — each
    screen and each component has its own checklist, keyed on the master id so it
    survives version changes.
  - Items can be checked/unchecked, added (Enter or +), and deleted; all changes
    persist immediately through the record store.
  - Empty state shows "No items yet."
- **AI chat mode**:
  - Message history with user and assistant bubbles
  - Tags showing currently selected nodes
  - Text input with voice button and send button

---

### 7. References Page `/references`

Reference image library for UI research.

**Layout**:
- Header: title, total count, "Add reference" button
- Responsive grid of image cards
- Each card: image thumbnail, name, tags, hover actions (View / Delete)
- **Group treatment**: a card is shown with stacked layers + a "Group" badge and a
  screen count whenever it represents more than one screen — either a multi-image
  group **or** a single image that holds multiple screens (its stack roots). The
  screen count sums every reference's stack roots (so one image with three roots
  reads as 3 screens, not 1); the subtitle is "N screens", or "M originals · N
  screens" when the two differ. A single-screen image keeps the plain card with its
  format/Stack badges.

**Reference Detail Modal** (opens on card click — single reference or group):
- **Original / Originals tab**: always shows the true source image (never the
  stack composite or the screens within it). A single reference shows its image
  enlarged. A group shows a gallery of **its originals only** (one card per source
  image); a group with only one original opens it enlarged directly (no one-cell
  grid). Opening an original here never dives into its screens — that is the
  Screens tab's job.
- **Screens tab** (labelled "Screens"; for a single reference the second tab is
  also "Screens"): one image can hold several screens (roots). A **group** grids
  the same originals as the Originals tab, but opening one here drills into its
  screens instead of showing the flat source. When there are multiple screens the
  tab shows a card per screen; selecting one renders that screen's composite (its
  background plus only its own cuts). A single screen renders its composite
  directly. The composite draws each cut once — the root is never re-painted over
  the background (fixes the prior duplicated image).
  - "All / Solo" toggle (composite overlay vs an isolated single cut) appears only
    when the screen in view actually holds cuts; a screen with just its root shows
    its image directly with no toggle. Solo with no cut selected falls back to the
    focused screen's own image (not another screen).
  - The Screens tab is enabled only when screens-with-stacks exist.
- **Sidebar tabs**: just **Inspector** (always) and **Group** (when applicable).
  There is no separate Stack tab — the Inspector is context-sensitive and changes
  with what is being viewed:
  - Viewing the **original** → the image's data (name, description, source URL,
    tags, group membership, details).
  - Viewing a **screen** (a stack) → that screen's **stack tree** (each cut's name
    + dimensions, selectable/isolatable), with the selected cut's preview and
    Builder/Remove actions beneath. With multiple screens and none opened, it
    prompts "Select a screen to view its stack". Opening a screen always brings
    the Inspector forward.
  - **Group** appears whenever the subject is a group. Every collection is a real
    `ReferenceGroup` — there is no longer a separate "image-as-group" pseudo path:
    a single image split into multiple screens is auto-promoted to a real group
    (seeded from the image's name on first sight), so it gets the same Group panel
    as a multi-image group. The panel shows an **inline-editable group name**
    (independent of the original's name), group details (Originals count, Screens
    count = total stack roots, Updated, ID), an "Add loose screen" picker, and
    Builder/Add/Edit/Delete actions. The three name layers are independent and
    separately editable: the group name (this panel), each original's name
    (Inspector), and each screen/cut name (stack tree).
  - **Delete** always opens a confirm dialog (even for a single multi-root image)
    with two outcomes:
    - **Separate into images** — dissolves the group into standalone references.
      A member that holds a single screen is just ungrouped; a member that bundles
      several screens (a multi-root stack) is split so each screen becomes its own
      reference — a copy of the original image carrying that one screen's stack
      (its cuts) — and the bundling reference is removed. It is a plain separation,
      like duplicating the image once per screen; cut boxes are copied verbatim
      (they are authored in the original image's space, so the copy renders them
      identically). Because every resulting image holds one screen, none
      re-promotes back into a group.
    - **Delete everything** — permanently removes the group and cascade-deletes
      every member image, screen, stack file, and cut (project links included).
    This dialog is also reached from the Inspector's **Remove** when the group is
    backed by a single reference (one image holding several stacks): removing that
    lone reference would destroy the whole group, so it opens the same confirm
    instead of silently deleting the backing image.
- **Card thumbnails** (grid + group gallery) render `contain`, so the whole image
  is visible (letterboxed if needed) rather than cropped to fill.

**Add Reference Modal** (`AddReferenceModal`, opened from a screen, component, or
the canvas references window):
- A single searchable **tree** whose top-level rows are **screens**, not images.
  Every uploaded image contributes its screens directly: an image with explicit
  sub-screens lists each one (the raw original is never shown); an image with no
  sub-screens contributes one screen (the whole image); a plain image is itself one
  screen. Each screen row shows its own cover thumbnail and a "Screen · W × H"
  subtitle, and is addable. Stack data for every stacked image is loaded when the
  modal opens so its screens appear immediately.
- A screen that has **stack components** (cuts) gets a chevron toggle; expanding it
  reveals those cuts nested beneath it (layers icon, indented by depth), each
  individually addable. The count badge on a screen is its number of cuts.
- One search box filters across image names, tags, screen names, **and**
  stack-component names; matching screens auto-expand.
- Picking a screen attaches that screen; picking a stack attaches just that cropped
  component (its crop is baked into the card thumbnail). Already-added items show an
  "Added" marker.
- Footer selects the attach target (entire project / specific screen / specific
  component); it is pre-set to the current subject when opened from a detail page
  or the canvas.

---

### 8. System Design Page `/system-design`

Edits the **active workspace's** system design — the company-level design system
shared with that workspace's projects. Each workspace owns exactly one design,
created lazily on first visit and persisted (records table / save queue), so all
edits survive reloads.

**Header**: "System Design" title + a line naming the workspace whose tokens are
being edited. If no workspace exists yet, an empty state asks the user to create
or select one from the top-left workspace switcher.

**Horizontal tab bar (token categories)**: Colors | Gradients | Typography |
Icons | Spacing | Radius | Images. Only the active category is shown at a time.

**Per category section** (`SectionBlock` with an "Add" action):
- **Colors** — grid of swatch cards: color block, name, hex value
- **Gradients** — grid of linear-gradient preview cards with name
- **Typography** — list of type styles: name, family/weight/size descriptor, live sample
- **Icons** — grid of real **vector SVG** tiles with name (tinted to the text
  color via `currentColor`). Each tile reveals an extra **Edit in canvas** action
  (see icon authoring below) alongside edit/delete
- **Spacing** — list: token name, proportional bar, px value
- **Radius** — grid of rounded-corner previews with name + px value
- **Images** — grid of uploaded image cards (empty state when none)

Token cards reveal actions on hover. On the **workspace** page each card shows a
**linkable toggle** (a link icon, on by default) plus edit/delete — the toggle
marks whether that token is shareable into projects, mirroring how a
project/workspace-global component is linkable. **Turning it off** runs the same
consequence flow as components: if no project links the token it's disabled
silently; if projects link it, the **`UnlinkComponentModal`** opens listing each
**project** that links it, each a switch — **copy** (detach into an independent
local token in that project, default) or **delete** — then applies the choices and
clears the linkable flag. The toggle button itself turns **purple** while the token
is linkable (the shared linked-instance accent). **Deleting** a workspace token runs
the very same per-project copy/delete modal when projects link it (confirm label
"Confirm & delete"), then removes the master; with no links it deletes immediately.

There is no "design system" selector and no libraries/icons name-lists — those
belonged to the old disconnected manager and were removed. The page edits one
real, persisted design.

**Add-token modal** (`AddTokenModal`): on the workspace page it shows just the
create form. On a project (when a workspace exists) it has two tabs — **Create
new** (the per-category form) and **From workspace** (a list of the workspace's
**linkable** tokens not yet linked, click to **Link** one as a live instance).
Editing a token uses `EditTokenModal`. Forms per category: color picker + hex;
gradient from/to + angle; family/weight/size + sample; **icon** (see below);
spacing slider; radius with "Full / Pill"; image upload.

**Icon authoring.** An icon is a vector token whose `<svg>` markup is the source
of truth. The icon form offers two ways to author it:
- **Import** — an `.svg` dropzone (sanitized, must contain at least one path,
  capped at 64 KB) with an inline preview, saved directly to the token.
- **Draw / Edit in canvas** — a button in the form (and the per-icon **Edit in
  canvas** tile action) opens the icon's art on the **normal canvas**. The art
  lives in an **`IconRow` master** — a first-class editable subject like a
  screen/component (its own entity, **never** a component), owned by the design's
  scope owner (workspace/project) exactly like a component created there. The
  token references it by `iconId`. The icon opens by variant just like any
  subject — **no special editor mode or route** — and, being its own entity, it
  never surfaces in the component browser, the canvas "Add components" picker, or
  `/drafts`. Every scene save serializes the artboard back into the master's (and
  the token's) cached `svg`, so the tab reflects edits automatically. Deleting the
  icon (or its whole system design) cascade-deletes the master.

**Icon color.** `currentColor` paints are preserved end-to-end: import keeps them
as-is (never baked to a concrete color), the canvas renders them in the theme
foreground (the same tint the Icons tab shows), and save-back writes
`currentColor` back into the token's `svg` — so icons stay tintable and never
"turn black" from an open→save round-trip. Explicit colors (`#hex`, `rgb()`)
are preserved untouched; recoloring a path in the Inspector makes it concrete.

---

### 8a. Project System tab (project design system)

The **System** tab inside a project (`/project/:id`) edits that project's own
system design using the same editor and modals as the workspace page. A project's
design is independent and persisted per project.

**Linkable token model** (the same linkable → instance → detach model as
components):
- The project's own (local) tokens and the workspace tokens it has **linked** are
  shown **together** in one list per category. An info bar names the workspace.
- Each card carries an **origin badge**: `Linked` for a linked instance of a
  workspace token, or `Local` for a project token. A linked token shows the
  master's live values and is **read-only** here.
- A linked token's hover actions are **Detach** (an unlink icon — copies the
  master's current values locally and breaks the link, so it becomes an editable
  `Local` token) and **Remove link** (drops it from the project). A local token
  has the usual edit/delete.
- **Linking** a token: the add-token modal's **From workspace** tab lists the
  workspace's linkable tokens not yet linked; clicking one adds a live linked
  instance. Editing the master in the workspace updates every linked instance.
- A project with **no workspace** has no linkable source and no badges — it just
  owns its tokens.

A global setting, **"Share workspace tokens with new projects by default"**
(default on), decides whether a new project starts with **all linkable workspace
tokens already linked** or none. It is editable in the new-project flow
(section 2).

---

### 9. Global Components Page `/components`

Workspace-level shared component library.

**Layout**:
- Header: title, total count, "Add component" button
- Search bar + kind filter dropdown
- Responsive grid of WorkspaceComponentCard
- AddComponentCard with dashed border at the end of the grid

"Add component" / AddComponentCard open `NewComponentModal` in workspace scope (name, optional Size W×H, kind). Deleting a card → CardMenu → Delete opens `ConfirmActionModal` (controlled mode) and removes the component tree on confirm.

**WorkspaceComponentCard**:
- Snapshot preview
- Component name + kind badge
- Row of project-usage badges (shows which projects use this component)
- On hover: CardMenu with Fast Edit / Canvas Edit / **more** menu

**Linkable toggle (card "more" menu)** — present on **every component card**: the
Global Components card, the project **Components** tab (grid + list rows), and the
**Sub Components** cards in screen/component detail (`ComponentSideCard`). When the
component is linkable the menu shows a **purple "Unlink"** item; otherwise a
**"Make linkable"** item. Making it
linkable just sets the flag. **Unlinking** runs a consequence check:
- no instances use it → it's disabled silently;
- instances exist → the **`UnlinkComponentModal`** opens, listing **every
  placement** (one row per instance, labelled "Owner (version) — element name")
  each with a **switch**: ON = keep an independent **local copy** (detach, the
  default), OFF = **delete** that instance. "Copy all" / "Delete all" shortcuts and
  a running count sit at the top. **Confirm & unlink** applies each choice across
  all scenes, then clears the linkable flag. (Unlinking ≠ deleting the component —
  the component stays; only its shareability and the chosen instances change.)
  The **Delete component** action reuses the very same per-instance modal when the
  component is linked elsewhere, but additionally removes the master afterwards (see
  "Deleting a linked component" below).

**EmptyState**: icon + title + description + CTA button

---

### 10. Generate / Builder Page `/generate`

AI-assisted image-to-component tool. The Builder is a **general, workspace-
agnostic route** (`/generate`, `/tools`) — it carries no workspace or project
state of its own. It reads the reference via `?id=` (and group via `?groupId=`).
It also accepts an **optional target owner** via `?projectId=`/`?screenId=`/
`?componentId=`: when opened from inside a project with these params, **Save**
links the worked reference back into that owner (via the reference link engine —
no copy, shares the library blob), and **Close** returns to the origin. (The
in-project entry button that supplies these params is not built yet.)

**Auto-save**: the stack commits to the database on its own — after any change
(new cut, edit, radius, move, delete, variant) settles for ~1.2s, the reference
stack is persisted durably without pressing **Save**. The Save button remains as
an immediate, explicit commit; it just isn't required anymore.

**Screens, images and groups**: one imported image is one **screen**. A single
image can hold several screens (its roots) — "New screen" copies the original as
a fresh root, and "Become root" turns a cut into the whole screen. Multiple
images form a **group**; in a group the originals are addressed positionally
(Original 1, Original 2, …). A **stack** is only what a screen contains — it is
not a separate entity and has no name of its own.

**Header**:
- Left: Wand icon + "Builder" label
- Center: **Builder / Stack / Gallery** tab switcher
- Right: close button

**Two-panel horizontal layout**:

**Left panel — Reference image area**:
- Import area for uploading a static UI screenshot
- Once imported: image is displayed at full size
- Crop tool: user draws rectangular regions over the image to mark component boundaries
- Each region is called a "cut"
- **Crop corner radius**: a locked selection shows a small circle inset from each corner (while the selection is hovered); hovering one shows the custom "bend" cursor. Dragging a handle sets a uniform corner radius for the cut, clamped to half the shorter side, projected onto the corner's 45° rail so perpendicular drift never changes the radius. At the maximum the two handles on the short edge meet and the drag locks; on that merged handle the first drag direction commits the corner — the drag can be pulled back to the lock but cannot cross it into the opposite corner. The live radius is shown in the selection's size badge (`· r N`). This matches the main canvas's radius handle.

**Show original (clean view)**: an image icon button in the **Componentes** header
(right panel) toggles a clean view of the open subject (no cut overlays, tool rail
dimmed). While active, the header icon is highlighted and a **close (×) button**
appears in the top-right of the canvas; the right panel stays fully populated
(screens, component tree) so you can keep navigating. Clicking the header icon
again, or the canvas ×, returns to the editor.

**Bottom canvas bar — image-level actions**: (when the Auto-detect Components feature is enabled) **Auto-detect**:
- **Auto-detect** runs the active auto-detect model on the open subject and shows every detected region as an **editable, colored review box** on the canvas — the same rectangle crop box used for manual cropping (move/resize/radius handles), not a saved cut yet. Boxes sharing a detected label share a color; different labels get distinct colors. The button shows a spinner and the image dims while it runs. Only available when a stack/component is open (croppable).
- The model is switchable in Settings → Processing → Auto-detect Components (four models). **OmniParser (icon detect)** (~58 MB, YOLOv8, the default) is purpose-built for UI screenshots and proposes icon/element regions; **OmniParser v2 (icon detect)** is the newer YOLOv8 (better on small elements); **UI-DETR (RF-DETR)** proposes many more / denser element regions; **Florence-2** (~1.2 GB) proposes region-captioned crops and labels each cut with its caption. Whichever model is active is the one Auto-detect runs. OmniParser v2 and UI-DETR are **local-file models** — see the manual install note below.
- Click a box to make it the active one (its handles appear); drag to move or resize it like any manual crop. When boxes overlap (a smaller region nested inside a larger one), clicking selects the **smallest** box under the cursor, so inner regions stay reachable. To discard the active box, press **Delete**/**Backspace**.
- **Undo** (`Cmd`/`Ctrl+Z`) reverts the last review-box change — bringing back a box you just deleted, or clearing the boxes an Auto-detect run just added.
- A toolbar in the top-right reads "N detected" with **Cancel** (discards every pending box, no cuts created) and **Save all (N)** (crops every remaining box at once, in a single batch, into normal cuts — selected/opened like a manual crop, editable afterward exactly like any manual cut).
- If no model is installed/enabled, a toast reads "Install an auto-detect model in Settings first". If nothing is detected, a toast reads "No components detected — try drawing regions manually".

**Right panel — Tools and output**:
- **Screens panel** (top of the Componentes tab): the single source for screen
  navigation — there is no separate left group navigator. It shows the open image's
  screens (its roots, selectable; clicking one shows that screen's stack/components
  below); when the image belongs to a group, the group's other images render as
  navigation cards that open that image in the Builder.
  - **Tab persistence on screen switch**: switching to another screen keeps the
    currently active tab when it still applies. From the **Stack** tab, selecting a
    screen that has a stack (one or more cuts) stays on Stack; selecting a screen
    with no cuts falls back to Builder, since there is no stack to show.
  - **New** creates a new screen by copying an original. With a single original it
    creates directly; with multiple originals (a group) it opens a small **"Copy
    from original"** picker — each entry shows the original's thumbnail, name, and
    dimensions (the current one tagged "· current") — and the chosen original seeds
    the new screen's root. A click-away backdrop closes the picker.
  - **Main screen** — each screen card has a star button (top-right of the
    thumbnail, visible on hover, filled gold when set). Clicking it marks that
    screen as the reference's **main** screen; exactly one screen can be main. The
    main screen is what shows on the **front of the reference card** in the gallery
    and is what the Builder opens on. Defaults to the full-image screen until
    changed. Save persists the choice.
  - **Opening the Builder lands on a screen, never the raw original image.** When
    a reference with an existing stack is opened, the Builder opens its **main
    screen** as the editable subject in the Builder tab (ready to crop). A fresh
    image with no stack opens its default full-image screen. The standalone
    original-image overview is still reachable via the sidebar "show original"
    toggle, but it is no longer the landing view. While the saved stack is still
    resolving (it may load asynchronously), the stage shows a brief spinner rather
    than the raw original — so the original never flashes before the main screen.
  - **Delete screen** — each screen card has a trash button (top-left of the
    thumbnail, visible on hover, turns red on hover). Clicking it opens a
    confirmation dialog ("Delete screen") that names the screen and its cut count;
    confirming permanently removes that screen and all its cuts. If the deleted
    screen was the open one, the editor switches to another remaining screen; when
    none are left, it returns to the original full image and the Screens panel
    shows the empty "No screens yet" state.
- **Builder tab** (default):
  - List of cuts created on the image
  - Each cut item: thumbnail preview, name, edit button, delete button
  - **Variants** button (Layers icon + count, only when the cut owns more than one variant): opens the **Variants panel** for that cut (see below). A cut gains variants when a non-crop AI tool (Remove background, Upscale, Remove element) runs on it; the plain crop is always kept as the "Original" variant.
  - Text detection and font recognition are **not** shown on tree rows — they are Gallery-tab features (see below).
- **Crops overlay toggle** (bottom-right of the stage, Builder/original views only): a **Crops** button that shows/hides the translucent overlay marking each cut's region on the open subject. It is **not** shown in the Stack or Gallery tabs (the Stack already renders the cuts themselves).
- **Stack tab**:
  - Shows all cuts from a reference image layered over the original at their exact positions
  - Clicking a cut selects it (blue outline); hovering shows an orange highlight
  - Selected cut name is shown below the canvas
  - Tree list of cuts with name and dimensions in the right panel
  - No Crops overlay toggle here
- **Gallery tab**:
  - Carousel view of individual cuts, one at a time
  - Left/right arrows and dot indicators for navigation (arrow keys also work)
  - Cut name and position counter (e.g. "2 / 5") shown below the image
  - Bottom action bar (when Color Detector, Text Detector, or Font Detector features are enabled): **Colors**, **Text**, and/or **Font** buttons run analysis on the current cut. **Text** detects whether the cut contains text (green "Text detected" / red "No text detected"); **Font** runs the EfficientNet-B3 font-classify model and lists the top font-family guesses with confidences (e.g. "Roboto-Regular 87%"). Each result appears in its own **titled box** (Colors / Text / Font), the boxes sitting side by side **above** the buttons. Results are display-only and reset when the cut changes.
  - **Switching to the Builder opens the cut currently in view** — leaving the Gallery on a given cut and clicking the Builder tab renders that same cut as the editable subject, scoped to its screen.
- **Variants panel** (replaces the component tree in the right sidebar when opened from a cut's Variants button or the rail's Variants button; the root switcher above stays visible):
  - Header: a **Back to tree** button (ChevronLeft) that returns to the tree, the cut's thumbnail and name, and a variant count
  - One row per variant: a "main" check indicator, thumbnail, the tool label (**Original**, **Background removed**, **Upscaled**, **Element removed**), and a delete button
  - Clicking a non-main row makes that variant the **main** one — the cut everywhere (tree thumbnail, canvas, Stack, Gallery, snapshot) switches to it
  - Delete is disabled for the **Original** and for the current **main** variant; deleting any other variant removes it. Selecting **Original** as main reverts the cut to the plain crop.

**Crop action toolbars** (shown once a crop is active — a locked rectangle selection or a closed pen path):
- a cluster at the **top-right** of the stage with the crop's **size** (W × H), **Cancel**, and **Save** (Save rasterizes the cut — a rounded rectangle for the Crop tool, the silhouette for the Pen tool).
- a **floating toolbar centred at the top** with two crop-shaping actions:
  - **Adjust crop** (desktop-only; needs an Object Segmentation model) — segments the object the user framed and reshapes the active tool to it: the rectangle snaps to the object's bounds (the whole word for multi-part text, not one glyph); the pen is redrawn as a smooth path along the object's silhouette. **Round/concentric subjects** (badges, coins, ring logos) are handled specially for the rectangle: because a filled segmentation barely moves the box, the crop instead **peels inward to the next ring** — it reads the crop radially from its centre and insets to the next strong, angularly-consistent contrast edge inside the current edge. Each click peels one ring (orange → white → black → interior). This radial step runs in-app (no model) and only triggers when a clean concentric ring exists; otherwise the normal object-bounds snap applies.
  - **Padding** — opens a popover to pad the crop, Figma-style. For the rectangle it defaults to **one field that sets all sides** (showing the common value, or "Mixed" when they differ); a toggle expands it into a **cross of per-side Top/Right/Bottom/Left fields**. Every field **shows the current padding and sets it to an absolute value** (measured out from the crop's base box, clamped to the image) — not a blind increment. For the pen it is a single px field that grows the path uniformly outward.
  - **Show sizes** (desktop-only; a toggle) — the static-image analogue of the canvas's hold-to-measure guides. It segments the objects inside the crop (always the built-in classic-CV engine, which finds every foreground object) and overlays a pink outline per object plus labelled gap lines (px): both between adjacent objects (along their dominant layout axis) and the four margins from the content to the crop edges — so you can align and dial in an even padding. Toggling off (or moving the crop) clears it.

**Left tool rail**: Move, Crop, Draw, Pen, plus (when models are installed) a processing group. The **Pen** tool (`P`) is a Bézier cut: click drops a corner anchor, click-drag pulls mirrored curve handles, clicking the first anchor (or Enter) closes the path; once closed its anchors/handles drag to reshape and dragging the interior moves the whole path. Non-crop tools do not overwrite the cut — each run adds a **variant** and makes it the main one, keeping the plain crop available as **Original**:
- **Remove background** — runs BiRefNet and adds a transparent-background PNG variant
- **Upscale 4×** — runs Real-ESRGAN and adds an upscaled PNG variant
- **Remove element** (Wand2 icon, only when the Remove Element feature is enabled) — enters a mask-drawing mode on the canvas: an overlay appears over the open cut's image and the cursor becomes a brush circle. Dragging paints a semi-transparent red mask over what to remove (the brush stays aligned to the image at any zoom). A floating **Apply / Cancel** toolbar shows at the bottom-center of the canvas: **Apply** runs LaMa inpainting and adds the result as a variant (the rail button shows a spinner while running); **Cancel** (or clicking the rail button again) discards the mask and exits. Crop/Draw selection is suspended while masking.
- Each non-crop tool chains onto the currently shown (main) variant, so edits stack (e.g. Upscale then Remove background).
- **Variants** (Layers icon) — opens the Variants panel for the open cut; enabled only when that cut owns more than one variant.
- Remove background / Upscale / Remove element show an inline spinner while running; results are stored as variants and persisted with the stack (one PNG per variant) on **Save**.
- The group requires a cut to be open (Remove background, Upscale, and Remove element are disabled otherwise); if no model is installed, the group does not appear

**Draw toolbar** (centered at the bottom of the canvas, visible whenever the Draw tool is active):
- **Brush size** slider — controls the freehand stroke thickness (visual guide; the cut is still the bounding box of the drawing)
- The freehand drawing stays painted on the canvas after you release; it is not committed until you pick an action
- Shows the bounding-box dimensions once a region is drawn
- Action buttons, each committing the drawn region as a new cut:
  - **Crop** — saves the cut as-is (no AI), a single Original variant
  - **Remove BG** — saves the cut with two variants: the plain crop (Original) and a BiRefNet background-removed variant set as main (only shown when installed)
  - **Upscale** — saves the cut with two variants: the plain crop (Original) and a Real-ESRGAN 4× variant set as main (only shown when installed)
  - **Clear** — discards the current drawing without saving
- Actions are disabled until a region is drawn; the active one shows a spinner while processing

---

## Shared Components

### TopBar

Global navigation header present on all non-canvas pages. It is **not** rendered
on the Home page (`/`), which has its own header.

**Left side**:
- **Home icon** (→ `/`) — returns to the Home page, followed by a divider
- Workspace selector button: avatar initial + workspace name + chevron
- Workspace menu (portal overlay): list of workspaces + "Create new" option

**Center**:
- Navigation links: Projects | Components | System | References
  (**Projects** → `/workspace/:workspaceId/projects`, the project browser)

**Right side**:
- "Builder" button (primary style)
- User avatar button with initials
- User menu (portal overlay): **Edit workspace** | Settings | Factory Reset
  - **Edit workspace** opens the full-page **WorkspaceEditPanel** (see Workspace Edit below)
  - **Settings** opens the global Settings modal

### Workspace Edit

Opened from the avatar menu → **Edit workspace**. A full-page editor (portaled
overlay, no routing) that fills everything below the TopBar — the same shape as the
project Edit. It edits the **active workspace** (from the workspace switcher) with a
sticky action bar (Close × · "Edit workspace" · Cancel / Save changes; Esc closes)
and a scrollable, centered body of two sections:
- **Details** — workspace **name** (saved by **Save changes**), plus a read-only
  project count and creation date.
- **Toolbar config** — this **workspace's** canvas element defaults. They override
  the Global base (edited in the Settings modal) and are overridden again per project
  in the project's Edit page. Persists **immediately** (independent of Save changes).

With no workspace selected, the body shows a hint to create or pick one.

---

### Modal System

All modals share a consistent structure.

**Overlay**: full-screen backdrop
**Container**: centered panel with rounded corners and border

**Behavior**:
- Closes on: Escape key, click outside, X button
- Locks body scroll while open
- Multiple modals can stack

**Sizes**:
- Default: 760px wide
- Wide: 1180px wide
- XL: near full-screen
- Image: 920px wide
- Picker: 600px wide

**ModalHeader**: title + optional subtitle + X close button + optional actions slot
**ModalBody**: scrollable content area with padding

---

### Settings (modal + page)

The Settings controls live in one shared body, `AppSettingsContent` (the tab bar,
the active tab, and the Cancel / Save footer), surfaced two ways so they never
drift:

- **Settings modal** — opened from the workspace user menu (TopBar → avatar →
  Settings). Wide modal wrapping `AppSettingsContent`.
- **Settings page** (`/settings`, `SettingsPage`) — the Home sidebar's
  **Settings** link routes here. Renders the same `AppSettingsContent` inside the
  Home shell (header + sidebar from `HomeLayout`), under a "Settings" page
  heading. Cancel and a successful save return to the Dashboard (`/`).

**Tabs**:
- **Canvas**: shell and layers-tree toggles (inherit parent background, drag ghost for invisible elements, resize dropped images to frame, reveal selected layers), plus the **Toolbar config** section — the **Global** element defaults (see below)
- **Project thumbnails**: auto-generate project card thumbnails (see below)
- **Processing Features**: optional on-device AI models (see below)
- **Keyboard shortcuts**: rebindable canvas commands, grouped as Canvas / Zoom / Tools /
  Modifiers / Text editing. Beyond the tool and selection keys this covers the wheel-zoom
  modifier, the Enter that commits a pen path, and the text-editing commit + selection-extend
  keys.
- **Save location**: workspace base folder and storage details, plus a **Danger
  zone** with a **Reset to default data** button — wipes every project/scene/edit
  and reseeds the factory mock workspace (same action as the TopBar user menu →
  Factory reset). Two-click confirm ("Click again to reset everything", auto-cancels
  after a few seconds); shows "Resetting data…" while running.

**Element defaults editor** (shared component):

Sets the default appearance new canvas elements get when dropped (Text, Rectangle,
Wrapper, Image, Icon, Ellipse, Line, Arrow, Polygon, Star). These defaults are a
three-level cascade — **Global → Workspace → Project** — and the same editor is
reused at every scope:
- **Global** lives in this Settings modal's **Canvas → Toolbar config** section,
  saved with the modal's **Save changes** button.
- **Workspace** is edited in the **Workspace Edit** page's "Toolbar config" section
  (avatar menu → Edit workspace); persists immediately.
- **Project** is edited in the project's **Edit** page (Gallery → Edit → Element
  defaults section).

There is no longer a standalone "Element defaults" tab in the Settings modal, nor a
top-nav "Elements" page.

The editor's fields:

- **Adaptive sizing** (global only): Reference size (the frame size that maps to
  1× scale) plus min/max scale. New elements scale their default size toward the
  edited frame using these knobs, so editing a small frame yields smaller elements.
- **Per element**, an expandable card with: width, height, **Size mode**
  (Auto = adapt to the frame, Fixed = literal size), Fill, Border width, Border
  color, and Corner radius (where applicable).
- **Text** additionally has: Text color, Font family, Font weight, Font size,
  **Font size mode** (Auto/Fixed), and **Snap to design system** — when the font
  size is auto-computed it rounds to the nearest typography size in the project's
  design system (e.g. a computed 11.46px becomes 12px) instead of the raw value.

**Project thumbnails tab**:

A single **Auto-generate project thumbnails** switch (on by default). When on, each project's card thumbnail is composed automatically from its **first screen's snapshot**: the snapshot is laid inside a device mockup (iPhone for mobile, tablet for tablet, browser window for desktop) that is pushed off the right edge and below the bottom so only a portion (~40%) shows, with the project name displayed large to the left. The mockup and layout are composed as native SVG (vector device frame + the inlined screen snapshot) and emitted as a single SVG data URL into `ProjectRow.thumbnailDataUrl`, so it renders in the project card like any other thumbnail. A thumbnail is only produced once the first screen has a snapshot — projects with no snapshot are left with the default frame mockup. Thumbnails refresh automatically when the first screen's snapshot changes. The toggle persists immediately (independent of the Save button), and turning it on backfills every eligible existing project at once.

**Processing Features tab**:

Optional on-device AI models that run locally and are **off by default**. The tab separates **features** (capabilities) from **models** (implementations). A feature can have several models; **Text Detector** has four, **Auto-detect Components** has two, **Object Segmentation** (the "Adjust crop" engine) has three, every other feature has one. A model can be a download or **built-in** — a built-in engine runs in-app with no download (e.g. Object Segmentation's **Classic CV (contrast)**), is always available, and shows a "Built-in" tag instead of download/delete.

These exact controls (feature switch, per-model active selection, install/delete) are **mirrored in the Builder's right-sidebar Config tab** (under the crop-overlay settings), so models can be downloaded and switched without leaving the Builder; changes apply live through the shared settings.

A single list with one **accordion row per feature**. Each row shows:
- a chevron **expand/collapse toggle** and the feature's icon + name + description on the left;
- an enable/disable **switch** on the right, aligned with the feature. The switch is disabled (and the row reads "Install a model to enable") until at least one of the feature's models is installed. Enabling a feature is what makes its action appear in the Builder; disabling hides the action even if a model is installed. Uninstalling a feature's last model auto-disables it.

Expanding a row reveals the **list of models for that feature**, one per line:
- a **checkbox on the left** that selects the active model the feature runs (single-select, like a radio; checkable only once the model is installed; first install auto-selects);
- the model label + size;
- **download** and **delete** icon buttons on the right (download enabled when not installed, delete enabled when installed). While downloading, these are replaced by a progress percentage and a cancel (×) button; multi-file packages (Florence-2, font-classify) download sequentially.

All install / enable / active-model changes persist immediately, independent of the modal's Save button.

Catalog:
- **Remove Background** — BiRefNet (~220 MB)
- **Upscale (4×)** — Real-ESRGAN (~5 MB)
- **Auto-detect Components** — OmniParser (icon detect) (~58 MB, default), OmniParser v2 (icon detect), UI-DETR (RF-DETR), and Florence-2 (~1.2 GB, five-file package). Multiple models; the active one is selectable like the Text Detector. When enabled, the **Auto-detect** button appears on the Builder's bottom canvas bar and runs the active model. OmniParser v2 and UI-DETR have **no public download** ("Local file" models): their row shows a folder-in icon instead of a download button; clicking it reveals the exact path (an OS `alert`) where the user must drop a locally-converted `.onnx`, and only marks the model installed once that file is present. Clicking again after placing the file enables it.
- **Text Detector** — DBNet-MobileNetV3 (~15 MB), DBNet-ResNet34 (~85 MB), DBNet-ResNet50 (~96 MB), CRAFT (~80 MB). When enabled, the **Text** button appears in the Builder's Gallery action bar and runs the active model on the current cut.
- **Remove Element** — LaMa (~208 MB). When enabled, the **Remove element** tool appears in the Builder's left tool rail.
- **Font Detector** — font-classify (EfficientNet-B3, ~64 MB, three-file package: model + two YAML sidecars). When enabled, the **Font** button appears in the Builder's Gallery action bar and identifies the cut's font family.
- **Color Detector** — model-free (runs built-in). When enabled, the **Colors** button appears in the Builder's Gallery action bar.

---

### PreviewShell

Container for screen or component previews with controls.

**Content area**: rendered by `SceneCanvasViewer`, which supports four source modes:
- `stored` — loads and displays the saved thumbnail for a screen or component variant
- `snapshot` — displays a provided image URL directly
- `stack` — renders an image stack (background + cuts at their original positions)
- `scene` — renders a DOM schema as absolutely-positioned elements

**Controls** (floating over the preview area):
- Zoom in `+`, reset, zoom out `−`
- **Device frame switcher** (top-left, only for full screens — hidden via
  `showDevice={false}` on the component-detail preview): a two-part control — a
  toggle button that turns the device mockup on/off, and a caret that opens a
  dropdown of presets **grouped by platform (iPhone / Android)**, each row showing
  the model name and resolution. Picking a model both selects it and turns the
  frame on. When active, the screen snapshot is wrapped in the selected
  `DeviceMockup` (realistic bezel, corner radius, camera cutout, side buttons,
  home indicator/button) sourced from the shared device catalog
  (`src/canvas/devices`). The mockup is scaled to fit the pane and still respects
  the zoom/pan controls.
- Previous / Next navigation arrows with tooltips showing the adjacent item name
- FastEdit button
- "Open in Canvas" button

**Background**: grid pattern

---

### FastEditModal

Modal for quick in-place editing of a screen or component's scene schema.

**Layout**: two-column panel
- Left: `SceneCanvasInspector` rendering the scene — clicking a node selects it (blue outline); hovering shows an orange highlight
- Right: sidebar showing the selected node's properties (name, background, text color, font size, etc.)

**Behavior**: sidebar edits update the scene immediately and the canvas re-renders in real time. There is no separate draft — each edit is applied to the live scene and **persisted to the owner variant's scene** (debounced, fire-and-forget via `saveScene`; pending edits are flushed on close). Edits are mapped back onto the original unresolved document, so linked subcomponents (resolved read-only for display) are never rewritten.

---

### CardMenu

Floating action layer that appears on card hover.

**Buttons**: Open / Canvas / More / Check (varies by context)
**MoreMenu**: secondary submenu for additional options
**Destructive actions**: visually distinct (e.g. Delete)
**Behavior**: portal-based positioning, closes on outside click or Escape

---

### Color picker

Every color control in the canvas inspector — the Fill color field and the `InsColor` fields
(border, underline, text stroke, shadow, typography color, canvas background, export background)
— shows a **swatch** that opens the same picker popover. Translucent colors are drawn over a
checkerboard, in the swatch and in the picker.

**Popover** (anchored under the swatch, flipped above near the bottom edge; closes on outside
click or Escape):
- a **saturation / value square** with a draggable ring;
- a **hue slider** and an **alpha slider**;
- a **hex field** (3/4/6/8 digits) and an **alpha %** field, both reverting on invalid input;
- an **eyedropper** — the web `EyeDropper` API, falling back to the macOS `NSColorSampler` in the
  WKWebView. Picking a color does not close the popover.
- a **Recent** row of the last 8 colors committed in this session, shared by every picker.

The picker writes hex: `#RRGGBB` when opaque, `#RRGGBBAA` otherwise — so **alpha is available on
every color control**, not just Fill. Dragging a control inside the Fill picker coalesces into a
single undo entry. The Fill field's text input still accepts wide-gamut literals
(`color(display-p3 …)`, `oklch(…)`), which the swatch renders but the picker cannot represent; it
seeds from black and only overwrites the literal once a control is actually moved.

---

### FilterButton

Dropdown-based filter control.

**Trigger**: button showing a badge with the count of active filters
**Dropdown**: grouped filter options, each with a checkmark when active
**Clearing**: deselecting all options resets the badge

---

## Interaction Patterns

### Inline editing
- Click on a title to turn it into an input field
- Escape cancels and restores the original value
- Enter or blur confirms the edit

### Hover states
- Cards show CardMenu and highlight on hover
- Navigation links highlight on hover
- Buttons show a hover background

### Dropdowns and popovers
- Rendered via React portal into document body
- Auto-positioned to avoid screen edges
- Close on: Escape key, click outside

### Modals
- Triggered by explicit user action (button click)
- Scroll lock on body
- Multiple modals can stack with increasing z-index

### Grids
- Responsive `auto-fill` with `minmax` column sizing
- Consistent gap between items
- EmptyState replaces the grid when no items exist

### Navigation
- Breadcrumbs on detail pages reflect the full hierarchy path
- Previous/Next arrows on detail pages navigate within a list
- Back button on canvas returns to the parent detail page

### Confirmation
- Destructive actions (delete, reset) always show a `ConfirmActionModal` before executing
- Confirmation button is styled to signal danger

---

## Versioning & Linked Component Instances

See [`Versioning.md`](./Versioning.md) for the full model. UX surface:

**Creating a version** — a `VersionModeModal` ("Linked or Copy") appears before a new
version is created:
- Component versions: triggered by **New version** ("+") in the Component detail
  **version switcher** (above the side-panel tabs — the same control as the screen).
  A component's variants are its versions — they share the component's (one) name, and
  each is identified by the same purple **version tag** (`V1`, `V2`…, V1 = the default/
  "main"), shown on the switcher chips and the component detail header. Creating one
  opens the same Linked/Copy modal as screens.
- Screen versions: triggered by **New version** either in a screen card's `···` More menu
  (Gallery Screens tab) or via the **version switcher** ("+") in the screen detail page. A
  screen is a master that owns a variant chain exactly like a component — a screen version
  **is a variant** of the screen (not a separate screen), so versions never appear at the
  project level. All versions share the screen's (one) name and are identified by a stable
  **version tag** (`main`, then `V1`, `V2`…); the active version's tag shows in the screen
  detail header. The screen detail **version switcher** (above the side-panel tabs) lists
  the screen's variants as chips; selecting one is **preview-only** (it drives the preview
  and the Sub Components grid, never persisting the screen's active variant). The switcher's
  **open in canvas** action opens the **main** in Current (`?screen=`) or a **version** in
  the persistent **Versions window** (see §6).
- **Linked**: child components become read-only instances of the originals — editing a
  master updates every version. **Copy**: a fully independent duplicate — the scene is
  copied **and** every child component is **re-mastered into the version's own component**
  (no link to the original). A copied version's Sub Components are therefore editable and
  deletable in place; deleting one **never** affects the component it was copied from.

**Linked instances in the canvas**:
- Selecting an instance shows **purple** selection chrome (`#8638E5`) — outline, resize
  handles, and the size tag — vs blue for editable content, signalling an external component.
- An instance's contents are **read-only** but individually selectable: a child can be
  clicked/selected and shows a purple outline, yet has no transform handles and cannot be
  moved/resized; only the instance root moves as a whole (see the canvas-selection note above).
- In the layers tree, an instance row uses a purple **diamond-cluster component icon** and
  exposes:
  - **Open in canvas** (the same icon every openable row uses, tinted purple) — a single
    link that opens the master variant. (There is no separate "Go to component" link.)
  - **Detach** (broken-link icon) — breaks the link, turning the instance into editable
    own content (edited inline on the canvas).
- While linked, the tree shows an instance as a single row; its inlined master content is
  not expanded.

**Version details (screens & components)**:
- The original is labelled **"main"** (green badge); the versions created from it are
  **V1, V2, V3…** (purple badge) — the first version is V1, never the main.
- **Screen detail and component detail** both surface versions in the **version
  switcher** above the side-panel tabs (chips: Main · V1 · V2 …); the active chip is
  marked by its border + a filled colour dot (green main / purple version). The
  switcher's hover preview and the Compare modal render the subject's own snapshot
  (screen or component).
- Version actions — for both screen and component, the switcher's right-aligned cluster
  (**compare**, **open canvas**, **delete** — delete disabled on the main) acts on the
  currently selected version.
- Inside a version's canvas scene, child components that point at the master appear as
  **linked** instances (purple border, read-only — no delete); detached/own components
  appear normally. The **Sub Components** tab (screen or component) mirrors this: it
  follows the selected version (see the version switcher), listing that variant's
  subcomponents.
- **Subcomponent cards** in the screen detail **Sub Components** tab (`ComponentSideCard`):
  - an **owned** child shows **no source icon**, a normal border, and its **kind** badge
    (Layout / Section / Pattern …);
  - a **linked** child shows a **purple border**, a purple **component-link** badge
    (diamond-cluster glyph) pinned upper-right, a normal title, and the same **kind** badge
    (there is no separate "linked" text badge). Its hover menu is read-only (no delete).

**Linkable components & "Add components"**:
- A component becomes **linkable** automatically when it is created **project-global** or
  **workspace-global**, and when a **linked version** captures it as a linked instance.
- The canvas toolbar **Actions** menu → **All** tab → **Add components** opens a picker
  sub-panel (same pattern as the Image/Icon/TMB library sub-panels) listing the linkable
  components reachable from the current project (its project-global components plus its
  workspace's workspace-global components), each with its scope icon and a search box.
  Selecting one inserts a **linked instance** (purple) centered on the current
  frame; the open component itself is excluded to prevent self-insertion.
- A placed linked instance can be **moved/resized as a whole** on the canvas, but the
  **inspector shows it read-only** (property fields locked, with the "go to component"
  banner) — the same read-only treatment as the Versions window — signalling it cannot be
  edited in place; edit it via **go to component** or **detach**.

**Deleting a linked component** — deleting a component that is used as a linked instance
elsewhere opens the **same per-instance modal as Unlink** (`UnlinkComponentModal`, the
shared `useDeleteComponent` flow): it lists **every placement** (one row per instance,
"Owner (version) — element name"), each a switch — ON = keep an independent **local copy**
(detach, the default), OFF = **delete** that instance — with "Copy all" / "Delete all"
shortcuts. **Confirm & delete** resolves every link by the chosen action **and then removes
the master**. This is offered from every component card (Global Components, the project
**Components** tab, and the **Sub Components** cards in screen/component detail). With no
linked instances it falls back to a plain `ConfirmActionModal`.

**Deleting a linked screen** — when a screen still has linked instances of its components
elsewhere, an `InstanceDeleteModal` replaces the plain confirm, offering **Detach
instances, then delete** (each instance becomes an independent copy in place) or **Delete
everywhere (cascade)** (removes every instance too). With no instances, a plain
`ConfirmActionModal` is shown.

**Deleting a version** — deleting a version from the **version switcher** (screen or
component detail) deletes the components that version owns. When any of those owned
components is placed as a **linked instance** elsewhere, the same `InstanceDeleteModal`
opens first (the shared `useDeleteVariant` flow), offering **Detach instances, then
delete** or **Delete everywhere (cascade)** before the version's masters are removed —
the version-delete path is now instance-aware like screen/component deletion, instead of
silently leaving dangling instances. With no external instances it falls back to a plain
`ConfirmActionModal` ("Version X of Y will be removed"). The default/original **main**
version cannot be deleted.

### Empty states
- Every list, grid, and tab has a dedicated empty state
- EmptyState always includes: icon, title, short description, CTA button
