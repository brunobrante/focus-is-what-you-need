import { useParams } from "react-router-dom";
import { ScreenContent } from "./detail/ScreenContent";
import { ComponentContent } from "./detail/ComponentContent";

// ── Router ────────────────────────────────────────────────────────────────────

export function DetailPage() {
  const { projectId = "", screenId, componentId, workspaceId } = useParams<{
    projectId: string;
    screenId?: string;
    componentId?: string;
    workspaceId?: string;
  }>();

  if (screenId) return <ScreenContent projectId={projectId} screenId={screenId} workspaceId={workspaceId} />;
  if (componentId) return <ComponentContent componentId={componentId} workspaceId={workspaceId} />;
  return null;
}

export default DetailPage;
