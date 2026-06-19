import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCompare, IconOpenCanvas, IconPlus, IconTrash } from "@/components/icons";
import { Snapshot } from "@/components/Snapshot";
import type { ScreenVersion } from "@/lib/data/screenVersions";
import type { ProjectType } from "@/lib/data/types";

const MAIN_DOT = "#3FB950";
const VERSION_DOT = "#9b6dff";
// How long the mouse must rest on a version chip before its screen preview appears.
const PREVIEW_DELAY_MS = 600;
const PREVIEW_W = 172;

function isMainVersion(v: ScreenVersion): boolean {
  return v.tag === "main" || !v.tag;
}

function chipLabel(v: ScreenVersion): string {
  return isMainVersion(v) ? "Main" : (v.tag ?? v.title);
}

/** Hover preview card for a version chip — a snapshot of that version's screen, pinned
 *  below the chip via a portal so the chips' horizontal scroll container can't clip it. */
function VersionPreviewCard({
  version,
  rect,
  type,
}: {
  version: ScreenVersion;
  rect: DOMRect;
  type: ProjectType;
}) {
  const left = Math.max(
    8,
    Math.min(window.innerWidth - PREVIEW_W - 8, rect.left + rect.width / 2 - PREVIEW_W / 2),
  );
  return createPortal(
    <div
      aria-hidden
      className="fixed z-[90] overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.6)]"
      style={{ top: rect.bottom + 8, left, width: PREVIEW_W }}
    >
      <div
        className="overflow-hidden rounded-[7px] border border-[var(--border-strong)] bg-[var(--bg)]"
        style={{ height: 224 }}
      >
        {version.variantId ? (
          <Snapshot
            kind="screen"
            ownerType="variant"
            ownerId={version.variantId}
            variant={version.tpl}
            type={type}
            display="card"
          />
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-0.5">
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: VERSION_DOT }}
        />
        <span className="text-[12px] font-medium text-[var(--text)]">{chipLabel(version)}</span>
        <span className="truncate text-[11px] text-[var(--text-faint)]">{version.title}</span>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The version switcher that sits at the TOP of the screen detail side panel, above the
 * tabs. Selecting a version drives the preview AND the Sub Components grid below, so the
 * user watches the subcomponents repopulate when switching — the selection is no longer
 * buried next to the cards it changes. Replaces the old "Versions" tab; per-version
 * management (open in canvas, delete) and compare/add live here as actions on the
 * currently selected version.
 *
 * Resting the mouse on a *version* chip (never the main) for a moment reveals a preview
 * card of that version's screen, mirroring the prev/next preview tooltips in the canvas.
 */
export function VersionSwitcher({
  versions,
  activeId,
  type,
  onSelect,
  onAdd,
  onOpenCanvas,
  onDelete,
  onCompare,
}: {
  versions: ScreenVersion[];
  activeId: string | null;
  type: ProjectType;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onOpenCanvas: (v: ScreenVersion) => void;
  onDelete: (v: ScreenVersion) => void;
  onCompare: () => void;
}) {
  const active = versions.find((v) => v.id === activeId) ?? versions[0] ?? null;
  const hasRealVersions = versions.some((v) => !isMainVersion(v));

  const [preview, setPreview] = useState<{ version: ScreenVersion; rect: DOMRect } | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const schedulePreview = (version: ScreenVersion, el: HTMLElement) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setPreview({ version, rect: el.getBoundingClientRect() });
    }, PREVIEW_DELAY_MS);
  };
  const hidePreview = () => {
    clearTimer();
    setPreview(null);
  };

  const actionBtn =
    "grid h-[28px] w-[28px] shrink-0 cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--border-strong)] disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--text-soft)]";

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
      <div
        role="tablist"
        aria-label="Versions"
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {versions.map((v) => {
          const isActive = v.id === active?.id;
          const main = isMainVersion(v);
          return (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              // Selecting closes the open card immediately, then re-arms the dwell so the
              // preview still reappears while the mouse keeps resting on the (now selected)
              // chip — onMouseEnter won't re-fire on its own since the pointer never left.
              onClick={(e) => {
                hidePreview();
                onSelect(v.id);
                if (!main) schedulePreview(v, e.currentTarget);
              }}
              // Only versions (never the main) get a hover preview of their screen.
              onMouseEnter={main ? undefined : (e) => schedulePreview(v, e.currentTarget)}
              onMouseLeave={main ? undefined : hidePreview}
              className={[
                "inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                isActive
                  ? "border-[var(--text)] bg-[var(--surface-2)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{
                  background: isActive ? (main ? MAIN_DOT : VERSION_DOT) : "transparent",
                  border: `1.5px solid ${main ? MAIN_DOT : VERSION_DOT}`,
                }}
              />
              {chipLabel(v)}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="New version"
          onClick={onAdd}
          className="grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-dashed border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
        >
          <IconPlus size={13} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Compare versions"
          title="Compare versions"
          onClick={onCompare}
          disabled={!hasRealVersions}
          className={actionBtn}
        >
          <IconCompare size={13} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          aria-label={active && isMainVersion(active) ? "Open screen in canvas" : "Open version in canvas"}
          title="Open in canvas"
          onClick={() => active && onOpenCanvas(active)}
          disabled={!active}
          className={actionBtn}
        >
          <IconOpenCanvas size={13} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          aria-label="Delete version"
          title={active && isMainVersion(active) ? "The main cannot be deleted" : "Delete version"}
          onClick={() => active && onDelete(active)}
          disabled={!active || isMainVersion(active)}
          className={actionBtn}
        >
          <IconTrash size={13} strokeWidth={1.7} />
        </button>
      </div>

      {preview ? <VersionPreviewCard version={preview.version} rect={preview.rect} type={type} /> : null}
    </div>
  );
}
