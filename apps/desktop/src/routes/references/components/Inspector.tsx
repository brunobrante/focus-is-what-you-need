import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, Edit3, ExternalLink, Film, Folder, Layers, Trash2, Upload, X } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ArchiveStatus, ReferenceItem } from "../types";
import { referenceCardThumbnailUrl } from "../lib/fileHelpers";
import { formatDateTime, formatDuration, formatSize } from "../lib/utils";
import { DetailList, Section, SmallButton, TagEditor } from "./ui";

export function Inspector({
  item,
  groups,
  onClose,
  onOpenLightbox,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
  onExtractFrames,
}: {
  item: ReferenceItem | null;
  groups: ReferenceGroup[];
  onClose: () => void;
  onOpenLightbox: (item: ReferenceItem) => void;
  onDelete: (id: string) => void;
  onDescriptionChange: (id: string, description: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, sourceUrl: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: (item: ReferenceItem) => void;
}) {
  const lastItemRef = useRef<ReferenceItem | null>(null);
  if (item) lastItemRef.current = item;
  const display = item ?? lastItemRef.current;

  const [descDraft, setDescDraft] = useState(display?.description ?? "");
  const [urlDraft, setUrlDraft] = useState(display?.sourceUrl ?? "");

  useEffect(() => {
    if (!item) return;
    setDescDraft(item.description ?? "");
  }, [item?.id, item?.description]);

  useEffect(() => {
    if (!item) return;
    setUrlDraft(item.sourceUrl ?? "");
  }, [item?.id, item?.sourceUrl]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!display) return null;

  const builderHref = display.groupId
    ? `/tools?id=${encodeURIComponent(display.id)}&groupId=${encodeURIComponent(display.groupId)}`
    : `/tools?id=${encodeURIComponent(display.id)}`;

  return (
    <div className="flex h-full w-[320px] flex-col overflow-hidden bg-[var(--bg-elev)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">Info</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-6 w-6 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3.5">
        <div
          className="flex items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]"
          style={{ aspectRatio: "16/9" }}
        >
          {display.mediaKind === "video" ? (
            <video src={display.url} controls muted className="max-h-full max-w-full" />
          ) : (
            <img src={display.url} alt={display.name} className="max-h-full max-w-full" />
          )}
        </div>

        <div className="break-words text-[13px] font-medium leading-[1.4] text-[var(--text)]">
          {display.name}
        </div>

        <Section title="Description">
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => onDescriptionChange(display.id, descDraft)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDescDraft(display.description ?? "");
                e.currentTarget.blur();
              }
            }}
            placeholder="Add a description..."
            rows={3}
            className="w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
          />
        </Section>

        <Section title="URL de origem">
          <div className="flex gap-1.5">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={() => onSourceUrlChange(display.id, urlDraft)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setUrlDraft(display.sourceUrl ?? "");
                  e.currentTarget.blur();
                }
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
            {display.sourceUrl ? (
              <a
                href={display.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                <ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        </Section>

        <Section title="Tags">
          <TagEditor
            tags={display.tags ?? []}
            onAdd={(tag) => onTagsChange(display.id, [...(display.tags ?? []), tag])}
            onRemove={(tag) =>
              onTagsChange(display.id, (display.tags ?? []).filter((t) => t !== tag))
            }
            asButton
          />
        </Section>

        <Section title="Group">
          <select
            value={display.groupId ?? ""}
            onChange={(e) => onGroupChange(display.id, e.target.value || null)}
            className="h-[34px] w-full cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]"
          >
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Section>

        <Section title="Details">
          <DetailList
            items={[
              ["Formato", display.type],
              ["Type", display.mediaKind === "video" ? "Video" : "Image"],
              ...(display.w && display.h
                ? [["Dimensions", `${display.w} × ${display.h}`] as [string, string]]
                : []),
              ["Size", formatSize(display.size || 0)],
              ...(display.stack?.enabled
                ? [["Stack", `${display.stack.itemCount} ${display.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
                : []),
              ...(display.duration !== undefined
                ? [["Duration", formatDuration(display.duration)] as [string, string]]
                : []),
            ]}
          />
        </Section>

        <Section title="Origem">
          <DetailList
            items={[
              ["Adicionado", formatDateTime(display.added)],
              ["ID", display.id, true],
            ]}
          />
        </Section>
      </div>

      <div className="flex shrink-0 gap-1.5 border-t border-[var(--border)] px-3 py-2.5">
        <InspectorAction
          icon={<ExternalLink size={12} />}
          label="Open"
          onClick={() => onOpenLightbox(display)}
        />
        {display.mediaKind === "image" ? (
          <InspectorLinkAction icon={<Layers size={12} />} label="Builder" to={builderHref} />
        ) : null}
        {display.mediaKind === "video" ? (
          <InspectorAction
            icon={<Film size={12} />}
            label="Extract frames"
            onClick={() => onExtractFrames(display)}
          />
        ) : null}
        <InspectorAction
          icon={<Trash2 size={12} />}
          label="Remove"
          danger
          onClick={() => onDelete(display.id)}
        />
      </div>
    </div>
  );
}

export function GroupInspector({
  group,
  references,
  looseReferences,
  archiveStatus,
  stackThumbnailUrls,
  onClose,
  onOpenLightbox,
  onUpload,
  onEdit,
  onDelete,
  onSyncArchive,
  onGroupChange,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  onClose: () => void;
  onOpenLightbox: (item: ReferenceItem) => void;
  onUpload: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSyncArchive: () => void;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [addReferenceId, setAddReferenceId] = useState("");

  useEffect(() => { setAddReferenceId(""); }, [group.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const imageReferences = references.filter((item) => item.mediaKind === "image");
  const cover =
    (group.coverReferenceId
      ? imageReferences.find((item) => item.id === group.coverReferenceId)
      : null) ?? imageReferences[0] ?? null;
  const builderHref = cover
    ? `/tools?id=${encodeURIComponent(cover.id)}&groupId=${encodeURIComponent(group.id)}`
    : null;
  const stackCount = references.filter((item) => item.stack?.enabled).length;

  return (
    <div className="flex h-full w-[320px] flex-col overflow-hidden bg-[var(--bg-elev)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">Group</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-6 w-6 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3.5">
        <div
          className="flex items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]"
          style={{ aspectRatio: "16/9" }}
        >
          {cover ? (
            <img
              src={referenceCardThumbnailUrl(cover, stackThumbnailUrls[cover.id])}
              alt={group.name}
              className="max-h-full max-w-full"
              draggable={false}
            />
          ) : (
            <Folder size={30} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          )}
        </div>

        <div>
          <div className="break-words text-[13px] font-medium leading-[1.4] text-[var(--text)]">
            {group.name}
          </div>
          {group.description ? (
            <p className="m-0 mt-1.5 text-[12px] leading-[1.45] text-[var(--text-muted)]">
              {group.description}
            </p>
          ) : null}
        </div>

        <Section title="Details">
          <DetailList
            items={[
              ["Screens", String(references.length)],
              ["Stacks", String(stackCount)],
              ["Updated", formatDateTime(group.updatedAt)],
              ["ID", group.id, true],
            ]}
          />
        </Section>

        <Section title="Add loose screen">
          <select
            value={addReferenceId}
            disabled={looseReferences.length === 0}
            onChange={(e) => {
              const nextId = e.target.value;
              setAddReferenceId("");
              if (nextId) onGroupChange(nextId, group.id);
            }}
            className="h-[34px] w-full cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <option value="">
              {looseReferences.length === 0 ? "No loose image references" : "Choose a screen..."}
            </option>
            {looseReferences.map((item) => (
              <option key={item.id} value={item.id}>
                {item.stack?.enabled ? "Stack - " : ""}
                {item.name}
              </option>
            ))}
          </select>
        </Section>

        <Section title="Screens in group">
          {references.length > 0 ? (
            <div className="flex flex-col gap-2">
              {references.map((item) => (
                <GroupReferenceRow
                  key={item.id}
                  item={item}
                  groupId={group.id}
                  stackThumbnailUrl={stackThumbnailUrls[item.id]}
                  onOpen={() => onOpenLightbox(item)}
                  onRemove={() => onGroupChange(item.id, null)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] leading-[1.45] text-[var(--text-faint)]">
              This group has no screens yet.
            </div>
          )}
        </Section>

        {archiveStatus ? (
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">
            {archiveStatus.label}
          </div>
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-[var(--border)] px-3 py-2.5">
        {builderHref ? (
          <InspectorLinkAction icon={<Layers size={12} />} label="Builder" to={builderHref} />
        ) : (
          <InspectorAction icon={<Layers size={12} />} label="Builder" disabled onClick={() => undefined} />
        )}
        <InspectorAction icon={<Upload size={12} />} label="Add" onClick={onUpload} />
        <InspectorAction
          icon={<Archive size={12} />}
          label=".figx"
          disabled={archiveStatus?.saving || references.length === 0}
          onClick={onSyncArchive}
        />
        <InspectorAction icon={<Edit3 size={12} />} label="Edit" onClick={onEdit} />
        <InspectorAction icon={<Trash2 size={12} />} label="Delete" danger onClick={onDelete} />
      </div>
    </div>
  );
}

function GroupReferenceRow({
  item,
  groupId,
  stackThumbnailUrl,
  onOpen,
  onRemove,
}: {
  item: ReferenceItem;
  groupId: string;
  stackThumbnailUrl?: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] p-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="h-12 w-12 shrink-0 cursor-zoom-in overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--bg)] p-0"
      >
        <img
          src={referenceCardThumbnailUrl(item, stackThumbnailUrl)}
          alt={item.name}
          draggable={false}
          className="h-full w-full object-cover"
        />
      </button>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="truncate text-[12px] font-medium text-[var(--text)]">{item.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] tabular-nums text-[var(--text-faint)]">
          <span>{item.w} x {item.h}</span>
          {item.stack?.enabled ? <span>Stack</span> : null}
        </div>
        <div className="mt-1 flex gap-1">
          <Link
            to={`/tools?id=${encodeURIComponent(item.id)}&groupId=${encodeURIComponent(groupId)}`}
            className="rounded-[5px] border border-[var(--border)] px-1.5 py-[2px] text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-muted)] no-underline hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Builder
          </Link>
          <button
            type="button"
            onClick={onRemove}
            className="cursor-pointer rounded-[5px] border border-[var(--border)] bg-transparent px-1.5 py-[2px] text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-muted)] hover:border-[rgba(255,80,80,0.45)] hover:text-[#ff8a8a]"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectorAction({
  icon,
  label,
  onClick,
  danger,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40 hover:border-[var(--border)] hover:bg-[var(--surface)]"
          : danger
          ? "hover:border-[rgba(255,80,80,0.45)] hover:bg-[rgba(255,80,80,0.15)] hover:text-[#ff8a8a]"
          : "hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function InspectorLinkAction({
  icon,
  label,
  to,
}: {
  icon: ReactNode;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
    >
      {icon}
      {label}
    </Link>
  );
}

export { SmallButton };
