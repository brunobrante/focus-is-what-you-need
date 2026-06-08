import { useMemo, useState } from "react";
import { useActiveWorkspaceId } from "@/lib/storage/activeWorkspace";
import { useWorkspaceComponents, useWorkspaces } from "@/lib/storage/hooks";
import {
  createComponent,
  deleteComponentTree,
} from "@/lib/storage/repos/components.repo";
import type { ComponentKind } from "@/lib/data/types";
import type { ComponentRow } from "@/lib/storage/schema";

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
  query: string;
  setQuery: (value: string) => void;
  kindFilter: ComponentKind | "all";
  setKindFilter: (value: ComponentKind | "all") => void;
  creating: boolean;
  setCreating: (value: boolean | ((prev: boolean) => boolean)) => void;
  newName: string;
  setNewName: (value: string) => void;
  newKind: ComponentKind;
  setNewKind: (value: ComponentKind) => void;
  submitting: boolean;
  pendingDelete: ComponentRow | null;
  setPendingDelete: (value: ComponentRow | null) => void;
  filtered: ComponentRow[];
  createWorkspaceComponent: () => Promise<void>;
  handleConfirmDelete: () => Promise<void>;
}

export function useGlobalComponents(): GlobalComponentsState {
  const { data: workspaces } = useWorkspaces();
  const [activeWorkspaceId] = useActiveWorkspaceId();
  const workspaceId =
    workspaces.find((w) => w.id === activeWorkspaceId)?.id ?? workspaces[0]?.id ?? null;

  const { data: components } = useWorkspaceComponents(workspaceId);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ComponentKind | "all">("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ComponentKind>("Custom");
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ComponentRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      const matchKind = kindFilter === "all" || c.kind === kindFilter;
      const matchQ = !q || c.name.toLowerCase().includes(q);
      return matchKind && matchQ;
    });
  }, [components, kindFilter, query]);

  const createWorkspaceComponent = async () => {
    const name = newName.trim();
    if (!workspaceId || !name || submitting) return;
    setSubmitting(true);
    try {
      await createComponent({
        parent: { kind: "workspace", workspaceId },
        name,
        kind: newKind,
      });
      setNewName("");
      setNewKind("Custom");
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteComponentTree(pendingDelete.id);
    setPendingDelete(null);
  };

  return {
    workspaceId,
    components,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    creating,
    setCreating,
    newName,
    setNewName,
    newKind,
    setNewKind,
    submitting,
    pendingDelete,
    setPendingDelete,
    filtered,
    createWorkspaceComponent,
    handleConfirmDelete,
  };
}
