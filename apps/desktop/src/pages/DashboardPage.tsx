import { useNavigate } from "react-router-dom";

import {
  AddProjectTile,
  ProjectCard,
  WorkspaceTile,
} from "@/components/home/HomeCards";
import { useHome, type RecentItem, type WorkspaceCard } from "@/application/home/useHome";

/**
 * Dashboard — the Home shell's index page. It surfaces the user's workspaces (as
 * light cards), loose projects, and recent items. It is a deliberately shallow
 * overview: the project-focused browser lives at `/projects`, and each workspace
 * card jumps there with that workspace active. The header, sidebar, and footer
 * come from `HomeLayout`; this component renders only the content. The dedicated
 * Workspaces (`/workspaces`) and Projects (`/my-projects`) pages reuse the same
 * cards.
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
          <ProjectCard key={item.project.id} item={item} />
        ))}
        <AddProjectTile />
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
          <ProjectCard key={item.project.id} item={item} />
        ))}
        <AddProjectTile />
      </div>
    </section>
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
