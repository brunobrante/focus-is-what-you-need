import type { ReferenceRow } from "@/lib/storage/schema";
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import { ReferenceThumbCard } from "./ReferenceThumbCard";

/**
 * Reference card bound to a `ReferenceRow`. Resolves the row's image through
 * `useReferenceRowImage` (baked thumbnail, else the blob-store original — which
 * also recovers large/orphaned rows) and derives the standard subtitle and stack
 * badge, then renders the presentational `ReferenceThumbCard`.
 *
 * Use this anywhere a `ReferenceRow` needs a card (canvas references window,
 * screen/component side tab, …) so image resolution stays identical everywhere
 * and there is one place to evolve it.
 */
export function ReferenceRowCard({
  reference,
  selected,
  onClick,
  onRemove,
}: {
  reference: ReferenceRow;
  selected?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const thumbnailUrl = useReferenceRowImage(reference);
  return (
    <ReferenceThumbCard
      thumbnailUrl={thumbnailUrl}
      title={reference.title}
      subtitle={
        reference.stackNodeId ? reference.stackNodeName ?? reference.source : reference.source
      }
      badge={!reference.stackNodeId && reference.stack?.enabled ? "Stack" : undefined}
      selected={selected}
      onClick={onClick}
      onRemove={onRemove}
    />
  );
}
