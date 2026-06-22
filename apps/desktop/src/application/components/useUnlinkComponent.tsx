import { useCallback, useState } from "react";

import type { ComponentRow } from "@/lib/storage/schema";
import { getComponent, updateComponent } from "@/lib/storage/repos/components.repo";
import { getScreen } from "@/lib/storage/repos/screens.repo";
import { getVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import {
  applyInstanceDecisions,
  listDetailedInstanceUsages,
} from "@/lib/storage/repos/scenes.repo";
import {
  UnlinkComponentModal,
  type UnlinkDecision,
  type UnlinkItem,
} from "@/components/modals/UnlinkComponentModal";

type Pending = { componentId: string; name: string; items: UnlinkItem[] };

/**
 * Toggling a component's `linkable` state, with the unlink consequence flow:
 * turning it ON just sets the flag; turning it OFF checks for instances — if none,
 * it disables silently; if some exist, it opens a confirmation modal where each
 * placement is kept as a local copy (detach, default) or deleted, then applies the
 * choices everywhere and disables linkable. Drop `modal` into the page and call
 * `requestToggle(component)` from the card menu.
 */
export function useUnlinkComponent() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const requestToggle = useCallback(async (component: ComponentRow) => {
    // Turning ON is trivial.
    if (component.linkable !== true) {
      await updateComponent(component.id, { linkable: true });
      return;
    }

    const usages = await listDetailedInstanceUsages(new Set([component.id]));
    if (usages.length === 0) {
      await updateComponent(component.id, { linkable: false });
      return;
    }

    // Build a human label per occurrence: "Owner (version) — element".
    const variantCache = new Map<string, Awaited<ReturnType<typeof getVariant>>>();
    const items: UnlinkItem[] = [];
    for (const usage of usages) {
      let variant = variantCache.get(usage.ownerId);
      if (variant === undefined) {
        variant = await getVariant(usage.ownerId);
        variantCache.set(usage.ownerId, variant);
      }
      let where = "Unknown";
      if (variant) {
        const version = variantVersionLabel(variant);
        if (variant.ownerKind === "component") {
          const owner = await getComponent(variant.ownerId);
          where = `${owner?.name ?? "Component"} (${version})`;
        } else {
          const owner = await getScreen(variant.ownerId);
          where = `${owner?.title ?? "Screen"} (${version})`;
        }
      }
      items.push({
        key: `${usage.ownerId}:${usage.nodeId}`,
        ownerId: usage.ownerId,
        nodeId: usage.nodeId,
        label: `${where} — ${usage.nodeName}`,
      });
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
        await applyInstanceDecisions(
          [...byOwner.entries()].map(([ownerId, value]) => ({ ownerId, ...value })),
        );
        await updateComponent(pending.componentId, { linkable: false });
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [pending, busy],
  );

  const modal = (
    <UnlinkComponentModal
      open={pending !== null}
      componentName={pending?.name ?? ""}
      items={pending?.items ?? []}
      onCancel={() => (busy ? undefined : setPending(null))}
      onConfirm={(decisions) => void confirm(decisions)}
    />
  );

  return { requestToggle, modal };
}
