import { IconDiamond, IconFolder, IconGrid, IconScreen } from "@/components/icons";
import { type ComponentScope } from "@/lib/storage/defaults";
import { componentScopeOf } from "@/application/graph/componentOwnership";
import type { ComponentRow } from "@/lib/storage/schema";

/**
 * Shared source/origin presentation for component cards. A component is owned by
 * exactly one of: a screen, a project (project-global), a workspace
 * (workspace-global), or a parent component (nested) — derived by
 * `componentScope`. Each scope gets a distinct icon so the card communicates
 * where the component comes from without a text label.
 */

export const SOURCE_SCOPE_LABEL: Record<ComponentScope, string> = {
  screen: "Screen",
  project: "Project",
  workspace: "Workspace",
  nested: "Component",
};

type ScopeSource = Pick<ComponentRow, "id" | "workspaceId" | "projectId">;

export function scopeOf(component: ScopeSource): ComponentScope {
  return componentScopeOf(component);
}

export function sourceScopeIcon(
  scope: ComponentScope,
  props: { size?: number; strokeWidth?: number; className?: string } = {},
) {
  const p = { size: 11, strokeWidth: 1.7, ...props };
  switch (scope) {
    case "screen":
      return <IconScreen {...p} />;
    case "workspace":
      return <IconGrid {...p} />;
    case "nested":
      return <IconDiamond {...p} />;
    case "project":
    default:
      return <IconFolder {...p} />;
  }
}

/**
 * Source icon pinned to a card's upper-right corner (inside the preview box).
 * Presentational only — pass `onMouse*`/children via the wrapper at the call
 * site when a hover menu is needed (project Components tab). Subcomponent cards
 * use it as a plain indicator with a native tooltip.
 */
export function CardSourceIcon({
  scope,
  title,
  className,
}: {
  scope: ComponentScope;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title ?? SOURCE_SCOPE_LABEL[scope]}
      className={[
        "pointer-events-none absolute right-2 top-2 z-[1] grid h-[22px] w-[22px] place-items-center rounded-md border border-[var(--border)] bg-[rgba(20,20,20,0.85)] text-[var(--text-muted)] backdrop-blur-sm",
        className ?? "",
      ].join(" ")}
    >
      {sourceScopeIcon(scope, { size: 11, strokeWidth: 1.7 })}
    </span>
  );
}
