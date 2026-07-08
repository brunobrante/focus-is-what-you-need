# Design Patterns

This document covers the recurring UI patterns used across the desktop app: add cards, content cards, and empty states.

---

## Design Tokens

All components share a single set of CSS custom properties for color and stay within the same sizing/motion scale.

**Color roles**

| Token | Role |
|---|---|
| `--bg` | Page background |
| `--surface` | Slightly elevated surface (inputs, badges, card fills) |
| `--surface-hover` | Surface on hover |
| `--border` | Default border |
| `--border-strong` | Emphasized border (focused, dashed empty states) |
| `--text` | Primary text and active icons |
| `--text-muted` | Secondary text and inactive labels |
| `--text-faint` | Tertiary text and placeholder icons |

**Motion**

All interactive elements use a single transition duration: `120ms`. Hover lift is always `hover:-translate-y-0.5`. Border and color transitions use `transition-colors` or `transition-[border-color,color,background]`.

**Border radius**

- `rounded-[10px]` — card preview areas
- `rounded-[14px]` — page-level containers, empty state panels
- `rounded-full` — icon circles inside add cards

---

## Add Cards

Add cards occupy a slot in the same grid as content cards. They signal a creation action using a dashed border, a centered icon-circle, a text label, and a footer that mirrors real card metadata.

### Anatomy

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ← dashed border, no background
│                             │
│         ┌───────┐           │
│         │   +   │           │  ← h-8 w-8 circle, border-current, bg-surface
│         └───────┘           │
│        New screen           │  ← 12px label, tracking-[0.2px]
│                             │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

  Adicionar           390×844    ← footer: title + dimension/subtitle
```

### Rules

- **No background fill at rest.** The preview area is transparent so the page background shows through, distinguishing add cards from content cards visually.
- **Icon circle.** The `+` icon always sits inside `h-8 w-8 rounded-full border border-current bg-[var(--surface)]`. The surface fill gives the circle a slight lift against the transparent card area. The border color tracks the current text color, so it shifts automatically on hover without additional classes.
- **Icon size.** `IconPlus size={14} strokeWidth={2}`.
- **Hover.** Border and text shift to `--text`. In the Gallery grid, the background also fills to `#161616` on hover to improve contrast against the dark page. In GlobalComponentsPage and LandingPage the background stays transparent.
- **Footer mirrors a real card.** The footer beneath the preview area uses the same layout as a real content card: `text-[13px] font-medium text-[var(--text-muted)]` for the title, `text-[11.5px] text-[var(--text-muted)]` for the subtitle. This keeps add cards visually in rhythm with their neighbors.
- **Aspect ratio.** The preview area inherits the aspect ratio of the surrounding grid's cards (`aspect-[4/3]` for components and projects, `aspect-[9/19.5]` for mobile screens, `aspect-[16/9]` for desktop screens).

### Instances

| Card | File | Trigger |
|---|---|---|
| `AddScreenCard` | `Gallery.tsx` | Button, calls `onClick` |
| `AddComponentCard` (Gallery) | `Gallery.tsx` | Button, calls `onClick` |
| `AddComponentCard` (Global) | `GlobalComponentsPage.tsx` | Button, calls `onClick` |
| `AddProjectCard` | `LandingPage.tsx` | `<Link to="/new">`, no click handler needed |

---

## Content Cards

Content cards display an existing entity. They share the same two-section layout as add cards (preview area + footer) but use a solid border, a snapshot preview, and an overlay action menu.

### Anatomy

```
┌─────────────────────────────┐  ← solid border (--border)
│  · · · · · · · · · · · · · │  ← preview-dotgrid background texture
│                             │
│        [snapshot]           │
│                             │
│  [canvas] [edit] [more]     │  ← CardMenu, hidden at rest
└─────────────────────────────┘

  Screen title          390×844  ← footer row 1
  em Alignment Debug    +4       ← footer row 2 (when applicable)
```

### Rules

- **Solid border at rest.** `border-[var(--border)]`. On hover: `border-[var(--border-strong)]`.
- **`preview-dotgrid` class.** Applied to the preview area to add a subtle dot-grid texture. This marks the area as an editable canvas surface and provides a neutral background that does not compete with the snapshot.
- **`bg-[var(--surface)]` on the preview area.** Unlike add cards, content cards carry a surface fill so the dot-grid and any negative space in the snapshot remain legible.
- **CardMenu overlay.** The `CardMenu` component is absolutely positioned inside the preview area (`absolute bottom-2 left-1/2`). It is invisible and non-interactive by default (`opacity-0 pointer-events-none`) and revealed on parent group hover (`group-hover:opacity-100 group-hover:pointer-events-auto`) with a 120ms transition. It slides up slightly (`translate-y-1.5` → `translate-y-0`) as it appears. Background: `bg-[rgba(20,20,20,0.92)] backdrop-blur-md`.
- **Individual menu buttons.** `h-[26px] w-[26px] rounded-[5px]`. Hover: `bg-[var(--surface-hover)]`. Destructive actions use `text-[#ff7373]`.
- **Footer hierarchy.** Row 1: entity name at `text-[13px] font-medium text-[var(--text)]`, truncated. Optional kind badge at `text-[9.5px] uppercase tracking-[0.5px]` in a `border border-[var(--border)] rounded px-1.5 py-px` pill. Row 2 (when present): secondary metadata at `text-[11.5px] text-[var(--text-muted)]`.
- **Tabular numbers.** Dimension strings (`390×844`, `1440×900`) use `font-feature-settings: "tnum"` so digits stay fixed-width.

### Instances

| Card | File | Entity |
|---|---|---|
| `ScreenCard` | `Gallery.tsx` | Screen in a project |
| `WorkspaceComponentCard` | `GlobalComponentsPage.tsx` | Global component |
| `ComponentSideCard` | `ComponentSideCard.tsx` | Component in a detail side panel |
| `VersionSideCard` | `VersionSideCard.tsx` | Version in a detail side panel |

---

## Empty States

Empty states appear when a list or grid has no items to show. There are two structural variants depending on context.

### Variant 1 — Page-level empty state

Used inside the main content area of a page when a filtered or unfiltered list is empty.

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                                             │
│                    No reference found                       │
│         Adjust the filters or add new references …          │
│                                                             │
│                    [ + Add Reference ]                      │
│                                                             │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

**Structure**

- Container: `rounded-[14px] border border-dashed border-[var(--border-strong)] min-h-[320px]`, no background.
- Inner content: `max-w-[280px]` centered, text-center.
- Title: `text-[16px] font-semibold text-[var(--text)] mb-3`.
- Description: `text-[13px] leading-[1.6] text-[var(--text-muted)]`.
- Action button (optional): `h-9 inline-flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-strong)] px-3.5 text-[12px] font-medium text-[var(--text-muted)]`. Hover: `border-[var(--text)] bg-[var(--surface)] text-[var(--text)]`. Prefixed with `IconPlus size={13} strokeWidth={1.8}`.

**Current instance:** References tab in `Gallery.tsx` — action button opens the Add Reference modal via `modalRef.current?.open()`.

---

### Variant 2 — Side panel empty state (`SideEmptyState`)

Used inside side panels or grid columns when a list (versions, components, children) has no items. It is a reusable component at `components/screen/SideEmptyState.tsx`.

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│                                  │
│        ┌────────────┐            │
│        │    ████    │            │  ← icon box: h-12 w-12 rounded-xl
│        └────────────┘            │     border (--border), bg (--surface)
│                                  │
│         No versions found        │  ← 13px font-medium
│    Versions will appear here …   │  ← 12px leading-[1.5]
│                                  │
│         [ + New version ]        │  ← optional action button
│                                  │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**Structure**

- Container: `col-span-full rounded-[14px] border border-dashed border-[var(--border)] min-h-[220px]`, no background.
- Inner content: `max-w-[300px]` centered, text-center.
- Icon box: `h-12 w-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)]` with `IconGrid size={18} strokeWidth={1.6}` centered inside it.
- Title: `text-[13px] font-medium text-[var(--text)]`.
- Description: `text-[12px] leading-[1.5] text-[var(--text-muted)]`.
- Action button (optional): identical to Variant 1 — `h-9 border border-dashed border-[var(--border-strong)] rounded-[10px]`. Prefixed with `IconPlus size={13} strokeWidth={1.8}`.

**Props**

```ts
{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

When `onAction` is omitted the button is not rendered.

**Key differences from Variant 1**

| | Page-level | Side panel |
|---|---|---|
| Min height | 320px | 220px |
| Border token | `--border-strong` | `--border` |
| Title size | 16px, semibold | 13px, medium |
| Icon | None | GridIcon in a framed box |
| `max-width` | 280px | 300px |
| `col-span` | N/A (standalone block) | `col-span-full` |

### Icon circle rule (shared with add cards)

Any circle used to represent an action — whether inside an add card or inside an empty state — always carries `bg-[var(--surface)]`. This applies to:

- Add card circles: `h-8 w-8 rounded-full border border-current bg-[var(--surface)]`
- Empty state icon circles: `h-10 w-10 rounded-full border border-[var(--border-strong)] bg-[var(--surface)]`
- `SideEmptyState` icon container: `h-12 w-12 rounded-xl border border-[var(--border)] bg-[var(--surface)]` (square variant)

The surface fill ensures the circle reads as a distinct element against any background, whether transparent (add cards) or the page surface (empty states).

---

## Summary

All three patterns (add cards, content cards, empty states) share one layout grammar: a centered rectangular region with a dashed or solid border, followed by a text footer. Add cards use a dashed border and transparent background to read as "potential". Content cards use a solid border and surface background to read as "existing". Empty states use a dashed border and no background to read as "available space". The action button style — dashed border, muted text, hover fill — is identical across all three contexts, keeping the affordance consistent wherever a creation action appears.

---

## Toolbar Controls

Every page toolbar (Screens, Components, References tabs in the Gallery; the References route) uses the same height scale for its inline controls. Never mix heights within the same toolbar row.

### Height scale

| Role | Height | Radius | Where |
|---|---|---|---|
| Search bar | `h-[34px]` | `rounded-full` (Gallery tabs) / `rounded-[8px]` (References page) | All tab toolbars |
| Filter button ("Filters" pill) | `h-[34px]` | `rounded-full` | All tab toolbars |
| Primary action button (New, Upload, Add Reference) | `h-9` (36px) | `rounded-[10px]` | Gallery tabs, References page header |
| Secondary action button (SmallButton) | `h-8` (32px) | `rounded-[8px]` | References page header |

### Filter button pattern

All tabs use a unified "Filters" pill button instead of individual per-filter dropdowns. The reusable component is `FilterButton` at `components/ui/FilterButton.tsx`.

**`FilterButton` props**

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `activeCount` | `number` | `0` | Number of non-default filters active. Drives the inverted colour state and badge. |
| `align` | `"left" \| "right"` | `"left"` | Dropdown alignment. Use `"right"` when the button sits at the right edge of a toolbar. |
| `children` | `ReactNode` | — | Content of the dropdown panel. Use `FilterSection` for standard chip groups; add custom markup for special cases (e.g. scrollable chip lists). |

**Button appearance**

- Shape: `inline-flex h-[34px] rounded-full border px-3 text-[12px]` with `ListFilter size={12}` icon.
- Inactive (`activeCount === 0`, closed): `border-[var(--border)] text-[var(--text-muted)]`.
- Active or open: `border-[var(--text)] bg-[var(--text)] font-medium text-[var(--bg)]`.
- Active badge: white circle `h-[14px] w-[14px] bg-[rgba(255,255,255,0.2)] text-[9px] font-bold` showing the count.

**Dropdown panel**

`rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]` — closes on outside click or Escape.

### `FilterSection` — chip group inside the dropdown

Use `FilterSection` (also in `components/ui/FilterButton.tsx`) for each filter dimension.

```tsx
<FilterSection title="Type" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
```

- `options`: `{ value: string; label: string }[]`
- Section heading: `text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]`
- Active chip: `h-[26px] rounded-full border border-[var(--text)] bg-[var(--text)] text-[var(--bg)] px-3 text-[11px] font-medium`
- Inactive chip: `h-[26px] rounded-full border border-[var(--border)] bg-transparent text-[var(--text-muted)] px-3 text-[11px] font-medium`, hover `border-[var(--border-strong)] text-[var(--text)]`

**Usage example**

```tsx
const activeCount = (typeFilter !== "all" ? 1 : 0) + (screenFilter !== "all" ? 1 : 0);

<FilterButton activeCount={activeCount}>
  <FilterSection title="Type" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
  <FilterSection title="Screen" options={screenOptions} value={screenFilter} onChange={setScreenFilter} />
</FilterButton>
```

### Where each component lives

| Tab | Search + Filter component | File |
|---|---|---|
| Components | `ComponentSearchBar` | `routes/Gallery.tsx` |
| Screens | `ScreenSearchBar` | `routes/Gallery.tsx` |
| References (Gallery) | `RefSearchBar` | `routes/Gallery.tsx` |
| References (route) | `FilterSearchBar` | `routes/references/components/ui.tsx` |

---

## Canvas Inspector Controls

The canvas inspector (`canvas/shell/inspector/`) has its **own** control language,
modelled on Framer's property panel — soft filled fields, large corner radii, glyph
labels inside the field, and segmented controls with a sliding indicator. It does **not**
use the page-level tokens above; its palette is centralised in the `INS` object and the
exported class constants at the top of `inspector/InsComponents.tsx`. Read that file before
adding or restyling any inspector control — never hard-code hex values in a section file.

### Tokens (`INS` in `InsComponents.tsx`)

| Token | Value | Role |
|---|---|---|
| `INS.fill` / `fillHover` | `#242424` / `#2C2C2C` | Field & control fill, rest / hover |
| `INS.track` | `#1C1C1C` | Recessed track behind segmented controls & sliders |
| `INS.active` | `#363636` | Sliding indicator / active segment |
| `INS.divider` | `#282828` | Hairline between sections |
| `INS.text` / `label` / `faint` | `#EDEDED` / `#8A8A8A` / `#5F5F5F` | Value / label / placeholder text |
| `INS.accent` | `#0D99FF` | Focus ring, slider fill, switch on, primary CTA |

### Height scale

Every text-like control (input, select, readout, segmented control, slider) is **30px**
tall. Icon buttons and swatches are **26px**. Corner radius is **8px** for fields and
tracks, **7px** for icon buttons. This replaces the old 28px/22px + `rounded-md`/`rounded-[5px]`
scale — do not mix the two.

### Primitives (all exported from `InsComponents.tsx`)

- **`InsSection`** — collapsible section. Header is a chevron + title on the left and an
  optional right-side **`action`** slot (used for the `+` add button on Fill / Effects /
  Export, following Figma/Framer). Pass `disabled` to lock the body read-only (linked
  instances).
- **`InsRow`** — label (68px column) + control. Omit `label` to let the control span full
  width; pass `align="start"` when the control is taller than one field (e.g. an align pad).
- **`FieldGroup`** — packs 2–4 fields into one horizontal row (`X │ Y`, `W │ H`), each
  flexing equally. This is the signature of the redesigned Transform block.
- **`InsInput`** — filled field. `icon` renders a muted glyph inside the field (X, Y, W, H,
  a rotation SVG); `suffix` renders a trailing unit (px, °, ×, %). Deferred commit (Enter
  commits, Escape reverts, commit on outside click).
- **`InsToggle` / `InsMultiSelect`** — segmented control with a sliding indicator (width /
  left computed from the active index). Replaces the old rounded-full pills.
- **`InsSelect`** — filled field with a custom chevron; **`InsSlider`** — track + accent
  progress fill + native thumb (thumb styled via `.ins-slider` in `index.css`) + numeric
  readout; **`InsColor` / `FillColorField`** — swatch inside the field + hex/value + token
  link (and eyedropper on `FillColorField`); **`InsSwitch`** — 30×18 accent toggle.
- **`iconButtonClass`** (26px, ghost→hover fill), **`insButtonClass`** (30px filled
  full-width action), **`fieldClass`** (the shared field chrome) — reuse these instead of
  re-deriving the class strings per file.
