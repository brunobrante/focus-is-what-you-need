import { useParams } from "react-router-dom";
import { ScreenContent } from "./detail/ScreenContent";
import { ComponentContent } from "./detail/ComponentContent";

// ── Router ────────────────────────────────────────────────────────────────────

export function DetailPage() {
  const { projectId = "", screenId, componentId } = useParams<{
    projectId: string;
    screenId?: string;
    componentId?: string;
  }>();

  if (screenId) return <ScreenContent projectId={projectId} screenId={screenId} />;
  if (componentId) return <ComponentContent componentId={componentId} />;
  return null;
}

export default DetailPage;
