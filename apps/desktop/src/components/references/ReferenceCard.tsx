import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import { CardMenuIcons, CardMoreMenu } from "@/components/screen/CardMenu";
import { IconEye, IconImage, IconTrash } from "@/components/icons";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceItem } from "@/lib/references/referenceItemTypes";
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import type { ComponentRow, ReferenceRow, ScreenRow } from "@/lib/storage/schema";
import { useReferenceUrl } from "@/routes/references/hooks/useReferenceUrl";
import { formatDuration, formatSize } from "@/routes/references/lib/utils";

// ─── Public types ────────────────────────────────────────────────────────────

type ReferenceItemKind = {
  kind: "reference";
  item: ReferenceItem;
  stackThumbnailUrl?: string;
  groupName?: string | null;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
};

type GroupKind = {
  kind: "group";
  group: ReferenceGroup;
  references: ReferenceItem[];
  stackThumbnailUrls: Record<string, string>;
  selected: boolean;
  onSelect: () => void;
};

type RowKind = {
  kind: "row";
  reference: ReferenceRow;
  selected?: boolean;
  onClick: () => void;
  onRemove?: () => void;
};

type ProjectKind = {
  kind: "project";
  reference: ReferenceRow;
  attachments: ReferenceRow["attachments"];
  screenById: Map<string, ScreenRow>;
  componentById: Map<string, ComponentRow>;
  onOpen?: () => void;
  onRemove: () => void;
};

type StackRootKind = {
  kind: "stack-root";
  thumbnailUrl?: string | null;
  title: string;
  badge?: string;
  onClick: () => void;
};

export type ReferenceCardProps =
  | ReferenceItemKind
  | GroupKind
  | RowKind
  | ProjectKind
  | StackRootKind;

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export function ReferenceCard(props: ReferenceCardProps) {
  switch (props.kind) {
    case "reference": return <ItemCard {...props} />;
    case "group":     return <GroupCard {...props} />;
    case "row":       return <RowCard {...props} />;
    case "project":   return <ProjectCard {...props} />;
    case "stack-root": return <StackRootCard {...props} />;
  }
}

// ─── Kind: reference (single item in the grid) ───────────────────────────────

function ItemCard({ item, stackThumbnailUrl, groupName, selected, onSelect, onDoubleClick }: ReferenceItemKind) {
  const stackThumb = item.stack?.enabled ? stackThumbnailUrl : undefined;
  const { url, setRef } = useReferenceUrl(item, { enabled: !stackThumb });
  const thumbnailUrl = stackThumb ?? url;
  const screenCount = item.stack?.rootCount ?? 1;
  const isMultiScreen = item.mediaKind === "image" && screenCount > 1;

  const badges: BadgeItem[] = [];
  if (isMultiScreen) {
    badges.push({ text: "Group", position: "top-left", variant: "overlay" });
  } else if (item.mediaKind === "image") {
    badges.push({ text: item.type, position: "top-left", variant: "type" });
  }
  if (!isMultiScreen && item.stack?.enabled) {
    badges.push({ text: "Stack", position: "top-right", variant: "blue" });
  }
  if (groupName) {
    badges.push({ text: groupName, position: "bottom-left", variant: "overlay" });
  }

  const subtitleParts: string[] = [];
  if (isMultiScreen) {
    subtitleParts.push(`${screenCount} screens`);
  } else {
    if (item.w && item.h) subtitleParts.push(`${item.w} × ${item.h}`);
    subtitleParts.push(formatSize(item.size || 0));
    if (item.duration) subtitleParts.push(formatDuration(item.duration));
  }

  return (
    <CardShell
      containerRef={setRef}
      thumbnailUrl={item.mediaKind !== "video" ? thumbnailUrl || null : null}
      videoSrc={item.mediaKind === "video" ? url || null : null}
      videoTypeBadge={item.mediaKind === "video" ? item.type : undefined}
      selected={selected}
      stackedLayers={isMultiScreen}
      cursor="zoom-in"
      badges={badges}
      title={item.name}
      subtitle={subtitleParts.join(" · ")}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    />
  );
}

// ─── Kind: group (group card in the grid) ────────────────────────────────────

function GroupCard({ group, references, stackThumbnailUrls, selected, onSelect }: GroupKind) {
  const imageReferences = references.filter((item) => item.mediaKind === "image");
  const firstImage =
    (group.coverReferenceId
      ? imageReferences.find((item) => item.id === group.coverReferenceId)
      : null) ?? imageReferences[0] ?? null;
  const stackCount = references.filter((item) => item.stack?.enabled).length;
  const isGroup = stackCount > 1 || imageReferences.length > 1;
  const coverStackThumb = firstImage?.stack?.enabled ? stackThumbnailUrls[firstImage.id] : undefined;
  const { url: coverUrl, setRef } = useReferenceUrl(firstImage, {
    enabled: Boolean(firstImage) && !coverStackThumb,
  });
  const thumbnailUrl = firstImage ? coverStackThumb ?? coverUrl : null;
  const subtitle = `${imageReferences.length} ${imageReferences.length === 1 ? "screen" : "screens"} · ${stackCount} ${stackCount === 1 ? "stack" : "stacks"}`;

  return (
    <CardShell
      containerRef={setRef}
      thumbnailUrl={thumbnailUrl || null}
      selected={selected}
      stackedLayers={isGroup}
      emptyIcon="folder"
      badges={isGroup ? [{ text: "Group", position: "top-left", variant: "overlay" }] : undefined}
      title={group.name}
      subtitle={subtitle}
      onClick={onSelect}
    />
  );
}

// ─── Kind: row (compact card in side panel / canvas window) ──────────────────

function RowCard({ reference, selected, onClick, onRemove }: RowKind) {
  const { url, setRef } = useReferenceRowImage(reference);
  const badge = !reference.stackNodeId && reference.stack?.enabled ? "Stack" : undefined;
  const subtitle = reference.stackNodeId
    ? reference.stackNodeName ?? reference.source
    : reference.source;

  return (
    <CardShell
      containerRef={setRef}
      thumbnailUrl={url}
      emptyTitle={reference.title}
      title={reference.title}
      subtitle={subtitle}
      badges={badge ? [{ text: badge, position: onRemove ? "top-left" : "top-right", variant: "overlay" }] : undefined}
      selected={selected}
      cursor="zoom-in"
      onRemove={onRemove}
      onClick={onClick}
    />
  );
}

// ─── Kind: project (project gallery grid card) ───────────────────────────────

function ProjectCard({ reference, attachments, screenById, componentById, onOpen, onRemove }: ProjectKind) {
  const { url, setRef } = useReferenceRowImage(reference);
  const labels = projectLabelSet(attachments, screenById, componentById);
  const primaryLabels = labels.slice(0, 2);

  return (
    <CardShell
      containerRef={setRef}
      thumbnailUrl={url}
      cursor="default"
      emptyTitle={reference.title}
      title={reference.title}
      hoverTopSlot={
        <div className="flex flex-wrap gap-1.5">
          <ProjectBadge>{reference.visibility === "external" ? "External" : "Local"}</ProjectBadge>
          {reference.stack?.enabled ? <ProjectBadge>Stack</ProjectBadge> : null}
          {primaryLabels.map((label) => <ProjectBadge key={label}>{label}</ProjectBadge>)}
          {labels.length > primaryLabels.length ? (
            <ProjectBadge>{`+${labels.length - primaryLabels.length}`}</ProjectBadge>
          ) : null}
        </div>
      }
      topLeftAction={
        onOpen ? (
          <button
            type="button"
            aria-label="Open reference"
            onClick={onOpen}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-white/15 bg-black/70 text-white/80 opacity-0 backdrop-blur transition-[opacity,background-color,color] duration-150 hover:bg-black/90 hover:text-white group-hover:opacity-100"
          >
            <IconEye size={13} strokeWidth={1.7} />
          </button>
        ) : undefined
      }
      cardSlot={
        <CardMoreMenu
          label="More reference actions"
          items={[{
            key: "delete",
            label: "Remove from project",
            icon: CardMenuIcons.Trash,
            destructive: true,
            onClick: onRemove,
          }]}
        />
      }
    />
  );
}

// ─── Kind: stack-root (pre-resolved URL, e.g. stack gallery in detail modal) ─

function StackRootCard({ thumbnailUrl, title, badge, onClick }: StackRootKind) {
  return (
    <CardShell
      thumbnailUrl={thumbnailUrl}
      emptyTitle={title}
      title={title}
      badges={badge ? [{ text: badge, position: "top-right", variant: "overlay" }] : undefined}
      cursor="zoom-in"
      onClick={onClick}
    />
  );
}

// ─── Shared visual shell ──────────────────────────────────────────────────────

type BadgeItem = {
  text: string;
  position: "top-left" | "top-right" | "bottom-left";
  variant?: "type" | "overlay" | "blue";
};

type CardShellProps = {
  thumbnailUrl?: string | null;
  videoSrc?: string | null;
  videoTypeBadge?: string;
  selected?: boolean;
  stackedLayers?: boolean;
  cursor?: "zoom-in" | "pointer" | "default";
  badges?: BadgeItem[];
  title?: string;
  subtitle?: string;
  hoverTopSlot?: ReactNode;
  emptyIcon?: "image" | "folder";
  emptyTitle?: string;
  containerRef?: (el: Element | null) => void;
  topLeftAction?: ReactNode;
  onRemove?: () => void;
  cardSlot?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function CardShell({
  thumbnailUrl,
  videoSrc,
  videoTypeBadge,
  selected = false,
  stackedLayers = false,
  cursor = "pointer",
  badges,
  title,
  subtitle,
  hoverTopSlot,
  emptyIcon = "image",
  emptyTitle,
  containerRef,
  topLeftAction,
  onRemove,
  cardSlot,
  footer,
  onClick,
  onDoubleClick,
}: CardShellProps) {
  const cursorClass =
    cursor === "zoom-in" ? "cursor-zoom-in" : cursor === "default" ? "cursor-default" : "cursor-pointer";

  const gradient = hoverTopSlot
    ? "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)"
    : "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 45%)";

  const innerCard = (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,box-shadow,transform] duration-150",
        selected
          ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
          : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_22px_rgba(0,0,0,0.12)] group-hover:-translate-y-px group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]",
      ].join(" ")}
    >
      {/* Content */}
      {videoSrc ? (
        <div className="relative h-full w-full">
          <video src={videoSrc} muted preload="metadata" playsInline className="absolute inset-0 h-full w-full object-cover" />
          {videoTypeBadge ? (
            <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-[4px] border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] uppercase tracking-[0.4px] text-white backdrop-blur">
              {videoTypeBadge}
            </span>
          ) : null}
        </div>
      ) : thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" draggable={false} className="block h-full w-full object-contain" />
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--bg)] text-[var(--text-muted)]">
          {emptyIcon === "folder" ? (
            <Folder size={30} strokeWidth={1.5} />
          ) : (
            <IconImage size={18} strokeWidth={1.4} />
          )}
          {emptyTitle ? (
            <span className="px-3 text-center text-[10.5px] leading-snug text-[var(--text-faint)]">{emptyTitle}</span>
          ) : null}
        </div>
      )}

      {/* Positioned badges */}
      {badges?.map((badge, i) => <BadgeChip key={i} badge={badge} />)}

      {/* Top-left action slot */}
      {topLeftAction ? <div className="absolute left-2 top-2 z-10">{topLeftAction}</div> : null}

      {/* Hover overlay */}
      {title || hoverTopSlot ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ background: gradient }}
        >
          <div>{hoverTopSlot ?? null}</div>
          {title ? (
            <div className="flex flex-col gap-0.5 text-[11.5px] leading-[1.35] text-white">
              <span className="line-clamp-2 font-medium">{title}</span>
              {subtitle ? <span className="text-[10.5px] tabular-nums text-white/70">{subtitle}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Unpositioned card slot — component positions itself (e.g. CardMoreMenu) */}
      {cardSlot}
    </div>
  );

  return (
    <div className={["group relative w-full text-left align-top", footer ? "flex flex-col" : ""].join(" ")}>
      {stackedLayers ? (
        <>
          <div className="pointer-events-none absolute inset-0 translate-x-[10px] translate-y-[10px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ opacity: 0.7 }} />
          <div className="pointer-events-none absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)]" style={{ opacity: 0.85 }} />
        </>
      ) : null}

      {onClick ? (
        <button
          ref={containerRef}
          type="button"
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className={["relative aspect-[4/3] w-full border-0 bg-transparent p-0 text-left text-inherit", cursorClass].join(" ")}
        >
          {innerCard}
        </button>
      ) : (
        <div ref={containerRef} className={["relative aspect-[4/3] w-full", cursorClass].join(" ")}>
          {innerCard}
        </div>
      )}

      {footer ? <div>{footer}</div> : null}

      {onRemove ? (
        <button
          type="button"
          aria-label="Remove reference"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-white/15 bg-black/70 text-white/78 opacity-0 backdrop-blur transition-[opacity,background-color,color,border-color] duration-150 hover:border-white/30 hover:bg-black/90 hover:text-white group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <IconTrash size={12} strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function BadgeChip({ badge }: { badge: BadgeItem }) {
  const posClass =
    badge.position === "top-left" ? "left-2 top-2" :
    badge.position === "top-right" ? "right-2 top-2" :
    "bottom-2 left-2";

  const variantClass =
    badge.variant === "blue"
      ? "border-[rgba(94,162,255,0.28)] bg-[rgba(24,72,140,0.82)] text-white font-semibold"
      : badge.variant === "type"
        ? "border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] text-[var(--text)]"
        : "border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] text-white font-semibold";

  return (
    <span className={["pointer-events-none absolute rounded-[4px] border px-1.5 py-[3px] text-[9.5px] uppercase tracking-[0.4px] backdrop-blur", posClass, variantClass].join(" ")}>
      {badge.text}
    </span>
  );
}

function ProjectBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border-strong)] bg-black/70 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.35px] text-white backdrop-blur">
      {children}
    </span>
  );
}

function projectLabelSet(
  attachments: ReferenceRow["attachments"],
  screenById: Map<string, ScreenRow>,
  componentById: Map<string, ComponentRow>,
): string[] {
  const labels: string[] = [];
  for (const attachment of attachments) {
    if (attachment.componentId) {
      labels.push(componentById.get(attachment.componentId)?.name ?? "Component");
      continue;
    }
    if (attachment.screenId) {
      labels.push(screenById.get(attachment.screenId)?.title ?? "Screen");
      continue;
    }
    labels.push("Global");
  }
  return Array.from(new Set(labels));
}
