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
  ExternalLink,
  Film,
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
  readRefsMeta,
  writeRefsMeta,
  extFromName,
} from "@/lib/tauri/referenceStorage";
import type { ReferenceStackSummary } from "@/lib/references/stackTypes";
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
  stack?: ReferenceStackSummary;
  url: string; // runtime only — Object URL created from the file blob
};

type StagedItem = ReferenceItem & { desc: string };
type DuplicateDecision = "existing" | "both";
type PendingDuplicate = {
  existing: ReferenceItem;
  imported: StagedItem;
};

type StoredMeta = Omit<ReferenceItem, "url">;

type FilterKind = "all" | "image" | "video" | "figx";
type FilterType = "all" | RefType;
type FilterSort = "recent" | "old" | "name" | "size";

type ImportTab = "local" | "figx";

/* ---------- File-system storage ---------- */

async function loadLibrary(): Promise<ReferenceItem[]> {
  await ensureWorkspaceFolders().catch(() => {});
  const metas = await readRefsMeta();
  const items: ReferenceItem[] = [];
  for (const meta of metas) {
    const ext = meta.ext || extFromName(meta.name);
    const blob = await loadReferenceFile(meta.id, ext).catch(() => null);
    if (!blob) continue;
    const contentHash = meta.contentHash ?? (await hashBlob(blob).catch(() => undefined));
    items.push({ ...meta, contentHash, ext, url: URL.createObjectURL(blob) });
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");

  const typeOptions = useMemo(() => typeOptionsForKind(filterKind), [filterKind]);
  const [filterSort, setFilterSort] = useState<FilterSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<ReferenceItem | null>(null);

  // Keep a ref to the current library so the unmount cleanup sees the latest value.
  const libraryRef = useRef<ReferenceItem[]>([]);
  libraryRef.current = library;

  useEffect(() => {
    loadLibrary().then((items) => {
      setLibrary(items);
      setLoading(false);
    });
    return () => {
      for (const item of libraryRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  // Persist metadata whenever library changes (after initial load)
  useEffect(() => {
    if (loading) return;
    persistMeta(library);
  }, [library, loading]);

  // Clear selection if item was removed
  useEffect(() => {
    if (!selectedId) return;
    if (!library.some((item) => item.id === selectedId)) setSelectedId(null);
  }, [library, selectedId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = library.filter((r) => {
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
    () => (selectedId ? library.find((item) => item.id === selectedId) ?? null : null),
    [library, selectedId],
  );

  const addItems = useCallback((items: ReferenceItem[]) => {
    if (items.length === 0) return;
    setLibrary((prev) => [...items, ...prev]);
    setSelectedId(items[0]?.id ?? null);
  }, []);

  const removeItem = useCallback((id: string) => {
    setLibrary((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
    void removeReferenceFile(id);
    setSelectedId((current) => (current === id ? null : current));
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
                    Images and videos saved locally. Drag or select to add.
                  </p>
                </div>
                <SmallButton type="button" primary onClick={() => setImportOpen(true)}>
                  <Upload size={14} />
                  Upload
                </SmallButton>
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
                  {loading ? "…" : `${visible.length} ${visible.length === 1 ? "item" : "itens"}`}
                </span>
              </div>

              {loading ? (
                <LoadingState />
              ) : visible.length === 0 ? (
                <EmptyState onUpload={() => setImportOpen(true)} />
              ) : (
                <MasonryGrid
                  items={visible}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId(id)}
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
            selected ? "w-[320px]" : "w-0",
          ].join(" ")}
          style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
        >
          <Inspector
            item={selected}
            onClose={() => setSelectedId(null)}
            onOpenLightbox={(item) => setLightboxItem(item)}
            onDelete={(id) => removeItem(id)}
            onDescriptionChange={updateDescription}
            onTagsChange={updateTags}
            onSourceUrlChange={updateSourceUrl}
          />
        </aside>
      </div>

      <ImportModal
        open={importOpen}
        existingItems={library}
        onClose={() => setImportOpen(false)}
        onAdd={(items) => {
          addItems(items);
          setImportOpen(false);
        }}
        onUseExisting={(item) => {
          setSelectedId(item.id);
          setImportOpen(false);
        }}
      />

      <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </div>
  );
}

/* ---------- Grid ---------- */

function MasonryGrid({
  items,
  selectedId,
  onSelect,
  onOpenLightbox,
}: {
  items: ReferenceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenLightbox: (item: ReferenceItem) => void;
}) {
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
        {items.map((item) => (
          <Pin
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={() => {
              if (item.id === selectedId) {
                onOpenLightbox(item);
                return;
              }
              onSelect(item.id);
            }}
            onDoubleClick={() => onOpenLightbox(item)}
          />
        ))}
      </div>
    </>
  );
}

function Pin({
  item,
  selected,
  onSelect,
  onDoubleClick,
}: {
  item: ReferenceItem;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
}) {
  const ratio = item.w && item.h ? item.w / item.h : 16 / 9;
  const padBottom = (100 / ratio).toFixed(2);

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
              backgroundImage: `url('${item.url}')`,
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
  onClose,
  onOpenLightbox,
  onDelete,
  onDescriptionChange,
  onTagsChange,
  onSourceUrlChange,
}: {
  item: ReferenceItem | null;
  onClose: () => void;
  onOpenLightbox: (item: ReferenceItem) => void;
  onDelete: (id: string) => void;
  onDescriptionChange: (id: string, description: string) => void;
  onTagsChange: (id: string, tags: string[]) => void;
  onSourceUrlChange: (id: string, sourceUrl: string) => void;
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
            to={`/tools?id=${encodeURIComponent(display.id)}`}
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
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-[30px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] transition-colors",
        danger
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
  onClose,
  onAdd,
  onUseExisting,
}: {
  open: boolean;
  existingItems: ReferenceItem[];
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
                Add {staged.length} {staged.length === 1 ? "item" : "items"}
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
  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  return (
    <div
      role="dialog"
      aria-modal
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-8"
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
      <div className="flex max-h-full max-w-full items-center justify-center">
        {item.mediaKind === "video" ? (
          <video
            src={item.url}
            controls
            autoPlay
            className="block max-h-[calc(100vh-100px)] max-w-full rounded-[10px] bg-[#0E0E0E]"
          />
        ) : (
          <img
            src={item.url}
            alt={item.name}
            className="block max-h-[calc(100vh-100px)] max-w-full rounded-[10px] bg-[#0E0E0E] object-contain"
            draggable={false}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- File helpers ---------- */

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
  URL.revokeObjectURL(item.url);
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
