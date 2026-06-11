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
  readReferenceStackData,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";
import type { ReferenceStackData } from "@/lib/references/stackTypes";
import { stackRootIds } from "@/lib/references/stackTypes";
import { listReferenceLibraryMeta } from "@/lib/storage/repos/referenceLibrary.repo";
import type { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { bakeOriginalThumbnail, bakeStackNodeThumbnail } from "@/lib/references/referenceThumbnails";

/* ---------- Types ---------- */

type LibMeta = StoredRefMeta & { _objectUrl?: string };
type AttachMode = "global" | "screen" | "component";
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

function defaultAttachMode(input: { defaultScreenId?: string; defaultComponentId?: string }): AttachMode {
  if (input.defaultComponentId) return "component";
  if (input.defaultScreenId) return "screen";
  return "global";
}

/* ---------- Tree building ---------- */

// Flattens an image's stack into an indented, selectable list: Original first,
// then each root and its nested cuts. The default root's cuts hang directly
// under Original (it *is* the original), so the tree stays shallow.
function buildPickNodes(data: ReferenceStackData, fallbackName: string): PickNode[] {
  const rootIds = stackRootIds(data);
  const cuts = data.components.filter((c) => !rootIds.has(c.id));
  const byParent = new Map<string, typeof cuts>();
  for (const cut of cuts) {
    const parent = cut.parentId ?? "__root__";
    byParent.set(parent, [...(byParent.get(parent) ?? []), cut]);
  }

  const out: PickNode[] = [
    {
      key: "__original__",
      stackNodeId: null,
      name: fallbackName,
      depth: 0,
      file: null,
      kind: "original",
      w: data.original.w,
      h: data.original.h,
    },
  ];

  const visitCuts = (parentId: string, depth: number, seen: Set<string>) => {
    for (const cut of byParent.get(parentId) ?? []) {
      if (seen.has(cut.id)) continue;
      const next = new Set(seen);
      next.add(cut.id);
      out.push({
        key: cut.id,
        stackNodeId: cut.id,
        name: cut.name,
        depth,
        file: cut.file,
        kind: "cut",
        w: cut.box.w,
        h: cut.box.h,
      });
      visitCuts(cut.id, depth + 1, next);
    }
  };

  const roots =
    data.roots && data.roots.length > 0
      ? data.roots
      : data.rootComponentId
      ? [
          {
            id: data.rootComponentId,
            name: fallbackName,
            box: { x: 0, y: 0, w: data.original.w, h: data.original.h },
            file: null,
            isDefault: true,
            createdAt: "",
          },
        ]
      : [];

  for (const root of roots) {
    if (root.isDefault) {
      visitCuts(root.id, 1, new Set());
    } else {
      out.push({
        key: root.id,
        stackNodeId: root.id,
        name: root.name,
        depth: 1,
        file: root.file,
        kind: "root",
        w: root.box.w,
        h: root.box.h,
      });
      visitCuts(root.id, 2, new Set());
    }
  }
  return out;
}

/* ---------- Component ---------- */

export const AddReferenceModal = forwardRef<AddReferenceModalHandle, Props>(function AddReferenceModal(
  { projectId, screens, components, existingReferences, defaultScreenId, defaultComponentId, onAdd },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [attachMode, setAttachMode] = useState<AttachMode>(
    defaultAttachMode({ defaultScreenId, defaultComponentId }),
  );
  const [screenId, setScreenId] = useState(defaultScreenId ?? "");
  const [componentId, setComponentId] = useState(defaultComponentId ?? "");
  const [libraryItems, setLibraryItems] = useState<LibMeta[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [stackDataById, setStackDataById] = useState<Record<string, ReferenceStackData | null>>({});

  const objectUrlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setAttachMode(defaultAttachMode({ defaultScreenId, defaultComponentId }));
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
  }, [open, defaultScreenId, defaultComponentId]);

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

  // When searching, load stack data for every stacked image so node names are
  // searchable. (Local library — bounded; cheap JSON reads, not blobs.)
  const hasQuery = query.trim().length > 0;
  useEffect(() => {
    if (!open || !hasQuery) return;
    for (const item of libraryItems) {
      if (item.stack?.enabled && !(item.id in stackDataById)) void loadStackData(item.id);
    }
  }, [open, hasQuery, libraryItems, stackDataById, loadStackData]);

  const kindItems = useMemo(
    () => libraryItems.filter((item) => kindFilter === "all" || item.mediaKind === kindFilter),
    [libraryItems, kindFilter],
  );

  // Per-image: the visible nodes given the current query.
  const q = query.trim().toLowerCase();
  const matchesText = (text: string) => text.toLowerCase().includes(q);

  const nodesForItem = (item: LibMeta): PickNode[] => {
    const data = stackDataById[item.id];
    if (!data) {
      return [{ key: "__original__", stackNodeId: null, name: item.name, depth: 0, file: null, kind: "original", w: item.w, h: item.h }];
    }
    return buildPickNodes(data, item.name);
  };

  const visibleItems = useMemo(() => {
    if (!q) return kindItems;
    return kindItems.filter((item) => {
      if (matchesText(item.name) || (item.tags ?? []).some(matchesText)) return true;
      const data = stackDataById[item.id];
      if (!data) return false;
      return buildPickNodes(data, item.name).some((node) => matchesText(node.name));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindItems, q, stackDataById]);

  function buildAttachment(): ReferenceAttachment | null {
    if (!projectId) return null;
    if (attachMode === "screen") return screenId ? { projectId, screenId, componentId: null } : null;
    if (attachMode === "component") return componentId ? { projectId, screenId: null, componentId } : null;
    return { projectId, screenId: null, componentId: null };
  }

  const attachmentReady =
    attachMode === "global" ||
    (attachMode === "screen" && Boolean(screenId)) ||
    (attachMode === "component" && Boolean(componentId));

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

  function toggleExpand(item: LibMeta) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else {
        next.add(item.id);
        if (item.stack?.enabled && !(item.id in stackDataById)) void loadStackData(item.id);
      }
      return next;
    });
  }

  const isEmpty = libraryItems.length === 0 && !loadingLibrary;
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
                {loadingLibrary ? "…" : `${visibleItems.length} ${visibleItems.length === 1 ? "item" : "items"}`}
              </span>
            </div>
          )}

          {/* Tree */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isEmpty ? (
              <EmptyLibrary />
            ) : visibleItems.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-[var(--text-faint)]">
                {hasQuery ? "No images or components match this search." : "No items in this category."}
              </p>
            ) : (
              visibleItems.map((item) => (
                <ImageRow
                  key={item.id}
                  item={item}
                  nodes={nodesForItem(item)}
                  expanded={hasQuery || expandedIds.has(item.id)}
                  forceExpanded={hasQuery}
                  query={q}
                  attachmentReady={attachmentReady}
                  submittingId={submitting}
                  existingIds={existingIds}
                  derivedId={(node) => derivedId(item, node)}
                  onToggle={() => toggleExpand(item)}
                  onPick={(node) => void handlePick(item, node)}
                />
              ))
            )}
          </div>

          {/* Footer — attach target */}
          <div className="shrink-0 border-t border-[rgba(255,255,255,0.07)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-[var(--text-faint)]">Attach to</span>
              <FooterSelect value={attachMode} onChange={(v) => setAttachMode(v as AttachMode)}>
                <option value="global">Entire project</option>
                <option value="screen">Specific screen</option>
                {components.length > 0 && <option value="component">Specific component</option>}
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
          Add images and videos on the <span className="text-[var(--text)]">References</span> page so they appear here.
        </p>
      </div>
    </div>
  );
}

function ImageRow({
  item,
  nodes,
  expanded,
  forceExpanded,
  query,
  attachmentReady,
  submittingId,
  existingIds,
  derivedId,
  onToggle,
  onPick,
}: {
  item: LibMeta;
  nodes: PickNode[];
  expanded: boolean;
  forceExpanded: boolean;
  query: string;
  attachmentReady: boolean;
  submittingId: string | null;
  existingIds: Set<string>;
  derivedId: (node: PickNode) => string;
  onToggle: () => void;
  onPick: (node: PickNode) => void;
}) {
  const expandable = Boolean(item.stack?.enabled) && item.mediaKind === "image";
  const childNodes = nodes.filter((n) => n.kind !== "original");
  const original = nodes.find((n) => n.kind === "original")!;
  const visibleChildren = query
    ? childNodes.filter((n) => n.name.toLowerCase().includes(query))
    : childNodes;
  const linked = existingIds.has(item.id);

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 rounded-[9px] px-1.5 hover:bg-[rgba(255,255,255,0.03)]">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse" : "Expand"}
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
          onClick={() => onPick(original)}
          disabled={!attachmentReady || submittingId != null}
          title={item.name}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[9px] py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)]">
            {item._objectUrl ? (
              <img src={item._objectUrl} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
                {item.mediaKind === "video" ? <IconVideo size={16} strokeWidth={1.5} /> : <IconImage size={16} strokeWidth={1.5} />}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-[var(--text)]">{item.name}</span>
              <span className="shrink-0 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.4)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.3px] text-[var(--text-faint)]">
                {item.type}
              </span>
              {item.stack?.enabled ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(94,162,255,0.24)] bg-[rgba(94,162,255,0.12)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.3px] text-[#9fc9ff]">
                  <IconLayers size={9} strokeWidth={2} />
                  {item.stack.itemCount}
                </span>
              ) : null}
            </div>
            <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--text-faint)]">
              Whole image{item.w && item.h ? ` · ${item.w} × ${item.h}` : ""}
            </span>
          </div>
          <PickHint linked={linked} busy={submittingId === item.id} />
        </button>
      </div>

      {expanded && expandable
        ? visibleChildren.map((node) => {
            const id = derivedId(node);
            return (
              <button
                key={node.key}
                type="button"
                onClick={() => onPick(node)}
                disabled={!attachmentReady || submittingId != null}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] py-1.5 pr-2 text-left hover:bg-[rgba(255,255,255,0.03)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ paddingLeft: `${36 + node.depth * 16}px` }}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-faint)]">
                  <IconLayers size={10} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[var(--text)]">{node.name}</span>
                  <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
                    {Math.round(node.w)} × {Math.round(node.h)}
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
