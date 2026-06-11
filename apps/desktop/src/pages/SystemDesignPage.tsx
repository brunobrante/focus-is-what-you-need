import { TopBar } from "@/components/layout/TopBar";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useWorkspaceSystemDesign } from "@/application/system-design/useSystemDesign";
import { SystemDesignEditor } from "@/system-design/SystemDesignEditor";

export function SystemDesignPage() {
  const controller = useWorkspaceSystemDesign();
  const { data: workspaces } = useWorkspaces();
  const workspace =
    workspaces.find((w) => w.id === controller.workspaceId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-[var(--border)] px-7 pb-5 pt-8">
          <h1 className="m-0 mb-1 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
            System Design
          </h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            The design system for{" "}
            <span className="text-[var(--text)]">
              {workspace?.name ?? "this workspace"}
            </span>
            . Its tokens are shared with the workspace's projects, which can
            inherit or override each category.
          </p>
        </header>

        {controller.workspaceId ? (
          <SystemDesignEditor
            controller={controller}
            workspaceName={workspace?.name}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-7">
            <div className="max-w-[360px] text-center text-[13px] leading-[1.6] text-[var(--text-faint)]">
              Create or select a workspace from the top-left switcher to start
              its design system.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SystemDesignPage;
