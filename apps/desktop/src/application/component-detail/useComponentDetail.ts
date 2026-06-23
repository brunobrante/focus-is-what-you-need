import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getComponent, updateComponent } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { deleteVariant, duplicateVariant, getVariant, isMainVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
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
import type { ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";

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
  /**
   * Variant shown in the detail preview pane. Defaults to the active variant, but
   * clicking a version card overrides it (preview-only) without persisting that
   * version as the component's active/main variant.
   */
  displayVariant: VariantRow | null;
  /** True while the preview pane is showing a non-main version. */
  isPreviewingVersion: boolean;
  screen: ScreenRow | null | undefined;
  trail: ComponentRow[];
  children: ComponentRow[];
  linkedChildIds: Set<string>;
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
  creatingVariant: boolean;

  // Refs
  versionModeRef: React.RefObject<VersionModeModalHandle | null>;
  historyRef: React.RefObject<HistoryModalHandle | null>;
  referencesRef: React.RefObject<ReferencesModalHandle | null>;
  newComponentRef: React.RefObject<NewComponentModalHandle | null>;
  addRefModalRef: React.RefObject<AddReferenceModalHandle | null>;
  confirmRef: React.RefObject<ConfirmActionModalHandle | null>;

  // Handlers
  openNewChild: () => void;
  addVariant: () => void;
  removeLinkedReference: (referenceId: string) => void;
  handleComponentCreated: (r: { component: ComponentRow }) => void;
  handleOpenCanvas: (variantId: string) => void;
  handleOpenVersionCanvas: (variantId: string) => void;
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
    current = await getComponent(variant.ownerId);
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
    const parent = await getComponent(variant.ownerId);
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
  // A non-main variant's subcomponents are the main variant's children, referenced as
  // linked instances. Load the main's children and mark them linked; the version's own
  // (detached) children come from ownChildren.
  const mainVariant = useMemo(
    () => variants.find((v) => isMainVariant(v)) ?? null,
    [variants],
  );
  const isVersionVariant = Boolean(
    activeVariant && mainVariant && activeVariant.id !== mainVariant.id,
  );
  const { data: ownChildren } = useVariantChildren(activeVariant?.id);
  const { data: mainChildren } = useVariantChildren(
    isVersionVariant ? mainVariant?.id : undefined,
  );
  const children = useMemo(
    () => (isVersionVariant ? [...mainChildren, ...ownChildren] : ownChildren),
    [isVersionVariant, mainChildren, ownChildren],
  );
  const linkedChildIds = useMemo(
    () => (isVersionVariant ? new Set(mainChildren.map((c) => c.id)) : new Set<string>()),
    [isVersionVariant, mainChildren],
  );
  const { data: childVariants } = useActiveVariants(children);
  const { data: projectComponents } = useComponentsByProject(project?.id ?? null);
  const { data: references } = useReferences("component", component?.id ?? null);

  const type: ProjectType = project?.type ?? "desktop";
  const projectId = project?.id ?? component?.projectId ?? routeProjectId;
  const projectName = project?.name ?? "Projeto";

  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");
  const [creatingVariant, setCreatingVariant] = useState(false);
  // Preview-only selection: which version the preview pane shows. Null falls back
  // to the active variant. Selecting a version never persists it as main.
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);

  const displayVariant = useMemo<VariantRow | null>(() => {
    if (previewVariantId) {
      return variants.find((v) => v.id === previewVariantId) ?? activeVariant ?? null;
    }
    return activeVariant ?? null;
  }, [previewVariantId, variants, activeVariant]);

  const isPreviewingVersion = Boolean(
    displayVariant && mainVariant && displayVariant.id !== mainVariant.id,
  );

  const versionModeRef = useRef<VersionModeModalHandle>(null);
  const historyRef = useRef<HistoryModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const addRefModalRef = useRef<AddReferenceModalHandle>(null);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

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
            ownerKind: "component",
            ownerId: sourceComponent.id,
            sourceVariantId: sourceVariant.id,
            name: `Variant ${variants.length + 1}`,
            mode,
          });
          // Preview the new version without promoting it to the component's
          // active/main variant — creating a version must never change the main
          // or what the projects gallery shows. Promoting is a separate action.
          setPreviewVariantId(created.id);
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

  const handleComponentCreated = (r: { component: ComponentRow }) => {
    navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
  };

  const handleOpenCanvas = (variantId: string) => {
    navigate(
      `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${variantId}`,
    );
  };

  // Opening a version (variant) card: go to the component's MAIN canvas and surface
  // the chosen variant in the persistent Versions window — never in Current.
  const handleOpenVersionCanvas = (variantId: string) => {
    const mainVariant = variants.find((v) => v.order <= 0) ?? activeVariant;
    const mainId = mainVariant?.id ?? variantId;
    navigate(
      `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${mainId}&versionVariant=${encodeURIComponent(variantId)}`,
    );
  };

  const handleAddReference = async (input: Parameters<typeof createOrAttachReference>[0]) => {
    await createOrAttachReference(input);
  };

  const handleSelectVariant = (variantId: string) => {
    // Preview-only: surface the chosen version in the preview pane without
    // changing the component's active/main variant or the project gallery.
    setPreviewVariantId(variantId);
  };

  const handleDeleteVariant = (variantId: string) => {
    const target = variants.find((v) => v.id === variantId);
    const label = target ? variantVersionLabel(target) : "";
    confirmRef.current?.open({
      title: "Delete version",
      message: `Version "${label}" of "${component?.name ?? "component"}" will be removed.`,
      onConfirm: async () => {
        // deleteVariant switches the component's active variant to a sibling if needed.
        await deleteVariant(variantId);
      },
    });
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
    displayVariant,
    isPreviewingVersion,
    screen,
    trail,
    children,
    linkedChildIds,
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
    creatingVariant,
    versionModeRef,
    historyRef,
    referencesRef,
    newComponentRef,
    addRefModalRef,
    confirmRef,
    openNewChild,
    addVariant,
    removeLinkedReference,
    handleComponentCreated,
    handleOpenCanvas,
    handleOpenVersionCanvas,
    handleAddReference,
    handleSelectVariant,
    handleDeleteVariant,
    handleRename,
    handleUpdate,
  };
}
