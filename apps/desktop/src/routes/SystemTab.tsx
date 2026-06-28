import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProjectSystemDesign } from "@/application/system-design/useSystemDesign";
import { useWorkspaces } from "@/lib/storage/hooks";
import { SystemDesignSidebar } from "@/components/system/SystemDesignSidebar";
import { TokenSection } from "@/components/system/TokenSection";
import { projectBase } from "@/lib/navigation/projectUrl";
import { SYSTEM_DESIGN_CATEGORIES } from "@/domain/system-design/defaults";
import type { SystemDesignCategory } from "@/lib/storage/schema";
import type { ProjectRow } from "@/lib/storage/schema";

export function SystemTab({ project }: { project: ProjectRow }) {
  const { workspaceId, systemCategory } = useParams<{
    workspaceId?: string;
    systemCategory?: string;
  }>();
  const navigate = useNavigate();
  const controller = useProjectSystemDesign(project.id);
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.projectIds.includes(project.id)) ?? null;
  const systemBase = `${projectBase(project.id, workspaceId)}/system`;
  const activeCategory: SystemDesignCategory = SYSTEM_DESIGN_CATEGORIES.includes(
    systemCategory as SystemDesignCategory,
  )
    ? (systemCategory as SystemDesignCategory)
    : "colors";

  useEffect(() => {
    if (!systemCategory) {
      navigate(`${systemBase}/colors`, { replace: true });
    }
  }, [systemCategory, systemBase, navigate]);

  const handleToggleLinkable = (
    _category: SystemDesignCategory,
    _tokenId: string,
    _nextLinkable: boolean,
  ) => {
    // Project tokens are not linkable — this action only appears in workspace scope
  };

  const handleDeleteToken = (category: SystemDesignCategory, tokenId: string) => {
    controller.deleteToken(category, tokenId);
  };

  if (!controller.resolved) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <SystemDesignSidebar activeCategory={activeCategory} systemBase={systemBase} />
        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-8 py-8">
            <TokenSection
              category={activeCategory}
              resolved={controller.resolved[activeCategory]}
              controller={controller}
              workspaceName={workspace?.name}
              onToggleLinkable={handleToggleLinkable}
              onDeleteToken={handleDeleteToken}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
