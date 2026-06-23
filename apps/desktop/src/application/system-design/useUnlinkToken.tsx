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

type Mode = "unlink" | "delete";

type Pending = {
  mode: Mode;
  category: SystemDesignCategory;
  tokenId: string;
  tokenName: string;
  masterToken: MasterToken;
  items: UnlinkItem[];
  /** Final action once links are resolved: clear linkable (unlink) or delete master. */
  complete: () => void;
};

/**
 * Removing a workspace System Design token, link-aware — the same consequence flow
 * the canvas uses for components. When **unlinking** (turning off linkable) or
 * **deleting** a token that projects still link, a per-project confirmation opens:
 * each project keeps a local copy (detach, default) or drops the token too. With no
 * project links it runs the action silently. The only difference is the fate of the
 * master: unlink keeps it (clears its linkable flag); delete removes it afterwards.
 */
export function useUnlinkToken() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const buildItems = useCallback(
    async (category: SystemDesignCategory, token: MasterToken): Promise<UnlinkItem[]> => {
      const usages = await listTokenLinkUsages(category, token.id);
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
      return items;
    },
    [],
  );

  const requestUnlink = useCallback(
    async (input: {
      category: SystemDesignCategory;
      token: MasterToken;
      onDisable: () => void;
    }) => {
      const items = await buildItems(input.category, input.token);
      if (items.length === 0) {
        input.onDisable();
        return;
      }
      setPending({
        mode: "unlink",
        category: input.category,
        tokenId: input.token.id,
        tokenName: String(input.token.name ?? "token"),
        masterToken: input.token,
        items,
        complete: input.onDisable,
      });
    },
    [buildItems],
  );

  const requestDelete = useCallback(
    async (input: {
      category: SystemDesignCategory;
      token: MasterToken;
      onDelete: () => void;
    }) => {
      const items = await buildItems(input.category, input.token);
      if (items.length === 0) {
        input.onDelete();
        return;
      }
      setPending({
        mode: "delete",
        category: input.category,
        tokenId: input.token.id,
        tokenName: String(input.token.name ?? "token"),
        masterToken: input.token,
        items,
        complete: input.onDelete,
      });
    },
    [buildItems],
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
        pending.complete();
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [pending, busy],
  );

  const count = pending?.items.length ?? 0;
  const isDelete = pending?.mode === "delete";
  const projectsClause = count === 1 ? "1 project links" : `${count} projects link`;
  const modal = (
    <UnlinkComponentModal
      open={pending !== null}
      title={`${isDelete ? "Delete" : "Unlink"} “${pending?.tokenName ?? ""}”`}
      subtitle={
        isDelete
          ? `${projectsClause} this token. It will be deleted — choose what happens to each link. Default keeps a local copy.`
          : `${projectsClause} this token. Choose what happens to each, then confirm. Default keeps a local copy.`
      }
      items={pending?.items ?? []}
      confirmLabel={isDelete ? "Confirm & delete" : "Confirm & unlink"}
      onCancel={() => (busy ? undefined : setPending(null))}
      onConfirm={(decisions) => void confirm(decisions)}
    />
  );

  return { requestUnlink, requestDelete, modal };
}
