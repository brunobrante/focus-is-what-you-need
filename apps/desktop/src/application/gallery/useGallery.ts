import {
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import { projectBase, screenPath, componentPath } from "@/lib/navigation/projectUrl";
import {
  useActiveVariants,
  useComponentsByProject,
  useProject,
  useReferencesByProject,
  useScreens,
} from "@/lib/storage/hooks";
import { type InstanceDeleteStrategy } from "@/lib/storage/repos/components.repo";
import { deleteScreen } from "@/lib/storage/repos/screens.repo";
import { getGalleryLayout, saveGalleryLayout } from "@/lib/storage/repos/galleryLayout.repo";
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

export type CmpKindFilter = "all" | ComponentKind;
export type SectionState = { id: string; name: string };

function usePersistentSectionState(
  projectId: string | null | undefined,
  kind: "screens" | "components",
) {
  const [sections, setSections] = useState<SectionState[]>([]);
  const [sectionById, setSectionById] = useState<Record<string, string | null>>({});
  // Tracks which project/kind the current state was loaded for. The write effect
  // skips persisting until the async load has populated state, so the empty
  // initial state can't clobber the stored layout.
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setSections([]);
      setSectionById({});
      loadedKeyRef.current = null;
      return;
    }
    const key = `${projectId}:${kind}`;
    loadedKeyRef.current = null;
    let cancelled = false;
    void getGalleryLayout(projectId, kind).then((row) => {
      if (cancelled) return;
      setSections(row?.sections ?? []);
      setSectionById(row?.sectionById ?? {});
      loadedKeyRef.current = key;
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, kind]);

  useEffect(() => {
    if (!projectId) return;
    if (loadedKeyRef.current !== `${projectId}:${kind}`) return;
    saveGalleryLayout(projectId, kind, { sections, sectionById });
  }, [projectId, kind, sections, sectionById]);

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
}

export function useGallery(projectId: string, workspaceId?: string | null): GalleryState {
  const navigate = useNavigate();

  const { data: project } = useProject(projectId);
  const { data: screens } = useScreens(project?.id);
  const { data: components } = useComponentsByProject(project?.id);
  const { data: references } = useReferencesByProject(project?.id);
  const { data: activeVariants } = useActiveVariants(components);
  const type: ProjectType = project?.type ?? "desktop";
  const projectName = project?.name ?? "Projeto";

  const [cmpFilter, setCmpFilter] = useState<CmpKindFilter>("all");

  const screenSectionState = usePersistentSectionState(project?.id, "screens");
  const componentSectionState = usePersistentSectionState(project?.id, "components");

  const [pendingScreenDelete, setPendingScreenDelete] = useState<ScreenRow | null>(null);

  const newScreenRef = useRef<NewScreenModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);

  const openNewScreen = () => newScreenRef.current?.open();

  const openNewProjectComponent = () => {
    if (!project?.id) return;
    newComponentRef.current?.open({ kind: "project", projectId: project.id });
  };

  const handleScreenCreated = (s: ScreenRow) => {
    navigate(screenPath(s.projectId, s.id, workspaceId));
  };

  const handleComponentCreated = (r: { component: ComponentRow }) => {
    navigate(componentPath(r.component.projectId ?? projectId, r.component.id, workspaceId));
  };

  const handleSettingsSaved = (updatedProject: ProjectRow) => {
    navigate(projectBase(updatedProject.id, workspaceId), { replace: true });
  };

  const handleConfirmDeleteScreen = async (strategy?: InstanceDeleteStrategy) => {
    if (!pendingScreenDelete) return;
    await deleteScreen(
      pendingScreenDelete.id,
      strategy ? { instanceStrategy: strategy } : undefined,
    );
    setPendingScreenDelete(null);
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
    newScreenRef,
    newComponentRef,
    openNewScreen,
    openNewProjectComponent,
    handleScreenCreated,
    handleComponentCreated,
    handleSettingsSaved,
    handleConfirmDeleteScreen,
  };
}
