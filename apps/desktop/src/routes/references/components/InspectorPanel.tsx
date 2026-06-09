import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, Edit3, ExternalLink, Film, Folder, Layers, Trash2, Upload, X } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ArchiveStatus, ReferenceItem } from "../types";
import { referenceCardThumbnailUrl } from "../lib/fileHelpers";
import { formatDateTime, formatDuration, formatSize } from "../lib/utils";
import { DetailList, Section, TagEditor } from "./ui";

type PanelTab = "inspector" | "group";

export function InspectorPanel({
  item,
  selectedGroup,
  groupReferences,
  groups,
  looseReferences,
  archiveStatus,
  stackThumbnailUrls,
  onClose,
  onOpen,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
  onExtractFrames,
  onUpload,
  onEditGroup,
  onDeleteGroup,
  onSyncArchive,
}: {
  item: ReferenceItem | null;
  selectedGroup: ReferenceGroup | null;
  groupReferences: ReferenceItem[];
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  onClose: () => void;
  onOpen: (item: ReferenceItem) => void;
  onDelete: (id: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: (item: ReferenceItem) => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onSyncArchive: () => void;
}) {
  // item's parent group (when a reference with a groupId is selected)
  const itemGroup = item?.groupId ? groups.find((g) => g.id === item.groupId) ?? null : null;
  const activeGroup = selectedGroup ?? itemGroup;

  const defaultTab: PanelTab = selectedGroup && !item ? "group" : "inspector";
  const [tab, setTab] = useState<PanelTab>(defaultTab);

  // reset tab when the selected subject changes
  const prevSubjectKey = useRef<string | null>(null);
  const subjectKey = selectedGroup ? `g:${selectedGroup.id}` : item ? `r:${item.id}` : null;
  if (subjectKey !== prevSubjectKey.current) {
    prevSubjectKey.current = subjectKey;
    const next: PanelTab = selectedGroup && !item ? "group" : "inspector";
    if (tab !== next) setTab(next);
  }

  useEffect(() => {
    if (!item && !selectedGroup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, selectedGroup, onClose]);

  const hasGroupTab = Boolean(activeGroup);
  const visible = Boolean(item || selectedGroup);

  return (
    <aside
      className={[
        "shrink-0 overflow-hidden border-l border-[var(--border)] transition-[width] duration-200",
        visible ? "w-[300px]" : "w-0",
      ].join(" ")}
      style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
    >
      <div className="flex h-full w-[300px] flex-col overflow-hidden bg-[var(--bg-elev)]">
        {/* header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-center gap-0.5">
            <TabButton active={tab === "inspector"} onClick={() => setTab("inspector")}>
              Inspector
            </TabButton>
            <TabButton
              active={tab === "group"}
              disabled={!hasGroupTab}
              onClick={() => hasGroupTab && setTab("group")}
            >
              Group
            </TabButton>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={13} />
          </button>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "inspector" ? (
            <InspectorTab
              item={item}
              groups={groups}
              stackThumbnailUrls={stackThumbnailUrls}
              onOpen={onOpen}
              onDelete={onDelete}
              onDescriptionChange={onDescriptionChange}
              onTagsChange={onTagsChange}
              onSourceUrlChange={onSourceUrlChange}
              onGroupChange={onGroupChange}
              onExtractFrames={onExtractFrames}
            />
          ) : activeGroup ? (
            <GroupTab
              group={activeGroup}
              references={groupReferences}
              looseReferences={looseReferences}
              archiveStatus={archiveStatus}
              stackThumbnailUrls={stackThumbnailUrls}
              onOpen={onOpen}
              onUpload={onUpload}
              onEditGroup={onEditGroup}
              onDeleteGroup={onDeleteGroup}
              onSyncArchive={onSyncArchive}
              onGroupChange={onGroupChange}
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}

// ─── Inspector tab ────────────────────────────────────────────────────────────

function InspectorTab({
  item,
  groups,
  stackThumbnailUrls,
  onOpen,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
  onExtractFrames,
}: {
  item: ReferenceItem | null;
  groups: ReferenceGroup[];
  stackThumbnailUrls: Record<string, string>;
  onOpen: (item: ReferenceItem) => void;
  onDelete: (id: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: (item: ReferenceItem) => void;
}) {
  const lastRef = useRef<ReferenceItem | null>(null);
  if (item) lastRef.current = item;
  const display = item ?? lastRef.current;

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

  if (!display) return (
    <div className="flex h-full items-center justify-center p-6 text-[12px] text-[var(--text-faint)]">
      Select an item to inspect it.
    </div>
  );

  const builderHref = display.groupId
    ? `/tools?id=${encodeURIComponent(display.id)}&groupId=${encodeURIComponent(display.groupId)}`
    : `/tools?id=${encodeURIComponent(display.id)}`;

  return (
    <div className="flex flex-col gap-4 p-3.5">
      {/* thumbnail */}
      <div
        className="flex items-center justify-center overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--bg)]"
        style={{ aspectRatio: "16/9" }}
      >
        {display.mediaKind === "video" ? (
          <video src={display.url} controls muted className="max-h-full max-w-full" />
        ) : (
          <img
            src={referenceCardThumbnailUrl(display, stackThumbnailUrls[display.id])}
            alt={display.name}
            className="max-h-full max-w-full"
          />
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
            if (e.key === "Escape") { setDescDraft(display.description ?? ""); e.currentTarget.blur(); }
          }}
          placeholder="Add a description…"
          rows={3}
          className="w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
      </Section>

      <Section title="Source URL">
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => onSourceUrlChange(display.id, urlDraft)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setUrlDraft(display.sourceUrl ?? ""); e.currentTarget.blur(); }
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
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
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
          onRemove={(tag) => onTagsChange(display.id, (display.tags ?? []).filter((t) => t !== tag))}
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
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </Section>

      <Section title="Details">
        <DetailList
          items={[
            ["Format", display.type],
            ["Type", display.mediaKind === "video" ? "Video" : "Image"],
            ...(display.w && display.h ? [["Dimensions", `${display.w} × ${display.h}`] as [string, string]] : []),
            ["Size", formatSize(display.size || 0)],
            ...(display.stack?.enabled
              ? [["Stack", `${display.stack.itemCount} ${display.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
              : []),
            ...(display.duration !== undefined ? [["Duration", formatDuration(display.duration)] as [string, string]] : []),
            ["Added", formatDateTime(display.added)],
          ]}
        />
      </Section>

      {/* actions */}
      <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
        <PanelAction icon={<ExternalLink size={12} />} label="Open" onClick={() => onOpen(display)} />
        {display.mediaKind === "image" ? (
          <PanelLinkAction icon={<Layers size={12} />} label="Builder" to={builderHref} />
        ) : null}
        {display.mediaKind === "video" ? (
          <PanelAction icon={<Film size={12} />} label="Extract frames" onClick={() => onExtractFrames(display)} />
        ) : null}
        <PanelAction icon={<Trash2 size={12} />} label="Remove" danger onClick={() => onDelete(display.id)} />
      </div>
    </div>
  );
}

// ─── Group tab ────────────────────────────────────────────────────────────────

function GroupTab({
  group,
  references,
  looseReferences,
  archiveStatus,
  stackThumbnailUrls,
  onOpen,
  onUpload,
  onEditGroup,
  onDeleteGroup,
  onSyncArchive,
  onGroupChange,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  onOpen: (item: ReferenceItem) => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onSyncArchive: () => void;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [addReferenceId, setAddReferenceId] = useState("");
  useEffect(() => { setAddReferenceId(""); }, [group.id]);

  const imageReferences = references.filter((r) => r.mediaKind === "image");
  const stackCount = references.filter((r) => r.stack?.enabled).length;
  const cover = (group.coverReferenceId
    ? imageReferences.find((r) => r.id === group.coverReferenceId)
    : null) ?? imageReferences[0] ?? null;
  const builderHref = cover
    ? `/tools?id=${encodeURIComponent(cover.id)}&groupId=${encodeURIComponent(group.id)}`
    : null;

  return (
    <div className="flex flex-col gap-4 p-3.5">
      {/* cover */}
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
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-[var(--text-muted)]">
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
            {looseReferences.length === 0 ? "No loose references" : "Choose a screen…"}
          </option>
          {looseReferences.map((r) => (
            <option key={r.id} value={r.id}>
              {r.stack?.enabled ? "Stack – " : ""}{r.name}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Screens in group">
        {references.length > 0 ? (
          <div className="flex flex-col gap-2">
            {references.map((ref) => (
              <GroupScreenRow
                key={ref.id}
                item={ref}
                groupId={group.id}
                stackThumbnailUrl={stackThumbnailUrls[ref.id]}
                onOpen={() => onOpen(ref)}
                onRemove={() => onGroupChange(ref.id, null)}
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

      {/* actions */}
      <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--border)] pt-3">
        {builderHref ? (
          <PanelLinkAction icon={<Layers size={12} />} label="Builder" to={builderHref} />
        ) : (
          <PanelAction icon={<Layers size={12} />} label="Builder" disabled onClick={() => undefined} />
        )}
        <PanelAction icon={<Upload size={12} />} label="Add" onClick={onUpload} />
        <PanelAction
          icon={<Archive size={12} />}
          label=".figx"
          disabled={archiveStatus?.saving || references.length === 0}
          onClick={onSyncArchive}
        />
        <PanelAction icon={<Edit3 size={12} />} label="Edit" onClick={onEditGroup} />
        <PanelAction icon={<Trash2 size={12} />} label="Delete" danger onClick={onDeleteGroup} />
      </div>
    </div>
  );
}

// ─── shared primitives ────────────────────────────────────────────────────────

function GroupScreenRow({
  item, groupId, stackThumbnailUrl, onOpen, onRemove,
}: {
  item: ReferenceItem; groupId: string; stackThumbnailUrl?: string;
  onOpen: () => void; onRemove: () => void;
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
          <span>{item.w} × {item.h}</span>
          {item.stack?.enabled ? <span>· Stack</span> : null}
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

function TabButton({
  active, disabled = false, onClick, children,
}: {
  active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-7 cursor-pointer rounded-[7px] border px-2.5 text-[11.5px] font-medium transition-colors",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        disabled ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PanelAction({
  icon, label, onClick, danger, disabled = false,
}: {
  icon: ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : danger
          ? "hover:border-[rgba(255,80,80,0.45)] hover:bg-[rgba(255,80,80,0.15)] hover:text-[#ff8a8a]"
          : "hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
      ].join(" ")}
    >
      {icon}{label}
    </button>
  );
}

function PanelLinkAction({ icon, label, to }: { icon: ReactNode; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
    >
      {icon}{label}
    </Link>
  );
}
