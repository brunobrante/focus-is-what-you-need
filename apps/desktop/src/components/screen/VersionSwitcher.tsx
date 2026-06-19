import { IconCompare, IconOpenCanvas, IconPlus, IconTrash } from "@/components/icons";
import type { ScreenVersion } from "@/lib/data/screenVersions";

const MAIN_DOT = "#3FB950";
const VERSION_DOT = "#9b6dff";

function isMainVersion(v: ScreenVersion): boolean {
  return v.tag === "main" || !v.tag;
}

function chipLabel(v: ScreenVersion): string {
  return isMainVersion(v) ? "Main" : (v.tag ?? v.title);
}

/**
 * The version switcher that sits at the TOP of the screen detail side panel, above the
 * tabs. Selecting a version drives the preview AND the Sub Components grid below, so the
 * user watches the subcomponents repopulate when switching — the selection is no longer
 * buried next to the cards it changes. Replaces the old "Versions" tab; per-version
 * management (open in canvas, delete) and compare/add live here as actions on the
 * currently selected version.
 */
export function VersionSwitcher({
  versions,
  activeId,
  onSelect,
  onAdd,
  onOpenCanvas,
  onDelete,
  onCompare,
}: {
  versions: ScreenVersion[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onOpenCanvas: (v: ScreenVersion) => void;
  onDelete: (v: ScreenVersion) => void;
  onCompare: () => void;
}) {
  const active = versions.find((v) => v.id === activeId) ?? versions[0] ?? null;
  const hasRealVersions = versions.some((v) => !isMainVersion(v));

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
              onClick={() => onSelect(v.id)}
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
    </div>
  );
}
