import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  useActiveVariants,
  useComponentsByProject,
  useProject,
  useReferencesByProject,
  useScreens,
} from "@/lib/storage/hooks";
import { deleteComponentTree, type InstanceDeleteStrategy } from "@/lib/storage/repos/components.repo";
import { deleteScreen } from "@/lib/storage/repos/screens.repo";
import type { NewScreenModalHandle } from "@/components/modals/NewScreenModal";
import type { NewComponentModalHandle } from "@/components/modals/NewComponentModal";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import type {
  ComponentRow,
  ProjectRow,
  ReferenceRow,
  ScreenRow,
  VariantRow,
} from "@/lib/storage/schema";

export type Tab = "screens" | "components" | "references" | "system";
export type CmpKindFilter = "all" | ComponentKind;
export type SectionState = { id: string; name: string };

type SectionPersistedState = {
  sections: SectionState[];
  sectionById: Record<string, string | null>;
};

function usePersistentSectionState(
  projectId: string | null | undefined,
  kind: "screens" | "components",
) {
  const storageKey = projectId ? `fwyn:gallery-sections:${projectId}:${kind}` : null;
  const [sections, setSections] = useState<SectionState[]>([]);
  const [sectionById, setSectionById] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!storageKey) {
      setSections([]);
      setSectionById({});
      return;
    }
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      setSections([]);
      setSectionById({});
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SectionPersistedState>;
      setSections(Array.isArray(parsed.sections) ? parsed.sections : []);
      setSectionById(parsed.sectionById && typeof parsed.sectionById === "object" ? parsed.sectionById : {});
    } catch {
      setSections([]);
      setSectionById({});
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    const payload: SectionPersistedState = { sections, sectionById };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [storageKey, sections, sectionById]);

  return { sections, setSections, sectionById, setSectionById };
}

export interface GalleryState {
  // routing
  projectId: string;

  // data
  project: ProjectRow | undefined;
  screens: ScreenRow[];
  components: ComponentRow[];
  references: ReferenceRow[];
  activeVariants: Map<string, VariantRow>;
  type: ProjectType;
  projectName: string;

  // tab
  tab: Tab;
  setTab: (tab: Tab) => void;

  // component kind filter
  cmpFilter: CmpKindFilter;
  setCmpFilter: (filter: CmpKindFilter) => void;

  // screen sections (persisted)
  screenSections: SectionState[];
  setScreenSections: Dispatch<SetStateAction<SectionState[]>>;
  screenSectionById: Record<string, string | null>;
  setScreenSectionById: Dispatch<SetStateAction<Record<string, string | null>>>;

  // component sections (persisted)
  componentSections: SectionState[];
  setComponentSections: Dispatch<SetStateAction<SectionState[]>>;
  componentSectionById: Record<string, string | null>;
  setComponentSectionById: Dispatch<SetStateAction<Record<string, string | null>>>;

  // delete confirmation state
  pendingScreenDelete: ScreenRow | null;
  setPendingScreenDelete: (screen: ScreenRow | null) => void;
  pendingComponentDelete: ComponentRow | null;
  setPendingComponentDelete: (component: ComponentRow | null) => void;

  // modal open state
  projectSettingsOpen: boolean;
  setProjectSettingsOpen: (open: boolean) => void;
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;

  // modal refs
  newScreenRef: RefObject<NewScreenModalHandle | null>;
  newComponentRef: RefObject<NewComponentModalHandle | null>;

  // handlers
  openNewScreen: () => void;
  openNewProjectComponent: () => void;
  handleScreenCreated: (screen: ScreenRow) => void;
  handleComponentCreated: (result: { component: ComponentRow }) => void;
  handleSettingsSaved: (updatedProject: ProjectRow) => void;
  handleConfirmDeleteScreen: (strategy?: InstanceDeleteStrategy) => Promise<void>;
  handleConfirmDeleteComponent: (strategy?: InstanceDeleteStrategy) => Promise<void>;
}

export function useGallery(projectId: string): GalleryState {
  const navigate = useNavigate();

  const { data: project } = useProject(projectId);
  const { data: screens } = useScreens(project?.id);
  const { data: components } = useComponentsByProject(project?.id);
  const { data: references } = useReferencesByProject(project?.id);
  const { data: activeVariants } = useActiveVariants(components);
  const type: ProjectType = project?.type ?? "desktop";
  const projectName = project?.name ?? "Projeto";

  const [tab, setTab] = useState<Tab>("screens");
  const [cmpFilter, setCmpFilter] = useState<CmpKindFilter>("all");

  const screenSectionState = usePersistentSectionState(project?.id, "screens");
  const componentSectionState = usePersistentSectionState(project?.id, "components");

  const [pendingScreenDelete, setPendingScreenDelete] = useState<ScreenRow | null>(null);
  const [pendingComponentDelete, setPendingComponentDelete] = useState<ComponentRow | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const newScreenRef = useRef<NewScreenModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);

  const openNewScreen = () => newScreenRef.current?.open();

  const openNewProjectComponent = () => {
    if (!project?.id) return;
    newComponentRef.current?.open({ kind: "project", projectId: project.id });
  };

  const handleScreenCreated = (s: ScreenRow) => {
    navigate(`/project/${encodeURIComponent(s.projectId)}/screen/${encodeURIComponent(s.id)}`);
  };

  const handleComponentCreated = (r: { component: ComponentRow }) => {
    navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
  };

  const handleSettingsSaved = (updatedProject: ProjectRow) => {
    setProjectSettingsOpen(false);
    navigate(`/project/${encodeURIComponent(updatedProject.id)}`, { replace: true });
  };

  const handleConfirmDeleteScreen = async (strategy?: InstanceDeleteStrategy) => {
    if (!pendingScreenDelete) return;
    await deleteScreen(
      pendingScreenDelete.id,
      strategy ? { instanceStrategy: strategy } : undefined,
    );
    setPendingScreenDelete(null);
  };

  const handleConfirmDeleteComponent = async (strategy?: InstanceDeleteStrategy) => {
    if (!pendingComponentDelete) return;
    await deleteComponentTree(
      pendingComponentDelete.id,
      strategy ? { instanceStrategy: strategy } : undefined,
    );
    setPendingComponentDelete(null);
  };

  return {
    projectId,
    project,
    screens,
    components,
    references,
    activeVariants,
    type,
    projectName,
    tab,
    setTab,
    cmpFilter,
    setCmpFilter,
    screenSections: screenSectionState.sections,
    setScreenSections: screenSectionState.setSections,
    screenSectionById: screenSectionState.sectionById,
    setScreenSectionById: screenSectionState.setSectionById,
    componentSections: componentSectionState.sections,
    setComponentSections: componentSectionState.setSections,
    componentSectionById: componentSectionState.sectionById,
    setComponentSectionById: componentSectionState.setSectionById,
    pendingScreenDelete,
    setPendingScreenDelete,
    pendingComponentDelete,
    setPendingComponentDelete,
    projectSettingsOpen,
    setProjectSettingsOpen,
    previewOpen,
    setPreviewOpen,
    newScreenRef,
    newComponentRef,
    openNewScreen,
    openNewProjectComponent,
    handleScreenCreated,
    handleComponentCreated,
    handleSettingsSaved,
    handleConfirmDeleteScreen,
    handleConfirmDeleteComponent,
  };
}
