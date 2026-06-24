import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, ModalBody } from "./Modal";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconImage,
  IconLayers,
  IconSearch,
  IconVideo,
} from "@/components/icons";
import type { ComponentRow, ReferenceAttachment, ReferenceRow, ScreenRow } from "@/lib/storage/schema";
import {
  extFromName,
  loadReferenceFile,
  loadReferenceStackFile,
  readReferenceStackData,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";
import type { ReferenceStackData } from "@/lib/references/stackTypes";
import { stackRootIds } from "@/lib/references/stackTypes";
import { listReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";
import type { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { addReferencesFromFiles } from "@/application/references/addReferencesFromFiles";
import { bakeOriginalThumbnail, bakeStackNodeThumbnail } from "@/lib/references/referenceThumbnails";

/* ---------- Types ---------- */

type LibMeta = StoredRefMeta & { _objectUrl?: string };
type AttachMode = "workspace" | "global" | "screen" | "component";
type KindFilter = "all" | "image" | "video";

// A selectable node inside an image's stack tree. `stackNodeId === null` is the
// whole original image; otherwise it is a root or cut.
type PickNode = {
  key: string;
  stackNodeId: string | null;
  name: string;
  depth: number;
  file: string | null;
  kind: "original" | "root" | "cut";
  w: number;
  h: number;
};

type Props = {
  projectId: string | null;
  /** Set on the workspace references page: enables the workspace-global attach
   *  tab so picks/uploads link to the workspace itself, not a project. */
  workspaceId?: string | null;
  screens: ScreenRow[];
  components: ComponentRow[];
  existingReferences: ReferenceRow[];
  defaultScreenId?: string;
  defaultComponentId?: string;
  onAdd: (input: Parameters<typeof createOrAttachReference>[0]) => Promise<void> | void;
};

export interface AddReferenceModalHandle {
  open: () => void;
  close: () => void;
}

function defaultAttachMode(input: {
  defaultScreenId?: string;
  defaultComponentId?: string;
  projectId: string | null;
  workspaceId?: string | null;
}): AttachMode {
  if (input.defaultComponentId) return "component";
  if (input.defaultScreenId) return "screen";
  // Workspace references page: no project in scope, only the workspace-global tab.
  if (!input.projectId && input.workspaceId) return "workspace";
  return "global";
}

/* ---------- Tree building ---------- */

type StackCut = ReferenceStackData["components"][number];

// A screen (root) plus its nested stack components — one top-level row in the
// picker. The raw original image is never a row of its own.
type ScreenEntry = {
  rowKey: string;
  item: LibMeta;
  node: PickNode; // the screen itself (a cropped "root" or the whole-image "original")
  cuts: PickNode[]; // nested stack components, depth 1+
};

// The whole image as a single screen — used for plain images and non-image media.
function wholeImageNode(item: LibMeta): PickNode {
  return { key: "__original__", stackNodeId: null, name: item.name, depth: 0, file: null, kind: "original", w: item.w, h: item.h };
}

function groupCutsByParent(data: ReferenceStackData): Map<string, StackCut[]> {
  const rootIds = stackRootIds(data);
  const byParent = new Map<string, StackCut[]>();
  for (const cut of data.components) {
    if (rootIds.has(cut.id)) continue;
    const parent = cut.parentId ?? "__root__";
    byParent.set(parent, [...(byParent.get(parent) ?? []), cut]);
  }
  return byParent;
}

function collectCuts(parentId: string, byParent: Map<string, StackCut[]>, depth: number, seen: Set<string>): PickNode[] {
  const out: PickNode[] = [];
  for (const cut of byParent.get(parentId) ?? []) {
    if (seen.has(cut.id)) continue;
    const next = new Set(seen);
    next.add(cut.id);
    out.push({ key: cut.id, stackNodeId: cut.id, name: cut.name, depth, file: cut.file, kind: "cut", w: cut.box.w, h: cut.box.h });
    out.push(...collectCuts(cut.id, byParent, depth + 1, next));
  }
  return out;
}

// Decompose a stacked image into its **screens**. The raw original is never a
// screen of its own: when explicit sub-screens exist, only those are returned;
// otherwise the implicit full-image root is the single screen. Each screen owns
// the stack components cut from it.
function buildScreens(data: ReferenceStackData, item: LibMeta): ScreenEntry[] {
  const byParent = groupCutsByParent(data);
  const roots =
    data.roots && data.roots.length > 0
      ? data.roots
      : data.rootComponentId
      ? [{ id: data.rootComponentId, name: item.name, box: { x: 0, y: 0, w: data.original.w, h: data.original.h }, file: null, isDefault: true, createdAt: "" }]
      : [];
  const hasExplicitScreens = roots.some((root) => !root.isDefault);
  const screenRoots = hasExplicitScreens ? roots.filter((root) => !root.isDefault) : roots;

  return screenRoots.map((root): ScreenEntry => {
    // A default (full-image) screen is added as the whole image so it keeps its
    // stack; a cropped screen is added as its own root node.
    const node: PickNode = root.isDefault
      ? { key: "__original__", stackNodeId: null, name: item.name, depth: 0, file: null, kind: "original", w: root.box.w || item.w, h: root.box.h || item.h }
      : { key: root.id, stackNodeId: root.id, name: root.name, depth: 0, file: root.file, kind: "root", w: root.box.w, h: root.box.h };
    return { rowKey: `${item.id}::${root.id}`, item, node, cuts: collectCuts(root.id, byParent, 1, new Set()) };
  });
}

// The screens contributed by one library item, given its (maybe still loading)
// stack data.
function screenEntriesForItem(item: LibMeta, data: ReferenceStackData | null | undefined): ScreenEntry[] {
  if (item.mediaKind !== "image") {
    return [{ rowKey: item.id, item, node: wholeImageNode(item), cuts: [] }];
  }
  if (!data) {
    // A stacked image whose data is still loading shows nothing yet (so the raw
    // original never flashes); a plain image is itself one screen.
    if (item.stack?.enabled) return [];
    return [{ rowKey: item.id, item, node: wholeImageNode(item), cuts: [] }];
  }
  return buildScreens(data, item);
}

/* ---------- Component ---------- */

export const AddReferenceModal = forwardRef<AddReferenceModalHandle, Props>(function AddReferenceModal(
  { projectId, workspaceId, screens, components, existingReferences, defaultScreenId, defaultComponentId, onAdd },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [attachMode, setAttachMode] = useState<AttachMode>(
    defaultAttachMode({ defaultScreenId, defaultComponentId, projectId, workspaceId }),
  );
  const [screenId, setScreenId] = useState(defaultScreenId ?? "");
  const [componentId, setComponentId] = useState(defaultComponentId ?? "");
  const [libraryItems, setLibraryItems] = useState<LibMeta[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [stackDataById, setStackDataById] = useState<Record<string, ReferenceStackData | null>>({});

  const [uploading, setUploading] = useState(false);

  const objectUrlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }));

  useEffect(() => {
    if (!open) {
      for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
      objectUrlsRef.current = [];
      setQuery("");
      setKindFilter("all");
      setAttachMode(defaultAttachMode({ defaultScreenId, defaultComponentId, projectId, workspaceId }));
      setScreenId(defaultScreenId ?? "");
      setComponentId(defaultComponentId ?? "");
      setLibraryItems([]);
      setExpandedIds(new Set());
      setStackDataById({});
      setSubmitting(null);
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus());
    setLoadingLibrary(true);

    let cancelled = false;
    void (async () => {
      const metas = await listReferenceLibraryMeta();
      metas.sort((a, b) => new Date(b.added).getTime() - new Date(a.added).getTime());
      if (cancelled) return;
      setLibraryItems(metas);

      const items = await Promise.all(
        metas.map(async (meta) => {
          if (meta.mediaKind !== "image") return meta;
          try {
            const blob = await loadReferenceFile(meta.id, meta.ext || extFromName(meta.name));
            if (!blob || cancelled) return meta;
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.push(url);
            return { ...meta, _objectUrl: url };
          } catch {
            return meta;
          }
        }),
      );
      if (cancelled) return;
      setLibraryItems(items as LibMeta[]);
      setLoadingLibrary(false);
    })();

    return () => { cancelled = true; };
  }, [open, defaultScreenId, defaultComponentId, projectId, workspaceId]);

  const close = () => setOpen(false);

  const loadStackData = useMemo(
    () => async (id: string) => {
      setStackDataById((prev) => (id in prev ? prev : { ...prev, [id]: null }));
      const data = await readReferenceStackData(id);
      setStackDataById((prev) => ({ ...prev, [id]: data }));
      return data;
    },
    [],
  );

  // Screens are the top-level rows, so every stacked image's stack data is loaded
  // up front (local library — bounded; cheap JSON reads, not blobs). This also
  // makes screen and stack-component names searchable.
  const hasQuery = query.trim().length > 0;
  useEffect(() => {
    if (!open) return;
    for (const item of libraryItems) {
      if (item.mediaKind === "image" && item.stack?.enabled && !(item.id in stackDataById)) {
        void loadStackData(item.id);
      }
    }
  }, [open, libraryItems, stackDataById, loadStackData]);

  const kindItems = useMemo(
    () => libraryItems.filter((item) => kindFilter === "all" || item.mediaKind === kindFilter),
    [libraryItems, kindFilter],
  );

  // Per-image: the visible nodes given the current query.
  const q = query.trim().toLowerCase();
  const matchesText = (text: string) => text.toLowerCase().includes(q);

  // The flat, top-level list of screens across every visible image, filtered by
  // the current query (an entry matches on its image, screen, or any cut name).
  const screenEntries = useMemo(() => {
    const out: ScreenEntry[] = [];
    for (const item of kindItems) {
      for (const entry of screenEntriesForItem(item, stackDataById[item.id])) {
        if (q) {
          const itemMatch = matchesText(item.name) || (item.tags ?? []).some(matchesText);
          const matched =
            itemMatch || matchesText(entry.node.name) || entry.cuts.some((cut) => matchesText(cut.name));
          if (!matched) continue;
        }
        out.push(entry);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindItems, q, stackDataById]);

  function buildAttachment(): ReferenceAttachment | null {
    if (attachMode === "workspace") {
      return workspaceId
        ? { workspaceId, projectId: null, screenId: null, componentId: null }
        : null;
    }
    if (!projectId) return null;
    if (attachMode === "screen") return screenId ? { projectId, screenId, componentId: null } : null;
    if (attachMode === "component") return componentId ? { projectId, screenId: null, componentId } : null;
    return { projectId, screenId: null, componentId: null };
  }

  const attachmentReady =
    (attachMode === "workspace" && Boolean(workspaceId)) ||
    (attachMode === "global" && Boolean(projectId)) ||
    (attachMode === "screen" && Boolean(screenId)) ||
    (attachMode === "component" && Boolean(componentId));

  // Upload brand-new files from inside a project: each one is saved to the root
  // library and auto-linked to the current target in a single gesture.
  async function handleUploadFiles(files: FileList | null) {
    const attachment = buildAttachment();
    if (!files || files.length === 0 || !attachment || uploading) return;
    setUploading(true);
    try {
      await addReferencesFromFiles(files, attachment);
      close();
    } finally {
      setUploading(false);
    }
  }

  function derivedId(item: LibMeta, node: PickNode): string {
    return node.stackNodeId ? `${item.id}::${node.stackNodeId}` : item.id;
  }

  async function handlePick(item: LibMeta, node: PickNode) {
    const attachment = buildAttachment();
    if (!attachment || submitting) return;
    const rowId = derivedId(item, node);
    setSubmitting(rowId);
    try {
      const originalExt = item.ext || extFromName(item.name);
      const thumbnailUrl =
        item.mediaKind === "image"
          ? node.stackNodeId
            ? await bakeStackNodeThumbnail({ sourceReferenceId: item.id, file: node.file, originalExt })
            : await bakeOriginalThumbnail({ sourceReferenceId: item.id, originalExt })
          : null;

      const kindMap: Record<string, ReferenceRow["kind"]> = { image: "cards", video: "dash", figx: "hero" };

      await onAdd({
        title: node.stackNodeId ? node.name : item.name,
        source: item.sourceUrl || `${item.type} · local`,
        origin: "upload",
        visibility: "local",
        bg: "#101418",
        accent: "#FFFFFF",
        kind: kindMap[item.mediaKind] ?? "cards",
        description: item.description ?? "",
        metadata: item.tags ?? [],
        thumbnailUrl,
        // The whole-image card keeps the stack badge; a node card represents a
        // single component, so it carries no stack summary.
        stack: node.stackNodeId ? undefined : item.stack,
        sourceReferenceId: item.id,
        stackNodeId: node.stackNodeId,
        stackNodeName: node.stackNodeId ? node.name : undefined,
        attachment,
      });
      close();
    } finally {
      setSubmitting(null);
    }
  }

  function toggleExpand(rowKey: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  // Screen thumbnails for cropped roots are object URLs; track them so they are
  // revoked alongside the original-image URLs when the modal closes.
  const registerObjectUrl = useMemo(
    () => (url: string) => {
      objectUrlsRef.current.push(url);
    },
    [],
  );

  const isEmpty = libraryItems.length === 0 && !loadingLibrary;
  // True while a stacked image's screens are still being read, so the list shows
  // a loading hint rather than a premature "no screens" message.
  const stacksPending = kindItems.some(
    (item) => item.mediaKind === "image" && item.stack?.enabled && !(item.id in stackDataById),
  );
  const existingIds = useMemo(() => new Set(existingReferences.map((r) => r.id)), [existingReferences]);

  return (
    <Modal open={open} onClose={close} size="picker" ariaLabel="Add reference">
      <ModalBody className="!p-0">
        <div className="flex h-full flex-col">
          {/* Search bar */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-[rgba(255,255,255,0.07)] px-4 py-3">
            <IconSearch size={16} strokeWidth={1.8} className="shrink-0 text-[var(--text-faint)]" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search images and stack components..."
              className="flex-1 bg-transparent text-[14.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleUploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!attachmentReady || uploading}
              title={attachmentReady ? "Upload new files to the library and link them here" : "Choose a target first"}
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)] px-3 text-[11.5px] font-medium text-[var(--text)] transition-colors hover:bg-[rgba(255,255,255,0.1)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconImage size={13} strokeWidth={1.8} />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              <IconClose size={12} strokeWidth={2} />
            </button>
          </div>

          {/* Kind filter pills */}
          {!isEmpty && (
            <div className="flex shrink-0 items-center gap-1 border-b border-[rgba(255,255,255,0.07)] px-4 py-2">
              {(["all", "image", "video"] as KindFilter[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={[
                    "h-6 cursor-pointer rounded-full border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
                    kindFilter === k
                      ? "border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-faint)] hover:text-[var(--text-muted)]",
                  ].join(" ")}
                >
                  {k === "all" ? "All" : k === "image" ? "Images" : "Videos"}
                </button>
              ))}
              <span className="ml-auto text-[11px] tabular-nums text-[var(--text-faint)]">
                {loadingLibrary ? "…" : `${screenEntries.length} ${screenEntries.length === 1 ? "item" : "items"}`}
              </span>
            </div>
          )}

          {/* Tree */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isEmpty ? (
              <EmptyLibrary />
            ) : screenEntries.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-[var(--text-faint)]">
                {hasQuery
                  ? "No screens or components match this search."
                  : stacksPending
                  ? "Loading screens…"
                  : "No screens in this category."}
              </p>
            ) : (
              screenEntries.map((entry) => (
                <ScreenRow
                  key={entry.rowKey}
                  entry={entry}
                  expanded={hasQuery || expandedIds.has(entry.rowKey)}
                  forceExpanded={hasQuery}
                  query={q}
                  attachmentReady={attachmentReady}
                  submittingId={submitting}
                  existingIds={existingIds}
                  derivedId={(node) => derivedId(entry.item, node)}
                  registerObjectUrl={registerObjectUrl}
                  onToggle={() => toggleExpand(entry.rowKey)}
                  onPick={(node) => void handlePick(entry.item, node)}
                />
              ))
            )}
          </div>

          {/* Footer — attach target */}
          <div className="shrink-0 border-t border-[rgba(255,255,255,0.07)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-[var(--text-faint)]">Attach to</span>
              <FooterSelect value={attachMode} onChange={(v) => setAttachMode(v as AttachMode)}>
                {projectId ? (
                  <>
                    <option value="global">Entire project</option>
                    <option value="screen">Specific screen</option>
                    {components.length > 0 && <option value="component">Specific component</option>}
                  </>
                ) : (
                  <option value="workspace">Workspace (global)</option>
                )}
              </FooterSelect>
              {attachMode === "screen" && (
                <FooterSelect value={screenId} onChange={setScreenId}>
                  <option value="">Select screen…</option>
                  {screens.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </FooterSelect>
              )}
              {attachMode === "component" && (
                <FooterSelect value={componentId} onChange={setComponentId}>
                  <option value="">Select component…</option>
                  {components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </FooterSelect>
              )}
              {!attachmentReady && <span className="text-[11px] text-[#f0b574]">Choose a target.</span>}
            </div>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
});

/* ---------- Sub-components ---------- */

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center gap-4 py-14 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)]">
        <IconImage size={18} strokeWidth={1.6} />
      </span>
      <div>
        <p className="m-0 text-[13.5px] font-semibold text-[var(--text)]">Empty library</p>
        <p className="m-0 mt-1 max-w-[300px] text-[12.5px] leading-[1.55] text-[var(--text-muted)]">
          Use <span className="text-[var(--text)]">Upload</span> above to add images or videos — they are saved to your library and linked here.
        </p>
      </div>
    </div>
  );
}

function ScreenRow({
  entry,
  expanded,
  forceExpanded,
  query,
  attachmentReady,
  submittingId,
  existingIds,
  derivedId,
  registerObjectUrl,
  onToggle,
  onPick,
}: {
  entry: ScreenEntry;
  expanded: boolean;
  forceExpanded: boolean;
  query: string;
  attachmentReady: boolean;
  submittingId: string | null;
  existingIds: Set<string>;
  derivedId: (node: PickNode) => string;
  registerObjectUrl: (url: string) => void;
  onToggle: () => void;
  onPick: (node: PickNode) => void;
}) {
  const { item, node, cuts } = entry;
  const isImage = item.mediaKind === "image";
  const expandable = cuts.length > 0;
  const visibleChildren = query ? cuts.filter((n) => n.name.toLowerCase().includes(query)) : cuts;
  const rowId = derivedId(node);
  const linked = existingIds.has(rowId);

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 rounded-[9px] px-1.5 hover:bg-[rgba(255,255,255,0.03)]">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse stacks" : "Expand stacks"}
            disabled={forceExpanded}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-[var(--text-faint)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text)] disabled:opacity-40"
          >
            {expanded ? <IconChevronDown size={13} strokeWidth={2} /> : <IconChevronRight size={13} strokeWidth={2} />}
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onPick(node)}
          disabled={!attachmentReady || submittingId != null}
          title={node.name}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[9px] py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ScreenThumb item={item} node={node} registerObjectUrl={registerObjectUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-[var(--text)]">{node.name}</span>
              <span className="shrink-0 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.4)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.3px] text-[var(--text-faint)]">
                {item.type}
              </span>
              {expandable ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(94,162,255,0.24)] bg-[rgba(94,162,255,0.12)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.3px] text-[#9fc9ff]">
                  <IconLayers size={9} strokeWidth={2} />
                  {cuts.length}
                </span>
              ) : null}
            </div>
            <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
              {isImage ? "Screen · " : ""}
              {node.w && node.h ? `${Math.round(node.w)} × ${Math.round(node.h)}` : ""}
            </span>
          </div>
          <PickHint linked={linked} busy={submittingId === rowId} />
        </button>
      </div>

      {expanded && expandable
        ? visibleChildren.map((cut) => {
            const id = derivedId(cut);
            return (
              <button
                key={cut.key}
                type="button"
                onClick={() => onPick(cut)}
                disabled={!attachmentReady || submittingId != null}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] py-1.5 pr-2 text-left hover:bg-[rgba(255,255,255,0.03)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ paddingLeft: `${36 + cut.depth * 16}px` }}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)]">
                  <IconLayers size={10} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[var(--text)]">{cut.name}</span>
                  <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
                    {Math.round(cut.w)} × {Math.round(cut.h)}
                  </span>
                </span>
                <PickHint linked={existingIds.has(id)} busy={submittingId === id} />
              </button>
            );
          })
        : null}
    </div>
  );
}

// Screen cover. The whole-image / default-root screen reuses the already-loaded
// original; a cropped screen loads its own root pixels from the stack file.
function ScreenThumb({
  item,
  node,
  registerObjectUrl,
}: {
  item: LibMeta;
  node: PickNode;
  registerObjectUrl: (url: string) => void;
}) {
  const baseUrl = item._objectUrl ?? null;
  const [url, setUrl] = useState<string | null>(node.file ? null : baseUrl);

  useEffect(() => {
    if (!node.file) {
      setUrl(baseUrl);
      return;
    }
    let cancelled = false;
    void loadReferenceStackFile(item.id, node.file, "image/png")
      .then((blob) => {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        registerObjectUrl(objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.id, node.file, baseUrl, registerObjectUrl]);

  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)]">
      {url ? (
        <img src={url} alt="" draggable={false} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
          {item.mediaKind === "video" ? <IconVideo size={16} strokeWidth={1.5} /> : <IconImage size={16} strokeWidth={1.5} />}
        </div>
      )}
    </div>
  );
}

function PickHint({ linked, busy }: { linked: boolean; busy: boolean }) {
  if (busy) {
    return <span className="shrink-0 text-[11px] font-medium text-[var(--text-faint)]">Adding…</span>;
  }
  if (linked) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#7fb2ff]">
        <IconCheck size={11} strokeWidth={2.5} /> Added
      </span>
    );
  }
  return <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">Add</span>;
}

function FooterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 cursor-pointer rounded-[7px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-2 text-[11.5px] text-[var(--text)] outline-none focus:border-[rgba(94,162,255,0.55)]"
    >
      {children}
    </select>
  );
}
