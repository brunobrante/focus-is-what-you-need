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
| `/system-design` | SystemDesignPage | Global design tokens management |
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

Three-step wizard for creating a project.

**Progress bar** at the top showing current step out of 3.

**Step 1 — Project type**:
- Three TypeCards side by side: Desktop / Tablet / Mobile
- Each card shows a device mockup illustration, type label, dimensions (e.g. `1440 × 900`), and a radio button
- Selected state: highlighted border and background

**Step 2 — Project name**:
- Badge showing the chosen type
- Text input with placeholder
- Info pill below the input

**Step 3 — Advanced settings**:
- Drag-and-drop image upload area with dashed border, upload icon, and label "Drag & drop or click"
- Image preview when a file is loaded
- Remove image button

**Footer** (all steps):
- "Back" button on the left
- "Next" / "Create" button on the right, disabled when required fields are empty

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

**Each tab contains**:
- "Add" button in the top-right corner
- Search bar
- Kind/type filter dropdown
- Responsive card grid
- EmptyState when no items

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
- Canvas tabs: Current | Drafts
- Split mode selector: None | Vertical | Grid (icon buttons)

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

**Stack Viewer** (side panel, opens on card selection):
- Composite canvas showing the reference image with its cuts overlaid
- Tree inspector listing each cut with name and dimensions
- Metadata panel: name, dimensions, date added

---

### 8. System Design Page `/system-design`

Global design token management.

**Top section**:
- Design system name selector dropdown with "Create new" option
- "Shared with projects" checkbox
- Libraries list (names + Add button)
- Icons libraries list (same pattern)

**Horizontal tab bar**: Colors | Typography | Icons | Spacing | Radius | Assets

**Colors tab**:
- "Palette" section: grid of color token cards — each shows a color swatch circle, name, hex value, edit/delete actions
- "Gradients" section: cards showing a gradient preview strip, name, from/to color labels, angle — edit/delete actions
- "Add" button per section

**Typography tab**:
- "Type Styles" section: vertical list — name, family/weight/size descriptor, inline text preview
- "Libraries" section: list of font libraries — preview sample, local/remote badge, source URL

**Icons tab**:
- "Custom Icons" section: grid of glyph/emoji token tiles
- "Libraries" section: list of icon sets with item count and local/remote badge

**Spacing tab**:
- Vertical list of spacing tokens: name, range slider, numeric value, proportional visual bar

**Radius tab**:
- Grid of radius tokens: rounded-corner visual preview, name, value

**Assets tab**:
- Image upload area (empty state)

**Modals from this page**:
- `ColorModal` — name field + color picker + hex input
- `GradientModal` — name + from-color + to-color + angle slider
- `TypeModal` — name + font family + weight + size + preview text
- `IconModal` — name + emoji/glyph input
- `SpacingModal` — name + range slider + numeric input
- `RadiusModal` — name + value + "Full / Pill" checkbox
- `FontBrowserModal` — browse available font weights with sample text
- `IconBrowserModal` — grid of icons from Lucide or other libraries

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
