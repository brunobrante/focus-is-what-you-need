import { ChevronsDownUp, ChevronsUpDown, RotateCcw, Save } from "lucide-react";
import type { ReactNode } from "react";
import type { SidebarTab } from "../types";
import { CROPS_OVERLAY_PRESETS } from "../types";

export function SidebarTabs({
  active,
  onChange,
}: {
  active: SidebarTab;
  onChange: (tab: SidebarTab) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-2">
      <SidebarTabButton active={active === "components"} onClick={() => onChange("components")}>
        Componentes
      </SidebarTabButton>
      <SidebarTabButton active={active === "config"} onClick={() => onChange("config")}>
        Config
      </SidebarTabButton>
    </div>
  );
}

function SidebarTabButton({
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
        "h-7 cursor-pointer rounded-[7px] border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)]"
          : "border-transparent bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function SidebarComponentsHeader({
  rootName,
  scopedCount,
  showReset,
  onExpandAll,
  onCollapseAll,
  onReset,
}: {
  rootName: string;
  scopedCount: number;
  showReset: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">Componentes</h3>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--text-faint)]">
            {scopedCount}
          </span>
        </div>
        <p className="m-0 mt-0.5 max-w-[210px] overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-[var(--text-faint)]">
          Screen: {rootName}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Expand all"
          title="Expand entire tree"
          onClick={onExpandAll}
          disabled={scopedCount <= 1}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--surface)] disabled:hover:text-[var(--text-muted)]"
        >
          <ChevronsUpDown size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Collapse all"
          title="Collapse entire tree"
          onClick={onCollapseAll}
          disabled={scopedCount <= 1}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:bg-[var(--surface)] disabled:hover:text-[var(--text-muted)]"
        >
          <ChevronsDownUp size={13} strokeWidth={1.8} />
        </button>
        {showReset ? (
          <button
            type="button"
            aria-label="Resetar stack"
            title="Resetar stack"
            onClick={onReset}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <RotateCcw size={13} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SidebarSaveButton({
  saving,
  saveStatus,
  onSave,
}: {
  saving: boolean;
  saveStatus: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex shrink-0 border-t border-[var(--border)] bg-[rgba(15,15,16,0.82)] px-3 py-3 backdrop-blur-[8px]">
      <button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[var(--accent)] bg-[var(--accent)] px-3 text-[12.5px] font-semibold text-[var(--accent-fg)] transition-colors duration-[120ms] hover:bg-white"
      >
        {saving ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(0,0,0,0.25)] border-t-[var(--accent-fg)]" />
        ) : (
          <Save size={14} strokeWidth={1.9} />
        )}
        {saving ? "Saving..." : saveStatus ?? "Save"}
      </button>
    </div>
  );
}

export function SidebarConfigPanel({
  cropsOverlayColor,
  onChangeCropsOverlayColor,
  cropsOverlayAlpha,
  onChangeCropsOverlayAlpha,
}: {
  cropsOverlayColor: string;
  onChangeCropsOverlayColor: (color: string) => void;
  cropsOverlayAlpha: number;
  onChangeCropsOverlayAlpha: (alpha: number) => void;
}) {
  const alphaPct = Math.round(cropsOverlayAlpha * 100);
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <div>
          <h4 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">
            Crop overlay color
          </h4>
          <p className="m-0 mt-1 text-[10.5px] leading-[1.4] text-[var(--text-faint)]">
            Base color applied over already cropped areas. The screen blend is
            preserved — lighter colors appear more.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-[7px] border border-[var(--border-strong)]">
            <input
              type="color"
              value={cropsOverlayColor}
              onChange={(event) => onChangeCropsOverlayColor(event.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0 opacity-0"
            />
            <span
              aria-hidden
              className="block h-full w-full"
              style={{ background: cropsOverlayColor }}
            />
          </label>
          <span className="font-mono text-[11.5px] uppercase tabular-nums text-[var(--text-muted)]">
            {cropsOverlayColor}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {CROPS_OVERLAY_PRESETS.map((preset) => {
            const isActive = preset.toUpperCase() === cropsOverlayColor.toUpperCase();
            return (
              <button
                key={preset}
                type="button"
                aria-label={`Select color ${preset}`}
                onClick={() => onChangeCropsOverlayColor(preset)}
                className={[
                  "h-6 w-6 cursor-pointer rounded-full border transition-transform duration-[120ms] hover:scale-110",
                  isActive
                    ? "border-[var(--text)] ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg)]"
                    : "border-[var(--border-strong)]",
                ].join(" ")}
                style={{ background: preset }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h4 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">
            Crop overlay opacity
          </h4>
          <span className="font-mono text-[11.5px] tabular-nums text-[var(--text-muted)]">
            {alphaPct}%
          </span>
        </div>
        <p className="m-0 text-[10.5px] leading-[1.4] text-[var(--text-faint)]">
          How strongly already cropped areas are tinted.
        </p>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={alphaPct}
          aria-label="Crop overlay opacity"
          onChange={(event) => onChangeCropsOverlayAlpha(Number(event.target.value) / 100)}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--border-strong)] accent-[var(--text)]"
        />
      </div>
    </div>
  );
}
