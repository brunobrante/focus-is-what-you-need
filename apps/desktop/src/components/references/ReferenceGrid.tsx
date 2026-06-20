import { useMemo } from "react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem } from "@/lib/references/referenceItemTypes";
import { ReferenceCard } from "./ReferenceCard";

export type { ReferenceItem };

// Static, hoisted so the template literal isn't rebuilt on every render. The
// `<style>` content is identical each render, so React never re-injects the DOM.
const GRID_STYLE = `
        .reference-library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
          gap: 14px;
        }
        @media (max-width: 720px) {
          .reference-library-grid {
            grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
            gap: 10px;
          }
        }
      `;

export function ReferenceGrid({
  groups,
  references,
  allReferences,
  groupNameById,
  stackThumbnailUrls,
  selectedReferenceId,
  selectedGroupId,
  onSelectReference,
  onSelectGroup,
  onOpenLightbox,
}: {
  groups: ReferenceGroup[];
  references: ReferenceItem[];
  allReferences: ReferenceItem[];
  groupNameById: Map<string, string>;
  stackThumbnailUrls: Record<string, string>;
  selectedReferenceId: string | null;
  selectedGroupId: string | null;
  onSelectReference: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onOpenLightbox: (item: ReferenceItem) => void;
}) {
  const referencesById = useMemo(
    () => new Map(allReferences.map((item) => [item.id, item])),
    [allReferences],
  );

  return (
    <>
      <style>{GRID_STYLE}</style>
      <div className="reference-library-grid">
        {groups.map((group) => (
          <ReferenceCard
            key={group.id}
            kind="group"
            group={group}
            references={group.referenceIds
              .map((id) => referencesById.get(id))
              .filter((item): item is ReferenceItem => item != null)}
            stackThumbnailUrls={stackThumbnailUrls}
            selected={group.id === selectedGroupId}
            onSelect={() => onSelectGroup(group.id)}
          />
        ))}

        {references.map((item) => (
          <ReferenceCard
            key={item.id}
            kind="reference"
            item={item}
            groupName={item.groupId ? groupNameById.get(item.groupId) ?? null : null}
            stackThumbnailUrl={stackThumbnailUrls[item.id]}
            selected={item.id === selectedReferenceId}
            onSelect={() => {
              if (item.id === selectedReferenceId) {
                onOpenLightbox(item);
                return;
              }
              onSelectReference(item.id);
            }}
            onDoubleClick={() => onOpenLightbox(item)}
          />
        ))}
      </div>
    </>
  );
}
