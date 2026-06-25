import { useNavigate, useParams } from "react-router-dom";
import { useProjects, useAllScreens } from "@/lib/storage/hooks";
import { ProjectEditPanel } from "@/routes/Gallery/ProjectEditPanel";
import { projectBase } from "@/lib/navigation/projectUrl";

export function ProjectEditPage() {
  const { projectId: rawId, workspaceId } = useParams<{ projectId: string; workspaceId?: string }>();
  const projectId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();

  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();

  const project = allProjects.find((p) => p.id === projectId);
  const screens = allScreens.filter((s) => s.projectId === projectId);

  const back = projectBase(projectId, workspaceId);

  if (!project) return null;

  return (
    <ProjectEditPanel
      project={project}
      screens={screens}
      onClose={() => navigate(back)}
      onSaved={() => navigate(back)}
    />
  );
}

export default ProjectEditPage;
