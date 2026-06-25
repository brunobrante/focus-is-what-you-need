import { Link, useNavigate } from "react-router-dom";

import { IconGrid } from "@/components/icons";
import { DashedAddTile } from "@/components/DashedAddTile";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectRow, WorkspaceRow } from "@/lib/storage/schema";
import { relativeTime } from "@/application/landing/useLanding";
import { useHome, type RecentItem, type WorkspaceCard } from "@/application/home/useHome";

/**
 * Dashboard — the Home shell's index page. It surfaces the user's workspaces (as
 * light cards), loose projects, and recent items. It is a deliberately shallow
 * overview: the project-focused browser lives at `/projects`, and each workspace
 * card jumps there with that workspace active. The header, sidebar, and footer
 * come from `HomeLayout`; this component renders only the content.
 */
export function DashboardPage() {
  const { workspaces, recent, looseProjects, activeWorkspace, setActiveWorkspaceId } = useHome();
  const navigate = useNavigate();

  const openWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    navigate("/projects");
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-9">
        <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Dashboard</h1>
        <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
          {activeWorkspace
            ? `Working in ${activeWorkspace.name}`
            : "Pick a workspace to get started"}
        </p>
      </header>

      <WorkspacesSection workspaces={workspaces} onOpenWorkspace={openWorkspace} />

      <MyProjectsSection projects={looseProjects} />

      <RecentSection recent={recent} />
    </div>
  );
}

export default DashboardPage;

/* ── Workspaces ───────────────────────────────────────────────────────────── */

function WorkspacesSection({
  workspaces,
  onOpenWorkspace,
}: {
  workspaces: WorkspaceCard[];
  onOpenWorkspace: (id: string) => void;
}) {
  return (
    <section className="mb-11">
      <SectionHeading title="Workspaces" />
      {workspaces.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">
          No workspaces yet. Create one from the switcher at the top-left.
        </p>
      ) : (
        <div
          className="grid gap-x-[18px] gap-y-[18px]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {workspaces.map((card) => (
            <WorkspaceTile
              key={card.workspace.id}
              card={card}
              onClick={() => onOpenWorkspace(card.workspace.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WorkspaceTile({
  card,
  onClick,
}: {
  card: WorkspaceCard;
  onClick: () => void;
}) {
  const { workspace, projectCount, isActive } = card;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-[border-color,transform] duration-[120ms] hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] bg-[var(--text)] text-[14px] font-bold text-[var(--bg)]"
      >
        {initialOf(workspace)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-[var(--text)]">
            {workspace.name}
          </span>
          {isActive ? (
            <span className="shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.5px] text-[var(--text-muted)]">
              Active
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </div>
      </div>
    </button>
  );
}

function initialOf(workspace: WorkspaceRow): string {
  return workspace.name.trim()[0]?.toUpperCase() ?? "W";
}

/* ── My projects (loose) ──────────────────────────────────────────────────── */

/**
 * Projects that belong to no workspace — created loose from Home. They live here
 * (not in any workspace browser); the add tile creates more loose projects.
 */
function MyProjectsSection({ projects }: { projects: RecentItem[] }) {
  return (
    <section className="mb-11">
      <SectionHeading title="My Projects" />
      <div
        className="grid gap-x-[18px] gap-y-[22px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {projects.map((item) => (
          <RecentCard key={item.project.id} item={item} />
        ))}
        <Link
          to="/new"
          aria-label="Create project"
          className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
        >
          <DashedAddTile label="New project" />
        </Link>
      </div>
    </section>
  );
}

/* ── Recent items ─────────────────────────────────────────────────────────── */

function RecentSection({ recent }: { recent: RecentItem[] }) {
  return (
    <section>
      <SectionHeading title="Recent Items" />
      <div
        className="grid gap-x-[18px] gap-y-[22px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
      >
        {recent.map((item) => (
          <RecentCard key={item.project.id} item={item} />
        ))}
        <Link
          to="/new"
          aria-label="Create project"
          className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
        >
          <DashedAddTile label="New project" />
        </Link>
      </div>
    </section>
  );
}

function RecentCard({ item }: { item: RecentItem }) {
  const { project, screensCount } = item;
  return (
    <Link
      to={`/project/${encodeURIComponent(project.id)}`}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <RecentThumb project={project} />
      <div className="flex flex-col gap-[3px] px-0.5">
        <span className="truncate text-[13.5px] font-medium text-[var(--text)]">
          {project.name}
        </span>
        <div className="text-[11.5px] text-[var(--text-muted)]">
          {screensCount} {screensCount === 1 ? "screen" : "screens"}
          <span className="px-1.5 text-[var(--text-faint)]">·</span>
          updated {relativeTime(project.updatedAt)}
        </div>
      </div>
    </Link>
  );
}

function RecentThumb({ project }: { project: ProjectRow }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-[120ms] group-hover:border-[var(--border-strong)]">
      <span className="absolute left-2.5 top-2.5 z-[2] rounded border border-[var(--border)] bg-black/55 px-1.5 py-[3px] text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)] backdrop-blur-md">
        {PROJECT_TYPE_LABEL[project.type]}
      </span>
      {project.thumbnailDataUrl ? (
        <img
          src={project.thumbnailDataUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[var(--text-faint)]">
          <IconGrid size={26} strokeWidth={1.3} />
        </div>
      )}
    </div>
  );
}

/* ── Shared ───────────────────────────────────────────────────────────────── */

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[var(--text-faint)]">
      {title}
    </h2>
  );
}
