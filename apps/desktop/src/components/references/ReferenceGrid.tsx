import { useMemo } from "react";
import { Folder, Play } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem } from "@/lib/references/referenceItemTypes";

export type { ReferenceItem };

function referenceCardThumbnailUrl(item: ReferenceItem, stackThumbnailUrl?: string | null): string {
  if (item.stack?.enabled && stackThumbnailUrl) return stackThumbnailUrl;
  return item.url;
}

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
      <style>{`
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
      `}</style>
      <div className="reference-library-grid">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
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

function GroupCard({
  group,
  references,
  stackThumbnailUrls,
  selected,
  onSelect,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  stackThumbnailUrls: Record<string, string>;
  selected: boolean;
  onSelect: () => void;
}) {
  const imageReferences = references.filter((item) => item.mediaKind === "image");
  const firstImage =
    (group.coverReferenceId
      ? imageReferences.find((item) => item.id === group.coverReferenceId)
      : null) ?? imageReferences[0] ?? null;
  const stackCount = references.filter((item) => item.stack?.enabled).length;
  const isGroup = stackCount > 1 || imageReferences.length > 1;
  const thumbnailUrl = firstImage
    ? referenceCardThumbnailUrl(firstImage, stackThumbnailUrls[firstImage.id])
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative aspect-[4/3] w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
    >
      {isGroup ? (
        <>
          <div className="pointer-events-none absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ opacity: 0.7 }} />
          <div className="pointer-events-none absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ opacity: 0.85 }} />
        </>
      ) : null}
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,box-shadow] duration-150",
          selected
            ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
            : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_22px_rgba(0,0,0,0.12)] group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]",
        ].join(" ")}
      >
        {thumbnailUrl ? (
          <div
            className="h-full w-full bg-cover bg-center bg-no-repeat bg-[var(--surface)]"
            style={{ backgroundImage: `url('${thumbnailUrl}')` }}
          />
        ) : (
          <div className="relative h-full w-full bg-[var(--bg)] text-[var(--text-muted)]">
            <Folder
              size={30}
              strokeWidth={1.5}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </div>
        )}
        {isGroup ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-[4px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.4px] text-white backdrop-blur">
            Group
          </span>
        ) : null}
        <div
          className={[
            "pointer-events-none absolute inset-0 flex items-end p-3 transition-opacity duration-150",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          ].join(" ")}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 45%)" }}
        >
          <div className="flex w-full flex-col gap-0.5 text-[11.5px] leading-[1.35] text-white">
            <span className="line-clamp-2 font-medium">{group.name}</span>
            <span className="flex items-center gap-2 text-[10.5px] tabular-nums text-white/70">
              <span>{imageReferences.length} {imageReferences.length === 1 ? "screen" : "screens"}</span>
              <span>·</span>
              <span>{stackCount} {stackCount === 1 ? "stack" : "stacks"}</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ReferenceCard({
  item,
  groupName,
  stackThumbnailUrl,
  selected,
  onSelect,
  onDoubleClick,
}: {
  item: ReferenceItem;
  groupName: string | null;
  stackThumbnailUrl?: string;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}) {
  const thumbnailUrl = referenceCardThumbnailUrl(item, stackThumbnailUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className="group aspect-[4/3] w-full cursor-zoom-in border-0 bg-transparent p-0 text-left text-inherit"
    >
      <div
        className={[
          "relative h-full w-full overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,box-shadow] duration-150",
          selected
            ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
            : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_22px_rgba(0,0,0,0.12)] group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]",
        ].join(" ")}
      >
        {item.mediaKind === "video" ? (
          <div className="relative h-full w-full">
            <video
              src={item.url}
              muted
              preload="metadata"
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] uppercase tracking-[0.4px] text-white backdrop-blur">
              <Play size={8} className="fill-white" />
              {item.type}
            </span>
          </div>
        ) : (
          <div
            className="h-full w-full bg-cover bg-center bg-no-repeat bg-[var(--surface)]"
            style={{ backgroundImage: `url('${thumbnailUrl}')` }}
          />
        )}

        {item.mediaKind === "image" ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-[4px] border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] px-1.5 py-[3px] text-[9.5px] uppercase tracking-[0.4px] text-[var(--text)] backdrop-blur">
            {item.type}
          </span>
        ) : null}

        {item.stack?.enabled ? (
          <span className="pointer-events-none absolute right-2 top-2 rounded-[4px] border border-[rgba(94,162,255,0.28)] bg-[rgba(24,72,140,0.82)] px-1.5 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.4px] text-white backdrop-blur">
            Stack
          </span>
        ) : null}

        {groupName ? (
          <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-[4px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] font-medium text-white backdrop-blur">
            {groupName}
          </span>
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 flex items-end p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 45%)" }}
        >
          <div className="flex w-full flex-col gap-0.5 text-[11.5px] leading-[1.35] text-white">
            <span className="line-clamp-2 font-medium">{item.name}</span>
            <span className="flex items-center gap-2 text-[10.5px] tabular-nums text-white/70">
              {item.w && item.h ? <span>{item.w} × {item.h}</span> : null}
              {item.w && item.h && <span>·</span>}
              <span>{item.size || 0} KB</span>
              {item.duration ? <><span>·</span><span>{item.duration}s</span></> : null}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
