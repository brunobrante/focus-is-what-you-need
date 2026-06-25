import { useState } from "react";
import { Link } from "react-router-dom";

import { IconFrame, IconPlus } from "@/components/icons";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { AddProjectTile, ProjectCard } from "@/components/home/HomeCards";
import { useHome, type RecentItem } from "@/application/home/useHome";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { deleteProject } from "@/lib/storage/repos/projects.repo";

/**
 * ProjectsPage (`/my-projects`) — individual projects that belong to no
 * workspace (the loose projects created from Home). Distinct from `/projects`,
 * which is a workspace's project browser. Reached from the Home sidebar and
 * rendered inside the Home shell, so this is content only.
 */
export function ProjectsPage() {
  const { looseProjects } = useHome();
  const [pendingDelete, setPendingDelete] = useState<RecentItem | null>(null);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    await deleteProject(pendingDelete.project.id);
    setPendingDelete(null);
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-7 pb-20 pt-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-0.5 text-2xl font-semibold tracking-[-0.3px]">Projects</h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            Individual projects that aren't inside any workspace ·{" "}
            {looseProjects.length} {looseProjects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <Link to="/new" className="btn btn-primary no-underline shrink-0">
          <IconPlus size={14} strokeWidth={2} />
          New project
        </Link>
      </header>

      {looseProjects.length === 0 ? (
        <EmptyMessage
          icon={<IconFrame size={17} strokeWidth={1.7} />}
          title="No individual projects yet"
          description="Projects you create outside a workspace show up here."
        />
      ) : (
        <div
          className="grid gap-x-[18px] gap-y-[22px]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {looseProjects.map((item) => (
            <ProjectCard key={item.project.id} item={item} onDelete={() => setPendingDelete(item)} />
          ))}
          <AddProjectTile />
        </div>
      )}

      <ConfirmActionModal
        open={Boolean(pendingDelete)}
        title="Delete project?"
        message={
          pendingDelete
            ? `"${pendingDelete.project.name}" and its ${pendingDelete.screensCount} ${pendingDelete.screensCount === 1 ? "screen" : "screens"} will be permanently deleted.`
            : ""
        }
        confirmLabel="Delete project"
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export default ProjectsPage;
