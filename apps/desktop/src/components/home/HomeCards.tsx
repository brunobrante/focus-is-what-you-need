import { Link } from "react-router-dom";

import { IconGrid } from "@/components/icons";
import { DashedAddTile } from "@/components/DashedAddTile";
import { PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectRow, WorkspaceRow } from "@/lib/storage/schema";
import { relativeTime } from "@/application/landing/useLanding";
import type { RecentItem, WorkspaceCard } from "@/application/home/useHome";
import { CardMenuIcons, CardMoreMenu } from "@/components/screen/CardMenu";

/**
 * Home card primitives shared by the Dashboard and the dedicated Workspaces /
 * Projects pages, so the three surfaces stay visually identical and never drift.
 */

export function initialOf(workspace: WorkspaceRow): string {
  return workspace.name.trim()[0]?.toUpperCase() ?? "W";
}

/* ── Workspace card ───────────────────────────────────────────────────────── */

export function WorkspaceTile({
  card,
  onClick,
  onDelete,
}: {
  card: WorkspaceCard;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const { workspace, projectCount, isActive } = card;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-left transition-[border-color,transform] duration-[120ms] hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
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
      {onDelete ? (
        <CardMoreMenu
          items={[
            {
              key: "delete",
              label: "Delete workspace",
              icon: CardMenuIcons.Trash,
              destructive: true,
              onClick: onDelete,
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/* ── Project card ─────────────────────────────────────────────────────────── */

export function ProjectCard({
  item,
  onDelete,
}: {
  item: RecentItem;
  onDelete?: () => void;
}) {
  const { project, screensCount, workspace } = item;
  return (
    <div className="group relative">
      <Link
        to={`/project/${encodeURIComponent(project.id)}`}
        className="flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
      >
        <ProjectThumb project={project} workspace={workspace} />
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
      {onDelete ? (
        <CardMoreMenu
          items={[
            {
              key: "delete",
              label: "Delete project",
              icon: CardMenuIcons.Trash,
              destructive: true,
              onClick: onDelete,
            },
          ]}
        />
      ) : null}
    </div>
  );
}

function ProjectThumb({
  project,
  workspace,
}: {
  project: ProjectRow;
  workspace: WorkspaceRow | null;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-[120ms] group-hover:border-[var(--border-strong)]">
      <span className="absolute left-2.5 top-2.5 z-[2] rounded border border-[var(--border)] bg-black/55 px-1.5 py-[3px] text-[10px] uppercase tracking-[0.5px] text-[var(--text-muted)] backdrop-blur-md">
        {PROJECT_TYPE_LABEL[project.type]}
      </span>
      {workspace ? (
        <span
          title={`In workspace: ${workspace.name}`}
          className="absolute right-2.5 top-2.5 z-[2] flex max-w-[60%] items-center gap-1 rounded border border-[var(--border)] bg-black/55 px-1.5 py-[3px] text-[10px] text-[var(--text-muted)] backdrop-blur-md"
        >
          <IconGrid size={10} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">{workspace.name}</span>
        </span>
      ) : null}
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

/* ── Add tile ─────────────────────────────────────────────────────────────── */

/** The dashed "create" tile that closes a project grid. */
export function AddProjectTile() {
  return (
    <Link
      to="/new"
      aria-label="Create project"
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <DashedAddTile label="New project" />
    </Link>
  );
}
