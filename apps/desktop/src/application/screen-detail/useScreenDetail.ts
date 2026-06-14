import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useActiveVariants,
  useProject,
  useReferences,
  useScreen,
  useScreenChildren,
  useScreens,
} from "@/lib/storage/hooks";
import { deleteComponentTree } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { createScreenVersion, screenVersionLabel, screenVersionsFromList, updateScreen } from "@/lib/storage/repos/screens.repo";
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
  const { data: components } = useScreenChildren(project?.id, screen?.id);
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

  // Versions are real sibling screens sharing a version group (the current screen
  // is always one of them, shown as active). No more client-side mock versions.
  const versions = useMemo<ScreenVersion[]>(
    () =>
      screenVersionsFromList(screens, screen).map((s) => ({
        id: s.id,
        screenId: s.id,
        title: s.title,
        tag: screenVersionLabel(s) ?? undefined,
        tpl: templateForScreenName(s.title),
        updated: "",
        author: "You",
        initials: "VC",
      })),
    [screens, screen],
  );
  const activeVersionId = screen?.id ?? null;
  // Selecting a version opens that real screen.
  const setActiveVersionId = (id: string | null) => {
    if (id && id !== screen?.id) navigate(buildScreenHref(id));
  };

  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? versions[0];
  const activeTpl = activeVersion?.tpl ?? tpl;

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
    const idx = screens.findIndex((s) => s.id === screen?.id);
    const hasMultipleScreens = screens.length > 1;
    if (idx < 0 || !hasMultipleScreens) {
      return {
        prevScreen: null,
        nextScreen: null,
      };
    }
    const prevIdx = (idx - 1 + screens.length) % screens.length;
    const nextIdx = (idx + 1) % screens.length;
    return {
      prevScreen: screens[prevIdx] ?? null,
      nextScreen: screens[nextIdx] ?? null,
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

  // Creates a real screen version (copying the screen), choosing Linked vs Copy,
  // then opens the new version. Replaces the old client-side mock.
  const addVersion = () => {
    if (!screen) return;
    const src = screen;
    versionModeRef.current?.open({
      title: "New version",
      message: "How should child components behave in the new version?",
      onSelect: async (mode) => {
        const created = await createScreenVersion({ screenId: src.id, mode });
        if (created) navigate(buildScreenHref(created.id));
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
    handleScreenTitleSave,
    handleNewComponentCreated,
    handleCompareOpenInCanvas,
    handleAddReference,
  };
}
