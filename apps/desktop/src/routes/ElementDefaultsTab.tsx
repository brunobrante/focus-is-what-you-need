import { useProjectElementDefaults } from "@/application/settings/useScopedElementDefaults";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";
import { useWorkspaces } from "@/lib/storage/hooks";
import type { ProjectRow } from "@/lib/storage/schema";

/**
 * A project's element defaults. Values inherit from the workspace (or, with no
 * workspace, from Global); toggling an element to Custom overrides it for this
 * project only. New projects in a workspace inherit the workspace defaults.
 */
export function ElementDefaultsTab({ project }: { project: ProjectRow }) {
  const { inherited, override, save } = useProjectElementDefaults(project.id);
  const { data: workspaces } = useWorkspaces();
  const workspace =
    workspaces.find((w) => w.projectIds.includes(project.id)) ?? null;
  const parentLabel = workspace ? `${workspace.name} (workspace)` : "Global";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
      <ElementDefaultsEditor
        scope="project"
        inherited={inherited}
        override={override}
        parentLabel={parentLabel}
        onChange={save}
      />
    </div>
  );
}
