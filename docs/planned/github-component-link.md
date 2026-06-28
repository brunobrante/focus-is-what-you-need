# GitHub Component Link

## What it is

Each component can be linked to one or more files in a GitHub repository. This creates a direct bridge between the design component and its real implementation code — making it easy to find, navigate, and eventually synchronize design changes into code.

## The link

On any component (or screen), the user can attach GitHub file references:

- Repository + branch
- One or more file paths inside that repo (e.g. `src/components/Button.tsx`, `src/components/Button.css`)

The link is stored as metadata on the component. It is not a sync state — just a pointer.

## Design → Code ("Update Code")

An **"Update Code"** button on the component sends the current UX/UI state of that component to an AI (Claude via MCP, or Codex) with the linked files as context. The AI writes the necessary code changes and opens a pull request (or commits directly to the branch, per user preference).

The prompt context includes:
- The component's visual structure and properties
- The currently linked files (fetched from GitHub)
- The instruction to update only what is visually different

This is scoped to the specific component — not the whole project.

## Code → Design (future direction)

The reverse flow: detect changes in the linked files (via webhook or manual trigger) and surface a diff on the component card, letting the user decide whether to pull those changes into the design.

## Where it lives in the UI

- Component detail view: a **"Code"** tab or section listing linked files, with add/remove controls and a link to open each file on GitHub
- **"Update Code"** button visible when at least one file is linked
- Workspace/project settings: connect a GitHub account and set a default repository

## What it does not do

- Does not auto-sync on every save — always user-triggered
- Does not replace the canvas or change how components are built
- Does not link screens (only components, since screens map to full pages/routes, which is a different and more complex mapping)
