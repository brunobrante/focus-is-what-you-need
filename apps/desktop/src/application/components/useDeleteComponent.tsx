import { useCallback, useRef, useState } from "react";

import type { ComponentRow } from "@/lib/storage/schema";
import {
  collectComponentTreeIds,
  deleteComponentTree,
  listComponents,
} from "@/lib/storage/repos/components.repo";
import { listVariants } from "@/lib/storage/repos/variants.repo";
import { applyInstanceDecisions } from "@/lib/storage/repos/scenes.repo";
import {
  ConfirmActionModal,
  type ConfirmActionModalHandle,
} from "@/components/modals/ConfirmActionModal";
import {
  UnlinkComponentModal,
  type UnlinkDecision,
  type UnlinkItem,
} from "@/components/modals/UnlinkComponentModal";
import { buildInstanceUsageItems } from "./instanceUsageItems";

type Pending = { componentId: string; name: string; items: UnlinkItem[] };

/**
 * Deleting a component, instance-aware. If the component (or anything in its
 * subtree) is used as a linked instance elsewhere, the same per-instance copy/delete
 * modal as Unlink opens first — each placement is kept as a local copy (detach,
 * default) or deleted — and only then is the master removed. With no instances it is
 * a plain confirm. Drop `modal` into the page and call `requestDelete(component)` from
 * the card menu.
 */
export function useDeleteComponent() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

  const requestDelete = useCallback(async (component: ComponentRow) => {
    const components = await listComponents();
    const variants = await listVariants();
    const treeIds = collectComponentTreeIds(component.id, components, variants);
    const items = await buildInstanceUsageItems(treeIds);

    if (items.length === 0) {
      confirmRef.current?.open({
        title: "Delete component",
        message: `The component "${component.name}" will be removed along with its subcomponents and versions.`,
        confirmLabel: "Delete",
        onConfirm: () => deleteComponentTree(component.id),
      });
      return;
    }

    setPending({ componentId: component.id, name: component.name, items });
  }, []);

  const confirm = useCallback(
    async (decisions: UnlinkDecision[]) => {
      if (!pending || busy) return;
      setBusy(true);
      try {
        const byOwner = new Map<string, { copyNodeIds: string[]; deleteNodeIds: string[] }>();
        for (const decision of decisions) {
          const entry = byOwner.get(decision.ownerId) ?? { copyNodeIds: [], deleteNodeIds: [] };
          if (decision.action === "copy") entry.copyNodeIds.push(decision.nodeId);
          else entry.deleteNodeIds.push(decision.nodeId);
          byOwner.set(decision.ownerId, entry);
        }
        // Resolve the links FIRST (materialize copies read the master that is about
        // to be deleted), then remove the master itself.
        await applyInstanceDecisions(
          [...byOwner.entries()].map(([ownerId, value]) => ({ ownerId, ...value })),
        );
        await deleteComponentTree(pending.componentId);
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [pending, busy],
  );

  const count = pending?.items.length ?? 0;
  const modal = (
    <>
      <ConfirmActionModal ref={confirmRef} />
      <UnlinkComponentModal
        open={pending !== null}
        title={`Delete “${pending?.name ?? ""}”`}
        subtitle={`${count === 1 ? "1 instance uses" : `${count} instances use`} this component elsewhere. It will be deleted — choose what happens to each link. Default keeps a local copy.`}
        items={pending?.items ?? []}
        confirmLabel="Confirm & delete"
        onCancel={() => (busy ? undefined : setPending(null))}
        onConfirm={(decisions) => void confirm(decisions)}
      />
    </>
  );

  return { requestDelete, modal };
}
