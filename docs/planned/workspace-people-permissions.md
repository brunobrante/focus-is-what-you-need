# Workspace people & permissions

Status: planned. Extracted from `Product.md` (Workspace). When built, fold back
into `Product.md` as `[NOW]`.

## Behavior (how it must work)

A workspace is the top-level home for an organization or product line. Beyond
owning projects, components, system design, and references, it should support
**people**:

- **Invite members** to a workspace.
- **Manage permissions** — who can edit what, across the workspace's projects and
  their contents.

## Open questions (resolve when specced)

- Permission granularity: workspace-wide only, or per-project / per-screen?
- Roles (owner / editor / viewer) vs. capability flags.
- How permissions interact with loose entities — a project with no workspace has
  no workspace-level people to inherit from.
