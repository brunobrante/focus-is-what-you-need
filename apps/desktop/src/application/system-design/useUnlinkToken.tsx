import { useCallback, useState } from "react";

import type { SystemDesignCategory } from "@/lib/storage/schema";
import { getProject } from "@/lib/storage/repos/projects.repo";
import {
  applyTokenLinkDecisions,
  listTokenLinkUsages,
} from "@/lib/storage/repos/systemDesigns.repo";
import {
  UnlinkComponentModal,
  type UnlinkDecision,
  type UnlinkItem,
} from "@/components/modals/UnlinkComponentModal";

type MasterToken = { id: string; name?: string } & Record<string, unknown>;

type Pending = {
  category: SystemDesignCategory;
  tokenId: string;
  tokenName: string;
  masterToken: MasterToken;
  items: UnlinkItem[];
  onDisable: () => void;
};

/**
 * Unlinking a workspace System Design token: if no project links it, disable
 * silently; otherwise open a confirmation listing every project that links it,
 * each with copy (detach into a local project token, default) or delete. On
 * confirm it applies each choice across the project designs, then calls
 * `onDisable` to clear the token's linkable flag. Mirrors the component unlink.
 */
export function useUnlinkToken() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const requestUnlink = useCallback(
    async (input: {
      category: SystemDesignCategory;
      token: MasterToken;
      onDisable: () => void;
    }) => {
      const { category, token, onDisable } = input;
      const usages = await listTokenLinkUsages(category, token.id);
      if (usages.length === 0) {
        onDisable();
        return;
      }
      const items: UnlinkItem[] = [];
      for (const usage of usages) {
        const project = await getProject(usage.projectId);
        items.push({
          key: usage.designId,
          ownerId: usage.designId,
          nodeId: token.id,
          label: project?.name ?? "Project",
        });
      }
      setPending({
        category,
        tokenId: token.id,
        tokenName: String(token.name ?? "token"),
        masterToken: token,
        items,
        onDisable,
      });
    },
    [],
  );

  const confirm = useCallback(
    async (decisions: UnlinkDecision[]) => {
      if (!pending || busy) return;
      setBusy(true);
      try {
        await applyTokenLinkDecisions(
          pending.category,
          pending.tokenId,
          pending.masterToken,
          decisions.map((d) => ({ designId: d.ownerId, action: d.action })),
        );
        pending.onDisable();
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [pending, busy],
  );

  const count = pending?.items.length ?? 0;
  const modal = (
    <UnlinkComponentModal
      open={pending !== null}
      title={`Unlink “${pending?.tokenName ?? ""}”`}
      subtitle={`${count === 1 ? "1 project links" : `${count} projects link`} this token. Choose what happens to each, then confirm. Default keeps a local copy.`}
      items={pending?.items ?? []}
      onCancel={() => (busy ? undefined : setPending(null))}
      onConfirm={(decisions) => void confirm(decisions)}
    />
  );

  return { requestUnlink, modal };
}
