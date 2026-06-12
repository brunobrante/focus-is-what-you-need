import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Edit3, Eye, ExternalLink, Film, Folder,
  Layers, Trash2, Upload, X,
} from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import type { ReferenceStackData, ReferenceStackItem } from "@/lib/references/stackTypes";
import { stackRootIds } from "@/lib/references/stackTypes";
import {
  readReferenceStackData,
  loadReferenceStackFile,
} from "@/lib/tauri/referenceStorage";
import { loadReferenceUrl } from "@/lib/references/referenceUrlCache";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import type { ReferenceItem, StackPreviewState, StackTreeNode } from "../types";
import { useReferenceUrl } from "../hooks/useReferenceUrl";
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
  stackThumbnailUrls,
  onClose,
  onDelete,
  onNameChange,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
  onExtractFrames,
  onUpload,
  onEditGroup,
  onDeleteGroup,
}: {
  subject: ReferenceDetailSubject;
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  stackThumbnailUrls: Record<string, string>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: (item: ReferenceItem) => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
}) {
  type MainTab = "screen" | "stack" | "screens" | "stacks";

  const isGroup = subject?.kind === "group";

  // ── tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MainTab>(isGroup ? "screens" : "screen");

  // ── group: focused item ───────────────────────────────────────────────────
  const [focusedItem, setFocusedItem] = useState<ReferenceItem | null>(null);

  // ── stack state ───────────────────────────────────────────────────────────
  const [stackPreview, setStackPreview] = useState<StackPreviewState | null>(null);
  const [stackLoading, setStackLoading] = useState(false);
  const [selectedStackComponentId, setSelectedStackComponentId] = useState<string | null>(null);
  const [stackViewMode, setStackViewMode] = useState<"composite" | "isolated">("composite");
  // When a reference has more than one stack (root), the Stack tab first shows a
  // gallery of stack cards; selecting one focuses it for composite rendering.
  const [focusedRootId, setFocusedRootId] = useState<string | null>(null);

  // ── derived ───────────────────────────────────────────────────────────────
  const group = subject?.kind === "group" ? subject.group : null;
  const groupReferences = subject?.kind === "group" ? subject.references : [];
  const imageReferences = groupReferences.filter((r) => r.mediaKind === "image");
  const stackedReferences = groupReferences.filter((r) => r.stack?.enabled);
  const hasStacks = stackedReferences.length > 0;

  const currentItem: ReferenceItem | null =
    subject?.kind === "reference" ? subject.item : focusedItem;
  const canStack = Boolean(currentItem?.stack?.enabled);
  // A single image split into multiple screens is itself a group. It is not a
  // ReferenceGroup row, so it gets a Group tab backed by the image directly —
  // mirroring how a real multi-image group exposes Inspector + Group.
  const isImageGroup =
    !isGroup &&
    currentItem?.mediaKind === "image" &&
    (currentItem?.stack?.rootCount ?? 1) > 1;

  const displayedItems = activeTab === "screens" ? groupReferences : stackedReferences;
  const focusedIndex = focusedItem
    ? displayedItems.findIndex((i) => i.id === focusedItem.id)
    : -1;

  // Whether the left area shows the stack composite/isolated view:
  // - reference: only when Stack tab is active
  // - group: whenever focused item has a stack
  const showStackView = isGroup ? !!focusedItem && canStack : activeTab === "stack";

  // ── reset on subject change ───────────────────────────────────────────────
  const subjectKey = subject
    ? subject.kind === "reference"
      ? subject.item.id
      : subject.group.id
    : null;

  useEffect(() => {
    setActiveTab(isGroup ? "screens" : "screen");
    setFocusedItem(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey]);

  // A single-item gallery (one original, or one stack) opens straight into the
  // enlarged view rather than showing a pointless one-cell grid.
  useEffect(() => {
    if (!isGroup || focusedItem) return;
    if (displayedItems.length === 1) setFocusedItem(displayedItems[0] ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroup, activeTab, displayedItems.length, focusedItem]);

  // ── load stack preview ────────────────────────────────────────────────────
  useEffect(() => {
    setSelectedStackComponentId(null);
    setStackViewMode("composite");
    setFocusedRootId(null);
    setStackPreview((prev) => { releaseStackUrls(prev); return null; });
    if (!canStack || !currentItem) { setStackLoading(false); return; }

    let cancelled = false;
    setStackLoading(true);
    void loadStackPreview(currentItem).then((preview) => {
      if (cancelled) { releaseStackUrls(preview); return; }
      setStackPreview(preview);
      // Multi-screen references open into a screen gallery: keep the side panel
      // empty until the user opens a specific screen. Single-screen references
      // pre-select their primary component so the stack shows immediately.
      const rootCount = preview?.data.roots?.length ?? (preview?.data.rootComponentId ? 1 : 0);
      setSelectedStackComponentId(rootCount > 1 ? null : preview?.data.primaryComponentId ?? null);
    }).finally(() => { if (!cancelled) setStackLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id]);

  useEffect(() => () => { releaseStackUrls(stackPreview); }, [stackPreview]);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, onClose]);

  // ── URLs — must be before early return (hook rule) ────────────────────────
  const { url: currentUrl } = useReferenceUrl(currentItem, { eager: true });

  if (!subject) return null;

  // ── stack derivation ──────────────────────────────────────────────────────
  const fullStackTree = stackPreview ? buildStackTree(stackPreview.data) : [];
  // Each root = one screen. The Screens tab shows a card per screen when there
  // are several; with a single screen it renders the composite directly.
  const stackRoots = stackPreview ? listStackRoots(stackPreview.data) : [];
  const hasMultipleStacks = stackRoots.length > 1;
  // The side panel only shows a stack tree once a screen is in focus. With many
  // screens and none opened, it stays empty (awaiting a screen selection); a
  // single screen shows its tree directly.
  const awaitingScreenSelection = hasMultipleStacks && !focusedRootId;
  const stackTree = focusedRootId
    ? fullStackTree.filter((node) => node.component.id === focusedRootId)
    : hasMultipleStacks
    ? []
    : fullStackTree;
  // Only scope the composite to a root when a stack is explicitly focused (which
  // only happens for multi-root v2 stacks, whose cuts carry rootId). A single
  // stack stays unscoped so legacy cuts (rootId === null) still render.
  // With a screen focused but no cut selected, fall back to that screen's own
  // image — not the primary/first root, which would show the wrong screen.
  const effectiveStackId =
    selectedStackComponentId ??
    focusedRootId ??
    stackPreview?.data.primaryComponentId ??
    stackPreview?.data.roots?.[0]?.id ??
    stackPreview?.data.components[0]?.id;
  // Cuts contained by the screen currently in view. The All/Solo toggle only
  // makes sense when a screen actually holds children (more than its own root).
  const scopedCutCount = stackPreview
    ? (() => {
        const rootIdSet = stackRootIds(stackPreview.data);
        return stackPreview.data.components.filter(
          (cut) =>
            !rootIdSet.has(cut.id) && (focusedRootId ? cut.rootId === focusedRootId : true),
        ).length;
      })()
    : 0;
  const currentStackThumb =
    canStack && currentItem ? stackThumbnailUrls[currentItem.id] : undefined;
  const stackImageUrl =
    effectiveStackId && stackPreview?.urls[effectiveStackId]
      ? stackPreview.urls[effectiveStackId]
      : currentStackThumb ?? currentUrl;

  // ── builder href ──────────────────────────────────────────────────────────
  const builderSource = isGroup
    ? (currentItem?.mediaKind === "image" ? currentItem : null) ??
      (group?.coverReferenceId
        ? imageReferences.find((r) => r.id === group.coverReferenceId)
        : undefined) ??
      imageReferences[0] ??
      null
    : subject.item.mediaKind === "image"
    ? subject.item
    : null;
  const builderHref = builderSource
    ? `/tools?id=${encodeURIComponent(builderSource.id)}${group ? `&groupId=${encodeURIComponent(group.id)}` : ""}`
    : null;

  // ── tabs config ───────────────────────────────────────────────────────────
  const tabs = isGroup
    ? [
        { id: "screens", label: "Originals" },
        { id: "stacks", label: "Screens" },
      ]
    : [
        { id: "screen", label: "Original" },
        { id: "stack", label: "Screens", disabled: !canStack },
      ];

  return (
    <div
      role="dialog"
      aria-modal
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <ModalShell
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(t) => {
          setActiveTab(t as MainTab);
          if (isGroup) setFocusedItem(null);
        }}
        title={isGroup ? group!.name : subject.item.name}
        onClose={onClose}
      >
        {/* ── left: content area ────────────────────────────────────────────── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {isGroup && !focusedItem ? (
            /* group gallery */
            displayedItems.length > 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
                >
                  {displayedItems.map((item) => (
                    <ReferenceCard
                      key={item.id}
                      kind="reference"
                      item={item}
                      stackThumbnailUrl={stackThumbnailUrls[item.id]}
                      selected={false}
                      onSelect={() => setFocusedItem(item)}
                      onDoubleClick={() => setFocusedItem(item)}
                    />
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
            )
          ) : (
            /* single item view — reference always; group when item is focused */
            <>
              {/* back — group only, and only when there is a gallery to return to */}
              {isGroup && focusedItem && displayedItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => setFocusedItem(null)}
                  className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-1 rounded-[7px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] px-2.5 py-1.5 text-[11.5px] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
                >
                  <ChevronLeft size={13} />
                  Back
                </button>
              )}

              {/* Back to stacks — when a single stack is focused out of several */}
              {showStackView && hasMultipleStacks && focusedRootId && (
                <button
                  type="button"
                  onClick={() => { setFocusedRootId(null); setSelectedStackComponentId(null); }}
                  className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-1 rounded-[7px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] px-2.5 py-1.5 text-[11.5px] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
                >
                  <ChevronLeft size={13} />
                  Stacks
                </button>
              )}

              {/* All / Solo toggle — only when the shown screen holds cuts */}
              {showStackView && !(hasMultipleStacks && !focusedRootId) && scopedCutCount > 0 && (
                <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 flex items-center gap-0.5 rounded-[8px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.88)] p-0.5 backdrop-blur">
                  {(["composite", "isolated"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setStackViewMode(mode)}
                      className={[
                        "h-7 cursor-pointer rounded-[6px] px-2.5 text-[11.5px] font-medium transition-colors",
                        stackViewMode === mode
                          ? "bg-[var(--surface)] text-[var(--text)]"
                          : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
                      ].join(" ")}
                    >
                      {mode === "composite" ? "All" : "Solo"}
                    </button>
                  ))}
                </div>
              )}

              {/* prev arrow — group focused non-stack item */}
              {isGroup && focusedItem && !canStack && displayedItems.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setFocusedItem(
                      displayedItems[(focusedIndex - 1 + displayedItems.length) % displayedItems.length]
                    )
                  }
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
                >
                  <ChevronLeft size={15} />
                </button>
              )}

              {/* main preview — the screens gallery sits at the top, not centered */}
              <div
                className={[
                  "flex flex-1 justify-center overflow-hidden p-6",
                  showStackView && hasMultipleStacks && !focusedRootId ? "items-start" : "items-center",
                ].join(" ")}
              >
                {showStackView ? (
                  stackLoading && !stackPreview ? (
                    <p className="text-[13px] text-[var(--text-muted)]">Loading stack…</p>
                  ) : hasMultipleStacks && !focusedRootId && stackPreview ? (
                    <StackRootsGallery
                      roots={stackRoots}
                      urls={stackPreview.urls}
                      onOpen={(id) => { setFocusedRootId(id); setSelectedStackComponentId(null); }}
                    />
                  ) : (stackViewMode === "composite" || scopedCutCount === 0) && stackPreview ? (
                    <StackCompositeView
                      data={stackPreview.data}
                      urls={stackPreview.urls}
                      selectedId={effectiveStackId ?? null}
                      onSelect={setSelectedStackComponentId}
                      rootId={focusedRootId}
                    />
                  ) : (
                    currentItem && (
                      <img
                        src={stackImageUrl ?? currentStackThumb ?? currentUrl}
                        alt={currentItem.name}
                        className="block max-h-full max-w-full rounded-[10px] object-contain"
                        draggable={false}
                      />
                    )
                  )
                ) : currentItem?.mediaKind === "video" ? (
                  currentUrl ? (
                    <video
                      src={currentUrl}
                      controls
                      autoPlay
                      className="block max-h-full max-w-full rounded-[10px]"
                    />
                  ) : (
                    <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
                  )
                ) : (
                  // Original tab: always the true source image, never the stack
                  // composite (which is the first screen, not the original).
                  <img
                    src={currentUrl ?? currentStackThumb}
                    alt={currentItem?.name}
                    className="block max-h-full max-w-full rounded-[10px] object-contain"
                    draggable={false}
                  />
                )}
              </div>

              {/* next arrow — group focused non-stack item */}
              {isGroup && focusedItem && !canStack && displayedItems.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setFocusedItem(displayedItems[(focusedIndex + 1) % displayedItems.length])
                  }
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] text-[var(--text)] backdrop-blur hover:bg-[var(--surface-hover)]"
                >
                  <ChevronRight size={15} />
                </button>
              )}

              {/* position counter — group focused */}
              {isGroup && focusedItem && displayedItems.length > 1 && (
                <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[rgba(14,14,15,0.85)] px-2.5 py-1 text-[10.5px] tabular-nums text-[var(--text-muted)] backdrop-blur">
                  {focusedIndex + 1} / {displayedItems.length}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── right: detail panel ───────────────────────────────────────────── */}
        <DetailPanel
          key={currentItem?.id ?? group?.id ?? "none"}
          item={currentItem}
          group={group}
          imageGroup={isImageGroup}
          groupReferences={groupReferences}
          groups={groups}
          looseReferences={isGroup ? looseReferences : []}
          stackThumbnailUrls={stackThumbnailUrls}
          builderHref={builderHref}
          stackTree={stackTree}
          stackLoading={stackLoading}
          selectedStackComponentId={selectedStackComponentId}
          stackPreviewUrls={stackPreview?.urls}
          showStackView={showStackView}
          awaitingScreenSelection={awaitingScreenSelection}
          onSelectStackComponent={setSelectedStackComponentId}
          onIsolateStackComponent={(id) => {
            setSelectedStackComponentId(id);
            setStackViewMode("isolated");
          }}
          onDelete={() => {
            if (currentItem) onDelete(currentItem.id);
            if (isGroup) setFocusedItem(null);
            else onClose();
          }}
          onNameChange={onNameChange}
          onDescriptionChange={onDescriptionChange}
          onTagsChange={onTagsChange}
          onSourceUrlChange={onSourceUrlChange}
          onGroupChange={onGroupChange}
          onExtractFrames={() => { if (currentItem) onExtractFrames(currentItem); }}
          onUpload={onUpload}
          onEditGroup={onEditGroup}
          onDeleteGroup={() => { onDeleteGroup(); onClose(); }}
        />
      </ModalShell>
    </div>
  );
}

// ─── item details (right panel) ───────────────────────────────────────────────

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

// ─── group details (right panel) ──────────────────────────────────────────────

function GroupDetails({
  group, references, looseReferences, onGroupChange,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  looseReferences: ReferenceItem[];
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
    </div>
  );
}

// ─── image-as-group details (right panel) ─────────────────────────────────────

// A single image split into multiple screens has no ReferenceGroup row, so its
// "group" is the image itself: editing the group name edits the image name.
function ImageGroupDetails({
  item,
  onNameChange,
}: {
  item: ReferenceItem;
  onNameChange: (id: string, name: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(item.name);
  const prevIdRef = useRef(item.id);
  const screenCount = item.stack?.rootCount ?? 1;

  useEffect(() => {
    if (prevIdRef.current === item.id) return;
    prevIdRef.current = item.id;
    setNameDraft(item.name);
  }, [item.id, item.name]);

  return (
    <div className="flex flex-col gap-3.5">
      <Section title="Group name">
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => onNameChange(item.id, nameDraft)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setNameDraft(item.name); e.currentTarget.blur(); }
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Group name"
          className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[13px] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
      </Section>

      <Section title="Details">
        <DetailList
          items={[
            ["Screens", String(screenCount)],
            ["Format", item.type],
            ...(item.w && item.h ? [["Dimensions", `${item.w} × ${item.h}`] as [string, string]] : []),
            ["Size", formatSize(item.size || 0)],
            ...(item.stack?.enabled
              ? [["Stack", `${item.stack.itemCount} ${item.stack.itemCount === 1 ? "component" : "components"}`] as [string, string]]
              : []),
            ["Added", formatDateTime(item.added)],
          ]}
        />
      </Section>
    </div>
  );
}

// ─── shared layout ────────────────────────────────────────────────────────────

function ModalShell({
  tabs, activeTab, onTabChange, title, onClose, children,
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function DetailPanel({
  item, group, imageGroup = false, groupReferences, groups, looseReferences,
  stackThumbnailUrls, builderHref,
  stackTree = [], stackLoading = false, selectedStackComponentId = null,
  stackPreviewUrls, showStackView = false, awaitingScreenSelection = false,
  onSelectStackComponent, onIsolateStackComponent,
  onDelete, onNameChange, onDescriptionChange, onTagsChange, onSourceUrlChange, onGroupChange,
  onExtractFrames, onUpload, onEditGroup, onDeleteGroup,
}: {
  item: ReferenceItem | null;
  group: ReferenceGroup | null;
  imageGroup?: boolean;
  groupReferences: ReferenceItem[];
  groups: ReferenceGroup[];
  looseReferences: ReferenceItem[];
  stackThumbnailUrls: Record<string, string>;
  builderHref: string | null;
  stackTree?: StackTreeNode[];
  stackLoading?: boolean;
  selectedStackComponentId?: string | null;
  stackPreviewUrls?: Record<string, string>;
  showStackView?: boolean;
  awaitingScreenSelection?: boolean;
  onSelectStackComponent?: (id: string) => void;
  onIsolateStackComponent?: (id: string) => void;
  onDelete: () => void;
  onNameChange: (id: string, name: string) => void;
  onDescriptionChange: (id: string, desc: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, url: string) => void;
  onGroupChange: (id: string, groupId: string | null) => void;
  onExtractFrames: () => void;
  onUpload: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
}) {
  // There is no separate Stack tab. The Inspector is a context-sensitive view of
  // whatever is selected: the image's data for the original, and the stack tree
  // when a screen/stack is being viewed.
  type SideTab = "inspector" | "group";
  const hasStack = Boolean(item?.stack?.enabled);
  const defaultTab: SideTab = !item && group ? "group" : "inspector";
  const [tab, setTab] = useState<SideTab>(defaultTab);
  const hasGroupTab = Boolean(group) || imageGroup;
  const inspectorShowsStack = showStackView && hasStack;
  const showingStackTree = tab === "inspector" && inspectorShowsStack;

  // Opening a screen always surfaces it in the Inspector, never the Group tab.
  useEffect(() => {
    if (showStackView) setTab("inspector");
  }, [showStackView]);

  const selectedNode = selectedStackComponentId
    ? findStackNode(stackTree, selectedStackComponentId)
    : null;
  const selectedPreviewUrl = selectedStackComponentId && stackPreviewUrls
    ? stackPreviewUrls[selectedStackComponentId]
    : undefined;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elev)]">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--border)] px-2 py-1.5">
        <TabButton active={tab === "inspector"} onClick={() => setTab("inspector")}>
          Inspector
        </TabButton>
        {hasGroupTab && (
          <TabButton active={tab === "group"} onClick={() => setTab("group")}>
            Group
          </TabButton>
        )}
      </div>

      <div className={`min-h-0 flex-1 ${showingStackTree ? "flex flex-col overflow-hidden" : "overflow-y-auto p-4"}`}>
        {tab === "inspector" && inspectorShowsStack ? (
          <>
            <div className="min-h-0 flex-1 overflow-hidden flex flex-col">
              <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
                <p className="m-0 text-[11.5px] font-semibold text-[var(--text)]">Stack tree</p>
                {stackLoading && stackTree.length === 0 ? (
                  <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">Loading…</p>
                ) : (
                  <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
                    {awaitingScreenSelection
                      ? "Select a screen"
                      : stackTree.length > 0
                      ? `${countTreeNodes(stackTree)} components`
                      : "No data"}
                  </p>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {awaitingScreenSelection ? (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] text-[var(--text-faint)]">
                    Select a screen to view its stack.
                  </div>
                ) : stackLoading && stackTree.length === 0 ? (
                  <p className="px-2 py-3 text-[11.5px] text-[var(--text-faint)]">Loading stack…</p>
                ) : stackTree.length > 0 ? (
                  stackTree.map((node) => (
                    <StackTreeRows
                      key={node.component.id}
                      node={node}
                      selectedId={selectedStackComponentId}
                      onSelect={(id) => onSelectStackComponent?.(id)}
                      onIsolate={(id) => onIsolateStackComponent?.(id)}
                    />
                  ))
                ) : (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] text-[var(--text-faint)]">
                    No stack data found.
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-[var(--border)]">
              {selectedNode ? (
                <>
                  <div className="flex items-start gap-2.5 p-3">
                    {selectedPreviewUrl && (
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface)]">
                        <img
                          src={selectedPreviewUrl}
                          alt={selectedNode.component.name}
                          className="h-full w-full object-contain"
                          draggable={false}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="m-0 truncate text-[12px] font-semibold leading-snug text-[var(--text)]">
                        {selectedNode.component.name}
                      </p>
                      <p className="m-0 mt-1 text-[10.5px] tabular-nums text-[var(--text-faint)]">
                        {Math.round(selectedNode.component.box.w)} × {Math.round(selectedNode.component.box.h)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] px-3 py-2.5">
                    {item?.mediaKind === "image" && builderHref ? (
                      <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
                    ) : null}
                    <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
                  </div>
                </>
              ) : (
                <p className="px-3 py-3 text-[11.5px] text-[var(--text-faint)]">No component selected.</p>
              )}
            </div>
          </>
        ) : tab === "inspector" && item ? (
          <ItemDetails
            item={item}
            groups={groups}
            onDescriptionChange={onDescriptionChange}
            onTagsChange={onTagsChange}
            onSourceUrlChange={onSourceUrlChange}
            onGroupChange={onGroupChange}
          />
        ) : tab === "inspector" ? (
          <p className="text-[12px] text-[var(--text-faint)]">No item selected.</p>
        ) : tab === "group" && group ? (
          <GroupDetails
            group={group}
            references={groupReferences}
            looseReferences={looseReferences}
            onGroupChange={onGroupChange}
          />
        ) : tab === "group" && imageGroup && item ? (
          <ImageGroupDetails item={item} onNameChange={onNameChange} />
        ) : null}
      </div>

      {!showingStackTree && (
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
              <Action icon={<Edit3 size={12} />} label="Edit" onClick={onEditGroup} />
              <Action icon={<Trash2 size={12} />} label="Delete" danger onClick={onDeleteGroup} />
            </>
          ) : tab === "group" && imageGroup && item ? (
            <>
              {builderHref ? (
                <ActionLink icon={<Layers size={12} />} label="Builder" to={builderHref} />
              ) : null}
              <Action icon={<Trash2 size={12} />} label="Remove" danger onClick={onDelete} />
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}

// ─── primitives ───────────────────────────────────────────────────────────────

function findStackNode(nodes: StackTreeNode[], id: string): StackTreeNode | null {
  for (const node of nodes) {
    if (node.component.id === id) return node;
    const found = findStackNode(node.children, id);
    if (found) return found;
  }
  return null;
}

function countTreeNodes(nodes: StackTreeNode[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    stack.push(...node.children);
  }
  return count;
}

function TabButton({
  active, disabled = false, onClick, children,
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

function StackCompositeView({
  data, urls, selectedId, onSelect, rootId = null,
}: {
  data: ReferenceStackData;
  urls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // When set, render only this root: its image as the background and only the
  // cuts that belong to it. When null, use the default root / original.
  rootId?: string | null;
}) {
  const rootIds = stackRootIds(data);
  const scopedRoot = rootId ? data.roots?.find((r) => r.id === rootId) : undefined;
  const defaultRootId = rootId ?? data.roots?.find((r) => r.isDefault)?.id ?? data.rootComponentId;
  const bgUrl = defaultRootId ? urls[defaultRootId] : undefined;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // The projection frame: when scoped to a trimmed root, cut boxes (stored in
  // original-image space) are positioned relative to that root's box; otherwise
  // relative to the full original.
  const frame = scopedRoot
    ? { x: scopedRoot.box.x, y: scopedRoot.box.y, w: scopedRoot.box.w, h: scopedRoot.box.h }
    : { x: 0, y: 0, w: data.original.w, h: data.original.h };

  // Root entries also live in `data.components`; skip them so the original is not
  // painted twice (background + a full-size overlay = the "two stacked images"
  // bug). When scoped to a root, keep only that root's cuts.
  const overlayCuts = data.components.filter(
    (cut) => !rootIds.has(cut.id) && (rootId ? cut.rootId === rootId : true),
  );

  return (
    <div className="relative leading-[0]" onClick={() => onSelect(null)}>
      {bgUrl ? (
        <img
          src={bgUrl}
          alt="original"
          className="block max-h-[calc(100vh-220px)] max-w-full rounded-[10px]"
          draggable={false}
        />
      ) : (
        <div
          className="rounded-[10px] bg-[var(--surface)]"
          style={{ width: frame.w, height: frame.h, maxWidth: "100%", maxHeight: "calc(100vh - 220px)" }}
        />
      )}
      {overlayCuts.map((cut) => {
        const isSelected = cut.id === selectedId;
        const isHovered = cut.id === hoveredId;
        const cutUrl = urls[cut.id];
        return (
          <button
            key={cut.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(cut.id); }}
            onMouseEnter={() => setHoveredId(cut.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute cursor-pointer bg-transparent p-0"
            style={{
              left: `${((cut.box.x - frame.x) / frame.w) * 100}%`,
              top: `${((cut.box.y - frame.y) / frame.h) * 100}%`,
              width: `${(cut.box.w / frame.w) * 100}%`,
              height: `${(cut.box.h / frame.h) * 100}%`,
              boxSizing: "border-box",
              outline: isSelected
                ? "2px solid #89C4FF"
                : isHovered
                ? "2px solid rgba(137,196,255,0.7)"
                : "none",
              outlineOffset: isSelected ? "-2px" : "-1.5px",
            }}
          >
            {cutUrl && (
              <img
                src={cutUrl}
                alt={cut.name}
                className="block h-full w-full"
                draggable={false}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

type StackRootEntry = { id: string; name: string };

function listStackRoots(data: ReferenceStackData): StackRootEntry[] {
  if (data.roots && data.roots.length > 0) {
    return data.roots.map((root) => ({ id: root.id, name: root.name }));
  }
  if (data.rootComponentId) {
    const root = data.components.find((c) => c.id === data.rootComponentId);
    return [{ id: data.rootComponentId, name: root?.name || data.original.name || "Stack" }];
  }
  return [];
}

function StackRootsGallery({
  roots, urls, onOpen,
}: {
  roots: StackRootEntry[];
  urls: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="min-h-0 max-h-full w-full overflow-y-auto">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {roots.map((root) => (
          <ReferenceCard
            key={root.id}
            kind="stack-root"
            thumbnailUrl={urls[root.id]}
            title={root.name}
            badge="Stack"
            onClick={() => onOpen(root.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StackTreeRows({
  node, selectedId, onSelect, onIsolate,
}: {
  node: StackTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIsolate?: (id: string) => void;
}) {
  const id = node.component.id;
  const active = selectedId === id;
  return (
    <>
      <div
        className={[
          "group mb-1 flex min-h-8 w-full items-center rounded-[7px] border transition-colors",
          active
            ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
            : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => onSelect(id)}
          className="flex min-h-8 flex-1 cursor-pointer items-center gap-2 bg-transparent py-1.5 text-left"
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
        <button
          type="button"
          title="View in isolation"
          onClick={() => onIsolate?.(id)}
          className="mr-1 grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] bg-transparent opacity-0 transition-opacity hover:bg-[var(--surface-hover)] group-hover:opacity-100 text-current"
        >
          <Eye size={11} />
        </button>
      </div>
      {node.children.map((child) => (
        <StackTreeRows key={child.component.id} node={child} selectedId={selectedId} onSelect={onSelect} onIsolate={onIsolate} />
      ))}
    </>
  );
}


async function loadStackPreview(item: ReferenceItem): Promise<StackPreviewState | null> {
  const data = await readReferenceStackData(item.id);
  if (!data) return null;
  const baseUrl = (await loadReferenceUrl(item)) ?? "";
  const urls: Record<string, string> = {};
  const ownedUrls: string[] = [];

  if (data.roots && data.roots.length > 0) {
    for (const root of data.roots) {
      if (!root.file) { urls[root.id] = baseUrl; continue; }
      const blob = await loadReferenceStackFile(item.id, root.file, "image/png");
      if (!blob) { urls[root.id] = baseUrl; continue; }
      const url = URL.createObjectURL(blob);
      urls[root.id] = url;
      ownedUrls.push(url);
    }
  }

  for (const component of data.components) {
    if (!component.file) { urls[component.id] = baseUrl; continue; }
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

  if (data.roots && data.roots.length > 0) {
    return data.roots.map((root) => {
      const synthetic: ReferenceStackItem = {
        id: root.id,
        name: root.name,
        type: data.original.type,
        box: root.box,
        file: root.file,
        parentId: null,
        createdAt: root.createdAt,
      };
      return visit(synthetic, 0, new Set());
    });
  }

  const root = data.components.find((c) => c.id === data.rootComponentId);
  if (root) return [visit(root, 0, new Set())];
  return (byParent.get("__root__") ?? data.components)
    .filter((c, i, list) => list.findIndex((x) => x.id === c.id) === i)
    .map((c) => visit(c, 0, new Set()));
}
