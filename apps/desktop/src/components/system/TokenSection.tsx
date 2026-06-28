import { useState } from "react";
import { SectionBlock, EmptySlot } from "@/system-design/shared";
import { AddTokenModal, EditTokenModal } from "@/system-design/modals";
import { CategoryGrid, type AnyToken } from "./CategoryGrid";
import type { ResolvedCategory } from "@/domain/system-design/resolve";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import type { SystemDesignCategory } from "@/lib/storage/schema";
import { CATEGORY_ICON } from "@/system-design/shared";
import { CATEGORY_LABEL } from "@/domain/system-design/defaults";

const ADD_LABEL: Record<SystemDesignCategory, string> = {
  colors: "New color",
  gradients: "New gradient",
  typography: "Add style",
  icons: "Add icon",
  spacing: "Add token",
  radius: "Add token",
  images: "Add image",
};

const EMPTY_LABEL: Record<SystemDesignCategory, string> = {
  colors: "No colors yet",
  gradients: "No gradients yet",
  typography: "No type styles yet",
  icons: "No icons yet",
  spacing: "No spacing tokens yet",
  radius: "No radius tokens yet",
  images: "No images yet",
};

export function TokenSection({
  category,
  resolved,
  controller,
  workspaceName: _workspaceName,
  onToggleLinkable,
  onDeleteToken,
}: {
  category: SystemDesignCategory;
  resolved: ResolvedCategory;
  controller: SystemDesignController;
  workspaceName?: string | null;
  onToggleLinkable: (category: SystemDesignCategory, tokenId: string, nextLinkable: boolean) => void;
  onDeleteToken: (category: SystemDesignCategory, tokenId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AnyToken | null>(null);
  const { tokens, hasWorkspace, availableShared } = resolved;

  return (
    <>
      <SectionBlock
        title={CATEGORY_LABEL[category]}
        icon={CATEGORY_ICON[category]}
        actionLabel={ADD_LABEL[category]}
        onAction={() => setAddOpen(true)}
      >
        {tokens.length === 0 ? (
          <EmptySlot label={EMPTY_LABEL[category]} />
        ) : (
          <CategoryGrid
            category={category}
            tokens={tokens}
            scope={controller.scope}
            showSource={hasWorkspace}
            onEdit={(token) => setEditing(token)}
            onDelete={(id) => onDeleteToken(category, id)}
            onDetach={(id) => controller.detachToken(category, id)}
            onToggleLinkable={(id, linkable) => onToggleLinkable(category, id, linkable)}
          />
        )}
      </SectionBlock>

      <AddTokenModal
        category={category}
        open={addOpen}
        hasWorkspace={hasWorkspace}
        availableShared={availableShared as AnyToken[]}
        onClose={() => setAddOpen(false)}
        onCreate={(token) => controller.upsertToken(category, token)}
        onPickShared={(id) => controller.linkToken(category, id)}
      />
      <EditTokenModal
        category={category}
        open={editing !== null}
        token={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(token) => controller.upsertToken(category, token)}
      />
    </>
  );
}
