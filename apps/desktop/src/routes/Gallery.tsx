import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AddReferenceModal,
  type AddReferenceModalHandle,
} from "@/components/modals/AddReferenceModal";
import {
  NewScreenModal,
  type NewScreenModalHandle,
} from "@/components/modals/NewScreenModal";
import {
  NewComponentModal,
  type NewComponentModalHandle,
} from "@/components/modals/NewComponentModal";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { Modal, ModalBody, ModalHeader } from "@/components/modals/Modal";
import { ProjectPreviewModal } from "@/components/modals/ProjectPreviewModal";
import { ProjectSettingsModal } from "@/components/modals/ProjectSettingsModal";
import {
  CardMenuIcons as SharedCardMenuIcons,
  CardMoreMenu,
} from "@/components/screen/CardMenu";
import { Snapshot } from "@/components/Snapshot";
import { Badge } from "@/components/ui/badge";
import { PROJECT_TYPE_DIMS } from "@/lib/data/projects";
import { fileFormatLabel, readFileAsDataUrl } from "@/lib/utils";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import {
  useActiveVariants,
  useComponentsByProject,
  useProject,
  useReferencesByProject,
  useScreens,
} from "@/lib/storage/hooks";
import { deleteComponentTree, updateComponent } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromProject,
} from "@/lib/storage/repos/references.repo";
import { deleteScreen } from "@/lib/storage/repos/screens.repo";
import { updateProject } from "@/lib/storage/repos/projects.repo";
import type {
  ComponentRow,
  ProjectDesignSystem,
  ProjectRow,
  ReferenceRow,
  ScreenRow,
  VariantRow,
} from "@/lib/storage/schema";

type Tab = "screens" | "components" | "references" | "system";
type CmpKindFilter = "all" | ComponentKind;
type SystemAssetKind = "color" | "font" | "icon" | "image";
type SystemModalState = { kind: SystemAssetKind; assetId?: string };
type SectionState = { id: string; name: string };
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

export function Gallery() {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : "";
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
  const navigate = useNavigate();
  const openNewScreen = () => newScreenRef.current?.open();
  const openNewProjectComponent = () => {
    if (!project?.id) return;
    newComponentRef.current?.open({ kind: "project", projectId: project.id });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <Crumbs projectName={projectName} type={type} />
        <div className="flex items-center gap-2">
          {screens.length > 0 ? (
            <button type="button" onClick={() => setPreviewOpen(true)} className="btn btn-ghost">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              Preview
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setProjectSettingsOpen(true)}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-[var(--border)] bg-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label="Project settings"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2.75 14.2 4l2.53-.33.95 2.36 2.25 1.22-.53 2.49 1.25 2.26-1.88 1.71-.31 2.54-2.5.51-1.74 1.88-2.25-1.28-2.27 1.28-1.73-1.88-2.51-.51-.3-2.54L3.36 14.3l1.25-2.26-.53-2.49 2.25-1.22.95-2.36L9.8 4 12 2.75Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <Tabs
        tab={tab}
        onChange={setTab}
        screensCount={screens.length}
        componentsCount={components.length}
        referencesCount={references.length}
      />

      {tab === "screens" && (
        <ScreensTab
          screens={screens}
          type={type}
          projectId={project?.id ?? projectId}
          onNewScreen={openNewScreen}
          sections={screenSectionState.sections}
          sectionById={screenSectionState.sectionById}
          onSectionsChange={screenSectionState.setSections}
          onSectionByIdChange={screenSectionState.setSectionById}
          onRequestDelete={setPendingScreenDelete}
        />
      )}
      {tab === "components" && (
        <ComponentsTab
          components={components}
          activeVariants={activeVariants}
          screens={screens}
          filter={cmpFilter}
          onFilterChange={setCmpFilter}
          projectId={project?.id ?? projectId}
          type={type}
          onNewComponent={openNewProjectComponent}
          canCreate={Boolean(project)}
          sections={componentSectionState.sections}
          sectionById={componentSectionState.sectionById}
          onSectionsChange={componentSectionState.setSections}
          onSectionByIdChange={componentSectionState.setSectionById}
          onRequestDelete={setPendingComponentDelete}
        />
      )}
      {tab === "references" && (
        <ReferencesTab
          project={project}
          screens={screens}
          components={components}
          references={references}
        />
      )}
      {tab === "system" && project ? <SystemTab project={project} /> : null}

      <NewScreenModal
        ref={newScreenRef}
        projectId={project?.id ?? null}
        onCreated={(s) => {
          navigate(`/project/${encodeURIComponent(s.projectId)}/screen/${encodeURIComponent(s.id)}`);
        }}
      />
      <NewComponentModal
        ref={newComponentRef}
        projectId={project?.id ?? null}
        screens={screens}
        onCreated={(r) => {
          navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
        }}
      />
      <ProjectSettingsModal
        open={projectSettingsOpen}
        project={project}
        screens={screens}
        onClose={() => setProjectSettingsOpen(false)}
        onSaved={(updatedProject) => {
          setProjectSettingsOpen(false);
          navigate(`/project/${encodeURIComponent(updatedProject.id)}`, { replace: true });
        }}
      />
      <ProjectPreviewModal
        open={previewOpen}
        project={project}
        screens={screens}
        onClose={() => setPreviewOpen(false)}
      />
      <ConfirmActionModal
        open={Boolean(pendingScreenDelete)}
        title="Delete screen"
        message={
          pendingScreenDelete
            ? `Screen "${pendingScreenDelete.title}" will be removed along with its components.`
            : ""
        }
        onClose={() => setPendingScreenDelete(null)}
        onConfirm={async () => {
          if (!pendingScreenDelete) return;
          await deleteScreen(pendingScreenDelete.id);
          setPendingScreenDelete(null);
        }}
      />
      <ConfirmActionModal
        open={Boolean(pendingComponentDelete)}
        title="Delete component"
        message={
          pendingComponentDelete
            ? `The component "${pendingComponentDelete.name}" will be removed along with subcomponents and variants.`
            : ""
        }
        onClose={() => setPendingComponentDelete(null)}
        onConfirm={async () => {
          if (!pendingComponentDelete) return;
          await deleteComponentTree(pendingComponentDelete.id);
          setPendingComponentDelete(null);
        }}
      />
    </div>
  );
}

function Crumbs({ projectName, type }: { projectName: string; type: ProjectType }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
      <Link to="/" aria-label="Back" className="text-[var(--text-muted)] hover:text-[var(--text)]">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <span className="text-[var(--text-faint)]">/</span>
      <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
        Projects
      </Link>
      <span className="text-[var(--text-faint)]">/</span>
      <span className="text-[13px] font-medium text-[var(--text)]">{projectName}</span>
      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
        {type}
      </span>
    </div>
  );
}

function Tabs({
  tab,
  onChange,
  screensCount,
  componentsCount,
  referencesCount,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  screensCount: number;
  componentsCount: number;
  referencesCount: number;
}) {
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "screens", label: "Screens", count: screensCount },
    { id: "components", label: "Components", count: componentsCount },
    { id: "references", label: "References", count: referencesCount },
    { id: "system", label: "System" },
  ];
  return (
    <nav role="tablist" className="flex gap-1 border-b border-[var(--border)] px-7">
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            onClick={() => onChange(t.id)}
            aria-selected={active}
            className={[
              "relative cursor-pointer border-0 bg-transparent px-3.5 py-3 text-[13px] font-medium tracking-[0.1px]",
              active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {t.label}
            {t.count != null && (
              <span
                className={[
                  "ml-1.5 inline-block rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-px text-[11px]",
                  active ? "text-[var(--text)]" : "text-[var(--text-faint)]",
                ].join(" ")}
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function ScreensTab({
  screens,
  type,
  projectId,
  onNewScreen,
  sections,
  sectionById,
  onSectionsChange,
  onSectionByIdChange,
  onRequestDelete,
}: {
  screens: ScreenRow[];
  type: ProjectType;
  projectId: string;
  onNewScreen: () => void;
  sections: SectionState[];
  sectionById: Record<string, string | null>;
  onSectionsChange: Dispatch<SetStateAction<SectionState[]>>;
  onSectionByIdChange: Dispatch<SetStateAction<Record<string, string | null>>>;
  onRequestDelete: (screen: ScreenRow) => void;
}) {
  const [createSectionRequest, setCreateSectionRequest] = useState(0);

  return (
    <>
      <div className="flex items-end justify-between gap-4 px-7 pb-3 pt-7">
        <div>
          <h1 className="m-0 mb-1 text-lg font-semibold tracking-[-0.1px]">Screens</h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            Click a screen to open its components.{" "}
            <span className="text-[12px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
              {screens.length} {screens.length === 1 ? "screen" : "screens"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateSectionRequest((value) => value + 1)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-3.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New section
          </button>
          <button type="button" onClick={onNewScreen} className="btn btn-primary h-9 px-3.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Screen
          </button>
          <ViewToggle />
        </div>
      </div>

      <main className="flex-1 px-7 pb-20">
        <ScreensGrid
          screens={screens}
          type={type}
          projectId={projectId}
          onNewScreen={onNewScreen}
          sections={sections}
          sectionById={sectionById}
          onSectionsChange={onSectionsChange}
          onSectionByIdChange={onSectionByIdChange}
          onRequestDelete={onRequestDelete}
          createSectionRequest={createSectionRequest}
        />
      </main>
    </>
  );
}

function gridColsForType(type: ProjectType): string {
  if (type === "tablet") return "repeat(auto-fill, minmax(220px, 1fr))";
  if (type === "mobile") return "repeat(auto-fill, minmax(170px, 1fr))";
  return "repeat(auto-fill, minmax(280px, 1fr))";
}

function aspectForType(type: ProjectType): string {
  if (type === "tablet") return "aspect-[4/5.7]";
  if (type === "mobile") return "aspect-[9/19.5]";
  return "aspect-[16/10]";
}

function ScreensGrid({
  screens,
  type,
  projectId,
  onNewScreen,
  sections,
  sectionById,
  onSectionsChange,
  onSectionByIdChange,
  onRequestDelete,
  createSectionRequest,
}: {
  screens: ScreenRow[];
  type: ProjectType;
  projectId: string;
  onNewScreen: () => void;
  sections: SectionState[];
  sectionById: Record<string, string | null>;
  onSectionsChange: Dispatch<SetStateAction<SectionState[]>>;
  onSectionByIdChange: Dispatch<SetStateAction<Record<string, string | null>>>;
  onRequestDelete: (screen: ScreenRow) => void;
  createSectionRequest?: number;
}) {
  if (screens.length === 0) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-10">
        <div className="max-w-[360px] text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text-faint)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M3 9h18" />
            </svg>
          </div>
          <h2 className="m-0 text-[20px] font-semibold tracking-[-0.2px] text-[var(--text)]">Empty Screen</h2>
          <p className="mt-2 text-[13px] leading-[1.6] text-[var(--text-muted)]">
            Start by creating the first screen of the project. New screens stay inside this area to keep the tab navigation flow.
          </p>
          <div className="mt-6">
            <button type="button" onClick={onNewScreen} className="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create first screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SectionedGrid
      items={screens}
      sections={sections}
      sectionById={sectionById}
      onSectionsChange={onSectionsChange}
      onSectionByIdChange={onSectionByIdChange}
      getId={(screen) => screen.id}
      gridTemplateColumns={gridColsForType(type)}
      newSectionPrefix="Section"
      createSectionRequest={createSectionRequest}
      showCreateSectionButton={false}
      renderItem={(s, helpers) => (
        <ScreenCard
          key={s.id}
          screen={s}
          type={type}
          projectId={projectId}
          onRequestDelete={onRequestDelete}
          onRequestAssignSection={helpers.onRequestAssignSection}
        />
      )}
      renderAddCard={() => <AddScreenCard type={type} onClick={onNewScreen} />}
    />
  );
}

function SectionedGrid<T>({
  items,
  sections,
  sectionById,
  onSectionsChange,
  onSectionByIdChange,
  getId,
  gridTemplateColumns,
  newSectionPrefix,
  renderItem,
  renderAddCard,
  createSectionRequest,
  showCreateSectionButton = true,
}: {
  items: T[];
  sections: SectionState[];
  sectionById: Record<string, string | null>;
  onSectionsChange: Dispatch<SetStateAction<SectionState[]>>;
  onSectionByIdChange: Dispatch<SetStateAction<Record<string, string | null>>>;
  getId: (item: T) => string;
  gridTemplateColumns: string;
  newSectionPrefix: string;
  renderItem: (
    item: T,
    helpers: { onRequestAssignSection: () => void },
  ) => ReactNode;
  renderAddCard?: () => ReactNode;
  createSectionRequest?: number;
  showCreateSectionButton?: boolean;
}) {
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [pendingSectionDelete, setPendingSectionDelete] = useState<SectionState | null>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [assignSectionId, setAssignSectionId] = useState<string>("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingScrollSectionId, setPendingScrollSectionId] = useState<string | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const groups = [
    { id: null, name: null },
    ...sections.map((section) => ({ id: section.id, name: section.name })),
  ];

  const openSectionModal = () => {
    setSectionName(`${newSectionPrefix} ${sections.length + 1}`);
    setSectionModalOpen(true);
  };
  const addSection = () => {
    const trimmed = sectionName.trim();
    if (!trimmed) return;
    const section: SectionState = {
      id: `section-${Date.now()}`,
      name: trimmed,
    };
    onSectionsChange((prev) => [...prev, section]);
    setPendingScrollSectionId(section.id);
    setSectionModalOpen(false);
    setSectionName("");
  };
  const assigningItem = assigningItemId
    ? items.find((item) => getId(item) === assigningItemId) ?? null
    : null;
  const activeDragItem = activeDragId
    ? items.find((item) => getId(item) === activeDragId) ?? null
    : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const itemId = String(event.active.id);
    const rawTarget = event.over ? String(event.over.id) : "";
    if (!rawTarget.startsWith("section:")) return;
    const nextSectionId = rawTarget === "section:unassigned" ? null : rawTarget.replace("section:", "");
    onSectionByIdChange((prev) => ({ ...prev, [itemId]: nextSectionId }));
  };

  useEffect(() => {
    if (!createSectionRequest) return;
    openSectionModal();
  }, [createSectionRequest]);

  useEffect(() => {
    if (!pendingScrollSectionId) return;
    const frame = window.requestAnimationFrame(() => {
      sectionRefs.current.get(pendingScrollSectionId)?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      setPendingScrollSectionId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingScrollSectionId, sections]);

  return (
    <div className="flex flex-col gap-7">
      <DndContext
        sensors={sensors}
        onDragStart={(event) => setActiveDragId(String(event.active.id))}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={handleDragEnd}
      >
        {groups.map((group) => {
          const groupItems = items.filter(
            (item) => (sectionById[getId(item)] ?? null) === group.id,
          );
          const isUncategorized = group.id == null;

          return (
            <section
              key={group.id ?? "uncategorized"}
              ref={(node) => {
                if (!group.id) return;
                if (node) sectionRefs.current.set(group.id, node);
                else sectionRefs.current.delete(group.id);
              }}
              className="scroll-mt-6 flex flex-col gap-3"
            >
              {!isUncategorized ? (
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                  <input
                    value={group.name ?? "Section"}
                    onChange={(e) => {
                      const value = e.target.value;
                      onSectionsChange((prev) =>
                        prev.map((section) =>
                          section.id === group.id ? { ...section, name: value } : section,
                        ),
                      );
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        onSectionsChange((prev) =>
                          prev.map((section) =>
                            section.id === group.id ? { ...section, name: "Section" } : section,
                          ),
                        );
                      }
                    }}
                    className="h-8 min-w-[160px] rounded-md border border-transparent bg-transparent px-1 text-[13px] font-semibold text-[var(--text)] outline-none hover:border-[var(--border)] focus:border-[var(--border-strong)] focus:bg-[var(--surface)]"
                  />
                  <span className="text-[11.5px] text-[var(--text-faint)]">
                    {groupItems.length} {groupItems.length === 1 ? "item" : "itens"}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    aria-label="Delete section"
                    onClick={() => {
                      if (!group.id) return;
                      setPendingSectionDelete({ id: group.id, name: group.name ?? "Section" });
                    }}
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border border-[var(--border)] bg-transparent text-[var(--text-faint)] hover:border-[rgba(255,80,80,0.45)] hover:bg-[rgba(255,80,80,0.1)] hover:text-[#ff7373]"
                  >
                    {SharedCardMenuIcons.Trash}
                  </button>
                </div>
              ) : null}

              <SectionDropZone id={`section:${group.id ?? "unassigned"}`}>
                <div
                  className={[
                    "grid gap-x-[18px] gap-y-[22px] rounded-[10px]",
                    !isUncategorized && groupItems.length === 0
                      ? "min-h-[92px] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4"
                      : "",
                  ].join(" ")}
                  style={{ gridTemplateColumns }}
                >
                  {groupItems.map((item) => {
                    const itemId = getId(item);
                    return (
                      <SectionDraggableItem key={itemId} id={itemId}>
                        {renderItem(item, {
                          onRequestAssignSection: () => {
                            setAssigningItemId(itemId);
                            setAssignSectionId(sectionById[itemId] ?? "");
                          },
                        })}
                      </SectionDraggableItem>
                    );
                  })}
                  {!isUncategorized && groupItems.length === 0 ? (
                    <div className="col-span-full grid min-h-[58px] place-items-center text-[12.5px] text-[var(--text-faint)]">
                      Drag cards to this section
                    </div>
                  ) : null}
                  {isUncategorized ? renderAddCard?.() : null}
                </div>
              </SectionDropZone>
            </section>
          );
        })}
        <DragOverlay>
          {activeDragItem ? (
            <div className="pointer-events-none max-w-[260px] rotate-1 rounded-[12px] border border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] p-2 shadow-[var(--shadow-pop)]">
              {renderItem(activeDragItem, { onRequestAssignSection: () => undefined })}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showCreateSectionButton ? (
      <div>
        <button
          type="button"
          onClick={openSectionModal}
          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-3 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nova section
        </button>
      </div>
      ) : null}
      <Modal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        ariaLabel="New section"
      >
        <ModalHeader
          title="New section"
          subtitle="Create a visual category to organize cards."
          onClose={() => setSectionModalOpen(false)}
        />
        <ModalBody>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
              Nome
            </span>
            <input
              autoFocus
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSection();
                }
              }}
              className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setSectionModalOpen(false)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={addSection}
              disabled={!sectionName.trim()}
              className="btn btn-primary"
            >
              Create section
            </button>
          </div>
        </ModalBody>
      </Modal>
      <ConfirmActionModal
        open={Boolean(pendingSectionDelete)}
        title="Delete section"
        message={
          pendingSectionDelete
            ? `Section "${pendingSectionDelete.name}" will be removed. Items will return to the unsectioned area.`
            : ""
        }
        onClose={() => setPendingSectionDelete(null)}
        onConfirm={() => {
          if (!pendingSectionDelete) return;
          onSectionsChange((prev) => prev.filter((s) => s.id !== pendingSectionDelete.id));
          onSectionByIdChange((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (next[key] === pendingSectionDelete.id) next[key] = null;
            }
            return next;
          });
          setPendingSectionDelete(null);
        }}
      />
      <Modal
        open={Boolean(assigningItem)}
        onClose={() => setAssigningItemId(null)}
        ariaLabel="Add to section"
      >
        <ModalHeader
          title="Add to section"
          subtitle="Choose where this card should appear visually."
          onClose={() => setAssigningItemId(null)}
        />
        <ModalBody>
          {sections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
              Crie uma section antes de adicionar cards.
            </div>
          ) : (
            <label className="flex flex-col gap-2">
              <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Section
              </span>
              <select
                value={assignSectionId}
                onChange={(e) => setAssignSectionId(e.target.value)}
                className="h-11 cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-[14px] font-medium text-[var(--text)] outline-none transition-colors duration-[100ms] focus:border-[var(--text)]"
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAssigningItemId(null)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!assigningItem || sections.length === 0}
              onClick={() => {
                if (!assigningItemId) return;
                onSectionByIdChange((prev) => ({
                  ...prev,
                  [assigningItemId]: assignSectionId || null,
                }));
                setAssigningItemId(null);
              }}
              className="btn btn-primary"
            >
              Adicionar
            </button>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}

function SectionDropZone({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={isOver ? "rounded-[12px] ring-1 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg)]" : ""}
    >
      {children}
    </div>
  );
}

function SectionDraggableItem({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="cursor-grab touch-none active:cursor-grabbing"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.32 : 1,
      }}
    >
      {children}
    </div>
  );
}

function ScreenCard({
  screen,
  type,
  projectId,
  onRequestDelete,
  onRequestAssignSection,
}: {
  screen: ScreenRow;
  type: ProjectType;
  projectId: string;
  onRequestDelete: (screen: ScreenRow) => void;
  onRequestAssignSection: () => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`;
  const canvasHref = `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&screen=${screen.id}`;
  return (
    <Link
      to={href}
      className="group relative flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:z-20 hover:-translate-y-0.5 focus-within:z-20"
    >
      <div
        className={`relative grid place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-[120ms] group-hover:border-[var(--border-strong)] ${aspectForType(type)}`}
      >
        <Snapshot
          kind="screen"
          ownerType="screen"
          ownerId={screen.id}
          variant={screen.variant}
          type={type}
        />
        <CardMenu
          actions={[
            { id: "components", label: "Componentes", icon: <IconGrid />, onClick: () => navigate(href) },
            { id: "canvas", label: "Canvas", icon: <IconCanvas />, onClick: () => navigate(canvasHref) },
            {
              id: "more",
              label: "Mais",
              icon: SharedCardMenuIcons.More,
              menuItems: [
                {
                  key: "section",
                  label: "Add to section",
                  onClick: onRequestAssignSection,
                },
                {
                  key: "delete",
                  label: "Delete screen",
                  icon: SharedCardMenuIcons.Trash,
                  destructive: true,
                  onClick: () => onRequestDelete(screen),
                },
              ],
            },
          ]}
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="truncate text-[13px] font-medium tracking-[-0.05px] text-[var(--text)]">
          {screen.title}
        </span>
        <span className="text-[11px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
          {PROJECT_TYPE_DIMS[type]}
        </span>
      </div>
    </Link>
  );
}

function AddScreenCard({ type, onClick }: { type: ProjectType; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-2.5 bg-transparent p-0 text-left text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div
        className={`grid place-items-center rounded-[10px] border border-dashed border-[var(--border)] text-[var(--text-muted)] transition-[border-color,color,background] duration-[120ms] group-hover:border-[var(--text)] group-hover:bg-[#161616] group-hover:text-[var(--text)] ${aspectForType(type)}`}
      >
        <div className="flex flex-col items-center gap-2 text-[12px] tracking-[0.2px]">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-current">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>New screen</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="truncate text-[13px] font-medium text-[var(--text-muted)]">Adicionar</span>
        <span className="text-[11px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
          {PROJECT_TYPE_DIMS[type]}
        </span>
      </div>
    </button>
  );
}

function CardMenu({
  actions,
}: {
  actions: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    onClick?: () => void;
    menuItems?: Array<{
      key: string;
      label: string;
      icon?: ReactNode;
      destructive?: boolean;
      onClick: () => void;
    }>;
  }>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpenId(null);
        setMenuPosition(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenId(null);
        setMenuPosition(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openId]);

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label="Actions"
      className="pointer-events-none absolute bottom-2 left-1/2 z-[2] inline-flex -translate-x-1/2 translate-y-1.5 items-center gap-0.5 rounded-[10px] border border-[var(--border-strong)] bg-[#161616] p-1 opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,transform] duration-[140ms] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
    >
      {actions.map((a, i) => (
        <span key={a.id} className="relative inline-flex items-center">
          {i > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--border)]" />}
          <button
            type="button"
            aria-label={a.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (a.menuItems) {
                const rect = e.currentTarget.getBoundingClientRect();
                const width = 176;
                setMenuPosition({
                  top: rect.bottom + 8,
                  left: Math.min(
                    window.innerWidth - width - 8,
                    Math.max(8, rect.right - width),
                  ),
                });
                setOpenId((current) => (current === a.id ? null : a.id));
                return;
              }
              a.onClick?.();
            }}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            {a.icon}
          </button>
          {a.menuItems && openId === a.id && menuPosition ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {a.menuItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenId(null);
                    setMenuPosition(null);
                    item.onClick();
                  }}
                  className={[
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors",
                    item.destructive
                      ? "text-[#ff7373] hover:bg-[rgba(255,80,80,0.12)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {item.icon ? <span className="grid h-4 w-4 place-items-center">{item.icon}</span> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          ) : null}
        </span>
      ))}
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value?: "grid" | "list";
  onChange?: (value: "grid" | "list") => void;
}) {
  const [internalView, setInternalView] = useState<"grid" | "list">("grid");
  const view = value ?? internalView;
  const setView = onChange ?? setInternalView;
  return (
    <div
      role="tablist"
      aria-label="Preview"
      className="inline-flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-[3px]"
    >
      <button
        type="button"
        aria-label="Grid"
        onClick={() => setView("grid")}
        className={[
          "grid h-[26px] w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent",
          view === "grid"
            ? "bg-[var(--pill)] text-[var(--text)]"
            : "text-[var(--text-muted)]",
        ].join(" ")}
        style={view === "grid" ? { background: "var(--pill)" } : undefined}
      >
        <IconGrid />
      </button>
      <button
        type="button"
        aria-label="List"
        onClick={() => setView("list")}
        className={[
          "grid h-[26px] w-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent",
          view === "list"
            ? "bg-[var(--pill)] text-[var(--text)]"
            : "text-[var(--text-muted)]",
        ].join(" ")}
        style={view === "list" ? { background: "var(--pill)" } : undefined}
      >
        <IconList />
      </button>
    </div>
  );
}

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconList() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function IconCanvas() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 9h18" strokeLinecap="round" />
    </svg>
  );
}
function ComponentsTab({
  components,
  activeVariants,
  screens,
  filter,
  onFilterChange,
  projectId,
  type,
  onNewComponent,
  canCreate,
  sections,
  sectionById,
  onSectionsChange,
  onSectionByIdChange,
  onRequestDelete,
}: {
  components: ComponentRow[];
  activeVariants: Map<string, VariantRow>;
  screens: ScreenRow[];
  filter: CmpKindFilter;
  onFilterChange: (f: CmpKindFilter) => void;
  projectId: string;
  type: ProjectType;
  onNewComponent: () => void;
  canCreate: boolean;
  sections: SectionState[];
  sectionById: Record<string, string | null>;
  onSectionsChange: Dispatch<SetStateAction<SectionState[]>>;
  onSectionByIdChange: Dispatch<SetStateAction<Record<string, string | null>>>;
  onRequestDelete: (component: ComponentRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [screenFilter, setScreenFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createSectionRequest, setCreateSectionRequest] = useState(0);
  const [screenAssignmentComponent, setScreenAssignmentComponent] = useState<ComponentRow | null>(null);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          components
            .map((component) => component.category?.trim())
            .filter((category): category is string => Boolean(category)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [components],
  );
  const filtered = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();
    return components.filter((component) => {
      const matchesKind = filter === "all" || component.kind === filter;
      const matchesQuery =
        !loweredQuery ||
        component.name.toLowerCase().includes(loweredQuery) ||
        component.category?.toLowerCase().includes(loweredQuery);
      const matchesScreen =
        screenFilter === "all" ||
        component.screenId === screenFilter ||
        component.assignedScreenIds.includes(screenFilter);
      const matchesSection =
        sectionFilter === "all" || (sectionById[component.id] ?? "unassigned") === sectionFilter;
      const matchesCategory =
        categoryFilter === "all" || (component.category ?? "") === categoryFilter;
      return matchesKind && matchesQuery && matchesScreen && matchesSection && matchesCategory;
    });
  }, [categoryFilter, components, filter, query, screenFilter, sectionById, sectionFilter]);
  const labelTotal =
    filter === "all"
      ? `${components.length}`
      : `${filtered.length} de ${components.length}`;
  const noun =
    (filter === "all" ? components.length : filtered.length) === 1
      ? "component"
      : "components";

  return (
    <>
      <div className="flex items-end justify-between gap-4 px-7 pb-3 pt-7">
        <div>
          <h1 className="m-0 mb-1 text-lg font-semibold tracking-[-0.1px]">Components</h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            All project components.{" "}
            <span className="text-[12px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
              {labelTotal} {noun}
            </span>
          </p>
        </div>
        <div className="inline-flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => setCreateSectionRequest((value) => value + 1)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--border-strong)] bg-transparent px-3.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New section
          </button>
          <button
            type="button"
            onClick={onNewComponent}
            disabled={!canCreate}
            className="btn btn-primary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create New Component
          </button>
          <ViewToggle />
        </div>
      </div>

      <main className="flex-1 px-7 pb-20">
        <div className="mb-5 grid gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 lg:grid-cols-[1.2fr_repeat(4,minmax(0,0.8fr))]">
          <label className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or category..."
              className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-9 pr-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
            />
          </label>
          <FilterSelectBase
            ariaLabel="Filter by type"
            value={filter}
            onChange={(value) => onFilterChange(value as CmpKindFilter)}
            options={[
              { value: "all", label: "All Types" },
              { value: "Layout", label: "Layout" },
              { value: "Atom", label: "Atom" },
              { value: "Section", label: "Section" },
              { value: "Pattern", label: "Pattern" },
              { value: "Overlay", label: "Overlay" },
            ]}
          />
          <FilterSelectBase
            ariaLabel="Filter by screen"
            value={screenFilter}
            onChange={setScreenFilter}
            options={[
              { value: "all", label: "All Screens" },
              ...screens.map((screen) => ({ value: screen.id, label: screen.title })),
            ]}
          />
          <FilterSelectBase
            ariaLabel="Filter by section"
            value={sectionFilter}
            onChange={setSectionFilter}
            options={[
              { value: "all", label: "All Sections" },
              { value: "unassigned", label: "No section" },
              ...sections.map((section) => ({ value: section.id, label: section.name })),
            ]}
          />
          <FilterSelectBase
            ariaLabel="Filter by category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All Categories" },
              ...categories.map((category) => ({ value: category, label: category })),
            ]}
          />
        </div>
        <SectionedGrid
          items={filtered}
          sections={sections}
          sectionById={sectionById}
          onSectionsChange={onSectionsChange}
          onSectionByIdChange={onSectionByIdChange}
          getId={(component) => component.id}
          gridTemplateColumns="repeat(auto-fill, minmax(240px, 1fr))"
          newSectionPrefix="Section"
          createSectionRequest={createSectionRequest}
          showCreateSectionButton={false}
          renderItem={(c, helpers) => (
            <ComponentCard
              key={c.id}
              component={c}
              variant={activeVariants.get(c.id) ?? null}
              screens={screens}
              projectId={projectId}
              type={type}
              onRequestDelete={onRequestDelete}
              onRequestAssignSection={helpers.onRequestAssignSection}
              onRequestAssignScreens={() => setScreenAssignmentComponent(c)}
            />
          )}
        />
      </main>
      <ComponentScreensModal
        component={screenAssignmentComponent}
        screens={screens}
        onClose={() => setScreenAssignmentComponent(null)}
        onSave={({ screenId, assignedScreenIds }) => {
          if (!screenAssignmentComponent) return;
          void updateComponent(screenAssignmentComponent.id, { screenId, assignedScreenIds });
          setScreenAssignmentComponent(null);
        }}
      />
    </>
  );
}

function FilterSelectBase({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-3 pr-8 text-[13px] text-[var(--text)] outline-none transition-colors duration-[120ms] hover:border-[var(--border-strong)] focus:border-[var(--text)]"
        style={{ appearance: "none", WebkitAppearance: "none" as never }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-[7px] w-[7px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
      />
    </div>
  );
}

function ComponentCard({
  component,
  variant,
  screens,
  projectId,
  type: _type,
  onRequestDelete,
  onRequestAssignSection,
  onRequestAssignScreens,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  screens: ScreenRow[];
  projectId: string;
  type: ProjectType;
  onRequestDelete: (component: ComponentRow) => void;
  onRequestAssignSection: () => void;
  onRequestAssignScreens: () => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/c/${component.id}`;
  const canvasHref = variant
    ? `/canvas?project=${encodeURIComponent(projectId)}&type=${_type}&variant=${variant.id}`
    : `/canvas?project=${encodeURIComponent(projectId)}&type=${_type}&component=${component.id}`;
  return (
    <Link
      to={href}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors duration-[120ms] group-hover:border-[var(--border-strong)]">
        {variant ? (
          <Snapshot
            kind="component"
            ownerType="variant"
            ownerId={variant.id}
            seedKey={variant.seedKey}
            type={_type}
            display="card"
          />
        ) : null}
        <CardMenu
          actions={[
            { id: "edit", label: "Edit", icon: <IconEdit />, onClick: () => navigate(canvasHref) },
            { id: "inspect", label: "Inspecionar", icon: <IconSearch />, onClick: () => navigate(href) },
            {
              id: "more",
              label: "Mais",
              icon: SharedCardMenuIcons.More,
              menuItems: [
                {
                  key: "section",
                  label: "Add to section",
                  onClick: onRequestAssignSection,
                },
                {
                  key: "screens",
                  label: "Link screens",
                  icon: <IconScreen />,
                  onClick: onRequestAssignScreens,
                },
                {
                  key: "delete",
                  label: "Delete component",
                  icon: SharedCardMenuIcons.Trash,
                  destructive: true,
                  onClick: () => onRequestDelete(component),
                },
              ],
            },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
            {component.name}
          </span>
          {component.kind ? <KindPill kind={component.kind} /> : null}
        </div>
        <CmpSource component={component} screens={screens} projectId={projectId} />
      </div>
    </Link>
  );
}

function ComponentScreensModal({
  component,
  screens,
  onClose,
  onSave,
}: {
  component: ComponentRow | null;
  screens: ScreenRow[];
  onClose: () => void;
  onSave: (value: { screenId: string | null; assignedScreenIds: string[] }) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingPrimaryUnlink, setPendingPrimaryUnlink] = useState<ScreenRow | null>(null);
  const primaryScreenId = component?.screenId ?? null;

  useEffect(() => {
    if (!component) return;
    setSelectedIds(Array.from(new Set([...(component.assignedScreenIds ?? []), ...(component.screenId ? [component.screenId] : [])])));
  }, [component]);

  return (
    <>
      <Modal open={Boolean(component)} onClose={onClose} ariaLabel="Link screens to component">
        <ModalHeader
          title="Link screens"
          subtitle={component ? `Choose which screens "${component.name}" should appear in.` : undefined}
          onClose={onClose}
        />
        <ModalBody>
          <div className="grid gap-2">
            {screens.map((screen) => {
              const checked = selectedIds.includes(screen.id);
              const isPrimary = screen.id === primaryScreenId;
              return (
                <label
                  key={screen.id}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-[10px] border bg-[var(--bg)] px-3.5 py-3 transition-colors",
                    checked ? "border-[var(--border-strong)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const isChecked = event.target.checked;
                      if (!isChecked && isPrimary) {
                        setPendingPrimaryUnlink(screen);
                        return;
                      }
                      setSelectedIds((current) => {
                        if (isChecked) return Array.from(new Set([...current, screen.id]));
                        return current.filter((id) => id !== screen.id);
                      });
                    }}
                    className="h-4 w-4 accent-[var(--text)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{screen.title}</span>
                  {isPrimary ? (
                    <Badge variant="outline" className="h-5 border-[var(--border)] px-2 text-[10px] uppercase tracking-[0.35px] text-[var(--text-faint)]">
                      origem
                    </Badge>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const screenId = primaryScreenId && selectedIds.includes(primaryScreenId) ? primaryScreenId : null;
                onSave({
                  screenId,
                  assignedScreenIds: selectedIds.filter((id) => id !== screenId),
                });
              }}
              className="btn btn-primary"
            >
              Save screens
            </button>
          </div>
        </ModalBody>
      </Modal>
      <ConfirmActionModal
        open={Boolean(pendingPrimaryUnlink)}
        title="Unlink screen?"
        message={
          pendingPrimaryUnlink
            ? `Screen "${pendingPrimaryUnlink.title}" will no longer be the origin of this component.`
            : ""
        }
        confirmLabel="Unlink"
        onClose={() => setPendingPrimaryUnlink(null)}
        onConfirm={() => {
          if (!pendingPrimaryUnlink) return;
          setSelectedIds((current) => current.filter((id) => id !== pendingPrimaryUnlink.id));
          setPendingPrimaryUnlink(null);
        }}
      />
    </>
  );
}

function CmpSource({
  component,
  screens,
  projectId,
}: {
  component: ComponentRow;
  screens: ScreenRow[];
  projectId: string;
}) {
  const navigate = useNavigate();
  const sourceScreens = getComponentSourceScreens(component, screens);
  const primaryScreen = sourceScreens[0] ?? null;
  const extraScreens = sourceScreens.slice(1);
  const title = sourceScreens.length > 0
    ? sourceScreens.map((screen) => screen.title).join(", ")
    : "Global";
  const openScreen = (event: MouseEvent, screen: ScreenRow) => {
    event.preventDefault();
    event.stopPropagation();
    navigate(`/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
      <span className="group/source relative inline-flex min-w-0 items-center gap-1.5" title={title}>
        {primaryScreen ? <IconScreen /> : <IconGlobal />}
        <span className="min-w-0 truncate">
          {primaryScreen ? (
            <>
              em{" "}
              <button
                type="button"
                onClick={(event) => openScreen(event, primaryScreen)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[11.5px] font-medium text-[var(--text)] underline-offset-2 hover:underline"
              >
                {primaryScreen.title}
              </button>
            </>
          ) : (
            "Global"
          )}
        </span>
        {extraScreens.length > 0 ? (
          <ScreenLinksBadge
            screens={extraScreens}
            onOpenScreen={openScreen}
          />
        ) : null}
      </span>
      {component.category ? (
        <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.35px] text-[var(--text-faint)]">
          {component.category}
        </span>
      ) : null}
    </div>
  );
}

function ScreenLinksBadge({
  screens,
  onOpenScreen,
}: {
  screens: ScreenRow[];
  onOpenScreen: (event: MouseEvent, screen: ScreenRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 90);
  };

  useEffect(() => {
    return () => cancelClose();
  }, []);

  return (
    <>
      <span
        className="flex-shrink-0"
        onMouseEnter={(event) => {
          cancelClose();
          const rect = event.currentTarget.getBoundingClientRect();
          const width = 190;
          setPosition({
            top: rect.bottom + 6,
            left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.left)),
          });
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <Badge
          variant="outline"
          className="h-[18px] cursor-default border-[var(--border)] px-1.5 text-[10px] font-medium leading-none text-[var(--text-faint)]"
        >
          +{screens.length}
        </Badge>
      </span>
      {open && position ? createPortal(
        <div
          className="fixed z-[120] min-w-[160px] max-w-[240px] rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)]"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {screens.map((screen) => (
            <button
              key={screen.id}
              type="button"
              onClick={(event) => {
                setOpen(false);
                onOpenScreen(event, screen);
              }}
              className="block w-full cursor-pointer truncate rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[11.5px] font-medium text-[var(--text-muted)] underline-offset-2 hover:bg-[var(--surface-hover)] hover:text-[var(--text)] hover:underline"
            >
              {screen.title}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function getComponentSourceScreens(component: ComponentRow, screens: ScreenRow[]): ScreenRow[] {
  const ids = new Set<string>();
  if (component.screenId) ids.add(component.screenId);
  component.assignedScreenIds.forEach((id) => ids.add(id));
  return screens.filter((screen) => ids.has(screen.id));
}

function IconScreen() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-[var(--text)] opacity-90"
    >
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}

function IconGlobal() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-[var(--text)] opacity-90"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function KindPill({ kind }: { kind: ComponentKind | null }) {
  if (!kind) return null;
  return (
    <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
      {kind}
    </span>
  );
}

function IconEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

type ReferenceView = "grid" | "list";

function ReferencesTab({
  project,
  screens,
  components,
  references,
}: {
  project: ProjectRow | null;
  screens: ScreenRow[];
  components: ComponentRow[];
  references: ReferenceRow[];
}) {
  const modalRef = useRef<AddReferenceModalHandle>(null);
  const [query, setQuery] = useState("");
  const [originFilter, setOriginFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [view, setView] = useState<ReferenceView>("grid");

  const screenById = useMemo(
    () => new Map(screens.map((screen) => [screen.id, screen])),
    [screens],
  );
  const componentById = useMemo(
    () => new Map(components.map((component) => [component.id, component])),
    [components],
  );

  const projectAttachments = (reference: ReferenceRow) =>
    reference.attachments.filter((attachment) => attachment.projectId === project?.id);

  const filtered = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();
    return references.filter((reference) => {
      const attachments = projectAttachments(reference);
      const targetTokens = attachments.flatMap((attachment) => [
        attachment.componentId ? componentById.get(attachment.componentId)?.name ?? "" : "",
        attachment.screenId ? screenById.get(attachment.screenId)?.title ?? "" : "",
        attachment.componentId == null && attachment.screenId == null ? "global" : "",
      ]);
      const haystack = [
        reference.title,
        reference.source,
        reference.description,
        ...reference.metadata,
        ...targetTokens,
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !loweredQuery || haystack.includes(loweredQuery);
      const matchesOrigin =
        originFilter === "all" || reference.visibility === originFilter;
      const matchesKind = kindFilter === "all" || reference.kind === kindFilter;
      const matchesTarget =
        targetFilter === "all" ||
        (targetFilter === "global" &&
          attachments.some(
            (attachment) =>
              attachment.componentId == null && attachment.screenId == null,
          )) ||
        attachments.some((attachment) => attachment.componentId === targetFilter) ||
        attachments.some((attachment) => attachment.screenId === targetFilter);
      return matchesQuery && matchesOrigin && matchesKind && matchesTarget;
    });
  }, [componentById, kindFilter, originFilter, query, references, screenById, targetFilter, project]);

  const targetOptions = [
    { value: "all", label: "All Targets" },
    { value: "global", label: "Global" },
    ...screens.map((screen) => ({ value: screen.id, label: `Screen · ${screen.title}` })),
    ...components.map((component) => ({ value: component.id, label: `Component · ${component.name}` })),
  ];

  return (
    <>
      <div className="flex items-end justify-between gap-4 px-7 pb-3 pt-7">
        <div>
          <h1 className="m-0 mb-1 text-lg font-semibold tracking-[-0.1px]">References</h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            Visual cards connected to the project, screens or components.{" "}
            <span className="text-[12px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
              {references.length} {references.length === 1 ? "reference" : "references"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <button type="button" onClick={() => modalRef.current?.open()} className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Reference
          </button>
        </div>
      </div>

      <main className="flex-1 px-7 pb-10">
        <div className="mb-5 grid gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 lg:grid-cols-[1.2fr_repeat(3,minmax(0,0.8fr))]">
          <label className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, source, link or description..."
              className="h-11 w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-9 pr-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
            />
          </label>
          <FilterSelectBase
            ariaLabel="Filter by source"
            value={originFilter}
            onChange={setOriginFilter}
            options={[
              { value: "all", label: "All Sources" },
              { value: "external", label: "External" },
              { value: "local", label: "Local" },
            ]}
          />
          <FilterSelectBase
            ariaLabel="Filter by type"
            value={kindFilter}
            onChange={setKindFilter}
            options={[
              { value: "all", label: "All Kinds" },
              { value: "hero", label: "Hero" },
              { value: "cards", label: "Cards" },
              { value: "form", label: "Form" },
              { value: "dash", label: "Dash" },
              { value: "type", label: "Type" },
            ]}
          />
          <FilterSelectBase
            ariaLabel="Filter by target"
            value={targetFilter}
            onChange={setTargetFilter}
            options={targetOptions}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="grid min-h-[320px] place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-10 text-center">
            <div className="max-w-[340px]">
              <div className="mb-3 text-[16px] font-semibold text-[var(--text)]">No reference found</div>
              <div className="text-[13px] leading-[1.6] text-[var(--text-muted)]">
                Adjust the filters or add new references to the project via search, upload or external URL.
              </div>
            </div>
          </div>
        ) : view === "grid" ? (
          <div
            className="columns-2 gap-3 md:columns-3 xl:columns-4"
            style={{ columnGap: "12px" }}
          >
            {filtered.map((reference) => (
              <ReferenceProjectCard
                key={reference.id}
                reference={reference}
                attachments={projectAttachments(reference)}
                screenById={screenById}
                componentById={componentById}
                onRemove={() => project && void removeReferenceFromProject(reference.id, project.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((reference) => (
              <ReferenceProjectRow
                key={reference.id}
                reference={reference}
                attachments={projectAttachments(reference)}
                screenById={screenById}
                componentById={componentById}
                onRemove={() => project && void removeReferenceFromProject(reference.id, project.id)}
              />
            ))}
          </div>
        )}
      </main>

      <AddReferenceModal
        ref={modalRef}
        projectId={project?.id ?? null}
        screens={screens}
        components={components}
        existingReferences={references}
        onAdd={async (input) => {
          await createOrAttachReference(input);
        }}
      />
    </>
  );
}

function referenceLabelSet(
  attachments: ReferenceRow["attachments"],
  screenById: Map<string, ScreenRow>,
  componentById: Map<string, ComponentRow>,
) {
  const labels: string[] = [];
  for (const attachment of attachments) {
    if (attachment.componentId) {
      labels.push(componentById.get(attachment.componentId)?.name ?? "Component");
      continue;
    }
    if (attachment.screenId) {
      labels.push(screenById.get(attachment.screenId)?.title ?? "Screen");
      continue;
    }
    labels.push("Global");
  }
  return Array.from(new Set(labels));
}

function ReferenceProjectCard({
  reference,
  attachments,
  screenById,
  componentById,
  onRemove,
}: {
  reference: ReferenceRow;
  attachments: ReferenceRow["attachments"];
  screenById: Map<string, ScreenRow>;
  componentById: Map<string, ComponentRow>;
  onRemove: () => void;
}) {
  const labels = referenceLabelSet(attachments, screenById, componentById);
  const primaryLabels = labels.slice(0, 2);
  return (
    <div className="group mb-3 inline-flex w-full break-inside-avoid flex-col gap-2 align-top">
      <div className="relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-[border-color] duration-150 group-hover:border-[var(--border-strong)]">
        {reference.thumbnailUrl ? (
          <>
            <img
              src={reference.thumbnailUrl}
              alt=""
              className="block h-auto w-full"
              draggable={false}
            />
            {/* Gradient overlay with badges */}
            <div
              className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)" }}
            >
              <div className="flex flex-wrap gap-1.5">
                <ReferenceBadge>{reference.visibility === "external" ? "External" : "Local"}</ReferenceBadge>
                {reference.stack?.enabled ? <ReferenceBadge>Stack</ReferenceBadge> : null}
                {primaryLabels.map((label) => (
                  <ReferenceBadge key={label}>{label}</ReferenceBadge>
                ))}
                {labels.length > primaryLabels.length ? (
                  <ReferenceBadge>{`+${labels.length - primaryLabels.length}`}</ReferenceBadge>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="line-clamp-1 text-[11.5px] font-medium text-white">{reference.title}</span>
                {(reference.metadata ?? []).slice(0, 3).map((tag) => (
                  <span key={tag} className="hidden" />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2.5 text-[var(--text-faint)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span className="px-4 text-center text-[11px] leading-snug">{reference.title}</span>
          </div>
        )}
        <CardMoreMenu
          label="More reference actions"
          items={[
            {
              key: "delete",
              label: "Delete reference",
              icon: SharedCardMenuIcons.Trash,
              destructive: true,
              onClick: onRemove,
            },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text)]">
            {reference.title}
          </span>
          {labels.length > 0 ? (
            <span className="flex-shrink-0 text-[11px] text-[var(--text-faint)]">
              {labels[0]}{labels.length > 1 ? ` +${labels.length - 1}` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="truncate">{reference.source}</span>
          {reference.stack?.enabled ? (
            <span className="rounded-full border border-[rgba(94,162,255,0.28)] bg-[rgba(94,162,255,0.1)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.35px] text-[#82b8ff]">
              Stack
            </span>
          ) : null}
          {(reference.metadata ?? []).slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.35px] text-[var(--text-faint)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReferenceProjectRow({
  reference,
  attachments,
  screenById,
  componentById,
  onRemove,
}: {
  reference: ReferenceRow;
  attachments: ReferenceRow["attachments"];
  screenById: Map<string, ScreenRow>;
  componentById: Map<string, ComponentRow>;
  onRemove: () => void;
}) {
  const labels = referenceLabelSet(attachments, screenById, componentById);
  return (
    <div className="group relative grid gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--border-strong)] md:grid-cols-[180px_1fr_auto]">
      <CardMoreMenu
        label="More reference actions"
        items={[
          {
            key: "delete",
            label: "Delete reference",
            icon: SharedCardMenuIcons.Trash,
            destructive: true,
            onClick: onRemove,
          },
        ]}
      />
      <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
        {reference.thumbnailUrl ? (
          <img
            src={reference.thumbnailUrl}
            alt=""
            className="aspect-[16/10] h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center text-[var(--text-faint)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[14px] font-semibold text-[var(--text)]">{reference.title}</div>
          <ReferenceBadge>{reference.visibility === "external" ? "External" : "Local"}</ReferenceBadge>
          {reference.stack?.enabled ? <ReferenceBadge>Stack</ReferenceBadge> : null}
          {labels.slice(0, 3).map((label) => (
            <ReferenceBadge key={label}>{label}</ReferenceBadge>
          ))}
        </div>
        <div className="mt-1 text-[12px] text-[var(--text-muted)]">{reference.source}</div>
        <div className="mt-3 text-[12.5px] leading-[1.6] text-[var(--text-muted)]">
          {reference.description || "a visual reference connected to the project."}
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          {reference.metadata.map((tag) => (
            <span key={tag} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10.5px] uppercase tracking-[0.35px] text-[var(--text-faint)]">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReferenceBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border-strong)] bg-black/70 px-2 py-0.5 text-[10.5px] uppercase tracking-[0.35px] text-white backdrop-blur">
      {children}
    </span>
  );
}

function SystemTab({ project }: { project: ProjectRow }) {
  const [modal, setModal] = useState<SystemModalState | null>(null);

  const patchDesignSystem = async (
    updater: (designSystem: ProjectDesignSystem) => ProjectDesignSystem,
  ) => {
    await updateProject(project.id, {
      designSystem: updater(project.designSystem),
    });
    setModal(null);
  };
  const upsertColor = (color: ProjectDesignSystem["colors"][number]) =>
    patchDesignSystem((designSystem) => ({
      ...designSystem,
      colors: upsertById(designSystem.colors, color),
    }));
  const upsertFont = (font: ProjectDesignSystem["fonts"][number]) =>
    patchDesignSystem((designSystem) => ({
      ...designSystem,
      fonts: upsertById(designSystem.fonts, font),
    }));
  const upsertIcon = (icon: ProjectDesignSystem["icons"][number]) =>
    patchDesignSystem((designSystem) => ({
      ...designSystem,
      icons: upsertById(designSystem.icons, icon),
    }));
  const upsertImage = (image: ProjectDesignSystem["images"][number]) =>
    patchDesignSystem((designSystem) => ({
      ...designSystem,
      images: upsertById(designSystem.images, image),
    }));
  const deleteSystemAsset = (kind: SystemAssetKind, assetId: string) =>
    void patchDesignSystem((designSystem) => {
      if (kind === "color") {
        return { ...designSystem, colors: designSystem.colors.filter((asset) => asset.id !== assetId) };
      }
      if (kind === "font") {
        return { ...designSystem, fonts: designSystem.fonts.filter((asset) => asset.id !== assetId) };
      }
      if (kind === "icon") {
        return { ...designSystem, icons: designSystem.icons.filter((asset) => asset.id !== assetId) };
      }
      return { ...designSystem, images: designSystem.images.filter((asset) => asset.id !== assetId) };
    });
  const editingColor = modal?.kind === "color" && modal.assetId
    ? project.designSystem.colors.find((color) => color.id === modal.assetId)
    : undefined;
  const editingFont = modal?.kind === "font" && modal.assetId
    ? project.designSystem.fonts.find((font) => font.id === modal.assetId)
    : undefined;
  const editingIcon = modal?.kind === "icon" && modal.assetId
    ? project.designSystem.icons.find((icon) => icon.id === modal.assetId)
    : undefined;
  const editingImage = modal?.kind === "image" && modal.assetId
    ? project.designSystem.images.find((image) => image.id === modal.assetId)
    : undefined;

  return (
    <>
      <div className="flex items-end justify-between gap-4 px-7 pb-3 pt-7">
        <div>
          <h1 className="m-0 mb-1 text-lg font-semibold tracking-[-0.1px]">System</h1>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">
            Real project tokens and assets, with dedicated fields for colors, fonts, icons and images.
          </p>
        </div>
      </div>
      <main className="flex flex-1 flex-col gap-9 px-7 pb-10">
        <SysBlock title="Cores" actionLabel="New color" onAction={() => setModal({ kind: "color" })}>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {project.designSystem.colors.map((color) => (
              <div key={color.id} className="group relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]">
                <CardMoreMenu
                  label="More color actions"
                  items={[
                    { key: "edit", label: "Edit color", icon: <IconEdit />, onClick: () => setModal({ kind: "color", assetId: color.id }) },
                    {
                      key: "delete",
                      label: "Delete color",
                      icon: SharedCardMenuIcons.Trash,
                      destructive: true,
                      onClick: () => deleteSystemAsset("color", color.id),
                    },
                  ]}
                />
                <div className="h-[72px]" style={{ background: color.value }} />
                <div className="flex flex-col gap-0.5 px-3 pb-1.5 pt-3">
                  <span className="text-[13px] font-medium">{color.name}</span>
                  <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {color.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SysBlock>

        <SysBlock title="Fontes" actionLabel="Add font" onAction={() => setModal({ kind: "font" })}>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {project.designSystem.fonts.map((font) => (
              <div key={font.id} className="group relative flex min-h-[168px] flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-[18px] pb-3.5 pt-[18px] transition-colors hover:border-[var(--border-strong)]">
                <CardMoreMenu
                  label="More font actions"
                  items={[
                    { key: "edit", label: "Edit font", icon: <IconEdit />, onClick: () => setModal({ kind: "font", assetId: font.id }) },
                    {
                      key: "delete",
                      label: "Delete font",
                      icon: SharedCardMenuIcons.Trash,
                      destructive: true,
                      onClick: () => deleteSystemAsset("font", font.id),
                    },
                  ]}
                />
                <div className="text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-[var(--text)]" style={{ fontFamily: font.family }}>
                  {font.preview}
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[var(--text)]">{font.name}</span>
                  <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                    {font.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SysBlock>

        <SysBlock title="Icons" actionLabel="Add icon" onAction={() => setModal({ kind: "icon" })}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
            {project.designSystem.icons.map((icon) => (
              <div key={icon.id} className="group relative grid aspect-square gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-3 text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]">
                <CardMoreMenu
                  label="More icon actions"
                  items={[
                    { key: "edit", label: "Edit icon", icon: <IconEdit />, onClick: () => setModal({ kind: "icon", assetId: icon.id }) },
                    {
                      key: "delete",
                      label: "Delete icon",
                      icon: SharedCardMenuIcons.Trash,
                      destructive: true,
                      onClick: () => deleteSystemAsset("icon", icon.id),
                    },
                  ]}
                />
                <div className="grid place-items-center">
                  <SystemGlyph glyph={icon.glyph} />
                </div>
                <div className="truncate text-center text-[11px] text-[var(--text-muted)]">{icon.name}</div>
              </div>
            ))}
          </div>
        </SysBlock>

        <SysBlock title="Images" actionLabel="Add image" onAction={() => setModal({ kind: "image" })}>
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {project.designSystem.images.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)]">
                <CardMoreMenu
                  label="More image actions"
                  items={[
                    { key: "edit", label: "Edit image", icon: <IconEdit />, onClick: () => setModal({ kind: "image", assetId: image.id }) },
                    {
                      key: "delete",
                      label: "Delete image",
                      icon: SharedCardMenuIcons.Trash,
                      destructive: true,
                      onClick: () => deleteSystemAsset("image", image.id),
                    },
                  ]}
                />
                <img src={image.previewUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="truncate text-[12px] text-[var(--text)]">{image.name}</span>
                  <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                    {image.format}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SysBlock>
      </main>

      <ColorAssetModal
        open={modal?.kind === "color"}
        color={editingColor}
        onClose={() => setModal(null)}
        onSave={(color) => void upsertColor(color)}
      />
      <FontAssetModal
        open={modal?.kind === "font"}
        font={editingFont}
        onClose={() => setModal(null)}
        onSave={(font) => void upsertFont(font)}
      />
      <IconAssetModal
        open={modal?.kind === "icon"}
        icon={editingIcon}
        onClose={() => setModal(null)}
        onSave={(icon) => void upsertIcon(icon)}
      />
      <ImageAssetModal
        open={modal?.kind === "image"}
        image={editingImage}
        onClose={() => setModal(null)}
        onSave={(image) => void upsertImage(image)}
      />
    </>
  );
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  if (existingIndex < 0) return [...items, nextItem];
  const nextItems = [...items];
  nextItems[existingIndex] = nextItem;
  return nextItems;
}

function SysBlock({
  title,
  actionLabel,
  children,
  onAction,
}: {
  title: string;
  actionLabel: string;
  children: ReactNode;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] pb-2.5">
        <h2 className="m-0 text-[14px] font-semibold uppercase tracking-[0.4px] text-[var(--text-faint)]">
          {title}
        </h2>
        <button
          type="button"
          onClick={onAction}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function ColorAssetModal({
  open,
  color,
  onClose,
  onSave,
}: {
  open: boolean;
  color?: ProjectDesignSystem["colors"][number];
  onClose: () => void;
  onSave: (color: ProjectDesignSystem["colors"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("#5EA2FF");

  useEffect(() => {
    if (!open) return;
    setName(color?.name ?? "");
    setValue(color?.value ?? "#5EA2FF");
  }, [color, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel="New color">
      <ModalHeader title={color ? "Edit color" : "New color"} subtitle="Set a name and pick the color directly in the palette." onClose={onClose} />
      <ModalBody>
        <div className="grid gap-4">
          <FieldLine label="Nome">
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" />
          </FieldLine>
          <FieldLine label="Cor">
            <div className="flex items-center gap-3">
              <input type="color" value={value} onChange={(event) => setValue(event.target.value)} className="h-12 w-20 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1" />
              <input value={value} onChange={(event) => setValue(event.target.value)} className="h-11 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] uppercase text-[var(--text)] outline-none focus:border-[var(--text)]" />
            </div>
          </FieldLine>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="button" onClick={() => onSave({ id: color?.id ?? `color-${Date.now()}`, name: name.trim() || "Custom", value })} className="btn btn-primary">Salvar cor</button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function FontAssetModal({
  open,
  font,
  onClose,
  onSave,
}: {
  open: boolean;
  font?: ProjectDesignSystem["fonts"][number];
  onClose: () => void;
  onSave: (font: ProjectDesignSystem["fonts"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [role, setRole] = useState("Body");

  useEffect(() => {
    if (!open) return;
    setName(font?.name ?? "");
    setFamily(font?.family ?? "");
    setRole(font?.role ?? "Body");
  }, [font, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel="New font">
      <ModalHeader title={font ? "Edit font" : "Add font"} subtitle="Register the typeface family and its role within the project." onClose={onClose} />
      <ModalBody>
        <div className="grid gap-4">
          <FieldLine label="Nome"><input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" /></FieldLine>
          <FieldLine label="Family"><input value={family} onChange={(event) => setFamily(event.target.value)} placeholder="Ex.: Manrope, sans-serif" className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" /></FieldLine>
          <FieldLine label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]">
              <option>Body</option>
              <option>Display</option>
              <option>UI</option>
              <option>Mono</option>
            </select>
          </FieldLine>
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 text-[28px] text-[var(--text)]" style={{ fontFamily: family || undefined }}>
            Hierarchy matters
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="button" onClick={() => onSave({ id: font?.id ?? `font-${Date.now()}`, name: name.trim() || "Custom font", family: family.trim() || "inherit", role, preview: font?.preview ?? "Hierarchy matters" })} className="btn btn-primary">Save font</button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

const SYSTEM_GLYPHS = ["grid", "search", "bell", "gear", "image", "spark"];

function IconAssetModal({
  open,
  icon,
  onClose,
  onSave,
}: {
  open: boolean;
  icon?: ProjectDesignSystem["icons"][number];
  onClose: () => void;
  onSave: (icon: ProjectDesignSystem["icons"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState("grid");

  useEffect(() => {
    if (!open) return;
    setName(icon?.name ?? "");
    setGlyph(icon?.glyph ?? "grid");
  }, [icon, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel="New icon">
      <ModalHeader title={icon ? "Edit icon" : "Add icon"} subtitle="Choose a glyph and name the asset for the project design system." onClose={onClose} />
      <ModalBody>
        <div className="grid gap-4">
          <FieldLine label="Name"><input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" /></FieldLine>
          <FieldLine label="Icon">
            <div className="grid grid-cols-3 gap-3">
              {SYSTEM_GLYPHS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setGlyph(entry)}
                  className={[
                    "grid aspect-square cursor-pointer place-items-center rounded-[12px] border bg-[var(--bg)] transition-colors",
                    glyph === entry ? "border-[var(--text)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  <SystemGlyph glyph={entry} />
                </button>
              ))}
            </div>
          </FieldLine>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="button" onClick={() => onSave({ id: icon?.id ?? `icon-${Date.now()}`, name: name.trim() || "Custom icon", glyph, family: icon?.family ?? "system" })} className="btn btn-primary">Save icon</button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function ImageAssetModal({
  open,
  image,
  onClose,
  onSave,
}: {
  open: boolean;
  image?: ProjectDesignSystem["images"][number];
  onClose: () => void;
  onSave: (image: ProjectDesignSystem["images"][number]) => void;
}) {
  const [name, setName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [format, setFormat] = useState("PNG");

  useEffect(() => {
    if (!open) return;
    setName(image?.name ?? "");
    setPreviewUrl(image?.previewUrl ?? "");
    setFormat(image?.format ?? "PNG");
  }, [image, open]);

  return (
    <Modal open={open} onClose={onClose} ariaLabel="New image">
      <ModalHeader title={image ? "Edit image" : "Add image"} subtitle="Upload an image to add to the project design system." onClose={onClose} />
      <ModalBody>
        <div className="grid gap-4">
          <FieldLine label="Nome"><input value={name} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]" /></FieldLine>
          <label className="grid min-h-[220px] cursor-pointer place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--bg)] p-4 text-center transition-colors hover:border-[var(--text)]">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void (async () => {
                  setPreviewUrl(await readFileAsDataUrl(file));
                  setFormat(fileFormatLabel(file.name));
                  if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
                })();
              }}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="" className="max-h-[220px] rounded-[10px] object-contain" />
            ) : (
              <div className="max-w-[240px] text-[12px] leading-[1.6] text-[var(--text-muted)]">
                Click to select an image from your disk.
              </div>
            )}
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="button" onClick={() => onSave({ id: image?.id ?? `image-${Date.now()}`, name: name.trim() || "Asset", previewUrl, format })} disabled={!previewUrl} className="btn btn-primary">Save image</button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function FieldLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[12px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  );
}

function SystemGlyph({ glyph }: { glyph: string }) {
  if (glyph === "search") {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  }
  if (glyph === "bell") {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>;
  }
  if (glyph === "gear") {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3.5 14 5l2.4-.4.9 2.3 2 1.1-.5 2.4 1.2 2.1-1.8 1.6-.3 2.4-2.4.5-1.7 1.8-2.1-1.2-2.1 1.2-1.7-1.8-2.4-.5-.3-2.4-1.8-1.6 1.2-2.1-.5-2.4 2-1.1.9-2.3L10 5l2-1.5Z" /><circle cx="12" cy="12" r="3" /></svg>;
  }
  if (glyph === "image") {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>;
  }
  if (glyph === "spark") {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m12 3 1.7 4.8L18.5 9l-4.8 1.2L12 15l-1.7-4.8L5.5 9l4.8-1.2L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
}
