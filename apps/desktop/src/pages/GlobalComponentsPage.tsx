import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { PageFooter } from "@/components/layout/PageFooter";
import { Snapshot } from "@/components/Snapshot";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { IconPlus, IconSearch, IconGlobe, IconChevronDown } from "@/components/icons";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import type { ComponentKind } from "@/lib/data/types";
import type { ComponentRow, ProjectRow } from "@/lib/storage/schema";
import { useGlobalComponents, KINDS, KIND_FILTERS } from "@/application/global-components/useGlobalComponents";

export function GlobalComponentsPage() {
  const {
    workspaceId,
    components,
    workspaceProjects,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    creating,
    setCreating,
    newName,
    setNewName,
    newKind,
    setNewKind,
    submitting,
    pendingDelete,
    setPendingDelete,
    filtered,
    createWorkspaceComponent,
    handleConfirmDelete,
  } = useGlobalComponents();

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <TopBar />
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
            onClick={() => setCreating((v) => !v)}
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

        {creating && workspaceId && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <input
              type="text"
              autoFocus
              value={newName}
              placeholder="Component name…"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createWorkspaceComponent();
              }}
              className="h-9 w-[240px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ComponentKind)}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[13px] text-[var(--text)] outline-none"
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createWorkspaceComponent()}
              disabled={!newName.trim() || submitting}
              className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        )}

        <div className="mb-6 flex items-center gap-2.5">
          <div className="relative max-w-[280px] flex-1">
            <IconSearch size={14} strokeWidth={1.7} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="search"
              placeholder="Search components..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
            />
          </div>

          <div className="relative">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
              className="h-8 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-8 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--text-muted)]"
            >
              {KIND_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <IconChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          </div>
        </div>

        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {filtered.map((c) => (
            <WorkspaceComponentCard
              key={c.id}
              component={c}
              projects={workspaceProjects}
              onRequestDelete={() => setPendingDelete(c)}
            />
          ))}
          {workspaceId && <AddComponentCard onClick={() => setCreating((v) => !v)} />}
        </div>
        {filtered.length === 0 && components.length > 0 && (
          <p className="mt-4 text-center text-[13px] text-[var(--text-muted)]">
            Try a different search or filter
          </p>
        )}
      </main>

      <ConfirmActionModal
        open={Boolean(pendingDelete)}
        title="Delete component"
        message={
          pendingDelete
            ? `The component "${pendingDelete.name}" and all of its variants will be removed.`
            : ""
        }
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      <PageFooter />
    </div>
  );
}

function WorkspaceComponentCard({
  component,
  projects,
  onRequestDelete,
}: {
  component: ComponentRow;
  projects: ProjectRow[];
  onRequestDelete: () => void;
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
              key: "more",
              label: "More",
              icon: CardMenuIcons.More,
              menuItems: [
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
            {primary ? `em ${primary.name}` : "Global"}
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
      <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] transition-colors duration-[120ms] group-hover:border-[var(--text)] group-hover:text-[var(--text)]">
        <div className="flex flex-col items-center gap-1.5 text-[12px] tracking-[0.2px]">
          <IconPlus size={22} strokeWidth={1.6} />
          <span>New component</span>
        </div>
      </div>
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
