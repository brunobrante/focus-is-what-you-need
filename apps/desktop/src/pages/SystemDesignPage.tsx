import { useState } from "react";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useWorkspaceSystemDesign } from "@/application/system-design/useSystemDesign";
import { useUnlinkToken } from "@/application/system-design/useUnlinkToken";
import { SystemDesignSidebar } from "@/components/system/SystemDesignSidebar";
import { TokenSection } from "@/components/system/TokenSection";
import type { SystemDesignCategory } from "@/lib/storage/schema";

export function SystemDesignPage() {
  const controller = useWorkspaceSystemDesign();
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.id === controller.workspaceId) ?? null;
  const [activeCategory, setActiveCategory] = useState<SystemDesignCategory>("colors");
  const { requestUnlink, requestDelete, modal: unlinkTokenModal } = useUnlinkToken();

  const handleToggleLinkable = (
    category: SystemDesignCategory,
    tokenId: string,
    nextLinkable: boolean,
  ) => {
    if (nextLinkable) {
      controller.setTokenLinkable(category, tokenId, true);
      return;
    }
    const token = (controller.design?.tokens[category] as { id: string }[] | undefined)?.find(
      (t) => t.id === tokenId,
    );
    const disable = () => controller.setTokenLinkable(category, tokenId, false);
    if (!token) { disable(); return; }
    void requestUnlink({ category, token, onDisable: disable });
  };

  const handleDeleteToken = (category: SystemDesignCategory, tokenId: string) => {
    const remove = () => controller.deleteToken(category, tokenId);
    const token = (controller.design?.tokens[category] as { id: string }[] | undefined)?.find(
      (t) => t.id === tokenId,
    );
    if (!token) { remove(); return; }
    void requestDelete({ category, token, onDelete: remove });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-[var(--border)] px-7 pb-5 pt-8">
        <h1 className="m-0 mb-1 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
          System Design
        </h1>
        <p className="m-0 text-[13px] text-[var(--text-muted)]">
          The design system for{" "}
          <span className="text-[var(--text)]">{workspace?.name ?? "this workspace"}</span>
          . Its tokens are shared with the workspace's projects, which can inherit or override each
          category.
        </p>
      </header>

      {controller.workspaceId && controller.resolved ? (
        <>
          <div className="flex min-h-0 flex-1">
            <SystemDesignSidebar activeCategory={activeCategory} onSelect={setActiveCategory} />
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
          {unlinkTokenModal}
        </>
      ) : !controller.workspaceId ? (
        <div className="flex flex-1 items-center justify-center px-7">
          <div className="max-w-[360px] text-center text-[13px] leading-[1.6] text-[var(--text-faint)]">
            Create or select a workspace from the top-left switcher to start its design system.
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SystemDesignPage;
