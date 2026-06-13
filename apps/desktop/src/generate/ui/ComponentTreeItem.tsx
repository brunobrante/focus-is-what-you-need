import { Baseline, ChevronRight, Layers, Loader2, ScanText, SquarePen, Trash2 } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";
import type { ComponentTreeNode } from "../engine/types";
import { useCraftCheck } from "@/lib/models/useCraftCheck";
import { useFontDetect } from "@/lib/models/useFontDetect";
import { urlToBytes } from "@/lib/models/modelCommands";

function IconButton({
  danger = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        danger ? "hover:text-[#ff8a8a]" : "",
        className,
      ].join(" ")}
    />
  );
}

export function ComponentTreeItem({
  node,
  activeId,
  hoveredId,
  editingId,
  expandedIds,
  rootId,
  primaryId,
  textDetectionModelId = null,
  fontDetectionEnabled = false,
  onOpen,
  onToggle,
  onHover,
  onRemove,
  onEdit,
  onOpenVariants,
}: {
  node: ComponentTreeNode;
  activeId: string | null;
  hoveredId: string | null;
  editingId: string | null;
  expandedIds: Set<string>;
  rootId: string;
  primaryId: string;
  /** Active text detector; when set, each card shows an "Is text?" action. */
  textDetectionModelId?: string | null;
  /** When true, each card shows a "Font?" action that recognizes the font. */
  fontDetectionEnabled?: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  /** Opens the variants panel for a cut that owns more than one variant. */
  onOpenVariants: (id: string) => void;
}) {
  const { component, children, depth } = node;
  const active = activeId === component.id;
  const hovered = hoveredId === component.id;
  const editing = editingId === component.id;
  const isRoot = component.id === rootId;
  const isPrimary = component.id === primaryId;
  const isProtected = isRoot || isPrimary;
  const canEdit = !isRoot;
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(component.id);
  const variantCount = component.variants?.length ?? 0;
  const hasVariants = variantCount > 1;

  return (
    <div className="flex flex-col gap-1">
      <div
        onClick={() => onOpen(component.id)}
        onMouseEnter={() => onHover(component.id)}
        onMouseLeave={() => onHover(null)}
        className={[
          "flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] border bg-[var(--bg-elev)] px-1.5 py-1 transition-colors duration-[120ms]",
          editing
            ? "border-[#4C8DFF]"
            : active || hovered
              ? "border-[var(--text)]"
              : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]",
        ].join(" ")}
        style={{ marginLeft: depth * 10 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "Close children" : "Open children"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(component.id);
            }}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] border-0 bg-transparent text-[var(--text-faint)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <ChevronRight
              size={13}
              strokeWidth={1.9}
              className={expanded ? "rotate-90 transition-transform duration-[120ms]" : "transition-transform duration-[120ms]"}
            />
          </button>
        ) : (
          <span aria-hidden className="h-6 w-6 shrink-0" />
        )}
        <div
          className="h-8 w-8 shrink-0 rounded-[5px] border border-[var(--border)] bg-[#0E0E0E] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${component.dataUrl}")` }}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--text)]">
          {component.name}
        </span>
        {textDetectionModelId ? (
          <CraftCheckButton dataUrl={component.dataUrl} modelId={textDetectionModelId} />
        ) : null}
        {fontDetectionEnabled ? <FontCheckButton dataUrl={component.dataUrl} /> : null}
        {hasVariants ? (
          <button
            type="button"
            aria-label="Variants"
            title={`${variantCount} variants`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenVariants(component.id);
            }}
            className="flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <Layers size={12} strokeWidth={1.8} />
            <span className="tabular-nums">{variantCount}</span>
          </button>
        ) : null}
        <div className="flex shrink-0">
          <IconButton
            aria-label="Edit crop"
            disabled={!canEdit}
            className={[
              !canEdit ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
              editing ? "text-[#4C8DFF] hover:text-[#4C8DFF]" : "",
            ].join(" ")}
            onClick={(event) => {
              event.stopPropagation();
              if (canEdit) onEdit(component.id);
            }}
          >
            <SquarePen size={13} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            aria-label="Remove"
            danger
            disabled={isProtected}
            className={isProtected ? "cursor-not-allowed opacity-35 hover:bg-transparent hover:text-[var(--text-muted)]" : ""}
            onClick={(event) => {
              event.stopPropagation();
              if (!isProtected) onRemove(component.id);
            }}
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </IconButton>
        </div>
      </div>
      {expanded
        ? children.map((child) => (
            <ComponentTreeItem
              key={child.component.id}
              node={child}
              activeId={activeId}
              hoveredId={hoveredId}
              editingId={editingId}
              expandedIds={expandedIds}
              rootId={rootId}
              primaryId={primaryId}
              textDetectionModelId={textDetectionModelId}
              fontDetectionEnabled={fontDetectionEnabled}
              onOpen={onOpen}
              onToggle={onToggle}
              onHover={onHover}
              onRemove={onRemove}
              onEdit={onEdit}
              onOpenVariants={onOpenVariants}
            />
          ))
        : null}
    </div>
  );
}

/**
 * Per-card text-detection control. Reads the cut's image bytes on demand and
 * asks the active detector (`modelId`) whether it contains text, surfacing a
 * Yes/No badge. Only rendered when a text-detection model is installed.
 */
function CraftCheckButton({
  dataUrl,
  modelId,
}: {
  dataUrl: string;
  modelId: string;
}) {
  const craft = useCraftCheck(modelId);
  const busy = craft.status === "running";

  const label =
    craft.status === "running"
      ? "Checking…"
      : craft.status === "done"
        ? "Check again"
        : craft.status === "error"
          ? "Retry"
          : "Is text?";

  async function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (busy) return;
    // "Check again" / "Retry": clear the previous result, then run a fresh check.
    craft.reset();
    try {
      const bytes = await urlToBytes(dataUrl);
      craft.check(bytes);
    } catch (error) {
      console.error("Failed to read cut image for text detection", error);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {craft.status === "done" ? (
        // TODO: persist text detection result to ReferenceRow
        <span
          className={[
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
            craft.isText
              ? "border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.12)] text-[#4ade80]"
              : "border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.12)] text-[#f87171]",
          ].join(" ")}
        >
          {craft.isText ? "Yes" : "No"}
        </span>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={12} strokeWidth={1.8} className="animate-spin" />
        ) : (
          <ScanText size={12} strokeWidth={1.8} />
        )}
        {label}
      </button>
    </div>
  );
}

/**
 * Per-card font-recognition control. Reads the cut's image bytes on demand and
 * runs the EfficientNet-B3 font classifier, surfacing the recognized font family
 * (top guess, with the full top-3 in the tooltip). Only rendered when the Font
 * Detector feature is enabled.
 */
function FontCheckButton({ dataUrl }: { dataUrl: string }) {
  const font = useFontDetect();
  const busy = font.status === "running";
  const top = font.predictions?.[0] ?? null;

  const label =
    font.status === "running"
      ? "Detecting…"
      : font.status === "done"
        ? "Detect again"
        : font.status === "error"
          ? "Retry"
          : "Font?";

  const allGuesses = font.predictions
    ?.map((p) => `${p.name} ${Math.round(p.confidence * 100)}%`)
    .join("  ·  ");

  async function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (busy) return;
    // "Detect again" / "Retry": clear the previous result, then run fresh.
    font.reset();
    try {
      const bytes = await urlToBytes(dataUrl);
      font.detect(bytes);
    } catch (error) {
      console.error("Failed to read cut image for font detection", error);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {font.status === "done" ? (
        top ? (
          <span
            title={allGuesses}
            className="inline-flex max-w-[128px] items-center gap-1 rounded-full border border-[rgba(167,139,250,0.4)] bg-[rgba(167,139,250,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[#A78BFA]"
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{top.name}</span>
            <span className="shrink-0 text-[9px] font-medium opacity-70">
              {Math.round(top.confidence * 100)}%
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-faint)]">
            No font
          </span>
        )
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={12} strokeWidth={1.8} className="animate-spin" />
        ) : (
          <Baseline size={12} strokeWidth={1.8} />
        )}
        {label}
      </button>
    </div>
  );
}
