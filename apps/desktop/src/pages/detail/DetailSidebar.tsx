import type { ReactNode } from "react";
import { IconHistory, IconPencil } from "@/components/icons";
import type { CmpKindFilter as ScreenCmpKindFilter } from "@/application/screen-detail/useScreenDetail";
import { EditableTitle, SideOverlayPanel, SideKindFilter, SideSearch, SideTabs } from "./detailUi";

/**
 * Shared aside scaffolding for the screen-detail and component-detail views.
 *
 * Owns the structure both views duplicate: the aside wrapper, the header row
 * (editable title + optional tag badge + meta line + history/pencil/count
 * controls), the inline info-panel toggle, the tabs, and the search/filter row
 * plus the scrollable grid container. The view-specific pieces (the tag badge,
 * the meta line, the info-panel body, and the grid body) are passed as props.
 */
export function DetailSidebar<T extends string>({
  // header
  title,
  titleLabel,
  onTitleSave,
  tagBadge,
  meta,
  onOpenHistory,
  count,
  // info panel
  infoOpen,
  onOpenInfo,
  onCloseInfo,
  infoTitle,
  infoPanel,
  // body
  beforeTabs,
  tabs,
  sideTab,
  onTabChange,
  query,
  onQueryChange,
  showKindFilter,
  filter,
  onFilterChange,
  children,
}: {
  title: string;
  titleLabel: string;
  onTitleSave: (v: string) => void;
  tagBadge?: ReactNode;
  meta: ReactNode;
  onOpenHistory: () => void;
  count: number;
  infoOpen: boolean;
  onOpenInfo: () => void;
  onCloseInfo: () => void;
  infoTitle: string;
  infoPanel: ReactNode;
  beforeTabs?: ReactNode;
  tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly count?: number }>;
  sideTab: T;
  onTabChange: (id: T) => void;
  query: string;
  onQueryChange: (v: string) => void;
  showKindFilter: boolean;
  filter: ScreenCmpKindFilter;
  onFilterChange: (v: ScreenCmpKindFilter) => void;
  children: ReactNode;
}) {
  return (
    <aside className="relative flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-[18px] pt-[22px]">
        <div>
          <div className="flex items-center gap-1.5">
            <EditableTitle value={title} label={titleLabel} onSave={onTitleSave} />
            {tagBadge}
          </div>
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            {meta}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="View history" onClick={onOpenHistory}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconHistory size={13} strokeWidth={1.7} />
            History
          </button>
          <button type="button" aria-label="Edit information" onClick={onOpenInfo}
            className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconPencil size={12} strokeWidth={1.7} />
          </button>
          <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {count} component{count === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {beforeTabs}
      <SideTabs tabs={tabs} active={sideTab} onChange={onTabChange} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <SideSearch query={query} onChange={onQueryChange} />
          {showKindFilter ? <SideKindFilter value={filter} onChange={onFilterChange} /> : null}
        </div>
        <div className="grid min-h-0 flex-1 content-start gap-x-4 gap-y-[22px] overflow-y-auto px-6 pb-8 pt-[22px]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
        >
          {children}
        </div>
      </div>

      {infoOpen && (
        <SideOverlayPanel title={infoTitle} onClose={onCloseInfo}>
          {infoPanel}
        </SideOverlayPanel>
      )}
    </aside>
  );
}
