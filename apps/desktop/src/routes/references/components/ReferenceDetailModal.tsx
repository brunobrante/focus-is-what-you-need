import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Archive, ChevronLeft, Edit3, ExternalLink, Film, Folder,
  Layers, Trash2, Upload, X, Play,
} from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceStackData, ReferenceStackItem } from "@/lib/references/stackTypes";
import {
  readReferenceStackData,
  loadReferenceStackFile,
} from "@/lib/tauri/referenceStorage";
import type {
  ArchiveStatus, LightboxTab, ReferenceItem,
  StackPreviewState, StackTreeNode,
} from "../types";
import { referenceCardThumbnailUrl } from "../lib/fileHelpers";
import { formatDateTime, formatDuration, formatSize } from "../lib/utils";
import { DetailList, Section, TagEditor } from "./ui";

// ─── public API ──────────────────────────────────────────────────────────────

export type ReferenceDetailSubject =
  | { kind: "reference"; item: ReferenceItem }
  | { kind: "group"; group: ReferenceGroup; references: ReferenceItem[] }
  | null;

export function ReferenceDetailModal({
  subject,
  groups,
  looseReferences,
  archiveStatus,
  stackThumbnailUrls,
  onClose,
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
  subject: ReferenceDetailSubject;
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  onClose: () => void;
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
  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, onClose]);

  if (!subject) return null;

  return (
    <div
      role="dialog"
      aria-modal
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      {subject.kind === "reference" ? (
        <ItemModal
          item={subject.item}
          groups={groups}
          archiveStatus={archiveStatus}
          stackThumbnailUrls={stackThumbnailUrls}
          onClose={onClose}
          onDelete={onDelete}
          onDescriptionChange={onDescriptionChange}
          onTagsChange={onTagsChange}
          onSourceUrlChange={onSourceUrlChange}
          onGroupChange={onGroupChange}
          onExtractFrames={onExtractFrames}
        />
      ) : (
        <GroupModal
          group={subject.group}
          references={subject.references}
          looseReferences={looseReferences}
          archiveStatus={archiveStatus}
          stackThumbnailUrls={stackThumbnailUrls}
          onClose={onClose}
          onUpload={onUpload}
          onEditGroup={onEditGroup}
          onDeleteGroup={onDeleteGroup}
          onSyncArchive={onSyncArchive}
          onGroupChange={onGroupChange}
        />
      )}
    </div>
  );
}

// ─── item modal ──────────────────────────────────────────────────────────────

function ItemModal({
  item,
  groups,
  archiveStatus,
  stackThumbnailUrls,
  onClose,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
  onExtractFrames,
}: {
  item: ReferenceItem;
  groups: ReferenceGroup[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: (item: ReferenceItem) => void;
}) {
  const canStack = item.mediaKind === "image" && Boolean(item.stack?.enabled);
  const [activeTab, setActiveTab] = useState<LightboxTab>("original");
  const [stackPreview, setStackPreview] = useState<StackPreviewState | null>(null);
  const [stackLoading, setStackLoading] = useState(false);
  const [selectedStackComponentId, setSelectedStackComponentId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab("original");
    setSelectedStackComponentId(null);
    setStackPreview((prev) => { releaseStackUrls(prev); return null; });
    if (!canStack) { setStackLoading(false); return; }

    let cancelled = false;
    setStackLoading(true);
    void loadStackPreview(item).then((preview) => {
      if (cancelled) { releaseStackUrls(preview); return; }
      setStackPreview(preview);
      setSelectedStackComponentId(preview?.data.primaryComponentId ?? null);
    }).finally(() => { if (!cancelled) setStackLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  useEffect(() => () => { releaseStackUrls(stackPreview); }, [stackPreview]);

  const stackTree = stackPreview ? buildStackTree(stackPreview.data) : [];
  const selectedComponent = stackPreview && selectedStackComponentId
    ? stackPreview.data.components.find((c) => c.id === selectedStackComponentId)
      ?? stackPreview.data.components.find((c) => c.id === stackPreview.data.primaryComponentId)
      ?? stackPreview.data.components[0]
    : null;
  const stackImageUrl = selectedComponent && stackPreview
    ? stackPreview.urls[selectedComponent.id] ?? item.url
    : item.url;

  const builderHref = item.groupId
    ? `/tools?id=${encodeURIComponent(item.id)}&groupId=${encodeURIComponent(item.groupId)}`
    : `/tools?id=${encodeURIComponent(item.id)}`;

  return (
    <ModalShell
      tabs={[
        { id: "original", label: "Screen" },
        { id: "stack", label: "Stack", disabled: !canStack },
      ]}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as LightboxTab)}
      title={item.name}
      onClose={onClose}
    >
      {/* left: preview area */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {activeTab === "stack" ? (
          <div className="grid h-full w-full grid-cols-[1fr_260px] overflow-hidden">
            {/* stack image */}
            <div className="flex min-h-0 min-w-0 items-center justify-center p-6">
              {stackLoading && !stackPreview ? (
                <p className="text-[13px] text-[var(--text-muted)]">Loading stack…</p>
              ) : (
                <img
                  src={stackImageUrl}
                  alt={selectedComponent?.name ?? "Stack"}
                  className="block max-h-full max-w-full rounded-[10px] object-contain"
                  draggable={false}
                />
              )}
            </div>
            {/* stack tree */}
            <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[var(--border)]">
              <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
                <p className="m-0 text-[11.5px] font-semibold text-[var(--text)]">Stack tree</p>
                <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
                  {stackPreview?.data.components.length ?? 0} components
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {stackTree.length > 0 ? stackTree.map((node) => (
                  <StackTreeRows
                    key={node.component.id}
                    node={node}
                    selectedId={selectedComponent?.id ?? null}
                    onSelect={setSelectedStackComponentId}
                  />
                )) : (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] text-[var(--text-faint)]">
                    No stack data found.
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : item.mediaKind === "video" ? (
          <video
            src={item.url}
            controls
            autoPlay
            className="block max-h-full max-w-full rounded-[10px]"
          />
        ) : (
          <img
            src={referenceCardThumbnailUrl(item, stackThumbnailUrls[item.id])}
            alt={item.name}
            className="block max-h-full max-w-full rounded-[10px] object-contain"
            draggable={false}
          />
        )}
      </div>

      {/* right: tabbed panel */}
      <DetailPanel
        item={item}
        group={groups.find((g) => g.id === item.groupId) ?? null}
        groupReferences={[]}
        groups={groups}
        looseReferences={[]}
        archiveStatus={archiveStatus}
        stackThumbnailUrls={stackThumbnailUrls}
        builderHref={builderHref}
        onDelete={() => { onDelete(item.id); onClose(); }}
        onDescriptionChange={onDescriptionChange}
        onTagsChange={onTagsChange}
        onSourceUrlChange={onSourceUrlChange}
        onGroupChange={onGroupChange}
        onExtractFrames={() => onExtractFrames(item)}
        onUpload={onUpload}
        onEditGroup={onEditGroup}
        onDeleteGroup={onDeleteGroup}
        onSyncArchive={onSyncArchive}
      />
    </ModalShell>
  );
}

// ─── group modal ──────────────────────────────────────────────────────────────

function GroupModal({
  group,
  references,
  looseReferences,
  archiveStatus,
  stackThumbnailUrls,
  onClose,
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
  onClose: () => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onSyncArchive: () => void;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  type GroupTab = "screens" | "stacks";
  const imageReferences = references.filter((r) => r.mediaKind === "image");
  const stackedReferences = references.filter((r) => r.stack?.enabled);
  const hasStacks = stackedReferences.length > 0;
  const [activeTab, setActiveTab] = useState<GroupTab>("screens");
  const [focusedItem, setFocusedItem] = useState<ReferenceItem | null>(null);
  const [addReferenceId, setAddReferenceId] = useState("");

  useEffect(() => { setFocusedItem(null); setAddReferenceId(""); }, [group.id]);

  const cover = (group.coverReferenceId
    ? imageReferences.find((r) => r.id === group.coverReferenceId)
    : null) ?? imageReferences[0] ?? null;
  const builderHref = cover
    ? `/tools?id=${encodeURIComponent(cover.id)}&groupId=${encodeURIComponent(group.id)}`
    : null;

  const displayedItems = activeTab === "screens" ? references : stackedReferences;

  return (
    <ModalShell
      tabs={[
        { id: "screens", label: "Screens" },
        { id: "stacks", label: "Stacks", disabled: !hasStacks },
      ]}
      activeTab={activeTab}
      onTabChange={(t) => { setActiveTab(t as GroupTab); setFocusedItem(null); }}
      title={group.name}
      onClose={onClose}
    >
      {/* left: screens / stacks grid */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {focusedItem ? (
          <>
            <button
              type="button"
              onClick={() => setFocusedItem(null)}
              className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-1 rounded-[7px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] px-2.5 py-1.5 text-[11.5px] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
            >
              <ChevronLeft size={13} />
              Back
            </button>
            <div className="flex flex-1 items-center justify-center p-6">
              <img
                src={referenceCardThumbnailUrl(focusedItem, stackThumbnailUrls[focusedItem.id])}
                alt={focusedItem.name}
                className="block max-h-full max-w-full rounded-[10px] object-contain"
                draggable={false}
              />
            </div>
          </>
        ) : displayedItems.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
            >
              {displayedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFocusedItem(item)}
                  className="group relative aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-0 transition-[border-color] hover:border-[var(--border-strong)]"
                >
                  <div
                    className="h-full w-full bg-cover bg-center bg-no-repeat"
                    style={{
                      backgroundImage: `url('${referenceCardThumbnailUrl(item, stackThumbnailUrls[item.id])}')`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 flex items-end p-2 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0) 50%)" }}
                  >
                    <span className="truncate text-[10.5px] font-medium text-white">{item.name}</span>
                  </div>
                  {item.stack?.enabled ? (
                    <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-[4px] border border-[rgba(94,162,255,0.28)] bg-[rgba(24,72,140,0.82)] px-1 py-[2px] text-[9px] font-semibold uppercase tracking-[0.4px] text-white backdrop-blur">
                      Stack
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <Folder size={32} strokeWidth={1.5} className="text-[var(--text-faint)]" />
              <p className="m-0 text-[13px] text-[var(--text-muted)]">
                {activeTab === "stacks" ? "No stacks in this group" : "No screens in this group"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* right: tabbed panel */}
      <DetailPanel
        item={null}
        group={group}
        groupReferences={references}
        groups={[]}
        looseReferences={looseReferences}
        archiveStatus={archiveStatus}
        stackThumbnailUrls={stackThumbnailUrls}
        builderHref={builderHref}
        onDelete={() => {}}
        onDescriptionChange={() => {}}
        onTagsChange={() => {}}
        onSourceUrlChange={() => {}}
        onGroupChange={onGroupChange}
        onExtractFrames={() => {}}
        onUpload={onUpload}
        onEditGroup={onEditGroup}
        onDeleteGroup={() => { onDeleteGroup(); onClose(); }}
        onSyncArchive={onSyncArchive}
      />
    </ModalShell>
  );
}

// ─── item details form (right panel, single item) ────────────────────────────

function ItemDetails({
  item,
  groups,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
}: {
  item: ReferenceItem;
  groups: ReferenceGroup[];
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [descDraft, setDescDraft] = useState(item.description ?? "");
  const [urlDraft, setUrlDraft] = useState(item.sourceUrl ?? "");
  const prevIdRef = useRef(item.id);

  useEffect(() => {
    if (prevIdRef.current === item.id) return;
    prevIdRef.current = item.id;
    setDescDraft(item.description ?? "");
    setUrlDraft(item.sourceUrl ?? "");
  }, [item.id, item.description, item.sourceUrl]);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="break-words text-[13px] font-semibold leading-[1.4] text-[var(--text)]">
        {item.name}
      </div>

      <Section title="Description">
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => onDescriptionChange(item.id, descDraft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDescDraft(item.description ?? ""); e.currentTarget.blur(); }
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
            onBlur={() => onSourceUrlChange(item.id, urlDraft)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setUrlDraft(item.sourceUrl ?? ""); e.currentTarget.blur(); }
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
          />
          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
            >
              <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </Section>

      <Section title="Tags">
        <TagEditor
          tags={item.tags ?? []}
          onAdd={(tag) => onTagsChange(item.id, [...(item.tags ?? []), tag])}
          onRemove={(tag) => onTagsChange(item.id, (item.tags ?? []).filter((t) => t !== tag))}
          asButton
        />
      </Section>

      <Section title="Group">
        <select
          value={item.groupId ?? ""}
          onChange={(e) => onGroupChange(item.id, e.target.value || null)}
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
            ["Format", item.type],
            ["Type", item.mediaKind === "video" ? "Video" : "Image"],
            ...(item.w && item.h ? [["Dimensions", `${item.w} × ${item.h}`] as [string, string]] : []),
            ["Size", formatSize(item.size || 0)],
            ...(item.stack?.enabled
              ? [["Stack", `${item.stack.itemCount} ${item.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
              : []),
            ...(item.duration !== undefined ? [["Duration", formatDuration(item.duration)] as [string, string]] : []),
            ["Added", formatDateTime(item.added)],
          ]}
        />
      </Section>
    </div>
  );
}

// ─── group details (right panel, group tab) ───────────────────────────────────

function GroupDetails({
  group, references, looseReferences, archiveStatus, onGroupChange,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  onGroupChange: (id: string, groupId: string | null) => void;
}) {
  const [addReferenceId, setAddReferenceId] = useState("");
  const stackCount = references.filter((r) => r.stack?.enabled).length;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="text-[13px] font-semibold text-[var(--text)]">{group.name}</div>
        {group.description ? (
          <p className="m-0 mt-1 text-[12px] leading-[1.45] text-[var(--text-muted)]">{group.description}</p>
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

      {archiveStatus ? (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">
          {archiveStatus.label}
        </div>
      ) : null}
    </div>
  );
}

// ─── shared layout pieces ─────────────────────────────────────────────────────

function ModalShell({
  tabs,
  activeTab,
  onTabChange,
  title,
  onClose,
  children,
}: {
  tabs: Array<{ id: string; label: string; disabled?: boolean }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-[min(900px,calc(100vh-48px))] w-[min(1320px,calc(100vw-48px))] flex-col overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.97)] shadow-[0_18px_80px_rgba(0,0,0,0.55)]">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              active={activeTab === tab.id}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
            >
              {tab.label}
            </TabButton>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[7px] border border-[var(--border-strong)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function DetailPanel({
  item, group, groupReferences, groups, looseReferences, archiveStatus,
  stackThumbnailUrls, builderHref,
  onDelete, onDescriptionChange, onTagsChange, onSourceUrlChange, onGroupChange,
  onExtractFrames, onUpload, onEditGroup, onDeleteGroup, onSyncArchive,
}: {
  item: ReferenceItem | null;
  group: ReferenceGroup | null;
  groupReferences: ReferenceItem[];
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  archiveStatus: ArchiveStatus;
  stackThumbnailUrls: Record<string, string>;
  builderHref: string | null;
  onDelete: () => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: () => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onSyncArchive: () => void;
}) {
  type SideTab = "inspector" | "group";
  const defaultTab: SideTab = !item && group ? "group" : "inspector";
  const [tab, setTab] = useState<SideTab>(defaultTab);

  const hasGroupTab = Boolean(group);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elev)]">
      {/* tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "inspector" && item ? (
          <ItemDetails
            item={item}
            groups={groups}
            onDescriptionChange={onDescriptionChange}
            onTagsChange={onTagsChange}
            onSourceUrlChange={onSourceUrlChange}
            onGroupChange={onGroupChange}
          />
        ) : tab === "inspector" && !item ? (
          <p className="text-[12px] text-[var(--text-faint)]">No item selected.</p>
        ) : null}

        {tab === "group" && group ? (
          <GroupDetails
            group={group}
            references={groupReferences}
            looseReferences={looseReferences}
            archiveStatus={archiveStatus}
            onGroupChange={onGroupChange}
          />
        ) : null}
      </div>

      {/* actions */}
      <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--border)] p-3">
        {tab === "inspector" && item ? (
          <>
            {item.mediaKind === "image" && builderHref ? (
              <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
            ) : null}
            {item.mediaKind === "video" ? (
              <Action icon={<Film size={12} />} label="Extract frames" onClick={onExtractFrames} />
            ) : null}
            <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
          </>
        ) : tab === "group" && group ? (
          <>
            {builderHref ? (
              <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
            ) : (
              <Action icon={<Layers size={12} />} label="Builder" disabled onClick={() => {}} />
            )}
            <Action icon={<Upload size={12} />} label="Add" onClick={onUpload} />
            <Action
              icon={<Archive size={12} />}
              label=".figx"
              disabled={archiveStatus?.saving || groupReferences.length === 0}
              onClick={onSyncArchive}
            />
            <Action icon={<Edit3 size={12} />} label="Edit" onClick={onEditGroup} />
            <Action icon={<Trash2 size={12} />} label="Delete" danger onClick={onDeleteGroup} />
          </>
        ) : null}
      </div>
    </aside>
  );
}


function TabButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-8 cursor-pointer rounded-[8px] border px-3 text-[12px] font-medium transition-colors",
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

function Action({
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

function ActionLink({ icon, label, to }: { icon: ReactNode; label: string; to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
    >
      {icon}{label}
    </Link>
  );
}

// ─── stack helpers ────────────────────────────────────────────────────────────

function StackTreeRows({
  node, selectedId, onSelect,
}: {
  node: StackTreeNode; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const active = selectedId === node.component.id;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.component.id)}
        className={[
          "mb-1 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors",
          active
            ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
            : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        ].join(" ")}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-55" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium">{node.component.name}</span>
          <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
            {Math.round(node.component.box.w)} × {Math.round(node.component.box.h)}
          </span>
        </span>
      </button>
      {node.children.map((child) => (
        <StackTreeRows key={child.component.id} node={child} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </>
  );
}

async function loadStackPreview(item: ReferenceItem): Promise<StackPreviewState | null> {
  const data = await readReferenceStackData(item.id);
  if (!data) return null;
  const urls: Record<string, string> = {};
  const ownedUrls: string[] = [];
  for (const component of data.components) {
    if (!component.file) { urls[component.id] = item.url; continue; }
    const blob = await loadReferenceStackFile(item.id, component.file, "image/png");
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls[component.id] = url;
    ownedUrls.push(url);
  }
  return { data, urls, ownedUrls };
}

function releaseStackUrls(preview: StackPreviewState | null): void {
  if (!preview) return;
  for (const url of preview.ownedUrls) URL.revokeObjectURL(url);
}

function buildStackTree(data: ReferenceStackData): StackTreeNode[] {
  const byParent = new Map<string, ReferenceStackItem[]>();
  for (const component of data.components) {
    const parentId = component.parentId ?? "__root__";
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), component]);
  }
  const visit = (component: ReferenceStackItem, depth: number, seen: Set<string>): StackTreeNode => {
    if (seen.has(component.id)) return { component, children: [], depth };
    const next = new Set(seen); next.add(component.id);
    const children = (byParent.get(component.id) ?? [])
      .filter((c) => c.id !== component.id)
      .map((c) => visit(c, depth + 1, next));
    return { component, children, depth };
  };
  const root = data.components.find((c) => c.id === data.rootComponentId);
  if (root) return [visit(root, 0, new Set())];
  return (byParent.get("__root__") ?? data.components)
    .filter((c, i, list) => list.findIndex((x) => x.id === c.id) === i)
    .map((c) => visit(c, 0, new Set()));
}
