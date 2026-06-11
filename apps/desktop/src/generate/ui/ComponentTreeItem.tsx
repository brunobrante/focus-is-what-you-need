import { ChevronRight, Loader2, RotateCcw, ScanText, SquarePen, Trash2, Wand2 } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";
import type { ComponentTreeNode, SavedComponent } from "../engine/types";
import { useCraftCheck } from "@/lib/models/useCraftCheck";
import { useLamaInpainting, type LamaInpainting } from "@/lib/models/useLamaInpainting";
import { urlToBytes } from "@/lib/models/modelCommands";

// A circular brush cursor sized to the LaMa brush (20px radius / 40px diameter).
const LAMA_BRUSH_CURSOR =
  "url('data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="rgba(248,113,113,0.15)" stroke="white" stroke-width="1.5"/></svg>',
  ) +
  "') 20 20, crosshair";

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
  craftInstalled = false,
  lamaInstalled = false,
  onOpen,
  onToggle,
  onHover,
  onRemove,
  onEdit,
}: {
  node: ComponentTreeNode;
  activeId: string | null;
  hoveredId: string | null;
  editingId: string | null;
  expandedIds: Set<string>;
  rootId: string;
  primaryId: string;
  /** When the CRAFT model is installed, each card shows an "Is text?" action. */
  craftInstalled?: boolean;
  /** When the LaMa model is installed, each card shows a "Remove element" action. */
  lamaInstalled?: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
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

  // LaMa "remove element" state. The hook is inert until the user starts
  // masking, so it is harmless to instantiate on every card.
  const lama = useLamaInpainting(component.dataUrl);
  // Session-local: the inpainted result is shown in place of the original but
  // not persisted in v1.
  // TODO: persist inpainting result to ReferenceRow
  const displayUrl = lama.resultUrl ?? component.dataUrl;
  // The masking panel expands while drawing, running, or after an error; a
  // finished result collapses back to the row (showing the inpainted thumbnail).
  const lamaOpen =
    lamaInstalled &&
    (lama.status === "masking" || lama.status === "running" || lama.status === "error");

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
          style={{ backgroundImage: `url("${displayUrl}")` }}
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-[var(--text)]">
          {component.name}
        </span>
        {craftInstalled ? <CraftCheckButton dataUrl={component.dataUrl} /> : null}
        {lamaInstalled ? <LamaTriggerButton lama={lama} /> : null}
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
      {lamaOpen ? (
        <div style={{ marginLeft: depth * 10 }}>
          <LamaRemovePanel lama={lama} component={component} />
        </div>
      ) : null}
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
              craftInstalled={craftInstalled}
              lamaInstalled={lamaInstalled}
              onOpen={onOpen}
              onToggle={onToggle}
              onHover={onHover}
              onRemove={onRemove}
              onEdit={onEdit}
            />
          ))
        : null}
    </div>
  );
}

/**
 * Per-card CRAFT text-detection control. Reads the cut's image bytes on demand
 * and asks the backend whether it contains text, surfacing a Yes/No badge.
 * Only rendered when the CRAFT model is installed.
 */
function CraftCheckButton({ dataUrl }: { dataUrl: string }) {
  const craft = useCraftCheck();
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
 * Row-level LaMa control. Starts the mask-drawing flow when idle, and offers an
 * "Undo" back to the original cut once a result is showing. The masking, running,
 * and error states are handled by the expanded panel below the row.
 */
function LamaTriggerButton({ lama }: { lama: LamaInpainting }) {
  if (lama.status === "done") {
    return (
      <button
        type="button"
        aria-label="Undo removal"
        onClick={(event) => {
          event.stopPropagation();
          lama.reset();
        }}
        className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      >
        <RotateCcw size={12} strokeWidth={1.8} />
        Undo
      </button>
    );
  }
  // While masking / running / error the expanded panel owns the controls.
  if (lama.status !== "idle") return null;
  return (
    <button
      type="button"
      aria-label="Remove element"
      onClick={(event) => {
        event.stopPropagation();
        lama.startMasking();
      }}
      className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-transparent px-1.5 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
    >
      <Wand2 size={12} strokeWidth={1.8} />
      Remove element
    </button>
  );
}

/**
 * Expanded LaMa mask-drawing panel. Renders the cut image with a paint-on
 * overlay canvas; the user brushes over what to remove, then Apply runs LaMa.
 * Sized to the cut's intrinsic bounds so the mask aligns with the source image.
 */
function LamaRemovePanel({
  lama,
  component,
}: {
  lama: LamaInpainting;
  component: SavedComponent;
}) {
  const running = lama.status === "running";
  const masking = lama.status === "masking";
  const error = lama.status === "error";
  const { w, h } = component.box;

  return (
    <div
      className="mt-1 rounded-[8px] border border-[var(--border)] bg-[var(--bg-elev)] p-2"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="relative w-full overflow-hidden rounded-[5px] bg-[#0E0E0E]"
        style={{ aspectRatio: `${Math.max(w, 1)} / ${Math.max(h, 1)}` }}
      >
        <img
          src={component.dataUrl}
          alt={component.name}
          className="block h-full w-full object-contain"
          draggable={false}
        />
        <canvas
          ref={lama.canvasRef}
          width={Math.max(Math.round(w), 1)}
          height={Math.max(Math.round(h), 1)}
          className="absolute inset-0 h-full w-full"
          style={{
            cursor: masking ? LAMA_BRUSH_CURSOR : "default",
            touchAction: "none",
            pointerEvents: masking ? "all" : "none",
          }}
        />
        {running ? (
          <div className="absolute inset-0 grid place-items-center bg-[rgba(10,10,11,0.55)]">
            <Loader2 size={20} strokeWidth={1.8} className="animate-spin text-[var(--text)]" />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--text-faint)]">
          {error
            ? "Inpainting failed. Try again."
            : running
              ? "Removing…"
              : "Paint over the element to remove."}
        </span>
        <button
          type="button"
          disabled={running}
          onClick={() => lama.confirmMask()}
          className="inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1 rounded-[6px] border border-[#5b6cff] bg-[#5b6cff] px-2 text-[10.5px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 size={12} strokeWidth={1.8} className="animate-spin" /> : null}
          {error ? "Retry" : "Apply"}
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => lama.cancel()}
          className="inline-flex h-[26px] shrink-0 cursor-pointer items-center rounded-[6px] border border-[var(--border)] bg-transparent px-2 text-[10.5px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
