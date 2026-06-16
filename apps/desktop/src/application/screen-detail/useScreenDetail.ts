import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useActiveVariants,
  useProject,
  useReferences,
  useScreen,
  useScreenChildren,
  useScreens,
  useScreenVariants,
} from "@/lib/storage/hooks";
import { deleteComponentTree } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { createScreenVersion, updateScreen } from "@/lib/storage/repos/screens.repo";
import { deleteVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import type { ComponentRow } from "@/lib/storage/schema";
import type { VersionModeModalHandle } from "@/components/modals/VersionModeModal";
import {
  DEFAULT_HISTORY,
  type ScreenVersion,
} from "@/lib/data/screenVersions";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import {
  PROJECT_TYPE_DIMS,
  templateForScreenName,
} from "@/lib/data/projects";
import type { HistoryModalHandle } from "@/components/modals/HistoryModal";
import type { CompareVersionsModalHandle } from "@/components/modals/CompareVersionsModal";
import type { NewComponentModalHandle } from "@/components/modals/NewComponentModal";
import type { ReferencesModalHandle } from "@/components/modals/ReferencesModal";
import type { AddReferenceModalHandle } from "@/components/modals/AddReferenceModal";
import type { FastEditModalHandle } from "@/components/screen/FastEditModal";
import type { ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";
export type SideTab = "components" | "versions" | "references";
export type CmpKindFilter = "all" | ComponentKind;

export interface ScreenDetailState {
  // project / screen data
  project: ReturnType<typeof useProject>["data"];
  screens: ReturnType<typeof useScreens>["data"];
  screen: ReturnType<typeof useScreen>["data"] | null;
  components: ReturnType<typeof useScreenChildren>["data"];
  linkedComponentIds: Set<string>;
  activeVariants: ReturnType<typeof useActiveVariants>["data"];
  references: ReturnType<typeof useReferences>["data"];
  type: ProjectType;
  canUseFactoryMocks: boolean;
  projectName: string;
  screenName: string;
  tpl: ReturnType<typeof templateForScreenName>;
  tplLabel: Record<ReturnType<typeof templateForScreenName>, string>;

  // navigation
  prevScreen: ReturnType<typeof useScreens>["data"][number] | null;
  nextScreen: ReturnType<typeof useScreens>["data"][number] | null;
  canvasHref: string;

  // filtered lists
  filteredComponents: ReturnType<typeof useScreenChildren>["data"];
  filteredVersions: ScreenVersion[];
  filteredReferences: ReturnType<typeof useReferences>["data"];

  // local state
  sideTab: SideTab;
  setSideTab: (tab: SideTab) => void;
  query: string;
  setQuery: (q: string) => void;
  filter: CmpKindFilter;
  setFilter: (f: CmpKindFilter) => void;
  versions: ScreenVersion[];
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  activeVersion: ScreenVersion | undefined;
  activeTpl: ReturnType<typeof templateForScreenName>;
  isPreviewingVersion: boolean;

  // modal refs
  versionModeRef: React.RefObject<VersionModeModalHandle | null>;
  historyRef: React.RefObject<HistoryModalHandle | null>;
  compareRef: React.RefObject<CompareVersionsModalHandle | null>;
  referencesRef: React.RefObject<ReferencesModalHandle | null>;
  newComponentRef: React.RefObject<NewComponentModalHandle | null>;
  addRefModalRef: React.RefObject<AddReferenceModalHandle | null>;
  fastEditRef: React.RefObject<FastEditModalHandle | null>;
  confirmRef: React.RefObject<ConfirmActionModalHandle | null>;

  // history data
  defaultHistory: typeof DEFAULT_HISTORY;
  projectDims: typeof PROJECT_TYPE_DIMS;

  // handlers
  buildScreenHref: (id: string) => string;
  openNewComponent: () => void;
  addVersion: () => void;
  removeLinkedReference: (referenceId: string) => void;
  requestDeleteComponent: (component: ComponentRow) => void;
  handleOpenCanvas: (variantId: string) => void;
  handleOpenVersionCanvas: (versionScreenId: string) => void;
  handleDeleteVersion: (versionScreenId: string, label: string) => void;
  handleScreenTitleSave: (title: string) => void;
  handleNewComponentCreated: (r: { component: ComponentRow }) => void;
  handleCompareOpenInCanvas: (ids: string[]) => void;
  handleAddReference: (input: Parameters<typeof createOrAttachReference>[0]) => Promise<void>;
}

export function useScreenDetail(screenId: string, projectId: string): ScreenDetailState {
  const navigate = useNavigate();

  const { data: project } = useProject(projectId);
  const { data: screens } = useScreens(project?.id);
  const { data: loadedScreen } = useScreen(screenId);
  const screen =
    loadedScreen && loadedScreen.projectId === (project?.id ?? projectId)
      ? loadedScreen
      : null;
  // A screen owns its top-level components directly; its versions are variants of the
  // screen (each version's scene references those components as linked instances).
  const components = useScreenChildren(project?.id, screen?.id).data;
  const linkedComponentIds = useMemo(() => new Set<string>(), []);
  const { data: screenVariants } = useScreenVariants(screen?.id);
  const { data: activeVariants } = useActiveVariants(components);
  const { data: references } = useReferences("screen", screen?.id ?? null);

  const type: ProjectType = project?.type ?? "desktop";
  const canUseFactoryMocks = project?.source === "mock";
  const projectName = project?.name ?? "Project";
  const screenName = screen?.title ?? "Screen";
  const tpl = templateForScreenName(screenName);
  const tplLabel: Record<ReturnType<typeof templateForScreenName>, string> = {
    hero: "Hero",
    list: "List",
    detail: "Detail",
    form: "Form",
    profile: "Profile",
  };

  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");

  // Versions are the screen's variants — the screen is a master that owns a variant
  // chain, exactly like a component. Each variant owns its own scene/snapshot.
  const versions = useMemo<ScreenVersion[]>(
    () =>
      screenVariants.map((v) => ({
        id: v.id,
        variantId: v.id,
        screenId: screen?.id,
        title: screen?.title ?? "Screen",
        tag: variantVersionLabel(v),
        tpl: templateForScreenName(screen?.title ?? ""),
        updated: "",
        author: "You",
        initials: "VC",
      })),
    [screenVariants, screen?.id, screen?.title],
  );
  // Selecting a version is preview-only: it shows that variant in the detail
  // preview pane without persisting it as the screen's active variant. Activating
  // a variant for the whole app would change the projects gallery and the screen's
  // main, which must never happen from a single click in this tab.
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const activeVersionId = previewVersionId ?? screen?.activeVariantId ?? null;
  const setActiveVersionId = (id: string | null) => {
    setPreviewVersionId(id);
  };

  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? versions[0];
  const activeTpl = activeVersion?.tpl ?? tpl;
  // While the preview pane shows a non-main version, the screen-stepper buttons
  // are hidden: a previewed version is not a screen you navigate between.
  const isPreviewingVersion = Boolean(activeVersion && activeVersion.tag !== "main");

  const versionModeRef = useRef<VersionModeModalHandle>(null);
  const historyRef = useRef<HistoryModalHandle>(null);
  const compareRef = useRef<CompareVersionsModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const addRefModalRef = useRef<AddReferenceModalHandle>(null);
  const fastEditRef = useRef<FastEditModalHandle>(null);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);

  const buildScreenHref = (id: string) =>
    `/project/${encodeURIComponent(project?.id ?? projectId)}/screen/${encodeURIComponent(id)}`;

  const { prevScreen, nextScreen } = useMemo(() => {
    // Prev/next steps between the project's screens (versions are variants, not screens).
    const projectScreens = screens;
    const idx = projectScreens.findIndex((s) => s.id === screen?.id);
    const hasMultipleScreens = projectScreens.length > 1;
    if (idx < 0 || !hasMultipleScreens) {
      return {
        prevScreen: null,
        nextScreen: null,
      };
    }
    const prevIdx = (idx - 1 + projectScreens.length) % projectScreens.length;
    const nextIdx = (idx + 1) % projectScreens.length;
    return {
      prevScreen: projectScreens[prevIdx] ?? null,
      nextScreen: projectScreens[nextIdx] ?? null,
    };
  }, [screen?.id, screens]);

  const canvasHref = screen
    ? `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&screen=${screen.id}`
    : `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}`;

  const filteredComponents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      const matchQ = !q || c.name.toLowerCase().includes(q);
      const matchF = filter === "all" || c.kind === filter;
      return matchQ && matchF;
    });
  }, [components, query, filter]);

  const filteredVersions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return versions.filter((v) => !q || v.title.toLowerCase().includes(q));
  }, [versions, query]);

  const filteredReferences = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return references;
    return references.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q) ||
        (r.metadata ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [references, query]);

  const openNewComponent = () => {
    if (!project || !screen) return;
    newComponentRef.current?.open({ kind: "screen", screenId: screen.id });
  };

  // Creates a new version of the screen (a new variant), choosing Linked vs Copy.
  // The new version is shown in the preview pane (preview-only) but is NOT promoted
  // to the screen's active/main variant — creating a version must never change the
  // screen's main or what the projects gallery shows. Promoting a version to main
  // will be a separate, explicit action.
  const addVersion = () => {
    if (!screen) return;
    const src = screen;
    versionModeRef.current?.open({
      title: "New version",
      message: "How should child components behave in the new version?",
      onSelect: async (mode) => {
        const created = await createScreenVersion({ screenId: src.id, mode });
        if (created) setPreviewVersionId(created.id);
      },
    });
  };

  const removeLinkedReference = (referenceId: string) => {
    if (!screen) return;
    void removeReferenceFromOwner(referenceId, "screen", screen.id);
  };

  const requestDeleteComponent = (component: ComponentRow) => {
    confirmRef.current?.open({
      title: "Delete component",
      message: `The component "${component.name}" will be removed along with subcomponents and variants.`,
      onConfirm: () => deleteComponentTree(component.id),
    });
  };

  const handleOpenCanvas = (variantId: string) => {
    navigate(
      `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&variant=${variantId}`,
    );
  };

  // Opens a specific version (variant) of the screen in the canvas's dedicated
  // "Versions" window — the Current window keeps showing the screen itself, so the
  // version is never rendered in Current. `versionVariant` activates and feeds the
  // Versions window.
  const handleOpenVersionCanvas = (variantId: string) => {
    if (!screen) return;
    navigate(
      `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&screen=${screen.id}&versionVariant=${encodeURIComponent(variantId)}`,
    );
  };

  const handleDeleteVersion = (variantId: string, label: string) => {
    confirmRef.current?.open({
      title: "Delete version",
      message: `Version "${label}" of "${screenName}" will be removed.`,
      onConfirm: async () => {
        // deleteVariant switches the screen's active variant to a sibling if needed.
        await deleteVariant(variantId);
      },
    });
  };

  const handleScreenTitleSave = (title: string) => {
    if (!screen || title === screen.title) return;
    void (async () => {
      const updated = await updateScreen(screen.id, { title });
      if (updated) {
        navigate(
          `/project/${encodeURIComponent(updated.projectId)}/screen/${encodeURIComponent(updated.id)}`,
          { replace: true },
        );
      }
    })();
  };

  const handleNewComponentCreated = (r: { component: ComponentRow }) => {
    navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
  };

  const handleCompareOpenInCanvas = (ids: string[]) => {
    if (screen) {
      navigate(
        `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&screen=${screen.id}&compare=${ids.join(",")}`,
      );
    }
  };

  const handleAddReference = async (input: Parameters<typeof createOrAttachReference>[0]) => {
    await createOrAttachReference(input);
  };

  return {
    project,
    screens,
    screen,
    components,
    linkedComponentIds,
    activeVariants,
    references,
    type,
    canUseFactoryMocks,
    projectName,
    screenName,
    tpl,
    tplLabel,
    prevScreen,
    nextScreen,
    canvasHref,
    filteredComponents,
    filteredVersions,
    filteredReferences,
    sideTab,
    setSideTab,
    query,
    setQuery,
    filter,
    setFilter,
    versions,
    activeVersionId,
    setActiveVersionId,
    activeVersion,
    activeTpl,
    isPreviewingVersion,
    versionModeRef,
    historyRef,
    compareRef,
    referencesRef,
    newComponentRef,
    addRefModalRef,
    fastEditRef,
    confirmRef,
    defaultHistory: DEFAULT_HISTORY,
    projectDims: PROJECT_TYPE_DIMS,
    buildScreenHref,
    openNewComponent,
    addVersion,
    removeLinkedReference,
    requestDeleteComponent,
    handleOpenCanvas,
    handleOpenVersionCanvas,
    handleDeleteVersion,
    handleScreenTitleSave,
    handleNewComponentCreated,
    handleCompareOpenInCanvas,
    handleAddReference,
  };
}
