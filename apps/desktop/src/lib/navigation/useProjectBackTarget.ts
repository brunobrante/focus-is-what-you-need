import { useWorkspaces } from "@/lib/storage/hooks";

export type ProjectBackTarget = { href: string; label: string };

/**
 * Where a project's root breadcrumb / "back out of the project" should point: the
 * workspace project browser when the project belongs to a workspace, or Home when
 * the project is loose (created outside any workspace). Keeps project navigation
 * from dead-ending in a workspace a loose project never belonged to.
 */
export function useProjectBackTarget(
  projectId: string | null | undefined,
): ProjectBackTarget {
  const { data: workspaces } = useWorkspaces();
  const workspace = projectId
    ? (workspaces.find((ws) => ws.projectIds.includes(projectId)) ?? null)
    : null;
  return workspace
    ? { href: `/workspace/${workspace.id}/projects`, label: "Projects" }
    : { href: "/", label: "Home" };
}
