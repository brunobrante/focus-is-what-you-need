import { useMemo, useState } from "react";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaceComponents, useWorkspaces, useProjects } from "@/lib/storage/hooks";
import { deleteComponentTree } from "@/lib/storage/repos/components.repo";
import type { ComponentKind } from "@/lib/data/types";
import type { ComponentRow, ProjectRow } from "@/lib/storage/schema";

export const KINDS: ComponentKind[] = [
  "Layout",
  "Atom",
  "Section",
  "Pattern",
  "Overlay",
  "Custom",
];

export const KIND_FILTERS: Array<{ value: ComponentKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  ...KINDS.map((kind) => ({ value: kind, label: kind })),
];

export interface GlobalComponentsState {
  workspaceId: string | null;
  components: ComponentRow[];
  workspaceProjects: ProjectRow[];
  query: string;
  setQuery: (value: string) => void;
  kindFilter: ComponentKind | "all";
  setKindFilter: (value: ComponentKind | "all") => void;
  pendingDelete: ComponentRow | null;
  setPendingDelete: (value: ComponentRow | null) => void;
  filtered: ComponentRow[];
  handleConfirmDelete: () => Promise<void>;
}

export function useGlobalComponents(): GlobalComponentsState {
  const { data: workspaces } = useWorkspaces();
  const { data: allProjects } = useProjects();
  const [activeWorkspaceId] = useActiveWorkspaceId();
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const workspaceId = workspace?.id ?? null;

  const { data: components } = useWorkspaceComponents(workspaceId);

  const workspaceProjects = useMemo(() => {
    if (!workspace) return [];
    const ids = new Set(workspace.projectIds);
    return allProjects.filter((p) => ids.has(p.id));
  }, [workspace, allProjects]);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ComponentKind | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<ComponentRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      const matchKind = kindFilter === "all" || c.kind === kindFilter;
      const matchQ = !q || c.name.toLowerCase().includes(q);
      return matchKind && matchQ;
    });
  }, [components, kindFilter, query]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteComponentTree(pendingDelete.id);
    setPendingDelete(null);
  };

  return {
    workspaceId,
    components,
    workspaceProjects,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    pendingDelete,
    setPendingDelete,
    filtered,
    handleConfirmDelete,
  };
}
