import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  readReferenceStackData,
  loadReferenceStackFile,
} from "@/lib/tauri/referenceStorage";
import type { ReferenceStackData, ReferenceStackItem } from "@/lib/references/stackTypes";
import type { LightboxTab, ReferenceItem, StackPreviewState, StackTreeNode } from "../types";

export function Lightbox({
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  useEffect(() => {
    setActiveTab("original");
    setSelectedStackComponentId(null);
    setStackPreview((current) => { releaseStackPreviewUrls(current); return null; });

    if (!item || item.mediaKind !== "image" || !item.stack?.enabled) {
      setStackLoading(false);
      return;
    }

    let cancelled = false;
    setStackLoading(true);
    void loadLightboxStackPreview(item)
      .then((preview) => {
        if (cancelled) { releaseStackPreviewUrls(preview); return; }
        setStackPreview(preview);
        setSelectedStackComponentId(preview?.data.primaryComponentId ?? null);
      })
      .finally(() => { if (!cancelled) setStackLoading(false); });

    return () => { cancelled = true; };
  }, [item?.id]);

  useEffect(() => {
    return () => { releaseStackPreviewUrls(stackPreview); };
  }, [stackPreview]);

  if (!item) return null;

  const canShowStack = item.mediaKind === "image" && Boolean(item.stack?.enabled);
  const stackTree = stackPreview ? buildStackTree(stackPreview.data) : [];
  const selectedStackComponent =
    stackPreview && selectedStackComponentId
      ? stackPreview.data.components.find((c) => c.id === selectedStackComponentId) ??
        stackPreview.data.components.find((c) => c.id === stackPreview.data.primaryComponentId) ??
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
              onClick={() => { if (canShowStack) setActiveTab("stack"); }}
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
          <span className="block truncate text-[11.5px] font-medium">{node.component.name}</span>
          <span className="block text-[10px] tabular-nums text-[var(--text-faint)]">
            {Math.round(node.component.box.w)} x {Math.round(node.component.box.h)}
          </span>
        </span>
      </button>
      {node.children.map((child) => (
        <StackTreeRows key={child.component.id} node={child} selectedId={selectedId} onSelect={onSelect} />
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
    if (!component.file) { urls[component.id] = item.url; continue; }
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

  const root = data.components.find((c) => c.id === data.rootComponentId);
  if (root) return [visit(root, 0, new Set())];

  return (byParent.get("__root__") ?? data.components)
    .filter((c, i, list) => list.findIndex((item) => item.id === c.id) === i)
    .map((c) => visit(c, 0, new Set()));
}
