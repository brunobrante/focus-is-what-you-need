import { useCallback, useRef, useState } from "react";

import {
  ConfirmActionModal,
  type ConfirmActionModalHandle,
} from "@/components/modals/ConfirmActionModal";
import { InstanceDeleteModal } from "@/components/modals/InstanceDeleteModal";
import type { InstanceDeleteStrategy } from "@/lib/storage/repos/components.repo";
import {
  countVariantInstanceUsages,
  deleteVariant,
} from "@/lib/storage/repos/variants.repo";

type Pending = { variantId: string; entityName: string; usageCount: number };

/**
 * Deleting a version (variant), instance-aware. If the version owns components
 * that are placed as linked instances elsewhere, the detach-all / cascade choice
 * opens first (Product.md Law 5) and the chosen strategy is applied before the
 * masters are removed — mirroring the screen-master delete flow. With no external
 * instances it is a plain confirm. Drop `modal` into the page and call
 * `requestDeleteVariant(...)` from the version switcher. Serves both screen and
 * component masters (a variant is a version of either).
 */
export function useDeleteVariant() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

  const requestDeleteVariant = useCallback(
    async (input: { variantId: string; label: string; ownerName: string }) => {
      const usageCount = await countVariantInstanceUsages(input.variantId);
      if (usageCount === 0) {
        confirmRef.current?.open({
          title: "Delete version",
          message: `Version "${input.label}" of "${input.ownerName}" will be removed.`,
          confirmLabel: "Delete",
          // deleteVariant switches the master's active variant to a sibling if needed.
          onConfirm: () => deleteVariant(input.variantId),
        });
        return;
      }
      setPending({
        variantId: input.variantId,
        entityName: `${input.ownerName} ${input.label}`.trim(),
        usageCount,
      });
    },
    [],
  );

  const resolve = useCallback(
    async (strategy: InstanceDeleteStrategy) => {
      if (!pending || busy) return;
      setBusy(true);
      try {
        await deleteVariant(pending.variantId, { instanceStrategy: strategy });
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [pending, busy],
  );

  const modal = (
    <>
      <ConfirmActionModal ref={confirmRef} />
      <InstanceDeleteModal
        open={pending !== null}
        entityName={pending?.entityName ?? ""}
        usageCount={pending?.usageCount ?? 0}
        onCancel={() => (busy ? undefined : setPending(null))}
        onDetachAll={() => void resolve("detach")}
        onCascade={() => void resolve("cascade")}
      />
    </>
  );

  return { requestDeleteVariant, modal };
}
