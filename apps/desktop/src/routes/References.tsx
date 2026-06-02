import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Edit3,
  ExternalLink,
  Film,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import {
  saveReferenceFile,
  loadReferenceFile,
  removeReferenceFile,
  readReferenceGroups,
  readReferenceStackData,
  loadReferenceStackFile,
  readRefsMeta,
  syncReferenceGroupArchive,
  writeReferenceGroups,
  writeRefsMeta,
  extFromName,
} from "@/lib/tauri/referenceStorage";
import type {
  ReferenceStackData,
  ReferenceStackItem,
  ReferenceStackSummary,
} from "@/lib/references/stackTypes";
import {
  newReferenceGroupId,
  type ReferenceGroup,
  type ReferenceGroupArchive,
} from "@/lib/references/groupTypes";
import { ensureWorkspaceFolders } from "@/lib/tauri/workspace";

/* ---------- Constants ---------- */

const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // 150 MB (~5–10 min)

const masonryItemStyle = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
  WebkitColumnBreakInside: "avoid",
};

/* ---------- Types ---------- */

type MediaKind = "image" | "video" | "figx";

type RefType =
  | "PNG"
  | "JPG"
  | "WEBP"
  | "SVG"
  | "GIF"
  | "MP4"
  | "MOV"
  | "WEBM"
  | "AVI"
  | "MKV"
  | "FIGX"
  | "IMG";

type ReferenceItem = {
  id: string;
  name: string;
  mediaKind: MediaKind;
  type: RefType;
  w: number;
  h: number;
  size: number;
  duration?: number;
  description?: string;
  sourceUrl?: string;
  contentHash?: string;
  tags: string[];
  added: string;
  ext?: string; // file extension used on disk (set after save)
  groupId?: string | null;
  stack?: ReferenceStackSummary;
  url: string; // runtime only — Object URL created from the file blob
};

type StagedItem = ReferenceItem & { desc: string };
type DuplicateDecision = "existing" | "both";
type PendingDuplicate = {
  existing: ReferenceItem;
  imported: StagedItem;
};

type FilterKind = "all" | "image" | "video" | "figx";
type FilterType = "all" | RefType;
type FilterSort = "recent" | "old" | "name" | "size";

type ImportTab = "local" | "figx";
type GroupDialogState =
  | { mode: "create"; group?: undefined }
  | { mode: "edit"; group: ReferenceGroup }
  | null;
type ArchiveStatus = {
  groupId: string;
  label: string;
  saving: boolean;
} | null;
type LightboxTab = "original" | "stack";
type StackPreviewState = {
  data: ReferenceStackData;
  urls: Record<string, string>;
  ownedUrls: string[];
};
type StackTreeNode = {
  component: ReferenceStackItem;
  children: StackTreeNode[];
  depth: number;
};
type SelectedSubject =
  | { kind: "reference"; id: string }
  | { kind: "group"; id: string }
  | null;

/* ---------- File-system storage ---------- */

async function loadLibrary(): Promise<ReferenceItem[]> {
  await ensureWorkspaceFolders().catch(() => {});
  const metas = await readRefsMeta();
  const items: ReferenceItem[] = [];
  for (const meta of metas) {
    const ext = meta.ext || extFromName(meta.name);
    const blob = await loadReferenceFile(meta.id, ext).catch(() => null);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    items.push({ ...meta, ext, url });
  }
  return items;
}

function persistMeta(library: ReferenceItem[]): void {
  const metas = library.map(({ url: _url, ...rest }) => ({
    ...rest,
    ext: rest.ext ?? extFromName(rest.name),
  }));
  void writeRefsMeta(metas);
}

/* ---------- Main component ---------- */

export function References() {
  const [library, setLibrary] = useState<ReferenceItem[]>([]);
  const [groups, setGroups] = useState<ReferenceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");

  const typeOptions = useMemo(() => typeOptionsForKind(filterKind), [filterKind]);
  const [filterSort, setFilterSort] = useState<FilterSort>("recent");
  const [importTargetGroupId, setImportTargetGroupId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SelectedSubject>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<ReferenceItem | null>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
  const [deleteGroup, setDeleteGroup] = useState<ReferenceGroup | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatus>(null);
  const [stackThumbnailUrls, setStackThumbnailUrls] = useState<Record<string, string>>({});

  // Keep a ref to the current library so the unmount cleanup sees the latest value.
  const libraryRef = useRef<ReferenceItem[]>([]);
  libraryRef.current = library;
  const stackThumbnailUrlsRef = useRef<Record<string, string>>({});
  stackThumbnailUrlsRef.current = stackThumbnailUrls;

  useEffect(() => {
    Promise.all([loadLibrary(), readReferenceGroups()]).then(([items, storedGroups]) => {
      const libraryWithGroups = applyGroupsToLibrary(items, storedGroups);
      const nextGroups = normalizeGroupsForLibrary(storedGroups, libraryWithGroups);
      setLibrary(libraryWithGroups);
      setGroups(nextGroups);
      setLoading(false);
    });
    return () => {
      for (const item of libraryRef.current) releaseReferenceItemUrls(item);
      for (const url of Object.values(stackThumbnailUrlsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  // Persist metadata whenever library changes (after initial load)
  useEffect(() => {
    if (loading) return;
    persistMeta(library);
  }, [library, loading]);

  useEffect(() => {
    if (loading) return;
    void writeReferenceGroups(groups);
  }, [groups, loading]);

  useEffect(() => {
    if (!selectedSubject) return;
    if (selectedSubject.kind === "reference") {
      if (!library.some((item) => item.id === selectedSubject.id)) setSelectedSubject(null);
      return;
    }
    if (!groups.some((group) => group.id === selectedSubject.id)) setSelectedSubject(null);
  }, [groups, library, selectedSubject]);

  const importTargetGroup = useMemo(
    () =>
      importTargetGroupId
        ? groups.find((group) => group.id === importTargetGroupId) ?? null
        : null,
    [groups, importTargetGroupId],
  );

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (filterKind !== "all" || filterType !== "all") return [];
    return groups
      .filter((group) => {
        if (!q) return true;
        const hay = `${group.name} ${group.description ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [groups, query, filterKind, filterType]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = library.filter((r) => {
      if (r.groupId) return false;
      if (filterKind !== "all" && r.mediaKind !== filterKind) return false;
      if (filterType !== "all" && r.type !== filterType) return false;
      if (q) {
        const hay = `${r.name} ${(r.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list];
    switch (filterSort) {
      case "old":
        list.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "size":
        list.sort((a, b) => (b.size || 0) - (a.size || 0));
        break;
      default:
        list.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
    }
    return list;
  }, [library, query, filterKind, filterType, filterSort]);

  const selected = useMemo(
    () =>
      selectedSubject?.kind === "reference"
        ? library.find((item) => item.id === selectedSubject.id) ?? null
        : null,
    [library, selectedSubject],
  );

  const selectedGroup = useMemo(
    () =>
      selectedSubject?.kind === "group"
        ? groups.find((group) => group.id === selectedSubject.id) ?? null
        : null,
    [groups, selectedSubject],
  );
  const selectedGroupReferences = useMemo(() => {
    if (!selectedGroup) return [];
    const referencesById = new Map(library.map((item) => [item.id, item]));
    return selectedGroup.referenceIds
      .map((id) => referencesById.get(id))
      .filter((item): item is ReferenceItem => item != null);
  }, [library, selectedGroup]);
  const looseGroupCandidates = useMemo(
    () =>
      library
        .filter((item) => item.mediaKind === "image" && !item.groupId)
        .sort((a, b) => {
          const stackDelta = Number(Boolean(b.stack?.enabled)) - Number(Boolean(a.stack?.enabled));
          if (stackDelta !== 0) return stackDelta;
          return a.name.localeCompare(b.name);
        }),
    [library],
  );

  useEffect(() => {
    if (loading) return;
    const candidateIds = new Set<string>();
    const referencesById = new Map(library.map((item) => [item.id, item]));

    for (const item of library) {
      if (!item.groupId) candidateIds.add(item.id);
    }
    for (const group of groups) {
      const coverId = group.coverReferenceId ?? group.referenceIds[0] ?? null;
      if (coverId) candidateIds.add(coverId);
    }
    if (selectedGroup) {
      for (const id of selectedGroup.referenceIds) candidateIds.add(id);
    }

    const missing = Array.from(candidateIds).filter((id) => {
      const item = referencesById.get(id);
      return Boolean(
        item?.mediaKind === "image" &&
          item.stack?.enabled &&
          !stackThumbnailUrls[id],
      );
    });
    if (missing.length === 0) return;

    let cancelled = false;
    const run = () => {
      void loadStackThumbnailBatch(missing).then((entries) => {
        if (entries.length === 0) return;
        if (cancelled) {
          for (const [, url] of entries) URL.revokeObjectURL(url);
          return;
        }
        setStackThumbnailUrls((current) => {
          const next = { ...current };
          for (const [id, url] of entries) {
            if (next[id]) {
              URL.revokeObjectURL(url);
              continue;
            }
            next[id] = url;
          }
          return next;
        });
      });
    };

    const idleId = requestIdle(run);
    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [groups, library, loading, selectedGroup, stackThumbnailUrls]);

  const addItems = useCallback((items: ReferenceItem[]) => {
    if (items.length === 0) return;
    const targetGroupId = importTargetGroupId;
    const nextItems = targetGroupId
      ? items.map((item) => ({ ...item, groupId: targetGroupId }))
      : items;
    setLibrary((prev) => [...nextItems, ...prev]);
    if (targetGroupId) {
      setGroups((prev) => addReferencesToGroup(prev, targetGroupId, nextItems.map((item) => item.id)));
    }
    if (targetGroupId) {
      setSelectedSubject({ kind: "group", id: targetGroupId });
    } else if (nextItems[0]) {
      setSelectedSubject({ kind: "reference", id: nextItems[0].id });
    }
  }, [importTargetGroupId]);

  const removeItem = useCallback((id: string) => {
    setLibrary((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) releaseReferenceItemUrls(item);
      return prev.filter((i) => i.id !== id);
    });
    setGroups((prev) => removeReferenceFromGroups(prev, id));
    setStackThumbnailUrls((current) => {
      const url = current[id];
      if (!url) return current;
      URL.revokeObjectURL(url);
      const { [id]: _removed, ...next } = current;
      return next;
    });
    void removeReferenceFile(id);
    setSelectedSubject((current) =>
      current?.kind === "reference" && current.id === id ? null : current,
    );
  }, []);

  const updateDescription = useCallback((id: string, description: string) => {
    setLibrary((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, description: description.trim() || undefined } : item,
      ),
    );
  }, []);

  const updateTags = useCallback((id: string, tags: string[]) => {
    setLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, tags } : item)),
    );
  }, []);

  const updateSourceUrl = useCallback((id: string, sourceUrl: string) => {
    setLibrary((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, sourceUrl: sourceUrl.trim() || undefined } : item,
      ),
    );
  }, []);

  const updateReferenceGroup = useCallback((id: string, groupId: string | null) => {
    const nextGroupId = groupId || null;
    setLibrary((prev) =>
      prev.map((item) => (item.id === id ? { ...item, groupId: nextGroupId } : item)),
    );
    setGroups((prev) => moveReferenceToGroup(prev, id, nextGroupId));
  }, []);

  const saveGroupDialog = useCallback((input: { name: string; description?: string }) => {
    const now = new Date().toISOString();
    if (groupDialog?.mode === "edit") {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupDialog.group.id
            ? {
                ...group,
                name: input.name,
                description: input.description,
                updatedAt: now,
              }
            : group,
        ),
      );
      setGroupDialog(null);
      return;
    }

    const group: ReferenceGroup = {
      id: newReferenceGroupId(),
      name: input.name,
      description: input.description,
      referenceIds: [],
      coverReferenceId: null,
      createdAt: now,
      updatedAt: now,
    };
    setGroups((prev) => [group, ...prev]);
    setGroupDialog(null);
  }, [groupDialog]);

  const confirmDeleteGroup = useCallback(() => {
    if (!deleteGroup) return;
    const groupId = deleteGroup.id;
    setGroups((prev) => prev.filter((group) => group.id !== groupId));
    setLibrary((prev) =>
      prev.map((item) => (item.groupId === groupId ? { ...item, groupId: null } : item)),
    );
    setImportTargetGroupId((current) => (current === groupId ? null : current));
    setDeleteGroup(null);
  }, [deleteGroup]);

  const syncGroupArchive = useCallback(async (group: ReferenceGroup) => {
    const referenceIds = group.referenceIds.filter((id) => library.some((item) => item.id === id));
    if (referenceIds.length === 0) {
      setArchiveStatus({ groupId: group.id, label: "No references", saving: false });
      return;
    }
    setArchiveStatus({ groupId: group.id, label: "Saving .figx...", saving: true });
    try {
      const archive = await syncReferenceGroupArchive({
        id: group.id,
        name: group.name,
        referenceIds,
      });
      setGroups((prev) => updateGroupArchive(prev, group.id, archive));
      setArchiveStatus({ groupId: group.id, label: ".figx saved", saving: false });
    } catch (error) {
      console.error("[references] syncReferenceGroupArchive failed:", error);
      setArchiveStatus({ groupId: group.id, label: "Failed to save", saving: false });
    }
  }, [library]);

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      <TopBar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex flex-1 min-w-0 min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-7 pb-20 pt-8">
              <header className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h1 className="m-0 mb-1.5 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]">
                    References
                  </h1>
                  <p className="m-0 text-[13px] text-[var(--text-muted)]">
                    Images, stacks, and stack groups saved locally.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SmallButton type="button" onClick={() => setGroupDialog({ mode: "create" })}>
                    <FolderPlus size={14} />
                    New stack group
                  </SmallButton>
                  <SmallButton
                    type="button"
                    primary
                    onClick={() => {
                      setImportTargetGroupId(null);
                      setImportOpen(true);
                    }}
                  >
                    <Upload size={14} />
                    Upload
                  </SmallButton>
                </div>
              </header>

              <div className="mb-[22px] flex flex-wrap items-center gap-2.5">
                <SearchInput value={query} onChange={setQuery} />
                <SelectControl
                  value={filterKind}
                  onChange={(v) => {
                    const next = v as FilterKind;
                    setFilterKind(next);
                    setFilterType((current) => {
                      const opts = typeOptionsForKind(next);
                      return opts.some((o) => o.value === current) ? current : "all";
                    });
                  }}
                  options={[
                    { value: "all", label: "All" },
                    { value: "image", label: "Images" },
                    { value: "video", label: "Videos" },
                    { value: "figx", label: "Canvas" },
                  ]}
                />
                <SelectControl
                  value={filterType}
                  onChange={(v) => setFilterType(v as FilterType)}
                  options={typeOptions}
                />
                <SelectControl
                  value={filterSort}
                  onChange={(v) => setFilterSort(v as FilterSort)}
                  options={[
                    { value: "recent", label: "Mais recentes" },
                    { value: "old", label: "Mais antigos" },
                    { value: "name", label: "Nome (A–Z)" },
                    { value: "size", label: "Maior tamanho" },
                  ]}
                />
                <span className="ml-auto text-[12px] tabular-nums text-[var(--text-muted)]">
                  {loading
                    ? "…"
                    : `${visibleGroups.length + visible.length} ${
                        visibleGroups.length + visible.length === 1 ? "item" : "itens"
                      }`}
                </span>
              </div>

              {loading ? (
                <LoadingState />
              ) : visibleGroups.length + visible.length === 0 ? (
                <EmptyState
                  onUpload={() => {
                    setImportTargetGroupId(null);
                    setImportOpen(true);
                  }}
                />
              ) : (
                <CatalogGrid
                  groups={visibleGroups}
                  references={visible}
                  allReferences={library}
                  groupNameById={groupNameById}
                  archiveStatus={archiveStatus}
                  stackThumbnailUrls={stackThumbnailUrls}
                  selectedReferenceId={selectedSubject?.kind === "reference" ? selectedSubject.id : null}
                  selectedGroupId={selectedSubject?.kind === "group" ? selectedSubject.id : null}
                  onSelectReference={(id) => setSelectedSubject({ kind: "reference", id })}
                  onSelectGroup={(id) => setSelectedSubject({ kind: "group", id })}
                  onOpenLightbox={(item) => setLightboxItem(item)}
                />
              )}
            </div>
          </div>

          <footer className="mt-auto border-t border-[var(--border)] py-4 text-center text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
            v0.1 · design preview
          </footer>
        </main>

        <aside
          className={[
            "shrink-0 overflow-hidden border-l border-[var(--border)]",
            "transition-[width] duration-200",
            selected || selectedGroup ? "w-[320px]" : "w-0",
          ].join(" ")}
          style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
        >
          {selectedGroup ? (
            <GroupInspector
              group={selectedGroup}
              references={selectedGroupReferences}
              looseReferences={looseGroupCandidates}
              archiveStatus={
                archiveStatus?.groupId === selectedGroup.id ? archiveStatus : null
              }
              stackThumbnailUrls={stackThumbnailUrls}
              onClose={() => setSelectedSubject(null)}
              onOpenLightbox={(item) => setLightboxItem(item)}
              onUpload={() => {
                setImportTargetGroupId(selectedGroup.id);
                setImportOpen(true);
              }}
              onEdit={() => setGroupDialog({ mode: "edit", group: selectedGroup })}
              onDelete={() => setDeleteGroup(selectedGroup)}
              onSyncArchive={() => void syncGroupArchive(selectedGroup)}
              onGroupChange={updateReferenceGroup}
            />
          ) : (
            <Inspector
              item={selected}
              onClose={() => setSelectedSubject(null)}
              onOpenLightbox={(item) => setLightboxItem(item)}
              onDelete={(id) => removeItem(id)}
              onDescriptionChange={updateDescription}
              onTagsChange={updateTags}
              onSourceUrlChange={updateSourceUrl}
              groups={groups}
              onGroupChange={updateReferenceGroup}
            />
          )}
        </aside>
      </div>

      <ImportModal
        open={importOpen}
        existingItems={library}
        onClose={() => {
          setImportOpen(false);
          setImportTargetGroupId(null);
        }}
        onAdd={(items) => {
          addItems(items);
          setImportOpen(false);
          setImportTargetGroupId(null);
        }}
        onUseExisting={(item) => {
          if (importTargetGroupId) {
            updateReferenceGroup(item.id, importTargetGroupId);
            setSelectedSubject({ kind: "group", id: importTargetGroupId });
          } else {
            setSelectedSubject({ kind: "reference", id: item.id });
          }
          setImportOpen(false);
          setImportTargetGroupId(null);
        }}
        targetGroupName={importTargetGroup?.name ?? null}
      />

      <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      <ReferenceGroupModal
        state={groupDialog}
        onCancel={() => setGroupDialog(null)}
        onSave={saveGroupDialog}
      />
      <DeleteGroupModal
        group={deleteGroup}
        onCancel={() => setDeleteGroup(null)}
        onConfirm={confirmDeleteGroup}
      />
    </div>
  );
}

/* ---------- Groups ---------- */

function ReferenceGroupModal({
  state,
  onCancel,
  onSave,
}: {
  state: GroupDialogState;
  onCancel: () => void;
  onSave: (input: { name: string; description?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!state) return;
    setName(state.mode === "edit" ? state.group.name : "");
    setDescription(state.mode === "edit" ? state.group.description ?? "" : "");
  }, [state]);

  if (!state) return null;

  const trimmedName = name.trim();
  const title = state.mode === "edit" ? "Edit stack group" : "Create stack group";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(0,0,0,0.65)] p-8 backdrop-blur-[6px]"
    >
      <div
        role="document"
        className="flex w-[min(440px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--text)]">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 p-[18px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
              Name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mobile checkout project"
              className="h-[36px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional context for this set of references..."
              rows={3}
              className="resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-[18px] py-3">
          <SmallButton type="button" onClick={onCancel}>
            Cancel
          </SmallButton>
          <SmallButton
            type="button"
            primary
            disabled={!trimmedName}
            onClick={() =>
              onSave({
                name: trimmedName,
                description: description.trim() || undefined,
              })
            }
          >
            Save stack group
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

function DeleteGroupModal({
  group,
  onCancel,
  onConfirm,
}: {
  group: ReferenceGroup | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!group) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Delete stack group"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(0,0,0,0.68)] p-8 backdrop-blur-[6px]"
    >
      <div
        role="document"
        className="flex w-[min(420px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="border-b border-[var(--border)] px-[18px] py-4">
          <h3 className="m-0 text-[15px] font-semibold text-[var(--text)]">Delete stack group?</h3>
          <p className="m-0 mt-2 text-[12px] leading-[1.5] text-[var(--text-muted)]">
            This removes the stack group "{group.name}" but keeps every screen, stack file, and cut.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-[18px] py-3">
          <SmallButton type="button" onClick={onCancel}>
            Cancel
          </SmallButton>
          <SmallButton type="button" onClick={onConfirm}>
            Delete stack group
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

/* ---------- Grid ---------- */

function CatalogGrid({
  groups,
  references,
  allReferences,
  groupNameById,
  archiveStatus,
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
  archiveStatus: ArchiveStatus;
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
          column-width: 224px;
          column-gap: 14px;
        }
        @media (max-width: 720px) {
          .reference-library-grid {
            column-width: 168px;
            column-gap: 10px;
          }
        }
      `}</style>
      <div className="reference-library-grid">
        {groups.map((group) => (
          <GroupPin
            key={group.id}
            group={group}
            references={group.referenceIds
              .map((id) => referencesById.get(id))
              .filter((item): item is ReferenceItem => item != null)}
            archiveStatus={archiveStatus?.groupId === group.id ? archiveStatus : null}
            stackThumbnailUrls={stackThumbnailUrls}
            selected={group.id === selectedGroupId}
            onSelect={() => onSelectGroup(group.id)}
          />
        ))}

        {references.map((item) => (
          <Pin
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

function GroupPin({
  group,
  references,
  archiveStatus,
  stackThumbnailUrls,
  selected,
  onSelect,
}: {
  group: ReferenceGroup;
  references: ReferenceItem[];
  archiveStatus: ArchiveStatus;
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
  const ratio = firstImage?.w && firstImage.h ? firstImage.w / firstImage.h : 16 / 9;
  const padBottom = (100 / ratio).toFixed(2);
  const thumbnailUrl = firstImage
    ? referenceCardThumbnailUrl(firstImage, stackThumbnailUrls[firstImage.id])
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group mb-[14px] inline-block w-full break-inside-avoid cursor-pointer border-0 bg-transparent p-0 text-left align-top text-inherit"
      style={masonryItemStyle}
    >
      <div className="relative pr-1.5 pt-1.5">
        {references.length > 1 ? (
          <>
            <span className="pointer-events-none absolute inset-0 translate-x-1 translate-y-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] opacity-65" />
            <span className="pointer-events-none absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-[10px] border border-[var(--border)] bg-[var(--surface)] opacity-45" />
          </>
        ) : null}
        <div
          className={[
            "relative overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,box-shadow] duration-150",
            selected
              ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
              : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_22px_rgba(0,0,0,0.12)] group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]",
          ].join(" ")}
        >
          {thumbnailUrl ? (
            <div
              className="block w-full bg-cover bg-center bg-[var(--surface)]"
              style={{
                paddingBottom: `${padBottom}%`,
                backgroundImage: `url('${thumbnailUrl}')`,
              }}
            />
          ) : (
            <div
              className="relative w-full bg-[var(--bg)] text-[var(--text-muted)]"
              style={{ paddingBottom: `${padBottom}%` }}
            >
              <Folder
                size={30}
                strokeWidth={1.5}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            </div>
          )}
          <span className="pointer-events-none absolute left-2 top-2 rounded-[4px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.4px] text-white backdrop-blur">
            Stack group
          </span>
          {archiveStatus ? (
            <span className="pointer-events-none absolute right-2 top-2 max-w-[96px] truncate rounded-[4px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[3px] text-[9.5px] text-white backdrop-blur">
              {archiveStatus.label}
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
                <span>{references.length} {references.length === 1 ? "screen" : "screens"}</span>
                <span>·</span>
                <span>{stackCount} {stackCount === 1 ? "stack" : "stacks"}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function Pin({
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
  const ratio = item.w && item.h ? item.w / item.h : 16 / 9;
  const padBottom = (100 / ratio).toFixed(2);
  const thumbnailUrl = referenceCardThumbnailUrl(item, stackThumbnailUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className="group mb-[14px] inline-block w-full break-inside-avoid cursor-zoom-in border-0 bg-transparent p-0 text-left align-top text-inherit"
      style={masonryItemStyle}
    >
      <div
        className={[
          "relative overflow-hidden rounded-[10px] border bg-[var(--surface)] transition-[border-color,box-shadow] duration-150",
          selected
            ? "border-[var(--text)] shadow-[0_0_0_1px_var(--text)]"
            : "border-[var(--border)] shadow-[0_1px_0_rgba(255,255,255,0.03),0_8px_22px_rgba(0,0,0,0.12)] group-hover:border-[var(--border-strong)] group-hover:shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.18)]",
        ].join(" ")}
      >
        {item.mediaKind === "video" ? (
          <div className="relative w-full" style={{ paddingBottom: `${padBottom}%` }}>
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
            className="block w-full bg-cover bg-center bg-[var(--surface)]"
            style={{
              paddingBottom: `${padBottom}%`,
              backgroundImage: `url('${thumbnailUrl}')`,
            }}
          />
        )}

        {item.mediaKind === "image" ? (
          <span
            className={[
              "pointer-events-none absolute left-2 top-2 rounded-[4px] border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] px-1.5 py-[3px] text-[9.5px] uppercase tracking-[0.4px] text-[var(--text)] backdrop-blur transition-opacity duration-150",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            ].join(" ")}
          >
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
              <span>{formatSize(item.size || 0)}</span>
              {item.duration ? <><span>·</span><span>{formatDuration(item.duration)}</span></> : null}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------- States ---------- */

function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center text-[13px] text-[var(--text-faint)]">
      Carregando…
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <button
      type="button"
      onClick={onUpload}
      className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-[12px] border border-dashed border-[var(--border-strong)] py-20 text-center transition-colors hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.01)]"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
        backgroundSize: "22px 22px",
        backgroundColor: "var(--bg)",
      }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]">
        <Upload size={18} />
      </span>
      <div>
        <p className="m-0 text-[13px] font-medium text-[var(--text)]">No references yet</p>
        <p className="m-0 mt-1 text-[12px] text-[var(--text-faint)]">
          Click to upload images or videos
        </p>
      </div>
    </button>
  );
}

/* ---------- Inspector ---------- */

function Inspector({
  item,
  groups,
  onClose,
  onOpenLightbox,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
  onGroupChange,
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
}) {
  // Keep last item rendered during the sidebar close animation
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
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
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
          Info
        </span>
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

        <Section title="Stack group">
          <select
            value={display.groupId ?? ""}
            onChange={(event) => onGroupChange(display.id, event.target.value || null)}
            className="h-[34px] w-full cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12px] text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]"
          >
            <option value="">No stack group</option>
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
          <InspectorLinkAction
            icon={<Layers size={12} />}
            label="Builder"
            to={builderHref}
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

function GroupInspector({
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

  useEffect(() => {
    setAddReferenceId("");
  }, [group.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
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
        <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-muted)]">
          Stack group
        </span>
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
            onChange={(event) => {
              const nextId = event.target.value;
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
          <InspectorLinkAction
            icon={<Layers size={12} />}
            label="Builder"
            to={builderHref}
          />
        ) : (
          <InspectorAction
            icon={<Layers size={12} />}
            label="Builder"
            disabled
            onClick={() => undefined}
          />
        )}
        <InspectorAction icon={<Upload size={12} />} label="Add" onClick={onUpload} />
        <InspectorAction
          icon={<Archive size={12} />}
          label=".figx"
          disabled={archiveStatus?.saving || references.length === 0}
          onClick={onSyncArchive}
        />
        <InspectorAction icon={<Edit3 size={12} />} label="Edit" onClick={onEdit} />
        <InspectorAction
          icon={<Trash2 size={12} />}
          label="Delete"
          danger
          onClick={onDelete}
        />
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

/* ---------- UI atoms ---------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h5 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        {title}
      </h5>
      {children}
    </div>
  );
}

function DetailList({ items }: { items: Array<[string, string] | [string, string, boolean]> }) {
  return (
    <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-[12px]">
      {items.map(([label, value, mono]) => (
        <Fragment key={label}>
          <dt className="text-[var(--text-muted)]">{label}</dt>
          <dd
            className={[
              "m-0 break-words text-[var(--text)] tabular-nums",
              mono ? "font-mono text-[11px] text-[var(--text-muted)]" : "",
            ].join(" ")}
          >
            {value}
          </dd>
        </Fragment>
      ))}
    </dl>
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

function SmallButton({
  primary = false,
  className = "",
  ...props
}: ComponentProps<typeof Button> & { primary?: boolean }) {
  return (
    <Button
      {...props}
      className={[
        "h-8 cursor-pointer gap-[7px] rounded-[8px] border px-3 text-[12.5px] font-medium shadow-none transition-colors duration-[120ms]",
        primary
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-white hover:text-[var(--accent-fg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]",
        "disabled:cursor-not-allowed disabled:bg-[#2A2A2A] disabled:text-[#6B6B6B]",
        className,
      ].join(" ")}
    />
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-[220px] max-w-[420px] flex-1">
      <Search
        size={14}
        className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by name or tag..."
        className="h-[34px] w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-8 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 grid h-[22px] w-[22px] -translate-y-1/2 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

function SelectControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative inline-flex">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[34px] min-w-[160px] cursor-pointer appearance-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] py-0 pl-3 pr-[30px] text-[12.5px] font-medium text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-[var(--text-muted)]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-[11px] top-1/2 h-[7px] w-[7px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
      />
    </div>
  );
}

/* ---------- Import modal ---------- */

function ImportModal({
  open,
  existingItems,
  targetGroupName,
  onClose,
  onAdd,
  onUseExisting,
}: {
  open: boolean;
  existingItems: ReferenceItem[];
  targetGroupName: string | null;
  onClose: () => void;
  onAdd: (items: ReferenceItem[]) => void;
  onUseExisting: (item: ReferenceItem) => void;
}) {
  const [tab, setTab] = useState<ImportTab>("local");
  const [dragActive, setDragActive] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [duplicateQueue, setDuplicateQueue] = useState<PendingDuplicate[]>([]);
  const [duplicateDecision, setDuplicateDecision] = useState<DuplicateDecision>("existing");
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const pendingDuplicate = duplicateQueue[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && duplicateQueue.length === 0) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, duplicateQueue.length]);

  useEffect(() => {
    if (!open) {
      if (!confirmedRef.current) {
        setStaged((prev) => {
          for (const item of prev) {
            discardReferenceItem(item);
          }
          return [];
        });
        setDuplicateQueue((prev) => {
          for (const duplicate of prev) discardReferenceItem(duplicate.imported);
          return [];
        });
      } else {
        setStaged([]);
        setDuplicateQueue([]);
        confirmedRef.current = false;
      }
      setTab("local");
      setDragActive(false);
      setRejectedFiles([]);
      setDuplicateDecision("existing");
      setProcessing(false);
    }
  }, [open]);

  function doCancel() {
    for (const item of staged) {
      discardReferenceItem(item);
    }
    for (const duplicate of duplicateQueue) discardReferenceItem(duplicate.imported);
    setStaged([]);
    setDuplicateQueue([]);
    setRejectedFiles([]);
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of arr) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) continue;
      if (isVideo && file.size > MAX_VIDEO_BYTES) {
        rejected.push(file.name);
        continue;
      }
      accepted.push(file);
    }

    setRejectedFiles(rejected);
    if (accepted.length === 0) return;

    setProcessing(true);
    try {
      const created = await Promise.all(accepted.map(fileToReference));
      const valid = created.filter(Boolean) as ReferenceItem[];
      const nextStaged: StagedItem[] = [];
      const nextDuplicates: PendingDuplicate[] = [];

      for (const item of valid) {
        const imported: StagedItem = { ...item, desc: "" };
        const duplicate = findDuplicateReference(item, [...existingItems, ...nextStaged]);
        if (duplicate) {
          nextDuplicates.push({ existing: duplicate, imported });
        } else {
          nextStaged.push(imported);
        }
      }

      setStaged((prev) => {
        for (const item of prev) discardReferenceItem(item);
        return nextStaged;
      });
      setDuplicateQueue((prev) => {
        for (const duplicate of prev) discardReferenceItem(duplicate.imported);
        return nextDuplicates;
      });
      setDuplicateDecision("existing");
    } finally {
      setProcessing(false);
    }
  }

  function handleConfirm() {
    if (duplicateQueue.length > 0) return;
    confirmedRef.current = true;
    const items: ReferenceItem[] = staged.map(({ desc, ...item }) => ({
      ...item,
      description: desc.trim() || undefined,
      sourceUrl: item.sourceUrl?.trim() || undefined,
    }));
    onAdd(items);
  }

  function resolveDuplicate() {
    if (!pendingDuplicate) return;
    const remaining = duplicateQueue.slice(1);
    if (duplicateDecision === "existing") {
      discardReferenceItem(pendingDuplicate.imported);
      setDuplicateQueue(remaining);
      setDuplicateDecision("existing");
      if (remaining.length === 0 && staged.length === 0) {
        confirmedRef.current = true;
        onUseExisting(pendingDuplicate.existing);
      }
      return;
    }

    setStaged((prev) => [pendingDuplicate.imported, ...prev]);
    setDuplicateQueue(remaining);
    setDuplicateDecision("existing");
  }

  if (!open) return null;

  const isStaged = staged.length > 0;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Add reference"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(0,0,0,0.65)] p-8 backdrop-blur-[6px]"
    >
      <div
        role="document"
        className="flex w-[min(560px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-[18px] py-3.5">
          <h3 className="m-0 text-[14px] font-semibold text-[var(--text)]">
            {isStaged
              ? `${staged.length} ${staged.length === 1 ? "file selected" : "files selected"}`
              : targetGroupName
                ? `Add screens to ${targetGroupName}`
                : "Add reference"}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={14} />
          </button>
        </div>

        {!isStaged && (
          <div className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-4 pt-3">
            <TabButton active={tab === "local"} onClick={() => setTab("local")}>
              <ImageIcon size={13} className="opacity-70" />
              Arquivo local
            </TabButton>
            <TabButton active={tab === "figx"} onClick={() => setTab("figx")}>
              <Sparkles size={13} className="opacity-70" />
              .figx
              <span className="ml-1 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] px-1.5 py-[2px] text-[9px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                em breve
              </span>
            </TabButton>
          </div>
        )}

        <div
          className={[
            "flex flex-col gap-3.5 overflow-y-auto p-[18px]",
            isStaged ? "max-h-[480px]" : "min-h-[300px] flex-1",
          ].join(" ")}
        >
          {isStaged ? (
            <div className="flex flex-col gap-2.5">
              {staged.map((item) => (
                <StagedItemRow
                  key={item.id}
                  item={item}
                  onDescChange={(desc) =>
                    setStaged((prev) =>
                      prev.map((s) => (s.id === item.id ? { ...s, desc } : s)),
                    )
                  }
                  onSourceUrlChange={(sourceUrl) =>
                    setStaged((prev) =>
                      prev.map((s) => (s.id === item.id ? { ...s, sourceUrl } : s)),
                    )
                  }
                  onTagAdd={(tag) =>
                    setStaged((prev) =>
                      prev.map((s) =>
                        s.id === item.id ? { ...s, tags: [...s.tags, tag] } : s,
                      ),
                    )
                  }
                  onTagRemove={(tag) =>
                    setStaged((prev) =>
                      prev.map((s) =>
                        s.id === item.id ? { ...s, tags: s.tags.filter((t) => t !== tag) } : s,
                      ),
                    )
                  }
                  onRemove={() => {
                    discardReferenceItem(item);
                    setStaged((prev) => prev.filter((s) => s.id !== item.id));
                  }}
                />
              ))}
            </div>
          ) : tab === "local" ? (
            <>
              <label
                onDragOver={(event: DragEvent<HTMLLabelElement>) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event: DragEvent<HTMLLabelElement>) => {
                  event.preventDefault();
                  setDragActive(false);
                  void handleFiles(event.dataTransfer.files);
                }}
                className={[
                  "flex cursor-pointer flex-col items-center gap-3 rounded-[10px] border-[1.5px] border-dashed px-[18px] py-9 text-center transition-colors",
                  processing
                    ? "pointer-events-none border-[var(--border-strong)] opacity-60"
                    : dragActive
                      ? "border-[var(--text)] bg-[rgba(255,255,255,0.02)]"
                      : "border-[var(--border-strong)] hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.02)]",
                ].join(" ")}
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                  backgroundColor: dragActive ? "rgba(255,255,255,0.02)" : "var(--bg)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  disabled={processing}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.files) void handleFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                <span className="grid h-[42px] w-[42px] place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]">
                  {processing ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]" />
                  ) : (
                    <Upload size={20} />
                  )}
                </span>
                <div>
                  <h4 className="m-0 text-[13.5px] font-semibold text-[var(--text)]">
                    {processing ? "Processing…" : "Drag files here"}
                  </h4>
                  <p className="m-0 mt-1 max-w-[340px] text-[12px] text-[var(--text-muted)]">
                    Imagens: PNG, JPG, GIF, WebP, SVG
                    <br />
                    Videos: MP4, MOV, WebM, AVI, MKV (max. 150 MB)
                  </p>
                </div>
                <div className="flex gap-3 text-[11.5px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon size={12} className="opacity-60" /> Imagens
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5">
                    <Film size={12} className="opacity-60" /> Videos
                  </span>
                </div>
              </label>

              {rejectedFiles.length > 0 ? (
                <div className="rounded-[8px] border border-[rgba(255,100,100,0.25)] bg-[rgba(255,80,80,0.08)] px-3 py-2.5">
                  <p className="m-0 text-[12px] font-medium text-[#ff8a8a]">
                    {rejectedFiles.length === 1
                      ? "1 video ignored — exceeds 150 MB:"
                      : `${rejectedFiles.length} videos ignored — exceed 150 MB:`}
                  </p>
                  <ul className="m-0 mt-1 list-none p-0">
                    {rejectedFiles.map((name) => (
                      <li key={name} className="text-[11.5px] text-[#ff8a8a]/70">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]">
                <Sparkles size={22} />
              </span>
              <div>
                <p className="m-0 text-[13.5px] font-semibold text-[var(--text)]">
                  .figx import
                </p>
                <p className="m-0 mt-2 max-w-[340px] text-[12px] leading-[1.55] text-[var(--text-muted)]">
                  <code className="text-[11px] text-[var(--text)]">.figx</code> files are
                  native platform references — they import multiple items in a single operation
                  directly from your projects.
                </p>
                <p className="m-0 mt-3 text-[11.5px] text-[var(--text-faint)]">
                  Coming soon.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-[18px] py-3">
          {isStaged ? (
            <>
              <SmallButton type="button" onClick={doCancel}>
                Voltar
              </SmallButton>
              <SmallButton
                type="button"
                primary
                disabled={staged.length === 0}
                onClick={handleConfirm}
              >
                {targetGroupName ? "Add to stack group" : `Add ${staged.length} ${staged.length === 1 ? "item" : "items"}`}
              </SmallButton>
            </>
          ) : (
            <SmallButton type="button" onClick={onClose}>
              Fechar
            </SmallButton>
          )}
        </div>
      </div>

      <DuplicateFileAlert
        duplicate={pendingDuplicate}
        decision={duplicateDecision}
        onDecisionChange={setDuplicateDecision}
        onClose={() => {
          if (pendingDuplicate) discardReferenceItem(pendingDuplicate.imported);
          setDuplicateQueue((prev) => prev.slice(1));
          setDuplicateDecision("existing");
        }}
        onConfirm={resolveDuplicate}
      />
    </div>
  );
}

function DuplicateFileAlert({
  duplicate,
  decision,
  onDecisionChange,
  onClose,
  onConfirm,
}: {
  duplicate: PendingDuplicate | null;
  decision: DuplicateDecision;
  onDecisionChange: (decision: DuplicateDecision) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!duplicate) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, onClose]);

  if (!duplicate) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Arquivo duplicado"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(0,0,0,0.72)] p-5 backdrop-blur-[7px]"
    >
      <div
        role="document"
        className="flex max-h-[calc(100vh-32px)] w-[min(1120px,100%)] flex-col overflow-hidden rounded-[14px] border border-[var(--border-strong)] bg-[var(--bg-elev)]"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h3 className="m-0 text-[18px] font-semibold text-[var(--text)]">
            Alerta de arquivo duplicado
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
          <div className="grid gap-7 md:grid-cols-2">
            <DuplicatePreview
              item={duplicate.existing}
              badge="Existente"
              muted={decision !== "existing"}
            />
            <DuplicatePreview
              item={duplicate.imported}
              badge="Importado"
              muted={decision !== "both"}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-5 border-t border-[var(--border)] px-5 py-4">
          <DuplicateChoice
            checked={decision === "existing"}
            label="Use existing file"
            onChange={() => onDecisionChange("existing")}
          />
          <DuplicateChoice
            checked={decision === "both"}
            label="Manter os dois"
            onChange={() => onDecisionChange("both")}
          />
          <SmallButton type="button" primary className="ml-auto min-w-[132px]" onClick={onConfirm}>
            Importar
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

function DuplicatePreview({
  item,
  badge,
  muted,
}: {
  item: ReferenceItem;
  badge: string;
  muted: boolean;
}) {
  return (
    <div className={["flex min-w-0 flex-col gap-4", muted ? "opacity-55" : ""].join(" ")}>
      <div className="relative flex h-[min(34vw,360px)] min-h-[220px] items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)]">
        {item.mediaKind === "video" ? (
          <video src={item.url} muted preload="metadata" className="max-h-full max-w-full" />
        ) : (
          <img
            src={item.url}
            alt={item.name}
            draggable={false}
            className="block max-h-full max-w-full object-contain"
          />
        )}
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-[rgba(20,20,20,0.88)] px-4 py-2 text-[18px] font-medium text-[var(--text)] shadow-[0_8px_26px_rgba(0,0,0,0.35)]">
          {badge}
        </span>
      </div>
      <div className="text-center">
        <p className="mx-auto mb-1.5 mt-0 max-w-[440px] break-words text-[17px] font-medium leading-[1.3] text-[var(--text)]">
          {item.name}
        </p>
        <p className="m-0 text-[14px] tabular-nums text-[var(--text-muted)]">
          {item.w && item.h ? `${item.w} × ${item.h} / ` : ""}
          {formatSize(item.size || 0)}
        </p>
        {item.tags.length > 0 ? (
          <div className="mt-2 flex justify-center">
            <span className="rounded-[6px] border border-[var(--border)] px-2 py-1 text-[12px] text-[var(--text-muted)]">
              {item.tags[0]}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DuplicateChoice({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[17px] font-medium text-[var(--text)]">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 accent-[#2f8ee8]"
      />
      {label}
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3 pb-3 pt-2 text-[12.5px] font-medium transition-colors",
        active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-[2px] bg-[var(--text)]" />
      ) : null}
    </button>
  );
}

function TagEditor({
  tags,
  onAdd,
  onRemove,
  asButton = false,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  asButton?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function commit() {
    const tag = draft
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (tag && !tags.includes(tag)) onAdd(tag);
    setDraft("");
    if (asButton) setEditing(false);
  }

  const chips = tags.map((tag) => (
    <span
      key={tag}
      className="inline-flex items-center gap-[3px] rounded-full border border-[var(--border)] bg-[var(--surface)] pl-1.5 pr-0.5 py-[2px] text-[10px] tracking-[0.3px] text-[var(--text-muted)]"
    >
      #{tag}
      <button
        type="button"
        onClick={() => onRemove(tag)}
        className="grid h-[14px] w-[14px] cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
      >
        <X size={8} />
      </button>
    </span>
  ));

  if (asButton) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {chips}
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft("");
                setEditing(false);
              }
              if (e.key === "Backspace" && draft === "" && tags.length > 0) {
                onRemove(tags[tags.length - 1]);
              }
            }}
            onBlur={commit}
            placeholder="nome-da-tag"
            className="h-[20px] min-w-[90px] rounded-full border border-dashed border-[var(--border-strong)] bg-transparent px-2 text-[10px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-[20px] cursor-pointer items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] bg-transparent px-2 text-[10px] text-[var(--text-faint)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-muted)]"
          >
            <Plus size={8} />
            tag
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5">
      {chips}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            onRemove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (draft) commit();
        }}
        placeholder={tags.length === 0 ? "Add tag…" : "+ tag"}
        className="min-w-[70px] flex-1 border-0 bg-transparent py-0 text-[10.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      />
    </div>
  );
}

function StagedItemRow({
  item,
  onDescChange,
  onSourceUrlChange,
  onTagAdd,
  onTagRemove,
  onRemove,
}: {
  item: StagedItem;
  onDescChange: (desc: string) => void;
  onSourceUrlChange: (url: string) => void;
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--bg)]">
        {item.mediaKind === "video" ? (
          <video
            src={item.url}
            muted
            preload="metadata"
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="m-0 truncate text-[12px] font-medium text-[var(--text)]">{item.name}</p>
            <p className="m-0 text-[11px] text-[var(--text-faint)]">
              {item.type} · {formatSize(item.size)}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Remove"
            onClick={onRemove}
            className="grid h-[22px] w-[22px] shrink-0 cursor-pointer place-items-center rounded-[5px] border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[rgba(255,80,80,0.15)] hover:text-[#ff8a8a]"
          >
            <X size={11} />
          </button>
        </div>
        <textarea
          value={item.desc}
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="Description (opcional)…"
          rows={2}
          className="w-full resize-none rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
        <input
          type="url"
          value={item.sourceUrl ?? ""}
          onChange={(e) => onSourceUrlChange(e.target.value)}
          placeholder="URL de origem (opcional)…"
          className="w-full rounded-[6px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[11.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
        />
        <TagEditor tags={item.tags} onAdd={onTagAdd} onRemove={onTagRemove} />
      </div>
    </div>
  );
}

/* ---------- Lightbox ---------- */

function Lightbox({
  item,
  onClose,
}: {
  item: ReferenceItem | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<LightboxTab>("original");
  const [stackPreview, setStackPreview] = useState<StackPreviewState | null>(null);
  const [stackLoading, setStackLoading] = useState(false);
  const [selectedStackComponentId, setSelectedStackComponentId] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  useEffect(() => {
    setActiveTab("original");
    setSelectedStackComponentId(null);
    setStackPreview((current) => {
      releaseStackPreviewUrls(current);
      return null;
    });

    if (!item || item.mediaKind !== "image" || !item.stack?.enabled) {
      setStackLoading(false);
      return;
    }

    let cancelled = false;
    setStackLoading(true);
    void loadLightboxStackPreview(item)
      .then((preview) => {
        if (cancelled) {
          releaseStackPreviewUrls(preview);
          return;
        }
        setStackPreview(preview);
        setSelectedStackComponentId(preview?.data.primaryComponentId ?? null);
      })
      .finally(() => {
        if (!cancelled) setStackLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id]);

  useEffect(() => {
    return () => {
      releaseStackPreviewUrls(stackPreview);
    };
  }, [stackPreview]);

  if (!item) return null;
  const canShowStack = item.mediaKind === "image" && Boolean(item.stack?.enabled);
  const stackTree = stackPreview ? buildStackTree(stackPreview.data) : [];
  const selectedStackComponent =
    stackPreview && selectedStackComponentId
      ? stackPreview.data.components.find((component) => component.id === selectedStackComponentId) ??
        stackPreview.data.components.find((component) => component.id === stackPreview.data.primaryComponentId) ??
        stackPreview.data.components[0]
      : null;
  const stackImageUrl =
    selectedStackComponent && stackPreview
      ? stackPreview.urls[selectedStackComponent.id] ?? item.url
      : item.url;
  const stackTitle = selectedStackComponent?.name ?? "Stack";

  return (
    <div
      role="dialog"
      aria-modal
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] text-[var(--text)] hover:bg-white hover:text-black"
      >
        <X size={14} />
      </button>

      <div className="flex h-[min(900px,calc(100vh-48px))] w-[min(1320px,calc(100vw-48px))] flex-col overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-[rgba(14,14,15,0.96)] shadow-[0_18px_80px_rgba(0,0,0,0.55)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <LightboxTabButton active={activeTab === "original"} onClick={() => setActiveTab("original")}>
              Original
            </LightboxTabButton>
            <LightboxTabButton
              active={activeTab === "stack"}
              disabled={!canShowStack}
              onClick={() => {
                if (canShowStack) setActiveTab("stack");
              }}
            >
              Stack
            </LightboxTabButton>
          </div>
          <div className="min-w-0 truncate px-2 text-right text-[12px] text-[var(--text-muted)]">
            {activeTab === "stack" ? stackTitle : item.name}
          </div>
        </div>

        {item.mediaKind === "video" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <video
              src={item.url}
              controls
              autoPlay
              className="block max-h-full max-w-full rounded-[10px] bg-[#0E0E0E]"
            />
          </div>
        ) : activeTab === "stack" ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-h-0 min-w-0 items-center justify-center p-4">
              {stackLoading && !stackPreview ? (
                <div className="text-[13px] text-[var(--text-muted)]">Loading stack...</div>
              ) : (
                <img
                  src={stackImageUrl}
                  alt={stackTitle}
                  className="block max-h-full max-w-full rounded-[10px] bg-[#0E0E0E] object-contain"
                  draggable={false}
                />
              )}
            </div>

            <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg-elev)]">
              <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5">
                <h3 className="m-0 text-[12px] font-semibold text-[var(--text)]">Stack tree</h3>
                <p className="m-0 mt-0.5 text-[10.5px] text-[var(--text-faint)]">
                  {stackPreview?.data.components.length ?? 0} components
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {stackTree.length > 0 ? (
                  stackTree.map((node) => (
                    <StackTreeRows
                      key={node.component.id}
                      node={node}
                      selectedId={selectedStackComponent?.id ?? null}
                      onSelect={setSelectedStackComponentId}
                    />
                  ))
                ) : (
                  <div className="rounded-[8px] border border-dashed border-[var(--border)] px-3 py-4 text-[11.5px] leading-[1.45] text-[var(--text-faint)]">
                    No stack data found.
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <img
              src={item.url}
              alt={item.name}
              className="block max-h-full max-w-full rounded-[10px] bg-[#0E0E0E] object-contain"
              draggable={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LightboxTabButton({
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

function StackTreeRows({
  node,
  selectedId,
  onSelect,
}: {
  node: StackTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
          <span className="block truncate text-[11.5px] font-medium">
            {node.component.name}
          </span>
          <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
            {Math.round(node.component.box.w)} x {Math.round(node.component.box.h)}
          </span>
        </span>
      </button>
      {node.children.map((child) => (
        <StackTreeRows
          key={child.component.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

async function loadLightboxStackPreview(item: ReferenceItem): Promise<StackPreviewState | null> {
  const data = await readReferenceStackData(item.id);
  if (!data) return null;

  const urls: Record<string, string> = {};
  const ownedUrls: string[] = [];
  for (const component of data.components) {
    if (!component.file) {
      urls[component.id] = item.url;
      continue;
    }
    const blob = await loadReferenceStackFile(item.id, component.file, "image/png");
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls[component.id] = url;
    ownedUrls.push(url);
  }

  return { data, urls, ownedUrls };
}

function releaseStackPreviewUrls(preview: StackPreviewState | null): void {
  if (!preview) return;
  for (const url of preview.ownedUrls) URL.revokeObjectURL(url);
}

function buildStackTree(data: ReferenceStackData): StackTreeNode[] {
  const byParent = new Map<string, ReferenceStackItem[]>();
  for (const component of data.components) {
    const parentId = component.parentId ?? "__root__";
    const current = byParent.get(parentId) ?? [];
    current.push(component);
    byParent.set(parentId, current);
  }

  const visit = (component: ReferenceStackItem, depth: number, seen: Set<string>): StackTreeNode => {
    if (seen.has(component.id)) return { component, children: [], depth };
    const nextSeen = new Set(seen);
    nextSeen.add(component.id);
    const children = (byParent.get(component.id) ?? [])
      .filter((child) => child.id !== component.id)
      .map((child) => visit(child, depth + 1, nextSeen));
    return { component, children, depth };
  };

  const root = data.components.find((component) => component.id === data.rootComponentId);
  if (root) return [visit(root, 0, new Set())];

  return (byParent.get("__root__") ?? data.components)
    .filter((component, index, list) => list.findIndex((item) => item.id === component.id) === index)
    .map((component) => visit(component, 0, new Set()));
}

/* ---------- Group helpers ---------- */

function applyGroupsToLibrary(
  items: ReferenceItem[],
  groups: ReferenceGroup[],
): ReferenceItem[] {
  const groupIds = new Set(groups.map((group) => group.id));
  const groupByReference = new Map<string, string>();
  for (const group of groups) {
    for (const referenceId of group.referenceIds) {
      if (!groupByReference.has(referenceId)) groupByReference.set(referenceId, group.id);
    }
  }
  return items.map((item) => {
    const groupId =
      item.groupId && groupIds.has(item.groupId)
        ? item.groupId
        : groupByReference.get(item.id) ?? null;
    return { ...item, groupId };
  });
}

function normalizeGroupsForLibrary(
  groups: ReferenceGroup[],
  library: ReferenceItem[],
): ReferenceGroup[] {
  const libraryIds = new Set(library.map((item) => item.id));
  const referencesByGroup = new Map<string, string[]>();
  for (const item of library) {
    if (!item.groupId) continue;
    const current = referencesByGroup.get(item.groupId) ?? [];
    current.push(item.id);
    referencesByGroup.set(item.groupId, current);
  }

  return groups.map((group) => {
    const referenceIds = Array.from(
      new Set([
        ...group.referenceIds.filter((id) => libraryIds.has(id)),
        ...(referencesByGroup.get(group.id) ?? []),
      ]),
    );
    return withGroupReferences(group, referenceIds);
  });
}

function addReferencesToGroup(
  groups: ReferenceGroup[],
  groupId: string,
  referenceIds: string[],
): ReferenceGroup[] {
  const ids = new Set(referenceIds);
  return groups.map((group) => {
    const withoutMoved = group.referenceIds.filter((id) => !ids.has(id));
    if (group.id !== groupId) {
      return withoutMoved.length === group.referenceIds.length
        ? group
        : withGroupReferences(group, withoutMoved, true);
    }
    return withGroupReferences(group, Array.from(new Set([...referenceIds, ...withoutMoved])), true);
  });
}

function removeReferenceFromGroups(groups: ReferenceGroup[], referenceId: string): ReferenceGroup[] {
  return groups.map((group) => {
    if (!group.referenceIds.includes(referenceId)) return group;
    return withGroupReferences(
      group,
      group.referenceIds.filter((id) => id !== referenceId),
      true,
    );
  });
}

function moveReferenceToGroup(
  groups: ReferenceGroup[],
  referenceId: string,
  nextGroupId: string | null,
): ReferenceGroup[] {
  return groups.map((group) => {
    const nextReferences = group.referenceIds.filter((id) => id !== referenceId);
    if (group.id === nextGroupId) nextReferences.unshift(referenceId);
    if (
      nextReferences.length === group.referenceIds.length &&
      nextReferences.every((id, index) => id === group.referenceIds[index])
    ) {
      return group;
    }
    return withGroupReferences(group, nextReferences, true);
  });
}

function updateGroupArchive(
  groups: ReferenceGroup[],
  groupId: string,
  archive: ReferenceGroupArchive,
): ReferenceGroup[] {
  const updatedAt = new Date().toISOString();
  return groups.map((group) =>
    group.id === groupId ? { ...group, archive, updatedAt } : group,
  );
}

function withGroupReferences(
  group: ReferenceGroup,
  referenceIds: string[],
  touch = false,
): ReferenceGroup {
  const uniqueIds = Array.from(new Set(referenceIds));
  const coverReferenceId =
    group.coverReferenceId && uniqueIds.includes(group.coverReferenceId)
      ? group.coverReferenceId
      : uniqueIds[0] ?? null;
  return {
    ...group,
    referenceIds: uniqueIds,
    coverReferenceId,
    updatedAt: touch ? new Date().toISOString() : group.updatedAt,
  };
}

/* ---------- File helpers ---------- */

async function loadStackThumbnailBatch(referenceIds: string[]): Promise<Array<[string, string]>> {
  const entries: Array<[string, string]> = [];
  const queue = [...referenceIds];
  const workerCount = Math.min(4, queue.length);

  async function worker() {
    while (queue.length > 0) {
      const referenceId = queue.shift();
      if (!referenceId) continue;
      const url = await loadStackThumbnailUrl(referenceId).catch(() => null);
      if (url) entries.push([referenceId, url]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return entries;
}

async function loadStackThumbnailUrl(referenceId: string): Promise<string | null> {
  const data = await readReferenceStackData(referenceId);
  if (!data || data.components.length === 0) return null;

  const primaryComponent =
    data.components.find((component) => component.id === data.primaryComponentId) ??
    data.components.find((component) => component.id === data.rootComponentId);
  const thumbnailComponent =
    primaryComponent?.file
      ? primaryComponent
      : pickFallbackStackThumbnailComponent(data.components, data.rootComponentId);
  if (!thumbnailComponent?.file) return null;

  const blob = await loadReferenceStackFile(referenceId, thumbnailComponent.file, "image/png");
  return blob ? URL.createObjectURL(blob) : null;
}

function pickFallbackStackThumbnailComponent(
  components: NonNullable<Awaited<ReturnType<typeof readReferenceStackData>>>["components"],
  rootComponentId: string,
) {
  const withFiles = components.filter((component) => component.id !== rootComponentId && component.file);
  const directChildren = withFiles.filter((component) => component.parentId === rootComponentId);
  const candidates = directChildren.length > 0 ? directChildren : withFiles;
  return candidates.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0] ?? null;
}

function referenceCardThumbnailUrl(item: ReferenceItem, stackThumbnailUrl?: string | null): string {
  if (item.stack?.enabled && stackThumbnailUrl) return stackThumbnailUrl;
  return item.url;
}

function releaseReferenceItemUrls(item: ReferenceItem): void {
  URL.revokeObjectURL(item.url);
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

async function fileToReference(file: File): Promise<ReferenceItem | null> {
  const id = newId();
  const blob: Blob = file;
  const contentHash = await hashBlob(blob).catch(() => undefined);

  let ext: string;
  try {
    ext = await saveReferenceFile(id, blob);
  } catch (err) {
    console.error("[references] saveReferenceFile failed:", err);
    return null;
  }

  const url = URL.createObjectURL(blob);
  const mediaKind: MediaKind = isVideoFile(file) ? "video" : "image";

  let w = 0;
  let h = 0;
  let duration: number | undefined;

  if (mediaKind === "image") {
    const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
    w = dims.w;
    h = dims.h;
  } else {
    const dims = await measureVideo(url).catch(() => ({ w: 0, h: 0, duration: 0 }));
    w = dims.w;
    h = dims.h;
    duration = dims.duration;
  }

  return {
    id,
    name: file.name,
    mediaKind,
    type: inferType(file.name),
    w,
    h,
    size: Math.max(1, Math.round(file.size / 1024)),
    duration,
    contentHash,
    ext,
    tags: [mediaKind],
    added: new Date().toISOString(),
    url,
  };
}

async function hashBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is not available in this environment");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function findDuplicateReference(
  item: ReferenceItem,
  candidates: ReferenceItem[],
): ReferenceItem | null {
  const byHash = item.contentHash
    ? candidates.find((candidate) => candidate.id !== item.id && candidate.contentHash === item.contentHash)
    : null;
  if (byHash) return byHash;

  return (
    candidates.find(
      (candidate) =>
        candidate.id !== item.id &&
        candidate.mediaKind === item.mediaKind &&
        candidate.name === item.name &&
        candidate.size === item.size &&
        candidate.w === item.w &&
        candidate.h === item.h,
    ) ?? null
  );
}

function discardReferenceItem(item: ReferenceItem): void {
  releaseReferenceItemUrls(item);
  void removeReferenceFile(item.id);
}

function measureImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error("Cannot measure image"));
    img.src = src;
  });
}

function measureVideo(src: string): Promise<{ w: number; h: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      resolve({
        w: video.videoWidth || 0,
        h: video.videoHeight || 0,
        duration: isFinite(video.duration) ? video.duration : 0,
      });
    };
    video.onerror = () => reject(new Error("Cannot measure video"));
    video.src = src;
  });
}

/* ---------- Utility helpers ---------- */

function requestIdle(callback: () => void): number {
  if (typeof window === "undefined") return 0;
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
  };
  return idleWindow.requestIdleCallback
    ? idleWindow.requestIdleCallback(callback)
    : window.setTimeout(callback, 1);
}

function cancelIdle(id: number): void {
  if (typeof window === "undefined") return;
  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
  };
  if (idleWindow.cancelIdleCallback) {
    idleWindow.cancelIdleCallback(id);
  } else {
    window.clearTimeout(id);
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `r-${crypto.randomUUID()}`;
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function typeOptionsForKind(kind: FilterKind): Array<{ value: string; label: string }> {
  switch (kind) {
    case "image":
      return [
        { value: "all", label: "All formats" },
        { value: "PNG", label: "PNG" },
        { value: "JPG", label: "JPG" },
        { value: "WEBP", label: "WebP" },
        { value: "SVG", label: "SVG" },
        { value: "GIF", label: "GIF" },
      ];
    case "video":
      return [
        { value: "all", label: "All formats" },
        { value: "MP4", label: "MP4" },
        { value: "MOV", label: "MOV" },
        { value: "WEBM", label: "WebM" },
        { value: "MKV", label: "MKV" },
      ];
    case "figx":
      return [{ value: "all", label: "All formats" }];
    default:
      return [
        { value: "all", label: "All formats" },
        { value: "PNG", label: "PNG" },
        { value: "JPG", label: "JPG" },
        { value: "WEBP", label: "WebP" },
        { value: "SVG", label: "SVG" },
        { value: "GIF", label: "GIF" },
        { value: "MP4", label: "MP4" },
        { value: "MOV", label: "MOV" },
        { value: "WEBM", label: "WebM" },
        { value: "MKV", label: "MKV" },
      ];
  }
}

function inferType(name: string): RefType {
  const ext = (name.split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "JPG";
    case "png":
      return "PNG";
    case "webp":
      return "WEBP";
    case "svg":
      return "SVG";
    case "gif":
      return "GIF";
    case "mp4":
      return "MP4";
    case "mov":
      return "MOV";
    case "webm":
      return "WEBM";
    case "avi":
      return "AVI";
    case "mkv":
      return "MKV";
    case "figx":
      return "FIGX";
    default:
      return "IMG";
  }
}

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem.toString().padStart(2, "0")}m`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
