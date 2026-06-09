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
