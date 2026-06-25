export function projectBase(projectId: string, workspaceId?: string | null): string {
  const pid = encodeURIComponent(projectId);
  return workspaceId
    ? `/workspace/${encodeURIComponent(workspaceId)}/project/${pid}`
    : `/project/${pid}`;
}

export function screenPath(projectId: string, screenId: string, workspaceId?: string | null): string {
  return `${projectBase(projectId, workspaceId)}/screen/${encodeURIComponent(screenId)}`;
}

export function componentPath(projectId: string, componentId: string, workspaceId?: string | null): string {
  return `${projectBase(projectId, workspaceId)}/c/${componentId}`;
}

export function projectEditPath(projectId: string, workspaceId?: string | null): string {
  return `${projectBase(projectId, workspaceId)}/edit`;
}
