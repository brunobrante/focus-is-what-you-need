import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageFooter } from "@/components/layout/PageFooter";
import { Snapshot } from "@/components/Snapshot";
import { NewComponentModal, type NewComponentModalHandle } from "@/components/modals/NewComponentModal";
import { FastEditModal, type FastEditModalHandle } from "@/components/screen/FastEditModal";
import { IconPlus, IconSearch, IconGlobe, IconDiamond, IconLink, IconUnlink } from "@/components/icons";
import { useUnlinkComponent } from "@/application/components/useUnlinkComponent";
import { useDeleteComponent } from "@/application/components/useDeleteComponent";
import { DashedAddTile } from "@/components/DashedAddTile";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { FilterButton, FilterSection } from "@/components/ui/FilterButton";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import type { ComponentRow, ProjectRow } from "@/lib/storage/schema";
import { useGlobalComponents, KIND_FILTERS } from "@/application/global-components/useGlobalComponents";

export function GlobalComponentsPage() {
  const {
    workspaceId,
    components,
    workspaceProjects,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    filtered,
  } = useGlobalComponents();

  const newComponentModalRef = useRef<NewComponentModalHandle>(null);
  const fastEditRef = useRef<FastEditModalHandle>(null);
  const { requestToggle, modal: unlinkModal } = useUnlinkComponent();
  const { requestDelete, modal: deleteModal } = useDeleteComponent();

  const openCreateModal = () => {
    if (!workspaceId) return;
    newComponentModalRef.current?.open({ kind: "workspace", workspaceId });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-14">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Global components</h1>
              <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
                Shared across all projects in this workspace · {components.length}{" "}
                {components.length === 1 ? "component" : "components"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!workspaceId}
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlus size={14} strokeWidth={2} />
            Add component
          </button>
        </header>

        {!workspaceId && (
          <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--text-muted)]">
            Create a workspace from the top-left menu to add global components.
          </div>
        )}

        <div className="mb-6 flex items-center gap-2">
          <label className="relative max-w-[280px] flex-1">
            <IconSearch size={13} strokeWidth={1.7} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="search"
              placeholder="Search components..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-[34px] w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-0 pl-8 pr-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
            />
          </label>
          <FilterButton activeCount={kindFilter !== "all" ? 1 : 0}>
            <FilterSection
              title="Kind"
              options={KIND_FILTERS}
              value={kindFilter}
              onChange={(v) => setKindFilter(v as typeof kindFilter)}
            />
          </FilterButton>
        </div>

        {components.length === 0 ? (
          <EmptyMessage
            icon={<IconDiamond size={17} strokeWidth={1.7} />}
            title="No global components yet"
            description="Global components are shared across all projects in this workspace."
            onClick={workspaceId ? openCreateModal : undefined}
          />
        ) : (
          <>
            <div
              className="grid gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
            >
              {filtered.map((c) => (
                <WorkspaceComponentCard
                  key={c.id}
                  component={c}
                  projects={workspaceProjects}
                  onRequestDelete={() => void requestDelete(c)}
                  onToggleLinkable={() => void requestToggle(c)}
                  onFastEdit={() =>
                    fastEditRef.current?.open({
                      mode: "component",
                      component: c,
                      variant: null,
                      type: "desktop",
                      canvasHref: `/canvas?variant=${encodeURIComponent(c.activeVariantId)}&type=desktop`,
                    })
                  }
                />
              ))}
              {workspaceId && <AddComponentCard onClick={openCreateModal} />}
            </div>
            {filtered.length === 0 && (
              <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
                Try a different search or filter
              </p>
            )}
          </>
        )}
      </main>

      <NewComponentModal ref={newComponentModalRef} />
      <FastEditModal ref={fastEditRef} />
      {unlinkModal}
      {deleteModal}

      <PageFooter />
    </div>
  );
}

function WorkspaceComponentCard({
  component,
  projects,
  onRequestDelete,
  onFastEdit,
  onToggleLinkable,
}: {
  component: ComponentRow;
  projects: ProjectRow[];
  onRequestDelete: () => void;
  onFastEdit: () => void;
  onToggleLinkable: () => void;
}) {
  const navigate = useNavigate();
  const canvasHref = `/canvas?variant=${encodeURIComponent(component.activeVariantId)}&type=desktop`;
  const primary = projects[0] ?? null;
  const extra = projects.length - 1;
  return (
    <Link
      to={canvasHref}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
        <Snapshot
          kind="component"
          ownerType="variant"
          ownerId={component.activeVariantId}
          seedKey={null}
          type="desktop"
          display="card"
        />
        <CardMenu
          buttons={[
            {
              key: "canvas",
              label: "Open in canvas",
              icon: CardMenuIcons.Canvas,
              onClick: () => navigate(canvasHref),
            },
            {
              key: "fast-edit",
              label: "Fast edit",
              icon: CardMenuIcons.FastEdit,
              onClick: onFastEdit,
            },
            {
              key: "more",
              label: "More",
              icon: CardMenuIcons.More,
              menuItems: [
                component.linkable
                  ? {
                      key: "unlink",
                      label: "Unlink",
                      icon: <IconUnlink size={13} strokeWidth={1.7} />,
                      accent: true,
                      onClick: onToggleLinkable,
                    }
                  : {
                      key: "link",
                      label: "Make linkable",
                      icon: <IconLink size={13} strokeWidth={1.7} />,
                      onClick: onToggleLinkable,
                    },
                {
                  key: "delete",
                  label: "Delete component",
                  icon: CardMenuIcons.Trash,
                  destructive: true,
                  onClick: onRequestDelete,
                },
              ],
            },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
            {component.name}
          </span>
          {component.kind ? (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
              {component.kind}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
          <IconGlobe size={11} strokeWidth={1.7} className="flex-shrink-0 text-[var(--text)] opacity-90" />
          <span className="min-w-0 truncate">
            {primary ? `in ${primary.name}` : "Global"}
          </span>
          {extra > 0 ? (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1 py-px text-[9.5px] text-[var(--text-faint)]">
              +{extra}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function AddComponentCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-2.5 border-0 bg-transparent p-0 text-left text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <DashedAddTile label="New component" className="w-full" />
      <div className="flex flex-col gap-[3px] px-0.5">
        <span className="truncate text-[13px] font-medium text-[var(--text-muted)]">
          New component
        </span>
        <div className="text-[11.5px] text-[var(--text-muted)]">workspace-global</div>
      </div>
    </button>
  );
}

export default GlobalComponentsPage;
