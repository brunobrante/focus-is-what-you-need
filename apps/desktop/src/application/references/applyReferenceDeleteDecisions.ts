import type { OwnerType } from "@/lib/storage/schema";
import {
  detachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";

export type ReferenceLinkDecision = {
  referenceId: string;
  ownerType: OwnerType;
  ownerId: string;
  action: "copy" | "delete";
};

/**
 * Apply the per-place keep-a-copy / delete decisions made before a library
 * reference is removed, mirroring the component (`applyInstanceDecisions`) and
 * token (`applyTokenLinkDecisions`) flows that satisfy the same product law.
 *
 * - `"copy"` detaches an independent local copy at that place (`detachReference`).
 * - `"delete"` drops the link there (`removeReferenceFromOwner`).
 *
 * Returns whether any copy was kept so the caller can preserve the underlying
 * blob on disk — detached copies resolve their image from the master blob (see
 * `detachReference`), so deleting the file would blank them out.
 */
export async function applyReferenceDeleteDecisions(
  decisions: ReferenceLinkDecision[],
): Promise<{ keptCopy: boolean }> {
  let keptCopy = false;
  for (const decision of decisions) {
    if (decision.action === "copy") {
      const copy = await detachReference(
        decision.referenceId,
        decision.ownerType,
        decision.ownerId,
      );
      if (copy) keptCopy = true;
    } else {
      await removeReferenceFromOwner(
        decision.referenceId,
        decision.ownerType,
        decision.ownerId,
      );
    }
  }
  return { keptCopy };
}
