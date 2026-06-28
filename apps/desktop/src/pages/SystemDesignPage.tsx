import { useState } from "react";
import { useWorkspaces } from "@/lib/storage/hooks";
import { useWorkspaceSystemDesign } from "@/application/system-design/useSystemDesign";
import { useUnlinkToken } from "@/application/system-design/useUnlinkToken";
import { TokenSection } from "@/components/system/TokenSection";
import { CATEGORY_ICON } from "@/system-design/shared";
import { SYSTEM_DESIGN_CATEGORIES, CATEGORY_LABEL } from "@/domain/system-design/defaults";
import { PageFooter } from "@/components/layout/PageFooter";
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

  if (!controller.workspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-7">
        <div className="max-w-[360px] text-center text-[13px] leading-[1.6] text-[var(--text-faint)]">
          Create or select a workspace from the top-left switcher to start its design system.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1000px] px-8 pb-20 pt-8">
          <header className="mb-6">
            <h1 className="m-0 mb-1 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
              System Design
            </h1>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">
              The design system for{" "}
              <span className="font-medium text-[var(--text)]">{workspace?.name ?? "this workspace"}</span>
              . Its tokens are shared with the workspace's projects, which can inherit or override
              each category.
            </p>
          </header>

          <nav className="mb-8 -mx-1 flex items-center gap-0.5">
            {SYSTEM_DESIGN_CATEGORIES.map((category) => {
              const isActive = category === activeCategory;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={[
                    "relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border-0 px-3 text-[13px] font-medium tracking-[0.1px] transition-colors duration-[120ms]",
                    isActive
                      ? "bg-[var(--surface)] text-[var(--text)]"
                      : "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  <span className={isActive ? "opacity-80" : "opacity-50"}>
                    {CATEGORY_ICON[category]}
                  </span>
                  {CATEGORY_LABEL[category]}
                </button>
              );
            })}
          </nav>

          {controller.resolved ? (
            <TokenSection
              category={activeCategory}
              resolved={controller.resolved[activeCategory]}
              controller={controller}
              workspaceName={workspace?.name}
              onToggleLinkable={handleToggleLinkable}
              onDeleteToken={handleDeleteToken}
            />
          ) : null}
        </div>
      </div>

      <PageFooter />
      {unlinkTokenModal}
    </div>
  );
}

export default SystemDesignPage;
