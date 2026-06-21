import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconOpenCanvas } from "@/components/icons";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { VersionSwitcher } from "@/components/screen/VersionSwitcher";
import type { ScreenVersion } from "@/lib/data/screenVersions";
import type { ProjectType } from "@/lib/data/types";
import type { CmpKindFilter } from "@/application/screen-detail/useScreenDetail";
import { DetailSidebar } from "./DetailSidebar";

/**
 * The single detail-page shell shared by the screen and component views.
 *
 * Both subjects (a screen or a component) are masters that own a variant chain and
 * expose the same three things: a preview, a version switcher, and tabs for sub
 * components + references. This component owns ALL of that structure once — the outer
 * frame, the header, the preview pane, the version switcher at the top of the aside,
 * the tabs, the search/filter row, and the (identical) References tab.
 *
 * The genuinely per-subject pieces are passed in as slots/props: the breadcrumb, the
 * preview content, the sidebar meta line, the info-panel body, the Sub Components grid
 * (`cardGrid`), and the modal set (`modals`). The `versions` array + handlers are the
 * same model for both — a screen feeds its screen-variants, a component feeds its own
 * variants mapped to the same `ScreenVersion` shape — so the versioning UX is identical.
 */
export function DetailView<T extends string>({
  type,
  // header
  breadcrumb,
  canvasHref,
  canvasLabel,
  // preview
  preview,
  onPreviewFastEdit,
  previewCanvasHref,
  previewShowDevice = true,
  prev,
  next,
  // sidebar header
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
  // versions (same model for screen + component)
  versions,
  activeVersionId,
  versionPreviewKind,
  onSelectVersion,
  onAddVersion,
  onOpenVersionCanvas,
  onDeleteVersion,
  onCompare,
  // tabs + body
  tabs,
  sideTab,
  onTabChange,
  query,
  onQueryChange,
  showKindFilter,
  filter,
  onFilterChange,
  cardGrid,
  // references tab
  references,
  onAddReference,
  onOpenReference,
  onRemoveReference,
  // modals
  modals,
}: {
  type: ProjectType;
  breadcrumb: ReactNode;
  canvasHref: string;
  canvasLabel: string;
  preview: ReactNode;
  onPreviewFastEdit: () => void;
  previewCanvasHref: string;
  previewShowDevice?: boolean;
  prev?: ComponentProps<typeof PreviewShell>["prev"];
  next?: ComponentProps<typeof PreviewShell>["next"];
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
  versions: ScreenVersion[];
  activeVersionId: string | null;
  versionPreviewKind: "screen" | "component";
  onSelectVersion: (id: string) => void;
  onAddVersion: () => void;
  onOpenVersionCanvas: (v: ScreenVersion) => void;
  onDeleteVersion: (v: ScreenVersion) => void;
  onCompare: () => void;
  tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly count?: number }>;
  sideTab: T;
  onTabChange: (id: T) => void;
  query: string;
  onQueryChange: (v: string) => void;
  showKindFilter: boolean;
  filter: CmpKindFilter;
  onFilterChange: (v: CmpKindFilter) => void;
  cardGrid: ReactNode;
  references: ComponentProps<typeof SideReferencesTab>["references"];
  onAddReference: () => void;
  onOpenReference: (index: number) => void;
  onRemoveReference: ComponentProps<typeof SideReferencesTab>["onRemove"];
  modals: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        {breadcrumb}
        <div className="flex items-center gap-2">
          <Link to={canvasHref} className="btn btn-ghost">
            <IconOpenCanvas size={14} strokeWidth={1.6} />
            {canvasLabel}
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 border-t border-[var(--border)]" style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}>
        <PreviewShell
          onFastEdit={onPreviewFastEdit}
          canvasHref={previewCanvasHref}
          showDevice={previewShowDevice}
          prev={prev}
          next={next}
        >
          {preview}
        </PreviewShell>

        <DetailSidebar
          title={title}
          titleLabel={titleLabel}
          onTitleSave={onTitleSave}
          tagBadge={tagBadge}
          meta={meta}
          onOpenHistory={onOpenHistory}
          count={count}
          infoOpen={infoOpen}
          onOpenInfo={onOpenInfo}
          onCloseInfo={onCloseInfo}
          infoTitle={infoTitle}
          infoPanel={infoPanel}
          beforeTabs={
            <VersionSwitcher
              versions={versions}
              activeId={activeVersionId}
              type={type}
              previewKind={versionPreviewKind}
              onSelect={onSelectVersion}
              onAdd={onAddVersion}
              onCompare={onCompare}
              onOpenCanvas={onOpenVersionCanvas}
              onDelete={onDeleteVersion}
            />
          }
          tabs={tabs}
          sideTab={sideTab}
          onTabChange={onTabChange}
          query={query}
          onQueryChange={onQueryChange}
          showKindFilter={showKindFilter}
          filter={filter}
          onFilterChange={onFilterChange}
        >
          {sideTab === "components" && cardGrid}
          {sideTab === "references" && (
            <SideReferencesTab
              references={references}
              query={query}
              onAdd={onAddReference}
              onOpen={onOpenReference}
              onRemove={onRemoveReference}
            />
          )}
        </DetailSidebar>
      </div>

      {modals}
    </div>
  );
}
