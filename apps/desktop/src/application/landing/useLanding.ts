import { useMemo, useState } from "react";
import type { ProjectType } from "@/lib/data/types";
import { resetToFactoryData } from "@/lib/storage/seed";
import { deleteProject } from "@/lib/storage/repos/projects.repo";
import { useAllScreens, useProjects, useWorkspaces } from "@/lib/storage/hooks";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import type { ProjectRow } from "@/lib/storage/schema";

type Filter = "all" | ProjectType;

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${d === 1 ? "day" : "days"} ago`;
  const w = Math.floor(d / 7);
  return `${w} ${w === 1 ? "week" : "weeks"} ago`;
}

export interface LandingState {
  query: string;
  setQuery: (v: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  pendingDelete: ProjectRow | null;
  setPendingDelete: (p: ProjectRow | null) => void;
  editingProject: ProjectRow | null;
  setEditingProject: (p: ProjectRow | null) => void;
  isResettingFactory: boolean;
  allProjects: ProjectRow[];
  allScreens: ReturnType<typeof useAllScreens>["data"];
  projects: ProjectRow[];
  filtered: ProjectRow[];
  screensByProject: Map<string, number>;
  onResetToFactory: () => Promise<void>;
  onConfirmDelete: () => Promise<void>;
  onSavedProject: (project: ProjectRow) => void;
}

export function useLanding(): LandingState {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [isResettingFactory, setIsResettingFactory] = useState(false);

  const { data: allProjects } = useProjects();
  const { data: allScreens } = useAllScreens();
  const { data: workspaces } = useWorkspaces();
  const [activeWorkspaceId] = useActiveWorkspaceId();

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  const projects = useMemo(
    () =>
      activeWorkspace
        ? allProjects.filter((p) => activeWorkspace.projectIds.includes(p.id))
        : allProjects,
    [allProjects, activeWorkspace],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      const matchType = filter === "all" || p.type === filter;
      const matchQ = !q || p.name.toLowerCase().includes(q);
      return matchType && matchQ;
    });
  }, [projects, query, filter]);

  const screensByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of allScreens) {
      counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    }
    return counts;
  }, [allScreens]);

  async function onResetToFactory(): Promise<void> {
    setIsResettingFactory(true);
    try {
      await resetToFactoryData();
      setQuery("");
      setFilter("all");
    } finally {
      setIsResettingFactory(false);
    }
  }

  async function onConfirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    await deleteProject(pendingDelete.id);
    setPendingDelete(null);
  }

  function onSavedProject(project: ProjectRow): void {
    setEditingProject(project);
  }

  return {
    query,
    setQuery,
    filter,
    setFilter,
    pendingDelete,
    setPendingDelete,
    editingProject,
    setEditingProject,
    isResettingFactory,
    allProjects,
    allScreens,
    projects,
    filtered,
    screensByProject,
    onResetToFactory,
    onConfirmDelete,
    onSavedProject,
  };
}
