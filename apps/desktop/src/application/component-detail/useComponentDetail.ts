import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteComponentTree, getComponent, setActiveVariant, updateComponent } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { deleteVariant, duplicateVariant, getVariant } from "@/lib/storage/repos/variants.repo";
import {
  useActiveVariant,
  useActiveVariants,
  useComponent,
  useComponentsByProject,
  useProject,
  useReferences,
  useScreen,
  useScreens,
  useVariantChildren,
  useVariants,
} from "@/lib/storage/hooks";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import { DEFAULT_HISTORY } from "@/lib/data/screenVersions";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import type { HistoryModalHandle } from "@/components/modals/HistoryModal";
import type { NewComponentModalHandle } from "@/components/modals/NewComponentModal";
import type { ReferencesModalHandle } from "@/components/modals/ReferencesModal";
import type { AddReferenceModalHandle } from "@/components/modals/AddReferenceModal";
import type { VersionModeModalHandle } from "@/components/modals/VersionModeModal";

type SideTab = "components" | "info" | "versions" | "references";
type CmpKindFilter = "all" | ComponentKind;

export interface ComponentDetailState {
  // Route params
  routeProjectId: string;
  componentId: string;

  // Data
  component: ComponentRow | null;
  project: { id: string; name: string; type: ProjectType } | null | undefined;
  screens: ScreenRow[] | undefined;
  variants: VariantRow[];
  activeVariant: VariantRow | null | undefined;
  screen: ScreenRow | null | undefined;
  trail: ComponentRow[];
  children: ComponentRow[];
  childVariants: Map<string, VariantRow>;
  projectComponents: ComponentRow[] | undefined;
  references: ReturnType<typeof useReferences>["data"];

  // Derived values
  type: ProjectType;
  projectId: string;
  projectName: string;
  variantCount: number;
  canvasHref: string;
  screenHref: string;
  filteredChildren: ComponentRow[];
  filteredVariants: VariantRow[];
  filteredReferences: ReturnType<typeof useReferences>["data"];
  history: typeof DEFAULT_HISTORY;

  // State
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
  query: string;
  setQuery: (q: string) => void;
  filter: CmpKindFilter;
  setFilter: (f: CmpKindFilter) => void;
  fastEditOpen: boolean;
  setFastEditOpen: (open: boolean) => void;
  creatingVariant: boolean;
  pendingChildDelete: ComponentRow | null;
  setPendingChildDelete: (c: ComponentRow | null) => void;

  // Refs
  versionModeRef: React.RefObject<VersionModeModalHandle | null>;
  historyRef: React.RefObject<HistoryModalHandle | null>;
  referencesRef: React.RefObject<ReferencesModalHandle | null>;
  newComponentRef: React.RefObject<NewComponentModalHandle | null>;
  addRefModalRef: React.RefObject<AddReferenceModalHandle | null>;

  // Handlers
  openNewChild: () => void;
  addVariant: () => void;
  removeLinkedReference: (referenceId: string) => void;
  handleChildDeleteConfirm: () => Promise<void>;
  handleComponentCreated: (r: { component: ComponentRow }) => void;
  handleOpenCanvas: (variantId: string) => void;
  handleAddReference: (input: Parameters<typeof createOrAttachReference>[0]) => Promise<void>;
  handleSelectVariant: (variantId: string) => void;
  handleDeleteVariant: (variantId: string) => void;
  handleRename: (name: string) => void;
  handleUpdate: (patch: Parameters<typeof updateComponent>[1]) => void;
}

/** Walks parent variants up to the root, returning the screenId at the top. */
function useScreenAncestor(component: ComponentRow | null): string | null {
  const [screenId, setScreenId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = await resolveScreenAncestor(component);
      if (!cancelled) setScreenId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [component?.id, component?.screenId, component?.parentVariantId]);
  return screenId;
}

async function resolveScreenAncestor(
  component: ComponentRow | null,
): Promise<string | null> {
  let current: ComponentRow | null = component;
  // Cap at a reasonable depth to avoid infinite loops on bad data.
  for (let i = 0; i < 64 && current; i++) {
    if (current.screenId) return current.screenId;
    if (!current.parentVariantId) return null;
    const variant = await getVariant(current.parentVariantId);
    if (!variant) return null;
    current = await getComponent(variant.componentId);
  }
  return null;
}

/** Returns the chain of ancestor components above `component` (excluding it). */
function useAncestorTrail(component: ComponentRow | null): ComponentRow[] {
  const [trail, setTrail] = useState<ComponentRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await resolveAncestorTrail(component);
      if (!cancelled) setTrail(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [component?.id, component?.parentVariantId]);
  return trail;
}

async function resolveAncestorTrail(
  component: ComponentRow | null,
): Promise<ComponentRow[]> {
  if (!component || !component.parentVariantId) return [];
  const trail: ComponentRow[] = [];
  let parentVariantId: string | null = component.parentVariantId;
  for (let i = 0; i < 64 && parentVariantId; i++) {
    const variant = await getVariant(parentVariantId);
    if (!variant) break;
    const parent = await getComponent(variant.componentId);
    if (!parent) break;
    trail.unshift(parent);
    parentVariantId = parent.parentVariantId;
  }
  return trail;
}

export function useComponentDetail(componentId: string): ComponentDetailState {
  const params = useParams<{ projectId: string; componentId: string }>();
  const navigate = useNavigate();
  const routeProjectId = decodeURIComponent(params.projectId ?? "");

  const { data: component } = useComponent(componentId);
  const { data: project } = useProject(component?.projectId ?? null);
  const { data: screens } = useScreens(project?.id);
  const { data: variants } = useVariants(component?.id);
  const { data: activeVariant } = useActiveVariant(component?.id);
  const screenIdAncestor = useScreenAncestor(component ?? null);
  const { data: screen } = useScreen(screenIdAncestor);
  const trail = useAncestorTrail(component ?? null);
  const { data: children } = useVariantChildren(activeVariant?.id);
  const { data: childVariants } = useActiveVariants(children);
  const { data: projectComponents } = useComponentsByProject(project?.id ?? null);
  const { data: references } = useReferences("component", component?.id ?? null);

  const type: ProjectType = project?.type ?? "desktop";
  const projectId = project?.id ?? component?.projectId ?? routeProjectId;
  const projectName = project?.name ?? "Projeto";

  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");
  const [fastEditOpen, setFastEditOpen] = useState(false);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [pendingChildDelete, setPendingChildDelete] = useState<ComponentRow | null>(null);

  const versionModeRef = useRef<VersionModeModalHandle>(null);
  const historyRef = useRef<HistoryModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const addRefModalRef = useRef<AddReferenceModalHandle>(null);

  const filteredChildren = useMemo(() => {
    const q = query.trim().toLowerCase();
    return children.filter((c) => {
      const matchQ = !q || c.name.toLowerCase().includes(q);
      const matchF = filter === "all" || c.kind === filter;
      return matchQ && matchF;
    });
  }, [children, filter, query]);

  const filteredVariants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variants.filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [query, variants]);

  // The base variant holds the component's content and is not itself a
  // "version" — only explicitly created copies count. A fresh component is
  // therefore free of versions.
  const variantCount = variants.length > 1 ? variants.length : 0;

  const filteredReferences = useMemo(() => {
    const q = query.trim().toLowerCase();
    return references.filter(
      (r) =>
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [query, references]);

  const canvasHref = activeVariant
    ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${activeVariant.id}`
    : `/canvas?project=${encodeURIComponent(projectId)}&type=${type}`;

  const screenHref = screen
    ? `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`
    : `/project/${encodeURIComponent(projectId)}`;

  const openNewChild = () => {
    if (!project || !activeVariant) return;
    newComponentRef.current?.open({
      kind: "variant",
      variantId: activeVariant.id,
    });
  };

  const addVariant = async () => {
    if (!component || !activeVariant || creatingVariant) return;
    const sourceComponent = component;
    const sourceVariant = activeVariant;
    versionModeRef.current?.open({
      title: "New version",
      message: "How should child components behave in the new version?",
      onSelect: async (mode) => {
        setCreatingVariant(true);
        try {
          const created = await duplicateVariant({
            componentId: sourceComponent.id,
            sourceVariantId: sourceVariant.id,
            name: `Variant ${variants.length + 1}`,
            mode,
          });
          await setActiveVariant(sourceComponent.id, created.id);
        } finally {
          setCreatingVariant(false);
        }
      },
    });
  };

  const removeLinkedReference = (referenceId: string) => {
    if (!component) return;
    void removeReferenceFromOwner(referenceId, "component", component.id);
  };

  const handleChildDeleteConfirm = async () => {
    if (!pendingChildDelete) return;
    await deleteComponentTree(pendingChildDelete.id);
    setPendingChildDelete(null);
  };

  const handleComponentCreated = (r: { component: ComponentRow }) => {
    navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
  };

  const handleOpenCanvas = (variantId: string) => {
    navigate(
      `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${variantId}`,
    );
  };

  const handleAddReference = async (input: Parameters<typeof createOrAttachReference>[0]) => {
    await createOrAttachReference(input);
  };

  const handleSelectVariant = (variantId: string) => {
    if (component) void setActiveVariant(component.id, variantId);
  };

  const handleDeleteVariant = (variantId: string) => {
    void deleteVariant(variantId);
  };

  const handleRename = (name: string) => {
    if (component) void updateComponent(component.id, { name });
  };

  const handleUpdate = (patch: Parameters<typeof updateComponent>[1]) => {
    if (component) void updateComponent(component.id, patch);
  };

  return {
    routeProjectId,
    componentId,
    component: component ?? null,
    project: project ?? null,
    screens,
    variants,
    activeVariant,
    screen,
    trail,
    children,
    childVariants,
    projectComponents,
    references,
    type,
    projectId,
    projectName,
    variantCount,
    canvasHref,
    screenHref,
    filteredChildren,
    filteredVariants,
    filteredReferences,
    history: DEFAULT_HISTORY,
    sideTab,
    setSideTab,
    query,
    setQuery,
    filter,
    setFilter,
    fastEditOpen,
    setFastEditOpen,
    creatingVariant,
    pendingChildDelete,
    setPendingChildDelete,
    versionModeRef,
    historyRef,
    referencesRef,
    newComponentRef,
    addRefModalRef,
    openNewChild,
    addVariant,
    removeLinkedReference,
    handleChildDeleteConfirm,
    handleComponentCreated,
    handleOpenCanvas,
    handleAddReference,
    handleSelectVariant,
    handleDeleteVariant,
    handleRename,
    handleUpdate,
  };
}
