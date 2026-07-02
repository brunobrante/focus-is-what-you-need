import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { Film, Image as ImageIcon, Sparkles, Upload, X } from "lucide-react";
import type {
  DuplicateDecision,
  ImportTab,
  PendingDuplicate,
  ReferenceItem,
  StagedItem,
} from "../types";
import { discardReferenceItem, fileToReference, findDuplicateReference } from "../lib/fileHelpers";
import { useReferenceUrl } from "../hooks/useReferenceUrl";
import { formatDuration, formatSize, MAX_VIDEO_BYTES } from "../lib/utils";
import { SmallButton, TagEditor } from "./ui";

type ImportConfig = {
  existingItems: ReferenceItem[];
  targetGroupName: string | null;
  onAdd: (items: ReferenceItem[], options?: { groupTogether?: boolean }) => void;
  onUseExisting: (item: ReferenceItem) => void;
};

export interface ImportModalHandle {
  open: (config: ImportConfig) => void;
  close: () => void;
}

export const ImportModal = forwardRef<ImportModalHandle>(
  function ImportModal(_, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const configRef = useRef<ImportConfig | null>(null);

    const [tab, setTab] = useState<ImportTab>("local");
    const [dragActive, setDragActive] = useState(false);
    const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
    const [staged, setStaged] = useState<StagedItem[]>([]);
    const [groupTogether, setGroupTogether] = useState(false);
    const [duplicateQueue, setDuplicateQueue] = useState<PendingDuplicate[]>([]);
    const [duplicateDecision, setDuplicateDecision] = useState<DuplicateDecision>("existing");
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const confirmedRef = useRef(false);
    const pendingDuplicate = duplicateQueue[0] ?? null;

    // Mirror the latest staged/queue so discard side effects can run OUTSIDE a
    // setState updater — React 19 may invoke updaters twice, which would
    // double-delete files / double-revoke object URLs (UI-5).
    const stagedRef = useRef<StagedItem[]>([]);
    stagedRef.current = staged;
    const duplicateQueueRef = useRef<PendingDuplicate[]>([]);
    duplicateQueueRef.current = duplicateQueue;

    useImperativeHandle(ref, () => ({
      open: (config) => {
        configRef.current = config;
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }));

    useEffect(() => {
      if (!isOpen) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && duplicateQueue.length === 0) setIsOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, duplicateQueue.length]);

    useEffect(() => {
      if (!isOpen) {
        if (!confirmedRef.current) {
          for (const item of stagedRef.current) discardReferenceItem(item);
          for (const dup of duplicateQueueRef.current) discardReferenceItem(dup.imported);
        } else {
          confirmedRef.current = false;
        }
        setStaged([]);
        setDuplicateQueue([]);
        setTab("local");
        setDragActive(false);
        setRejectedFiles([]);
        setDuplicateDecision("existing");
        setProcessing(false);
        setGroupTogether(false);
      }
    }, [isOpen]);

    function doCancel() {
      for (const item of staged) discardReferenceItem(item);
      for (const dup of duplicateQueue) discardReferenceItem(dup.imported);
      setStaged([]);
      setDuplicateQueue([]);
      setRejectedFiles([]);
    }

    async function handleFiles(files: FileList | File[]) {
      const arr = Array.from(files);
      const accepted: File[] = [];
      const rejected: string[] = [];
      const config = configRef.current;
      if (!config) return;

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
          const duplicate = findDuplicateReference(item, [...config.existingItems, ...nextStaged]);
          if (duplicate) {
            nextDuplicates.push({ existing: duplicate, imported });
          } else {
            nextStaged.push(imported);
          }
        }

        for (const item of stagedRef.current) discardReferenceItem(item);
        for (const dup of duplicateQueueRef.current) discardReferenceItem(dup.imported);
        setStaged(nextStaged);
        setDuplicateQueue(nextDuplicates);
        setDuplicateDecision("existing");
      } finally {
        setProcessing(false);
      }
    }

    function handleConfirm() {
      const config = configRef.current;
      if (duplicateQueue.length > 0 || !config) return;
      confirmedRef.current = true;
      const items: ReferenceItem[] = staged.map(({ desc, ...item }) => ({
        ...item,
        description: desc.trim() || undefined,
        sourceUrl: item.sourceUrl?.trim() || undefined,
      }));
      config.onAdd(items, { groupTogether: groupTogether && !config.targetGroupName && items.length >= 2 });
      setIsOpen(false);
    }

    function resolveDuplicate() {
      const config = configRef.current;
      if (!pendingDuplicate || !config) return;
      const remaining = duplicateQueue.slice(1);
      if (duplicateDecision === "existing") {
        // Apply THIS existing-item choice immediately. It previously fired only on
        // the final duplicate and only when nothing was staged, so any "use
        // existing" decision made alongside other staged files (or before another
        // duplicate) was silently dropped (M7).
        discardReferenceItem(pendingDuplicate.imported);
        config.onUseExisting(pendingDuplicate.existing);
        setDuplicateQueue(remaining);
        setDuplicateDecision("existing");
        // Queue drained and nothing staged to review → close. Otherwise leave the
        // modal open for the staged-items confirm step.
        if (remaining.length === 0 && staged.length === 0) {
          confirmedRef.current = true;
          setIsOpen(false);
        }
        return;
      }
      setStaged((prev) => [pendingDuplicate.imported, ...prev]);
      setDuplicateQueue(remaining);
      setDuplicateDecision("existing");
    }

    if (!isOpen || !configRef.current) return null;

    const config = configRef.current;
    const isStaged = staged.length > 0;

    return (
      <div
        role="dialog"
        aria-modal
        aria-label="Add reference"
        onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
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
                : config.targetGroupName
                  ? `Add to ${config.targetGroupName}`
                  : "Add reference"}
            </h3>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setIsOpen(false)}
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
                      setStaged((prev) => prev.map((s) => (s.id === item.id ? { ...s, desc } : s)))
                    }
                    onSourceUrlChange={(sourceUrl) =>
                      setStaged((prev) => prev.map((s) => (s.id === item.id ? { ...s, sourceUrl } : s)))
                    }
                    onTagAdd={(tag) =>
                      setStaged((prev) =>
                        prev.map((s) => (s.id === item.id ? { ...s, tags: [...s.tags, tag] } : s))
                      )
                    }
                    onTagRemove={(tag) =>
                      setStaged((prev) =>
                        prev.map((s) =>
                          s.id === item.id ? { ...s, tags: s.tags.filter((t) => t !== tag) } : s
                        )
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
                  onDragOver={(e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e: DragEvent<HTMLLabelElement>) => {
                    e.preventDefault();
                    setDragActive(false);
                    void handleFiles(e.dataTransfer.files);
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
                    backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
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
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files) void handleFiles(e.target.files);
                      e.currentTarget.value = "";
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
                        <li key={name} className="text-[11.5px] text-[#ff8a8a]/70">{name}</li>
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
                  <p className="m-0 text-[13.5px] font-semibold text-[var(--text)]">.figx import</p>
                  <p className="m-0 mt-2 max-w-[340px] text-[12px] leading-[1.55] text-[var(--text-muted)]">
                    <code className="text-[11px] text-[var(--text)]">.figx</code> files are native
                    platform references — they import multiple items in a single operation directly from
                    your projects.
                  </p>
                  <p className="m-0 mt-3 text-[11.5px] text-[var(--text-faint)]">Coming soon.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border)] px-[18px] py-3">
            {isStaged && !config.targetGroupName && staged.length >= 2 ? (
              <button
                type="button"
                role="switch"
                aria-checked={groupTogether}
                onClick={() => setGroupTogether((v) => !v)}
                className="mr-auto inline-flex cursor-pointer items-center gap-2.5 text-[12px] text-[var(--text-muted)]"
              >
                <span
                  className={[
                    "relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-150",
                    groupTogether
                      ? "bg-[var(--accent)]"
                      : "border border-[var(--border-strong)] bg-[var(--surface-hover)]",
                  ].join(" ")}
                >
                  <span
                    className="absolute left-0 top-1/2 h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150"
                    style={{ transform: `translate(${groupTogether ? 16 : 2}px, -50%)` }}
                  />
                </span>
                Create a group
              </button>
            ) : null}
            {isStaged ? (
              <>
                <SmallButton type="button" onClick={doCancel}>Back</SmallButton>
                <SmallButton type="button" primary disabled={staged.length === 0} onClick={handleConfirm}>
                  {config.targetGroupName
                    ? "Add to group"
                    : groupTogether
                      ? `Create group of ${staged.length}`
                      : `Add ${staged.length} ${staged.length === 1 ? "item" : "items"}`}
                </SmallButton>
              </>
            ) : (
              <SmallButton type="button" onClick={() => setIsOpen(false)}>Close</SmallButton>
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
  },
);

function DuplicateFileAlert({
  duplicate,
  decision,
  onDecisionChange,
  onClose,
  onConfirm,
}: {
  duplicate: PendingDuplicate | null;
  decision: DuplicateDecision;
  onDecisionChange: (d: DuplicateDecision) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!duplicate) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, onClose]);

  if (!duplicate) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Arquivo duplicado"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
            <DuplicatePreview item={duplicate.existing} badge="Existente" muted={decision !== "existing"} />
            <DuplicatePreview item={duplicate.imported} badge="Importado" muted={decision !== "both"} />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-5 border-t border-[var(--border)] px-5 py-4">
          <DuplicateChoice checked={decision === "existing"} label="Use existing file" onChange={() => onDecisionChange("existing")} />
          <DuplicateChoice checked={decision === "both"} label="Manter os dois" onChange={() => onDecisionChange("both")} />
          <SmallButton type="button" primary className="ml-auto min-w-[132px]" onClick={onConfirm}>
            Importar
          </SmallButton>
        </div>
      </div>
    </div>
  );
}

function DuplicatePreview({ item, badge, muted }: { item: ReferenceItem; badge: string; muted: boolean }) {
  // The existing (library) item carries no `url` — it hydrates to "" and rendered
  // a blank preview. Resolve it through the shared URL cache, preferring the
  // item's own url when present (the freshly-imported side's blob) (M7).
  const { url: resolvedUrl } = useReferenceUrl(item, { eager: true });
  const src = item.url || resolvedUrl;
  return (
    <div className={["flex min-w-0 flex-col gap-4", muted ? "opacity-55" : ""].join(" ")}>
      <div className="relative flex h-[min(34vw,360px)] min-h-[220px] items-center justify-center overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)]">
        {item.mediaKind === "video" ? (
          <video src={src} muted preload="metadata" className="max-h-full max-w-full" />
        ) : (
          <img src={src} alt={item.name} draggable={false} className="block max-h-full max-w-full object-contain" />
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

function DuplicateChoice({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[17px] font-medium text-[var(--text)]">
      <input type="radio" checked={checked} onChange={onChange} className="h-5 w-5 accent-[#2f8ee8]" />
      {label}
    </label>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
          <video src={item.url} muted preload="metadata" playsInline className="h-full w-full object-cover" />
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
