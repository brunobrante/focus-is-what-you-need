import { useNavigate, useParams } from "react-router-dom";
import { useProjects, useAllScreens } from "@/lib/storage/hooks";
import { useProjectBackTarget } from "@/lib/navigation/useProjectBackTarget";
import { ProjectEditPanel } from "@/routes/Gallery/ProjectEditPanel";
import { Crumbs } from "@/routes/Gallery";

export function ProjectEditPage() {
  const { projectId: rawId } = useParams<{ projectId: string }>();
  const projectId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();

  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();

  const project = allProjects.find((p) => p.id === projectId);
  const screens = allScreens.filter((s) => s.projectId === projectId);
  const back = useProjectBackTarget(projectId);

  if (!project) return null;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--border)] px-5">
        <Crumbs
          projectName={project.name}
          type={project.type}
          backHref={back.href}
          backLabel={back.label}
        />
      </header>
      <ProjectEditPanel
        project={project}
        screens={screens}
        onClose={() => navigate(-1)}
        onSaved={() => {}}
      />
    </div>
  );
}

export default ProjectEditPage;
