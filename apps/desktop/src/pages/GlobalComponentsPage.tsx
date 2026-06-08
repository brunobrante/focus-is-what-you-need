import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { Snapshot } from "@/components/Snapshot";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { IconPlus, IconSearch, IconLayers, IconTrash } from "@/components/icons";
import type { ComponentKind } from "@/lib/data/types";
import type { ComponentRow } from "@/lib/storage/schema";
import { useGlobalComponents, KINDS, KIND_FILTERS } from "@/application/global-components/useGlobalComponents";

export function GlobalComponentsPage() {
  const {
    workspaceId,
    components,
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
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <IconLayers size={16} strokeWidth={1.6} className="text-[var(--text-muted)]" />
            </div>
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

          <div
            role="tablist"
            className="inline-flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
          >
            {KIND_FILTERS.map((opt) => {
              const isActive = opt.value === kindFilter;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  onClick={() => setKindFilter(opt.value)}
                  className={[
                    "h-[26px] cursor-pointer rounded-md border-0 bg-transparent px-2.5 text-[12px]",
                    isActive
                      ? "bg-[var(--pill)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  ].join(" ")}
                  style={isActive ? { background: "var(--pill)" } : undefined}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
          >
            {filtered.map((c) => (
              <WorkspaceComponentCard
                key={c.id}
                component={c}
                onRequestDelete={() => setPendingDelete(c)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <p className="text-[14px] font-medium text-[var(--text)]">No components yet</p>
            <p className="text-[13px] text-[var(--text-muted)]">
              {components.length === 0
                ? "Add a workspace-global component to share across projects."
                : "Try a different search or filter"}
            </p>
          </div>
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

      <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
        <Link to="/" className="text-[var(--text-faint)] no-underline hover:text-[var(--text-muted)]">
          ← Back to projects
        </Link>
      </footer>
    </div>
  );
}

function WorkspaceComponentCard({
  component,
  onRequestDelete,
}: {
  component: ComponentRow;
  onRequestDelete: () => void;
}) {
  const canvasHref = `/canvas?variant=${encodeURIComponent(component.activeVariantId)}&type=desktop`;
  return (
    <div className="group flex flex-col gap-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]">
      <Link
        to={canvasHref}
        className="flex h-28 items-center justify-center bg-[var(--bg)] no-underline"
      >
        <Snapshot
          kind="component"
          ownerType="variant"
          ownerId={component.activeVariantId}
          seedKey={null}
          type="desktop"
          display="card"
        />
      </Link>
      <div className="flex flex-col gap-2 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-[var(--text)]">
            {component.name}
          </span>
          {component.kind && (
            <span className="shrink-0 rounded-full bg-[var(--pill)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              {component.kind}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <Link
            to={canvasHref}
            className="rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--text-muted)] no-underline transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Edit in canvas
          </Link>
          <button
            type="button"
            aria-label="Delete component"
            onClick={onRequestDelete}
            className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] bg-transparent text-[var(--text-faint)] opacity-0 transition-all group-hover:opacity-100 hover:border-[var(--border-strong)] hover:text-[#ffb0b0]"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default GlobalComponentsPage;
