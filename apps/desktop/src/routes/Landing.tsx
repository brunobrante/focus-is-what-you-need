import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconPlus, IconSearch } from "@/components/icons";
import { TopBar } from "@/components/layout/TopBar";
import { ProjectSettingsModal, type ProjectSettingsModalHandle } from "@/components/modals/ProjectSettingsModal";
import { ConfirmActionModal, type ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";
import { CardMoreMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import { resetToFactoryData } from "@/lib/storage/seed";
import { deleteProject } from "@/lib/storage/repos/projects.repo";
import { useAllScreens, useProjects, useWorkspaces } from "@/lib/storage/hooks";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import type { ProjectRow } from "@/lib/storage/schema";

type Filter = "all" | ProjectType;

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${d === 1 ? "day" : "days"} ago`;
  const w = Math.floor(d / 7);
  return `${w} ${w === 1 ? "week" : "weeks"} ago`;
}

export function Landing() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [isResettingFactory, setIsResettingFactory] = useState(false);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);
  const settingsRef = useRef<ProjectSettingsModalHandle>(null);

  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();
  const { data: workspaces } = useWorkspaces();
  const [activeWorkspaceId] = useActiveWorkspaceId();

  // Scope the gallery to the active workspace. A workspace owns its projects via
  // `projectIds`, so a freshly created (blank) workspace shows no projects.
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const projects = useMemo(
    () =>
      activeWorkspace
        ? allProjects.filter((p) => activeWorkspace.projectIds.includes(p.id))
        : allProjects,
    [allProjects, activeWorkspace],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      const matchType = filter === "all" || p.type === filter;
      const matchQ = !q || p.name.toLowerCase().includes(q);
      return matchType && matchQ;
    });
  }, [projects, query, filter]);

  const screensByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allScreens) {
      counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    }
    return counts;
  }, [allScreens]);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <TopBar
        isResettingFactory={isResettingFactory}
        onResetToFactory={async () => {
          setIsResettingFactory(true);
          try {
            await resetToFactoryData();
            setQuery("");
            setFilter("all");
          } finally {
            setIsResettingFactory(false);
          }
        }}
      />

      <main className="flex flex-1 flex-col">
        {projects.length === 0 ? <EmptyState /> : <ProjectsView
          allProjects={projects}
          filtered={filtered}
          screensByProject={screensByProject}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          onRequestEdit={(project) => {
            const screens = allScreens.filter((s) => s.projectId === project.id);
            settingsRef.current?.open(project, screens);
          }}
          onRequestDelete={(project) => {
            confirmRef.current?.open({
              title: "Delete project",
              message: `The project "${project.name}" will be removed along with its screens, components, and references.`,
              onConfirm: () => deleteProject(project.id),
            });
          }}
        />}
      </main>

      <ConfirmActionModal ref={confirmRef} />
      <ProjectSettingsModal ref={settingsRef} />

      <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
        v0.1 · design preview
      </footer>
    </div>
  );
}

function ProjectsView({
  allProjects,
  filtered,
  screensByProject,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  onRequestEdit,
  onRequestDelete,
}: {
  allProjects: ProjectRow[];
  filtered: ProjectRow[];
  screensByProject: Map<string, number>;
  query: string;
  onQueryChange: (v: string) => void;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  onRequestEdit: (project: ProjectRow) => void;
  onRequestDelete: (project: ProjectRow) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-14">
      <header className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Your projects</h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            {allProjects.length} {allProjects.length === 1 ? "project" : "projects"} in workspace
          </p>
        </div>
        <Link to="/new" className="btn btn-primary">
          <IconPlus size={14} strokeWidth={2} />
          New project
        </Link>
      </header>

      <div className="mb-[18px] flex items-center gap-2.5">
        <div className="relative w-full max-w-[320px] flex-1">
          <IconSearch size={14} strokeWidth={1.7} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            type="search"
            placeholder="Search projects..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-0 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
          />
        </div>

        <Segmented
          value={filter}
          onChange={onFilterChange}
          options={[
            { value: "all", label: "All" },
            { value: "desktop", label: "Desktop" },
            { value: "tablet", label: "Tablet" },
            { value: "mobile", label: "Mobile" },
          ]}
        />
      </div>

      <div
        className="grid gap-x-[18px] gap-y-[22px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {filtered.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            screensCount={screensByProject.get(p.id) ?? 0}
            onRequestEdit={onRequestEdit}
            onRequestDelete={onRequestDelete}
          />
        ))}
        <AddProjectCard />
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter by type"
      className="inline-flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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
  );
}

function ProjectCard({
  project,
  screensCount,
  onRequestEdit,
  onRequestDelete,
}: {
  project: ProjectRow;
  screensCount: number;
  onRequestEdit: (project: ProjectRow) => void;
  onRequestDelete: (project: ProjectRow) => void;
}) {
  return (
    <Link
      to={`/project/${encodeURIComponent(project.id)}`}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <ProjectThumb project={project}>
        <CardMoreMenu
          items={[
            {
              key: "edit",
              label: "Edit project",
              icon: CardMenuIcons.Open,
              onClick: () => onRequestEdit(project),
            },
            {
              key: "delete",
              label: "Delete project",
              icon: CardMenuIcons.Trash,
              destructive: true,
              onClick: () => onRequestDelete(project),
            },
          ]}
        />
      </ProjectThumb>
      <div className="flex flex-col gap-[3px] px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-medium text-[var(--text)]">
            {project.name}
          </span>
        </div>
        <div className="text-[11.5px] text-[var(--text-muted)]">
          {screensCount} {screensCount === 1 ? "screen" : "screens"}
          <span className="px-1.5 text-[var(--text-faint)]">·</span>
          updated {relativeTime(project.updatedAt)}
        </div>
      </div>
    </Link>
  );
}

function ProjectThumb({ project, children }: { project: ProjectRow; children?: ReactNode }) {
  const type = project.type;
  const count = type === "mobile" ? 4 : type === "tablet" ? 3 : 2;
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-[120ms] group-hover:border-[var(--border-strong)]"
    >
      <span className="absolute left-2.5 top-2.5 z-[2] rounded border border-[var(--border)] bg-black/55 px-1.5 py-[3px] text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)] backdrop-blur-md">
        {PROJECT_TYPE_LABEL[type]}
      </span>
      {children}
      {project.thumbnailDataUrl ? (
        <img src={project.thumbnailDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center p-3.5 ${
            type === "mobile" ? "gap-1.5" : type === "tablet" ? "gap-2.5" : "gap-2"
          }`}
        >
          {Array.from({ length: count }).map((_, i) => (
            <Frame key={i} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}

function Frame({ type }: { type: ProjectType }) {
  let widthCls = "w-[60%] aspect-[16/10]";
  let radiusCls = "rounded";
  if (type === "tablet") widthCls = "w-[38%] aspect-[4/5.5]";
  if (type === "mobile") {
    widthCls = "w-[22%] aspect-[9/19.5]";
    radiusCls = "rounded-md";
  }
  return (
    <div
      className={`relative flex flex-col overflow-hidden border border-[var(--border-strong)] bg-[var(--surface-hover)] shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${widthCls} ${radiusCls} flex-shrink-0`}
    >
      <span className="block h-1.5 bg-[var(--border)]" />
      <span className="mx-1 mt-1 block h-[3px] w-[60%] rounded-[1px] bg-[var(--border)]" />
      <span className="mx-1 mt-1 block h-[3px] w-[40%] rounded-[1px] bg-[var(--border)]" />
      <span className="mx-1 mt-1.5 block h-[3px] w-[70%] rounded-[1px] bg-[var(--border)]" />
      <span className="mx-1 mt-1 block h-[3px] w-[30%] rounded-[1px] bg-[var(--border)]" />
    </div>
  );
}

function AddProjectCard() {
  return (
    <Link
      to="/new"
      aria-label="Create project"
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)] transition-colors duration-[120ms] group-hover:border-[var(--text)] group-hover:text-[var(--text)]">
        <div className="flex flex-col items-center gap-1.5 text-[12px] tracking-[0.2px]">
          <IconPlus size={22} strokeWidth={1.6} />
          <span>New project</span>
        </div>
      </div>
      <div className="flex flex-col gap-[3px] px-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-medium text-[var(--text-muted)]">
            New project
          </span>
        </div>
        <div className="text-[11.5px] text-[var(--text-muted)]">start from scratch</div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-12">
      <div className="max-w-[460px] text-center">
        <div
          aria-hidden
          className="mx-auto mb-7 grid h-[120px] w-[120px] place-items-center rounded-2xl border border-dashed border-[var(--border-strong)] text-[var(--text-faint)]"
        >
          <IconPlus size={40} strokeWidth={1.4} />
        </div>
        <h1 className="mb-2 text-[22px] font-semibold tracking-[-0.2px]">No projects yet</h1>
        <p className="mb-7 text-[14px] leading-[1.5] text-[var(--text-muted)]">
          Start by creating your first project. You can choose the format and give it a name.
        </p>
        <Link to="/new" className="btn btn-primary">
          <IconPlus size={14} strokeWidth={2} />
          Create project
        </Link>
      </div>
    </div>
  );
}
