import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProjectSystemDesign } from "@/application/system-design/useSystemDesign";
import { useWorkspaces } from "@/lib/storage/hooks";
import { SystemDesignEditor } from "@/system-design/SystemDesignEditor";
import { projectBase } from "@/lib/navigation/projectUrl";
import { SYSTEM_DESIGN_CATEGORIES } from "@/domain/system-design/defaults";
import type { SystemDesignCategory } from "@/lib/storage/schema";
import type { ProjectRow } from "@/lib/storage/schema";

export function SystemTab({ project }: { project: ProjectRow }) {
  const { workspaceId, systemCategory } = useParams<{ workspaceId?: string; systemCategory?: string }>();
  const navigate = useNavigate();
  const controller = useProjectSystemDesign(project.id);
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.projectIds.includes(project.id)) ?? null;

  const systemBase = `${projectBase(project.id, workspaceId)}/system`;
  const activeCategory: SystemDesignCategory =
    SYSTEM_DESIGN_CATEGORIES.includes(systemCategory as SystemDesignCategory)
      ? (systemCategory as SystemDesignCategory)
      : "colors";

  useEffect(() => {
    if (!systemCategory) {
      navigate(`${systemBase}/colors`, { replace: true });
    }
  }, [systemCategory, systemBase, navigate]);

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
      <SystemDesignEditor
        controller={controller}
        workspaceName={workspace?.name}
        category={activeCategory}
        systemBase={systemBase}
      />
    </div>
  );
}
