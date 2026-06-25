import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";

/**
 * WorkspaceLayout — shared shell for all workspace-scoped pages.
 * Renders TopBar once; each sub-page renders through <Outlet />.
 * Syncs the URL :workspaceId into the active-workspace store so
 * all hooks that read useActiveWorkspaceId() continue to work.
 */
export function WorkspaceLayout() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [, setActiveWsId] = useActiveWorkspaceId();

  useEffect(() => {
    if (workspaceId) setActiveWsId(workspaceId);
  }, [workspaceId]);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />
      <Outlet />
    </div>
  );
}

export default WorkspaceLayout;
