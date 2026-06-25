import { useNavigate, useParams } from "react-router-dom";
import { useProjects, useAllScreens } from "@/lib/storage/hooks";
import { ProjectEditPanel } from "@/routes/Gallery/ProjectEditPanel";

export function ProjectEditPage() {
  const { projectId: rawId } = useParams<{ projectId: string }>();
  const projectId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();

  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();

  const project = allProjects.find((p) => p.id === projectId);
  const screens = allScreens.filter((s) => s.projectId === projectId);

  if (!project) return null;

  return (
    <ProjectEditPanel
      project={project}
      screens={screens}
      onClose={() => navigate(-1)}
      onSaved={() => {}}
    />
  );
}

export default ProjectEditPage;
