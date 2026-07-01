import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionBlock, EmptySlot } from "@/system-design/shared";
import { AddTokenModal, EditTokenModal } from "@/system-design/modals";
import { CategoryGrid, type AnyToken } from "./CategoryGrid";
import type { ResolvedCategory } from "@/domain/system-design/resolve";
import type { SystemDesignController } from "@/application/system-design/useSystemDesign";
import { openIconInCanvas } from "@/application/system-design/iconCanvas";
import type { SystemDesignCategory, IconToken } from "@/lib/storage/schema";
import { CATEGORY_ICON } from "@/system-design/shared";
import { CATEGORY_LABEL } from "@/domain/system-design/defaults";

export const ADD_LABEL: Record<SystemDesignCategory, string> = {
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
  hideHeader,
  addOpen: addOpenProp,
  onAddOpenChange,
}: {
  category: SystemDesignCategory;
  resolved: ResolvedCategory;
  controller: SystemDesignController;
  workspaceName?: string | null;
  onToggleLinkable: (category: SystemDesignCategory, tokenId: string, nextLinkable: boolean) => void;
  onDeleteToken: (category: SystemDesignCategory, tokenId: string) => void;
  /** Drop the section header (title + add button) when the page supplies its own. */
  hideHeader?: boolean;
  /** Controlled add-modal state; falls back to internal state when omitted. */
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}) {
  const [internalAddOpen, setInternalAddOpen] = useState(false);
  const addOpen = addOpenProp ?? internalAddOpen;
  const setAddOpen = (open: boolean) => {
    onAddOpenChange?.(open);
    if (addOpenProp === undefined) setInternalAddOpen(open);
  };
  const [editing, setEditing] = useState<AnyToken | null>(null);
  const { tokens, hasWorkspace, availableShared } = resolved;
  const navigate = useNavigate();

  // Icons only: open the token's editable vector art on the canvas (as an
  // ownerless draft component). Available on own tokens, not linked instances.
  const editIconInCanvas =
    category === "icons"
      ? (token: IconToken) => void openIconInCanvas({ token, controller, navigate })
      : undefined;

  const grid =
    tokens.length === 0 ? (
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
        onEditInCanvas={editIconInCanvas}
      />
    );

  return (
    <>
      {hideHeader ? (
        grid
      ) : (
        <SectionBlock
          title={CATEGORY_LABEL[category]}
          icon={CATEGORY_ICON[category]}
          actionLabel={ADD_LABEL[category]}
          onAction={() => setAddOpen(true)}
        >
          {grid}
        </SectionBlock>
      )}

      <AddTokenModal
        category={category}
        open={addOpen}
        hasWorkspace={hasWorkspace}
        availableShared={availableShared as AnyToken[]}
        onClose={() => setAddOpen(false)}
        onCreate={(token) => controller.upsertToken(category, token)}
        onPickShared={(id) => controller.linkToken(category, id)}
        onEditIcon={editIconInCanvas}
      />
      <EditTokenModal
        category={category}
        open={editing !== null}
        token={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(token) => controller.upsertToken(category, token)}
        onEditIcon={editIconInCanvas}
      />
    </>
  );
}
