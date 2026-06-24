import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { References } from "@/routes/references/References";

/**
 * A workspace's references: the same library body rendered inside the workspace
 * chrome (the workspace TopBar). The workspace comes from the route, so a deep
 * link selects the right one; we sync it into the active-workspace state the
 * TopBar and the rest of the workspace nav read from.
 */
export function WorkspaceReferencesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [activeId, setActiveId] = useActiveWorkspaceId();

  useEffect(() => {
    if (workspaceId && workspaceId !== activeId) setActiveId(workspaceId);
  }, [workspaceId, activeId, setActiveId]);

  return <References header={<TopBar />} />;
}

export default WorkspaceReferencesPage;
