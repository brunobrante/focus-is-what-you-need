# my-desktop-app

Monorepo desktop app built with Bun, Tauri v2, React 19, TailwindCSS v4,
shadcn/ui, and React Router v7.

## Product intent

The detailed product vision, mock hierarchy rules, preview behavior, and reusable prompt for future chats live in [AGENTS.md](./AGENTS.md).

## Architecture

```
apps/
  desktop/     — Tauri + React desktop app
packages/
  ui/          — Shared shadcn/ui components
  config/      — Shared tsconfig and Tailwind config
  types/       — Shared TypeScript types
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)
- Tauri prerequisites for your OS: https://tauri.app/start/prerequisites/

## Getting started

```bash
bun install

# Vite only (no Rust required)
cd apps/desktop && bun run dev

# Full Tauri desktop app
cd apps/desktop && bunx tauri dev
```

## Build

```bash
cd apps/desktop
bunx tauri build
```

## TypeScript check

```bash
cd apps/desktop
bun run typecheck
```

## Routes

| Path      | Description                      |
| --------- | -------------------------------- |
| `/`       | Home — tech stack overview       |
| `/canvas` | Canvas — HTML/CSS focused editor |

## Canvas Architecture

The Canvas route renders editable HTML/CSS nodes directly in the DOM. Scene
data is stored as a flat list of nodes with parent IDs, real bounds, HTML tag,
CSS class/id, and editable visual properties. Snapshots are still saved as card
images for gallery previews.

`@open-pencil/core` remains installed for future conversion work, but it is no
longer the runtime used by the editor canvas.
