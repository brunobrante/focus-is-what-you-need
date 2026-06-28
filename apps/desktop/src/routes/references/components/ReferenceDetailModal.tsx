import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Folder } from "lucide-react";
import type { ReferenceGroup } from "@/lib/references/groupTypes";
import { stackRootIds } from "@/lib/references/stackTypes";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import type { ReferenceItem, StackPreviewState } from "../types";
import { useReferenceUrl } from "../hooks/useReferenceUrl";
import { ModalShell } from "./ModalShell";
import { DetailPanel } from "./DetailPanel";
import { StackCompositeView, StackRootsGallery } from "./StackView";
import {
  loadStackPreview, releaseStackUrls, buildStackTree, listStackRoots,
} from "./stackViewHelpers";
import { writeReferenceStackData } from "@/lib/tauri/referenceStorage";

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
  const [focusedRootId, setFocusedRootId] = useState<string | null>(null);

  // ── derived ───────────────────────────────────────────────────────────────
  const group = subject?.kind === "group" ? subject.group : null;
  const groupReferences = subject?.kind === "group" ? subject.references : [];
  const imageReferences = groupReferences.filter((r) => r.mediaKind === "image");
  const stackedReferences = groupReferences.filter((r) => r.stack?.enabled);

  const currentItem: ReferenceItem | null =
    subject?.kind === "reference" ? subject.item : focusedItem;
  const canStack = Boolean(currentItem?.stack?.enabled);
  const isImageGroup =
    !isGroup &&
    currentItem?.mediaKind === "image" &&
    (currentItem?.stack?.rootCount ?? 1) > 1;

  const displayedItems = activeTab === "screens" || activeTab === "stacks" ? groupReferences : stackedReferences;
  const focusedIndex = focusedItem
    ? displayedItems.findIndex((i) => i.id === focusedItem.id)
    : -1;

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
    // Don't release here — the `[stackPreview]` cleanup effect below is the sole
    // owner of releasing state-held previews. Releasing here too double-revokes the
    // same URLs (this set-null fires that cleanup with the very preview we just freed).
    setStackPreview(null);
    if (!canStack || !currentItem) { setStackLoading(false); return; }

    let cancelled = false;
    setStackLoading(true);
    void loadStackPreview(currentItem).then((preview) => {
      if (cancelled) { releaseStackUrls(preview); return; }
      setStackPreview(preview);
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
  const stackRoots = stackPreview ? listStackRoots(stackPreview.data) : [];
  const hasMultipleStacks = stackRoots.length > 1;
  const awaitingScreenSelection = hasMultipleStacks && !focusedRootId;
  const stackTree = focusedRootId
    ? fullStackTree.filter((node) => node.component.id === focusedRootId)
    : hasMultipleStacks
    ? []
    : fullStackTree;
  const effectiveStackId =
    selectedStackComponentId ??
    focusedRootId ??
    stackPreview?.data.primaryComponentId ??
    stackPreview?.data.roots?.[0]?.id ??
    stackPreview?.data.components[0]?.id;
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

  // ── stack component rename ────────────────────────────────────────────────
  function handleRenameStackComponent(id: string, name: string) {
    if (!stackPreview || !currentItem) return;
    const data = stackPreview.data;
    const inRoots = data.roots?.some((r) => r.id === id);
    const updated = {
      ...data,
      roots: inRoots
        ? data.roots!.map((r) => r.id === id ? { ...r, name } : r)
        : data.roots,
      components: !inRoots
        ? data.components.map((c) => c.id === id ? { ...c, name } : c)
        : data.components,
    };
    setStackPreview((prev) => prev ? { ...prev, data: updated } : prev);
    void writeReferenceStackData(currentItem.id, updated);
  }

  // ── tabs config ───────────────────────────────────────────────────────────
  const tabs = isGroup
    ? [
        { id: "screens", label: "Originals" },
        { id: "stacks", label: "Screens" },
      ]
    : [
        { id: "screen", label: "Original" },
        { id: "stack", label: "Screens" },
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
            <>
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
                  <img
                    src={currentUrl ?? currentStackThumb}
                    alt={currentItem?.name}
                    className="block max-h-full max-w-full rounded-[10px] object-contain"
                    draggable={false}
                  />
                )}
              </div>

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
          builderHref={builderHref}
          stackTree={stackTree}
          stackLoading={stackLoading}
          selectedStackComponentId={selectedStackComponentId}
          stackPreviewUrls={stackPreview?.urls}
          showStackView={showStackView}
          awaitingScreenSelection={awaitingScreenSelection}
          onSelectStackComponent={setSelectedStackComponentId}
          onRenameStackComponent={handleRenameStackComponent}
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
