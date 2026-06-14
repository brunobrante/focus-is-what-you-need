import { TopBar } from "@/components/layout/TopBar";
import { useWorkspaceElementDefaults } from "@/application/settings/useScopedElementDefaults";
import { ElementDefaultsEditor } from "@/canvas/settings/ElementDefaultsEditor";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaces } from "@/lib/storage/hooks";

/**
 * Workspace-scoped element defaults. They override Global for every project in
 * the workspace; each project inherits these and can override them in turn.
 */
export function WorkspaceElementDefaultsPage() {
  const [activeId] = useActiveWorkspaceId();
  const { data: workspaces } = useWorkspaces();
  const workspaceId = activeId ?? workspaces[0]?.id ?? null;
  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
  const { inherited, override, save } = useWorkspaceElementDefaults(workspaceId);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] px-7 pb-5 pt-8">
          <h1 className="m-0 mb-1 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
            Element Defaults
          </h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            Default styles for new canvas elements in{" "}
            <span className="text-[var(--text)]">
              {workspace?.name ?? "this workspace"}
            </span>
            . These override the global defaults; each project can inherit or
            override them again.
          </p>
        </header>

        {workspaceId ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
            <ElementDefaultsEditor
              scope="workspace"
              inherited={inherited}
              override={override}
              parentLabel="Global"
              onChange={save}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-7">
            <div className="max-w-[360px] text-center text-[13px] leading-[1.6] text-[var(--text-faint)]">
              Create or select a workspace from the top-left switcher to set its
              element defaults.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default WorkspaceElementDefaultsPage;
