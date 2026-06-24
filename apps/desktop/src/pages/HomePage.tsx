import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { PageFooter } from "@/components/layout/PageFooter";
import {
  AppSettingsModal,
  type AppSettingsModalHandle,
} from "@/components/modals/AppSettingsModal";
import {
  IconChevronDown,
  IconClock,
  IconDocument,
  IconFrame,
  IconGrid,
  IconImage,
  IconPencil,
  IconPlus,
  IconSettings,
  IconSparkles,
} from "@/components/icons";
import { DashedAddTile } from "@/components/DashedAddTile";
import { useDismissable } from "@/lib/hooks/useDismissable";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectRow, WorkspaceRow } from "@/lib/storage/schema";
import { createWorkspace } from "@/lib/storage/repos/workspace.repo";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { relativeTime } from "@/application/landing/useLanding";
import { useHome, type RecentItem, type WorkspaceCard } from "@/application/home/useHome";

/**
 * Home — the central hub shown when the app opens. It surfaces the user's
 * workspaces (as light cards), quick links, and recent projects. It is a
 * deliberately shallow overview: the project-focused browser lives at
 * `/projects`, and each workspace card jumps there with that workspace active.
 */
export function HomePage() {
  const { workspaces, recent, looseProjects, activeWorkspace, setActiveWorkspaceId } = useHome();
  const navigate = useNavigate();
  const settingsRef = useRef<AppSettingsModalHandle>(null);

  const openWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    navigate("/projects");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <HomeHeader />

      <div className="flex flex-1">
        <HomeSidebar onOpenSettings={() => settingsRef.current?.open()} />

        <main className="flex flex-1 flex-col">
          <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
            <header className="mb-9">
              <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.3px]">Home</h1>
              <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
                {activeWorkspace
                  ? `Working in ${activeWorkspace.name}`
                  : "Pick a workspace to get started"}
              </p>
            </header>

            <WorkspacesSection
              workspaces={workspaces}
              onOpenWorkspace={openWorkspace}
            />

            <MyProjectsSection projects={looseProjects} />

            <RecentSection recent={recent} />
          </div>
        </main>
      </div>

      <PageFooter />
      <AppSettingsModal ref={settingsRef} />
    </div>
  );
}

export default HomePage;

/* ── Header ───────────────────────────────────────────────────────────────── */

/**
 * The home's own header — deliberately separate from the workspace TopBar. It
 * carries only the product mark and a primary create action; workspace switching
 * happens through the cards below, not a switcher here.
 */
function HomeHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] px-6">
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--text)] text-[12px] font-bold text-[var(--bg)]"
      >
        F
      </span>
      <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--text)]">
        Focus
      </span>
      <span className="flex-1" />
      <NewMenu />
    </header>
  );
}

/**
 * The header's "New" dropdown — one entry point for creating a workspace, a
 * project, or a draft. New project routes to the wizard; new workspace creates
 * one and makes it active in place; draft is a placeholder until that flow
 * exists.
 */
function NewMenu() {
  const navigate = useNavigate();
  const [, setActiveWorkspaceId] = useActiveWorkspaceId();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissable(open, () => setOpen(false), [triggerRef, menuRef]);

  const onNewWorkspace = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createWorkspace({ name: "Untitled workspace" });
      setActiveWorkspaceId(created.id);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary"
      >
        <IconPlus size={14} strokeWidth={2} />
        Create
        <IconChevronDown
          size={11}
          strokeWidth={2.2}
          className={["transition-transform duration-150", open ? "rotate-180" : ""].join(" ")}
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[230px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
        >
          <MenuItem
            icon={<IconGrid size={15} strokeWidth={1.7} />}
            onClick={() => void onNewWorkspace()}
            disabled={creating}
          >
            {creating ? "Creating workspace…" : "New workspace"}
          </MenuItem>
          <MenuItem
            icon={<IconFrame size={15} strokeWidth={1.7} />}
            onClick={() => {
              setOpen(false);
              navigate("/new");
            }}
          >
            New project
          </MenuItem>
          <MenuItem
            icon={<IconPencil size={15} strokeWidth={1.7} />}
            onClick={() => {
              setOpen(false);
              navigate("/new-draft");
            }}
          >
            New draft
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  placeholder,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** A not-yet-built action: visible but inert ("Coming soon"). */
  placeholder?: boolean;
}) {
  if (placeholder) {
    return (
      <span
        role="menuitem"
        aria-disabled
        title="Coming soon"
        className="flex h-9 w-full cursor-default items-center gap-2.5 rounded-lg px-3 text-[12.5px] text-[var(--text-faint)]"
      >
        <span className="opacity-70">{icon}</span>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 text-left text-[12.5px] text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
    >
      <span className="opacity-85">{icon}</span>
      {children}
    </button>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

function HomeSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <aside className="hidden w-[224px] shrink-0 border-r border-[var(--border)] px-3 py-6 md:block">
      <nav className="flex flex-col gap-0.5">
        {/* Recent Items, Drafts, and Local References reach real routes today;
            Learn is a placeholder until its feature lands. */}
        <SidebarLink to="/" icon={<IconClock size={15} strokeWidth={1.7} />}>
          Recent Items
        </SidebarLink>
        <SidebarLink to="/drafts" icon={<IconDocument size={15} strokeWidth={1.7} />}>
          Drafts
        </SidebarLink>
        <SidebarLink to="/references" icon={<IconImage size={15} strokeWidth={1.7} />}>
          Local References
        </SidebarLink>
        <SidebarPlaceholder icon={<IconSparkles size={15} strokeWidth={1.7} />}>
          Learn
        </SidebarPlaceholder>
      </nav>

      <div className="my-3 h-px bg-[var(--border)]" />

      <SidebarButton
        icon={<IconSettings size={15} strokeWidth={1.7} />}
        onClick={onOpenSettings}
      >
        Settings
      </SidebarButton>
    </aside>
  );
}

const SIDEBAR_ROW =
  "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors duration-[120ms]";

function SidebarLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`${SIDEBAR_ROW} text-[var(--text-muted)] no-underline hover:bg-[var(--surface)] hover:text-[var(--text)]`}
    >
      <span className="opacity-85">{icon}</span>
      {children}
    </Link>
  );
}

function SidebarButton({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${SIDEBAR_ROW} w-full cursor-pointer border-0 bg-transparent text-left text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]`}
    >
      <span className="opacity-85">{icon}</span>
      {children}
    </button>
  );
}

/** A nav row whose destination is not built yet — visible but inert. */
function SidebarPlaceholder({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      aria-disabled
      title="Coming soon"
      className={`${SIDEBAR_ROW} cursor-default text-[var(--text-faint)]`}
    >
      <span className="opacity-70">{icon}</span>
      {children}
    </span>
  );
}

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
