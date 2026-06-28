# Component Templates

## What it is

A library of pre-built, ready-to-use UI templates (buttons, inputs, modals, headers, cards, etc.) that the user can drop into any component or screen without building from scratch. Templates cover the most common UX patterns so starting a project has a real baseline immediately.

Templates are **not** shared components or linked instances — they are a separate concept. Placing a template is a one-time copy: once placed, it becomes a regular owned component with no link back to any master. There is no linkable/detach lifecycle here.

## The library

- Shipped with the app (offline-first), covering common patterns: buttons, inputs, checkboxes, toggles, modals, headers, navbars, cards, empty states, etc.
- Potentially expandable with community or user-saved templates in the future
- Browsable by category from a panel in the canvas or from the project view

## Placing a template

The user picks a template from the library and drops it into the open frame. It lands as a regular component tree owned by the current screen/component — editable immediately, no ceremony.

## Apply System Design

After placing a template (or at any point while editing it), an **"Apply System Design"** button runs an algorithm that reads the current project's (or workspace's) system design tokens and maps them onto the template:

- Colors → replaces template defaults with the project's color tokens (primary, surface, text, etc.)
- Typography → maps font family, size, and weight tokens
- Radius → applies the project's corner radius tokens
- Spacing → adjusts gaps and padding to match the project's spacing scale

The mapping is heuristic — it applies what it can infer and leaves the rest untouched. The user can re-run it or undo it.

This button is also useful on hand-built components, not only on templates.

## What it does not do

- Does not auto-apply system design on drop — always a deliberate action
- Does not keep a link to the template source after placement
- Does not replace the canvas workflow — it is an entry point, not a constraint
