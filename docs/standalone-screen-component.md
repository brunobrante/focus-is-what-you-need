# Standalone screen / component (no project or workspace)

Status: **shipped** — implemented as **Drafts**. A draft is a `ComponentRow` with
all scope owners null (`workspaceId`, `projectId`, `screenId`, `parentVariantId`)
plus `draftKind: "screen" | "component"`. Lives at the `/drafts` route
(`DraftsPage.tsx`), created via `useNewDraft.ts`. Fold behavior back into
`Product.md` as `[NOW]`.

## Today (loose entities that already work)

The containment hierarchy (Workspace → Project → Screen → Component) is the
default home, not a hard requirement at every level. Already supported:

- **Projects without a workspace** — a project can live on its own.
- **References without any attachment** — the global library holds references
  attached to nothing.

## Behavior (how it must work)

- **Create a standalone Screen or Component directly** — with no project (and no
  workspace) above it.

## Invariant to preserve

When an entity is loose, it simply **loses the capabilities it would have
inherited** from a parent scope (e.g. no project/workspace tokens to link) — but
it is otherwise a normal entity. A standalone screen/component must still obey
every `[LAW]`: hierarchy below it is preserved, components still form
automatically, and editing still happens inside the frame in isolation.
