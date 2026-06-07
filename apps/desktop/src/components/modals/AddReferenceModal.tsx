import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, ModalBody } from "./Modal";
import { IconCheck, IconClose, IconImage, IconSearch, IconVideo } from "@/components/icons";
import type {
  ComponentRow,
  ReferenceAttachment,
  ReferenceRow,
  ScreenRow,
} from "@/lib/storage/schema";
import {
  extFromName,
  loadReferenceFile,
  readRefsMeta,
  type StoredRefMeta,
} from "@/lib/tauri/referenceStorage";

/* ---------- Library reading ---------- */

type LibMeta = StoredRefMeta & { _objectUrl?: string };

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/* ---------- Types ---------- */

type AttachMode = "global" | "screen" | "component";
type KindFilter = "all" | "image" | "video";

type Props = {
  projectId: string | null;
  screens: ScreenRow[];
  components: ComponentRow[];
  existingReferences: ReferenceRow[];
  defaultScreenId?: string;
  defaultComponentId?: string;
  onAdd: (input: {
    id?: string;
    title: string;
    source: string;
    origin: ReferenceRow["origin"];
    visibility: ReferenceRow["visibility"];
    bg: string;
    accent: string;
    kind: ReferenceRow["kind"];
    description?: string;
    metadata?: string[];
    thumbnailUrl?: string | null;
    stack?: ReferenceRow["stack"];
    attachment: ReferenceAttachment;
  }) => Promise<void> | void;
};

export interface AddReferenceModalHandle {
  open: () => void;
  close: () => void;
}

function defaultAttachMode(input: {
  defaultScreenId?: string;
  defaultComponentId?: string;
}): AttachMode {
  if (input.defaultComponentId) return "component";
  if (input.defaultScreenId) return "screen";
  return "global";
}

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
  const [submitting, setSubmitting] = useState(false);

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
      setSubmitting(false);
      return;
    }

    // Focus input after mount
    requestAnimationFrame(() => inputRef.current?.focus());

    setLoadingLibrary(true);

    let cancelled = false;
    void (async () => {
      const metas = await readRefsMeta();
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

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return libraryItems.filter((item) => {
      if (kindFilter !== "all" && item.mediaKind !== kindFilter) return false;
      if (!q) return true;
      const hay = [
        item.name,
        item.description ?? "",
        item.sourceUrl ?? "",
        ...(item.tags ?? []),
        item.type,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [libraryItems, query, kindFilter]);

  function buildAttachment(): ReferenceAttachment | null {
    if (!projectId) return null;
    if (attachMode === "screen") {
      if (!screenId) return null;
      return { projectId, screenId, componentId: null };
    }
    if (attachMode === "component") {
      if (!componentId) return null;
      return { projectId, screenId: null, componentId };
    }
    return { projectId, screenId: null, componentId: null };
  }

  const attachmentReady =
    attachMode === "global" ||
    (attachMode === "screen" && Boolean(screenId)) ||
    (attachMode === "component" && Boolean(componentId));

  async function handlePick(item: LibMeta & { _objectUrl?: string }) {
    const attachment = buildAttachment();
    if (!attachment || submitting) return;
    setSubmitting(true);
    try {
      let thumbnailUrl: string | null = null;
      if (item.mediaKind === "image") {
        try {
          const blob = await loadReferenceFile(item.id, item.ext || extFromName(item.name));
          if (blob && blob.size <= 1024 * 1024) thumbnailUrl = await blobToDataUrl(blob);
        } catch { /* skip */ }
      }

      const kindMap: Record<string, ReferenceRow["kind"]> = {
        image: "cards",
        video: "dash",
        figx: "hero",
      };

      await onAdd({
        id: item.id,
        title: item.name,
        source: item.sourceUrl || `${item.type} · local`,
        origin: "upload",
        visibility: "local",
        bg: "#101418",
        accent: "#FFFFFF",
        kind: kindMap[item.mediaKind] ?? "cards",
        description: item.description ?? "",
        metadata: item.tags ?? [],
        thumbnailUrl,
        stack: item.stack,
        attachment,
      });
      close();
    } finally {
      setSubmitting(false);
    }
  }

  const hasQuery = query.trim().length > 0;
  const isEmpty = libraryItems.length === 0 && !loadingLibrary;

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
              placeholder="Search by name, tags or source..."
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
                {loadingLibrary ? "…" : `${filteredItems.length} ${filteredItems.length === 1 ? "item" : "itens"}`}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isEmpty ? (
              <EmptyLibrary />
            ) : hasQuery ? (
              <SearchResults
                items={filteredItems as (LibMeta & { _objectUrl?: string })[]}
                existingReferences={existingReferences}
                attachmentReady={attachmentReady}
                submitting={submitting}
                onPick={(item) => void handlePick(item)}
              />
            ) : (
              <RecentGrid
                items={filteredItems as (LibMeta & { _objectUrl?: string })[]}
                existingReferences={existingReferences}
                attachmentReady={attachmentReady}
                submitting={submitting}
                onPick={(item) => void handlePick(item)}
              />
            )}
          </div>

          {/* Footer — attach target */}
          <div className="shrink-0 border-t border-[rgba(255,255,255,0.07)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-[var(--text-faint)]">Anexar a</span>
              <FooterSelect
                value={attachMode}
                onChange={(v) => setAttachMode(v as AttachMode)}
              >
                <option value="global">Projeto inteiro</option>
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
              {!attachmentReady && (
                <span className="text-[11px] text-[#f0b574]">Selecione um destino.</span>
              )}
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
          Add images and videos on the{" "}
          <span className="text-[var(--text)]">References</span>{" "}
          page so they appear here.
        </p>
      </div>
    </div>
  );
}

function RecentGrid({
  items,
  existingReferences,
  attachmentReady,
  submitting,
  onPick,
}: {
  items: (LibMeta & { _objectUrl?: string })[];
  existingReferences: ReferenceRow[];
  attachmentReady: boolean;
  submitting: boolean;
  onPick: (item: LibMeta & { _objectUrl?: string }) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-[12.5px] text-[var(--text-faint)]">
        No items in this category.
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">
        Recentes
      </p>
      <div className="grid grid-cols-4 gap-2">
        {items.slice(0, 20).map((item) => {
          const linked = existingReferences.some((r) => r.id === item.id);
          return (
            <GridCard
              key={item.id}
              item={item}
              linked={linked}
              disabled={!attachmentReady || submitting}
              onPick={() => onPick(item)}
            />
          );
        })}
      </div>
    </>
  );
}

function GridCard({
  item,
  linked,
  disabled,
  onPick,
}: {
  item: LibMeta & { _objectUrl?: string };
  linked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      title={item.name}
      className="group relative flex cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="relative overflow-hidden rounded-[10px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] transition-colors group-hover:border-[rgba(94,162,255,0.45)]">
        <div className="aspect-square">
          {item._objectUrl ? (
            <img
              src={item._objectUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
              {item.mediaKind === "video" ? (
                <IconVideo size={18} strokeWidth={1.5} />
              ) : (
                <IconImage size={18} strokeWidth={1.5} />
              )}
            </div>
          )}
        </div>
        <div className="absolute inset-0 grid place-items-center rounded-[10px] bg-[rgba(0,0,0,0.55)] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black">
            {linked ? "Reuse" : "Add"}
          </span>
        </div>
        {linked && (
          <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[rgba(94,162,255,0.9)]">
            <IconCheck size={10} strokeWidth={2.5} className="text-white" />
          </span>
        )}
        {item.stack?.enabled ? (
          <span className="absolute left-1.5 top-1.5 rounded-[5px] border border-[rgba(255,255,255,0.14)] bg-[rgba(0,0,0,0.72)] px-1.5 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.35px] text-white">
            Stack
          </span>
        ) : null}
      </div>
      <span className="truncate px-0.5 text-[11px] text-[var(--text-muted)]">{item.name}</span>
    </button>
  );
}

function SearchResults({
  items,
  existingReferences,
  attachmentReady,
  submitting,
  onPick,
}: {
  items: (LibMeta & { _objectUrl?: string })[];
  existingReferences: ReferenceRow[];
  attachmentReady: boolean;
  submitting: boolean;
  onPick: (item: LibMeta & { _objectUrl?: string }) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-[12.5px] text-[var(--text-faint)]">
        No items found for this search.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const linked = existingReferences.some((r) => r.id === item.id);
        return (
          <SearchRow
            key={item.id}
            item={item}
            linked={linked}
            disabled={!attachmentReady || submitting}
            onPick={() => onPick(item)}
          />
        );
      })}
    </div>
  );
}

function SearchRow({
  item,
  linked,
  disabled,
  onPick,
}: {
  item: LibMeta & { _objectUrl?: string };
  linked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.03)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[7px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)]">
        {item._objectUrl ? (
          <img src={item._objectUrl} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-faint)]">
            <IconImage size={14} strokeWidth={1.5} />
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
            <span className="shrink-0 rounded-full border border-[rgba(94,162,255,0.24)] bg-[rgba(94,162,255,0.12)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.3px] text-[#9fc9ff]">
              Stack
            </span>
          ) : null}
        </div>
        {item.tags.length > 0 && (
          <div className="mt-0.5 flex gap-1">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[11px] text-[var(--text-faint)]">#{t}</span>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[12px] font-medium text-[var(--text-muted)]">
        {linked ? "Reuse" : "Add"}
      </span>
    </button>
  );
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
