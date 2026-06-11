# UI Specification — Focus Is What You Need

## Overview

Desktop application (Tauri + React) for screen-first component exploration and design tooling. The app lets users start from complete screens, inspect their child components, drill into nested components, and manage design tokens — all while preserving the parent-child hierarchy at every level.

---

## Routing & Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | Main hub — project browser |
| `/new` | NewProjectPage | Multi-step project creation wizard |
| `/project/:id` | GalleryPage | Project detail with tabbed sections |
| `/project/:id/screen/:id` | DetailPage (ScreenContent) | Screen inspector and editor |
| `/project/:id/c/:id` | DetailPage (ComponentContent) | Component inspector and editor |
| `/canvas` | CanvasPage | Full-screen visual canvas editor |
| `/references` | References | Reference image library |
| `/system-design` | SystemDesignPage | Active workspace's design system (tokens shared with its projects) |
| `/components` | GlobalComponentsPage | Workspace-level global components |
| `/generate` | Generate | AI builder and content generation |

---

## Pages

### 1. Landing Page `/`

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

### 3. Gallery Page `/project/:id`

Shows all screens, components, and references inside a project.

**Header**:
- Breadcrumb: Projects > ProjectName
- Counts: `Screens (N)` | `Components (N)` | `References (N)`
- "Edit project" button

**ProjectOverview section**:
- Project thumbnail on the left
- Right side: editable project name, counts, Preview button, Edit button
- **ProjectEditPanel** slides in from the right in edit mode:
  - Name field
  - Description field
  - Device type selector
  - Save / Cancel buttons

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
- On hover: CardMenu with actions

**Modals triggered from this page**:
- `NewScreenModal` — form with name field and template selector
- `NewComponentModal` — form with name field and kind selector
- `ProjectPreviewModal` — full-screen preview of project screens
- `ConfirmActionModal` — confirmation dialog with Cancel / Delete buttons

---

### 4. Screen Detail Page `/project/:id/screen/:id`

Two-column layout for inspecting and editing a screen.

**Left column (≈40%) — Preview**:
- PreviewShell container (see Components section)
- Device mockup wrapping the screen snapshot
- Floating buttons: Open in Canvas, FastEdit

**Right column (≈60%) — Inspector**:
- Editable screen title with edit icon
- Metadata row: dimensions, template, last updated
- Action buttons: History (clock icon) | Info (pencil icon) | badge showing component count
- **Tab bar**: Sub Components | Versions | References
  - Each tab: search bar + kind filter + "New" button + card grid
  - `ComponentSideCard`: snapshot, name, kind, CardMenu
  - `VersionSideCard`: version number, date, active status indicator
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

---

### 5. Component Detail Page `/project/:id/c/:id`

Same structure as Screen Detail with these differences:

- **Full breadcrumb**: Projects > Project > Screen > Component
- **Preview** shows the active variant snapshot, zoomed proportionally to the component's intrinsic size
- **Inspector** differences:
  - Component name (editable)
  - Metadata: kind, variant count, sub-component count
  - Additional button: Compare versions
  - InfoPanel fields: description textarea, kind dropdown, category input

---

### 6. Canvas Page `/canvas`

Full-screen visual editor with floating UI layers.

**Center**: Canvas rendering area with a grid background pattern.

**Top-left**:
- Back button with breadcrumb: Project > Screen or Component name
- Search toggle button

**Top-center**:
- Canvas tabs: Current | Drafts | References (Versions when enabled)
- Split mode selector: None | Vertical | Grid (icon buttons)

**References window** (a canvas window, like Current/Drafts):
- Shows references attached to the subject currently open in the canvas (a
  component takes precedence over its screen) as a gallery of `ReferenceThumbCard`s.
- Clicking a card opens it enlarged in the lightbox; hover reveals remove.
- The window's **Add** button opens the standard `AddReferenceModal`, scoped to
  the current subject, so new references appear here and in the side References tab.
- Empty state prompts to add the first reference.

**Left panel** (collapsible):
- Layers / tree panel
- Hierarchical list of nodes, each with: type icon, node name
- Per-item controls: visibility toggle (eye icon), lock toggle (padlock icon), drag handle for reordering
- Indentation reflects nesting depth

**Right panel** (collapsible):
- Inspector panel
- Tabs: Element | Canvas | Shell
- Properties editor: X / Y position, W / H size, rotation, opacity
- Visibility toggles: device, back, zoom, expand
- When nothing is selected: canvas-level properties (background, grid settings)

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

**Actions panel** (expands above the toolbar):
- Search bar
- Filter tabs: All | Assets | Plugins
- Library mode buttons: Images / Icons / Assets
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

**Reference Detail Modal** (opens on card click — single reference or group):
- **Original / Originals tab**: a single reference shows its image enlarged. A
  group shows a gallery of its originals; a group with only one original opens it
  enlarged directly (no one-cell grid).
- **Stack / Stacks tab**: one image can hold several independent stacks (roots).
  When there are multiple stacks the tab shows a card per stack; selecting one
  renders that stack's composite (its background plus only its own cuts). A single
  stack renders its composite directly. The composite draws each cut once — the
  root is never re-painted over the background (fixes the prior duplicated image).
  - "All / Solo" toggle: composite overlay vs an isolated single cut.
- **Sidebar**: a tree inspector listing each stack and its cuts (name +
  dimensions), each selectable/isolatable; plus the metadata panel.

**Add Reference Modal** (`AddReferenceModal`, opened from a screen, component, or
the canvas references window):
- A single searchable **tree** of the whole library. Each image row expands into
  its stack tree: the whole image ("Original") plus each root and its nested cuts,
  indented by depth.
- One search box filters across image names, tags, **and** stack-component names;
  matching images auto-expand.
- Picking the Original attaches the whole image; picking any node attaches just
  that cropped component (its crop is baked into the card thumbnail). Already-added
  items show an "Added" marker.
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
- **Icons** — grid of glyph/emoji tiles with name
- **Spacing** — list: token name, proportional bar, px value
- **Radius** — grid of rounded-corner previews with name + px value
- **Images** — grid of uploaded image cards (empty state when none)

Token cards reveal edit/delete actions on hover.

There is no "design system" selector and no libraries/icons name-lists — those
belonged to the old disconnected manager and were removed. The page edits one
real, persisted design.

**Add-token modal** (`AddTokenModal`): on the workspace page it shows just the
create form. On a project (when a workspace exists) it has two tabs — **Create
new** (the per-category form) and **From workspace** (a list of workspace tokens
the project previously removed, click to re-add). Editing a token uses
`EditTokenModal`. Forms per category: color picker + hex; gradient from/to +
angle; family/weight/size + sample; emoji/glyph; spacing slider; radius with
"Full / Pill"; image upload.

---

### 8a. Project System tab (project design system)

The **System** tab inside a project (`/project/:id`) edits that project's own
system design using the same editor and modals as the workspace page. A project's
design is independent and persisted per project.

**Unified token model** (the core idea — there is no Inherited/Custom switch):
- The project's own tokens and the tokens shared by its workspace are shown
  **together** in one list per category. An info bar names the workspace.
- Each card carries an **origin badge**: `WS` for a workspace (shared) token, or
  `Local` for a project token. Workspace tokens are not edited here (edit at the
  workspace level); they can be deleted.
- **Deleting a token removes it from the project.** A project token is deleted
  outright; a shared token is excluded from this project only — the deletion
  persists. It reappears under the add-token modal's **From workspace** tab to be
  re-added.
- **Adding** a token creates a project-local token (or re-adds a removed shared one
  from the From-workspace tab).
- A project with **no workspace** has no shared tokens and no badges — it just owns
  its tokens.

A global setting, **"Share workspace tokens with new projects by default"**
(default on), decides whether a new project starts with all workspace tokens
shared or none. It is editable in the new-project flow (section 2).

---

### 9. Global Components Page `/components`

Workspace-level shared component library.

**Layout**:
- Header: title, total count, "Add component" button
- Search bar + kind filter dropdown
- Responsive grid of WorkspaceComponentCard
- AddComponentCard with dashed border at the end of the grid

**WorkspaceComponentCard**:
- Snapshot preview
- Component name + kind badge
- Row of project-usage badges (shows which projects use this component)
- On hover: CardMenu with Fast Edit / Canvas Edit / Delete

**EmptyState**: icon + title + description + CTA button

---

### 10. Generate / Builder Page `/generate`

AI-assisted image-to-component tool.

**Two-panel horizontal layout**:

**Left panel — Reference image area**:
- Import area for uploading a static UI screenshot
- Once imported: image is displayed at full size
- Crop tool: user draws rectangular regions over the image to mark component boundaries
- Each region is called a "cut"

**Right panel — Tools and output**:
- **Builder tab** (default):
  - List of cuts created on the image
  - Each cut item: thumbnail preview, name, dimensions, delete button
- **Stack tab**:
  - Shows all cuts from a reference image together
  - Composite layout of all cuts side by side
  - Tree list of cuts with name and dimensions

---

## Shared Components

### TopBar

Global navigation header present on all non-canvas pages.

**Left side**:
- Workspace selector button: avatar initial + workspace name + chevron
- Workspace menu (portal overlay): list of workspaces + "Create new" option

**Center**:
- Navigation links: Projects | Components | System | References

**Right side**:
- "Builder" button (primary style)
- User avatar button with initials
- User menu (portal overlay): Settings | Factory Reset

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

### PreviewShell

Container for screen or component previews with controls.

**Controls** (floating over the preview area):
- Zoom in `+`, reset, zoom out `−`
- Device selector dropdown: iPhone 15 / XR / SE
- Previous / Next navigation arrows with tooltips showing the adjacent item name
- FastEdit button
- "Open in Canvas" button

**Background**: grid pattern

---

### CardMenu

Floating action layer that appears on card hover.

**Buttons**: Open / Canvas / More / Check (varies by context)
**MoreMenu**: secondary submenu for additional options
**Destructive actions**: visually distinct (e.g. Delete)
**Behavior**: portal-based positioning, closes on outside click or Escape

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

### Empty states
- Every list, grid, and tab has a dedicated empty state
- EmptyState always includes: icon, title, short description, CTA button
