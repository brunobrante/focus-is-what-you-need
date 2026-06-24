import { Link } from "react-router-dom";
import { PROJECT_TYPE_DIMS, PROJECT_TYPE_LABEL } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import type { ProjectRow } from "@/lib/storage/schema";
import { IconChevronLeft, IconPencil, IconPlay } from "@/components/icons";
import { projectLogoColor } from "./utils";

export function ProjectOverview({
  project,
  screensCount,
  componentsCount,
  referencesCount,
  onPreview,
  onEdit,
  editOpen,
}: {
  project: ProjectRow | undefined;
  screensCount: number;
  componentsCount: number;
  referencesCount: number;
  onPreview: (() => void) | null;
  onEdit: () => void;
  editOpen: boolean;
}) {
  const initial = (project?.name ?? "P")[0]!.toUpperCase();
  const logoColor = projectLogoColor(project?.name ?? "");
  const typeLabel = PROJECT_TYPE_LABEL[project?.type ?? "desktop"];
  const dims = PROJECT_TYPE_DIMS[project?.type ?? "desktop"];

  const updatedDate = project?.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-start gap-6 border-b border-[var(--border)] px-7 py-7">
      <div
        className="flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl text-[22px] font-semibold text-white"
        style={{ background: project?.icon ? undefined : logoColor }}
      >
        {project?.icon ? (
          <img
            src={project.icon}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">

        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[18px] font-semibold leading-none tracking-[-0.3px] text-[var(--text)]">
            {project?.name ?? "—"}
          </h1>
          <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {typeLabel}
          </span>
          {updatedDate && (
            <span className="text-[11px] text-[var(--text-faint)]">· Updated {updatedDate}</span>
          )}
        </div>

        {project?.description ? (
          <p className="m-0 max-w-[520px] text-[13px] leading-[1.55] text-[var(--text-muted)]">
            {project.description}
          </p>
        ) : null}

        <div className="flex items-center gap-3 text-[12px] text-[var(--text-faint)]">
          <span>
            <span className="font-medium text-[var(--text-muted)]">{screensCount}</span>{" "}
            {screensCount === 1 ? "Screen" : "Screens"}
          </span>
          <span className="opacity-40">·</span>
          <span>
            <span className="font-medium text-[var(--text-muted)]">{componentsCount}</span>{" "}
            {componentsCount === 1 ? "Component" : "Components"}
          </span>
          <span className="opacity-40">·</span>
          <span>
            <span className="font-medium text-[var(--text-muted)]">{referencesCount}</span>{" "}
            {referencesCount === 1 ? "Reference" : "References"}
          </span>
          <span className="opacity-40">·</span>
          <span>{dims}</span>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 self-start pt-0.5">
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity hover:opacity-80"
          >
            <IconPlay size={11} />
            Preview
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className={[
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium transition-colors",
            editOpen
              ? "border-[var(--text)] bg-[var(--surface-hover)] text-[var(--text)]"
              : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
          ].join(" ")}
          aria-label="Edit project"
        >
          <IconPencil size={13} strokeWidth={1.7} />
          Edit
        </button>
      </div>
    </div>
  );
}

export function Crumbs({
  projectName,
  type,
  backHref = "/projects",
  backLabel = "Projects",
}: {
  projectName: string;
  type: ProjectType;
  /** Root crumb target — the workspace browser, or Home for a loose project. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
      <Link to={backHref} aria-label="Back" className="text-[var(--text-muted)] hover:text-[var(--text)]">
        <IconChevronLeft size={14} strokeWidth={1.6} />
      </Link>
      <span className="text-[var(--text-faint)]">/</span>
      <Link to={backHref} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
        {backLabel}
      </Link>
      <span className="text-[var(--text-faint)]">/</span>
      <span className="text-[13px] font-medium text-[var(--text)]">{projectName}</span>
      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
        {type}
      </span>
    </div>
  );
}
