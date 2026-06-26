import { useCallback, useState } from "react";
import {
  UnlinkComponentModal,
  type UnlinkItem,
  type UnlinkDecision,
} from "@/components/modals/UnlinkComponentModal";
import {
  listReferenceLinkUsages,
  type ReferenceLinkUsage,
} from "@/lib/storage/repos/references.repo";
import type { OwnerType } from "@/lib/storage/schema";
import { getScreen } from "@/lib/storage/repos/screens.repo";
import { getComponent } from "@/lib/storage/repos/components.repo";
import { getProject } from "@/lib/storage/repos/projects.repo";
import {
  applyReferenceDeleteDecisions,
  type ReferenceLinkDecision,
} from "./applyReferenceDeleteDecisions";

/** Removes the library entry once the per-place decisions are applied. */
type RemoveFromLibrary = (opts?: { keepFile?: boolean }) => void;

type Pending = {
  name: string;
  items: UnlinkItem[];
  removeFromLibrary: RemoveFromLibrary;
};

// The shared modal only carries `ownerId` + `nodeId` per row; a reference place
// needs an owner *type* too, so the type is packed into the `ownerId` field and
// unpacked on confirm. Owner ids never contain this separator.
const OWNER_SEP = "::";

function packOwner(ownerType: OwnerType, ownerId: string): string {
  return `${ownerType}${OWNER_SEP}${ownerId}`;
}

function unpackOwner(value: string): { ownerType: OwnerType; ownerId: string } {
  const idx = value.indexOf(OWNER_SEP);
  return {
    ownerType: value.slice(0, idx) as OwnerType,
    ownerId: value.slice(idx + OWNER_SEP.length),
  };
}

async function placeLabel(usage: ReferenceLinkUsage): Promise<string> {
  switch (usage.ownerType) {
    case "screen": {
      const screen = await getScreen(usage.ownerId);
      return `Screen — ${screen?.title ?? usage.ownerId}`;
    }
    case "component": {
      const component = await getComponent(usage.ownerId);
      return `Component — ${component?.name ?? usage.ownerId}`;
    }
    case "project": {
      const project = await getProject(usage.ownerId);
      return `Project — ${project?.name ?? usage.ownerId}`;
    }
    default:
      return "Workspace";
  }
}

/**
 * Per-place keep-a-copy / delete flow for removing a library reference that is
 * linked elsewhere — the references counterpart of `useUnlinkComponent` /
 * `useUnlinkToken`, satisfying Product.md "Removing a linkable item that is used
 * elsewhere" for all three linkable capabilities. When the reference is not
 * linked anywhere it removes the library entry straight away.
 */
export function useDeleteReference() {
  const [pending, setPending] = useState<Pending | null>(null);

  const requestDelete = useCallback(
    async (input: { id: string; name: string; removeFromLibrary: RemoveFromLibrary }) => {
      const usages = await listReferenceLinkUsages(input.id);
      if (usages.length === 0) {
        input.removeFromLibrary();
        return;
      }
      const items: UnlinkItem[] = await Promise.all(
        usages.map(async (usage) => ({
          key: `${usage.referenceId}:${usage.ownerType}:${usage.ownerId}`,
          ownerId: packOwner(usage.ownerType, usage.ownerId),
          nodeId: usage.referenceId,
          label: await placeLabel(usage),
        })),
      );
      setPending({ name: input.name, items, removeFromLibrary: input.removeFromLibrary });
    },
    [],
  );

  const confirm = useCallback(
    async (decisions: UnlinkDecision[]) => {
      const current = pending;
      if (!current) return;
      setPending(null);
      const linkDecisions: ReferenceLinkDecision[] = decisions.map((decision) => {
        const { ownerType, ownerId } = unpackOwner(decision.ownerId);
        return { referenceId: decision.nodeId, ownerType, ownerId, action: decision.action };
      });
      const { keptCopy } = await applyReferenceDeleteDecisions(linkDecisions);
      current.removeFromLibrary({ keepFile: keptCopy });
    },
    [pending],
  );

  const count = pending?.items.length ?? 0;
  const modal = (
    <UnlinkComponentModal
      open={pending !== null}
      title={pending ? `Delete "${pending.name}"` : ""}
      subtitle={`This reference is used in ${count} ${count === 1 ? "place" : "places"}. Keep a copy or delete it in each.`}
      items={pending?.items ?? []}
      confirmLabel="Confirm & delete"
      onCancel={() => setPending(null)}
      onConfirm={(decisions) => void confirm(decisions)}
    />
  );

  return { requestDelete, modal };
}
