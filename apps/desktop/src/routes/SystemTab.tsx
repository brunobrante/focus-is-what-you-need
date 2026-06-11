import { useProjectSystemDesign } from "@/application/system-design/useSystemDesign";
import { useWorkspaces } from "@/lib/storage/hooks";
import { SystemDesignEditor } from "@/system-design/SystemDesignEditor";
import type { ProjectRow } from "@/lib/storage/schema";

/**
 * A project's design system. The project's own tokens and the tokens shared by
 * its workspace are shown together in one unified list per category, each tagged
 * with its origin. Removing a shared token hides it from this project only (and
 * it can be re-added from the workspace picker). Projects with no workspace just
 * have their own tokens.
 */
export function SystemTab({ project }: { project: ProjectRow }) {
  const controller = useProjectSystemDesign(project.id);
  const { data: workspaces } = useWorkspaces();
  const workspace =
    workspaces.find((w) => w.projectIds.includes(project.id)) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {controller.hasParent && workspace ? (
        <div className="border-b border-[var(--border)] px-7 py-2.5 text-[12px] text-[var(--text-muted)]">
          This design combines{" "}
          <span className="font-medium text-[var(--text)]">{workspace.name}</span>'s
          shared tokens with this project's own. Tokens tagged{" "}
          <span className="font-medium text-[var(--text)]">WS</span> come from the
          workspace.
        </div>
      ) : null}
      <SystemDesignEditor controller={controller} workspaceName={workspace?.name} />
    </div>
  );
}
