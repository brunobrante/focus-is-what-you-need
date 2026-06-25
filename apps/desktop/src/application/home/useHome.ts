import { useMemo } from "react";

import { useAllScreens, useProjects, useWorkspaces } from "@/lib/storage/hooks";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import type { ProjectRow, WorkspaceRow } from "@/lib/storage/schema";

/** A workspace plus the few numbers a Home card needs (no deep info). */
export interface WorkspaceCard {
  workspace: WorkspaceRow;
  projectCount: number;
  isActive: boolean;
}

/** A recent project plus its screen count, for the Recent Items grid. */
export interface RecentItem {
  project: ProjectRow;
  screensCount: number;
  /** The workspace this project belongs to, if any (null for loose projects). */
  workspace: WorkspaceRow | null;
}

export interface HomeState {
  workspaces: WorkspaceCard[];
  recent: RecentItem[];
  /** Projects that belong to no workspace — created loose from Home. */
  looseProjects: RecentItem[];
  /** Total projects in the active workspace (or all projects when loose). */
  projectCount: number;
  activeWorkspace: WorkspaceRow | null;
  setActiveWorkspaceId: (id: string | null) => void;
}

const RECENT_LIMIT = 8;

export function useHome(): HomeState {
  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();
  const { data: workspaces } = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useActiveWorkspaceId();

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const screensByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allScreens) {
      counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    }
    return counts;
  }, [allScreens]);

  const projectCountByWorkspace = useMemo(() => {
    // A workspace's projectIds may include ids that no longer exist; count only
    // projects that are actually present.
    const present = new Set(allProjects.map((p) => p.id));
    const counts = new Map<string, number>();
    for (const ws of workspaces) {
      counts.set(ws.id, ws.projectIds.filter((id) => present.has(id)).length);
    }
    return counts;
  }, [workspaces, allProjects]);

  const workspaceCards = useMemo<WorkspaceCard[]>(
    () =>
      workspaces.map((ws) => ({
        workspace: ws,
        projectCount: projectCountByWorkspace.get(ws.id) ?? 0,
        isActive: ws.id === activeWorkspace?.id,
      })),
    [workspaces, projectCountByWorkspace, activeWorkspace],
  );

  // Which workspace (if any) owns each project — lets Recent cards flag the
  // ones that live inside a workspace. First owner wins on the rare overlap.
  const workspaceByProjectId = useMemo(() => {
    const map = new Map<string, WorkspaceRow>();
    for (const ws of workspaces) {
      for (const id of ws.projectIds) if (!map.has(id)) map.set(id, ws);
    }
    return map;
  }, [workspaces]);

  // Recent items are scoped to the active workspace so they match what the
  // projects browser shows; with no workspace, every project is in scope.
  const scopedProjects = useMemo(
    () =>
      activeWorkspace
        ? allProjects.filter((p) => activeWorkspace.projectIds.includes(p.id))
        : allProjects,
    [allProjects, activeWorkspace],
  );

  const recent = useMemo<RecentItem[]>(
    () =>
      [...scopedProjects]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENT_LIMIT)
        .map((project) => ({
          project,
          screensCount: screensByProject.get(project.id) ?? 0,
          workspace: workspaceByProjectId.get(project.id) ?? null,
        })),
    [scopedProjects, screensByProject, workspaceByProjectId],
  );

  // Projects in no workspace (created loose from Home). Home owns these — they
  // never show in a workspace's project browser.
  const looseProjects = useMemo<RecentItem[]>(() => {
    const inAnyWorkspace = new Set<string>();
    for (const ws of workspaces) for (const id of ws.projectIds) inAnyWorkspace.add(id);
    return [...allProjects]
      .filter((p) => !inAnyWorkspace.has(p.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((project) => ({
        project,
        screensCount: screensByProject.get(project.id) ?? 0,
        workspace: null,
      }));
  }, [allProjects, workspaces, screensByProject]);

  return {
    workspaces: workspaceCards,
    recent,
    looseProjects,
    projectCount: scopedProjects.length,
    activeWorkspace,
    setActiveWorkspaceId,
  };
}
