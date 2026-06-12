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
  ReferencesModal,
  type ReferencesModalHandle,
} from "@/components/modals/ReferencesModal";
import {
  NewScreenModal,
  type NewScreenModalHandle,
} from "@/components/modals/NewScreenModal";
import {
  NewComponentModal,
  type NewComponentModalHandle,
} from "@/components/modals/NewComponentModal";
import { ConfirmActionModal, type ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";
import { FastEditModal, type FastEditModalHandle } from "@/components/screen/FastEditModal";
import { Modal, ModalBody, ModalHeader } from "@/components/modals/Modal";
import { ProjectPreviewModal, type ProjectPreviewModalHandle } from "@/components/modals/ProjectPreviewModal";
import { ProjectSettingsModal, type ProjectSettingsModalHandle } from "@/components/modals/ProjectSettingsModal";
import {
  CardMenuIcons as SharedCardMenuIcons,
  CardMoreMenu,
} from "@/components/screen/CardMenu";
import { Snapshot } from "@/components/Snapshot";
import { Badge } from "@/components/ui/badge";
import { PROJECT_TYPE_DIMS, PROJECT_TYPE_LABEL } from "@/lib/data/projects";
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
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import { updateProject } from "@/lib/storage/repos/projects.repo";
import { SystemTab } from "@/routes/SystemTab";
import type {
  ComponentRow,
  ProjectRow,
  ReferenceRow,
  ScreenRow,
  VariantRow,
} from "@/lib/storage/schema";
import { IconChevronDown, IconClose, IconColorStyles, IconDiamond, IconEye, IconFastEdit, IconFolder, IconGlobe, IconGrid, IconImage, IconListView, IconOpenCanvas, IconPencil, IconPhone, IconPlay, IconPlus, IconRectangle, IconScreen, IconSearch, IconText, IconChevronLeft, IconWindow } from "@/components/icons";
import { FilterButton, FilterSection } from "@/components/ui/FilterButton";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { ReferenceCard } from "@/components/references/ReferenceCard";

type Tab = "screens" | "components" | "references" | "system";
type CmpKindFilter = "all" | ComponentKind;
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
  const [editOpen, setEditOpen] = useState(false);
  const screenSectionState = usePersistentSectionState(project?.id, "screens");
  const componentSectionState = usePersistentSectionState(project?.id, "components");
  const newScreenRef = useRef<NewScreenModalHandle>(null);
  const confirmRef = useRef<ConfirmActionModalHandle>(null);
  const previewRef = useRef<ProjectPreviewModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const navigate = useNavigate();
  const openNewScreen = () => newScreenRef.current?.open();
  const openNewProjectComponent = () => {
    if (!project?.id) return;
    newComponentRef.current?.open({ kind: "project", projectId: project.id });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 items-center border-b border-[var(--border)] px-5">
        <Crumbs projectName={projectName} type={type} />
      </header>

      <ProjectOverview
        project={project}
        screensCount={screens.length}
        componentsCount={components.length}
        referencesCount={references.length}
        onPreview={screens.length > 0 && project ? () => previewRef.current?.open(project, screens) : null}
        onEdit={() => setEditOpen((v) => !v)}
        editOpen={editOpen}
      />
      {editOpen && project && (
        <ProjectEditPanel
          project={project}
          screens={screens}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            navigate(`/project/${encodeURIComponent(updated.id)}`, { replace: true });
          }}
        />
      )}

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
          onRequestDelete={(screen) => {
            confirmRef.current?.open({
              title: "Delete screen",
              message: `Screen "${screen.title}" will be removed along with its components.`,
              onConfirm: () => deleteScreen(screen.id),
            });
          }}
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
          onRequestDelete={(component) => {
            confirmRef.current?.open({
              title: "Delete component",
              message: `The component "${component.name}" will be removed along with subcomponents and variants.`,
              onConfirm: () => deleteComponentTree(component.id),
            });
          }}
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
      <ProjectPreviewModal ref={previewRef} />
      <ConfirmActionModal ref={confirmRef} />
    </div>
  );
}

const LOGO_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

function projectLogoColor(name: string): string {
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % LOGO_COLORS.length;
  return LOGO_COLORS[idx]!;
}

export function ProjectOverview({
  project,
  screensCount,
  componentsCount,
  referencesCount,
  onPreview,
  onEdit,
  editOpen,
}: {
  project: ProjectRow | undefined;
  screensCount: number;
  componentsCount: number;
  referencesCount: number;
  onPreview: (() => void) | null;
  onEdit: () => void;
  editOpen: boolean;
}) {
  const initial = (project?.name ?? "P")[0]!.toUpperCase();
  const logoColor = projectLogoColor(project?.name ?? "");
  const typeLabel = PROJECT_TYPE_LABEL[project?.type ?? "desktop"];
  const dims = PROJECT_TYPE_DIMS[project?.type ?? "desktop"];

  const updatedDate = project?.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-start gap-6 border-b border-[var(--border)] px-7 py-7">
      <div
        className="flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl text-[22px] font-semibold text-white"
        style={{ background: project?.thumbnailDataUrl ? undefined : logoColor }}
      >
        {project?.thumbnailDataUrl ? (
          <img
            src={project.thumbnailDataUrl}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">

        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[18px] font-semibold leading-none tracking-[-0.3px] text-[var(--text)]">
            {project?.name ?? "—"}
          </h1>
          <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {typeLabel}
          </span>
          {updatedDate && (
            <span className="text-[11px] text-[var(--text-faint)]">· Updated {updatedDate}</span>
          )}
        </div>

        {project?.description ? (
          <p className="m-0 max-w-[520px] text-[13px] leading-[1.55] text-[var(--text-muted)]">
            {project.description}
          </p>
        ) : null}

        <div className="flex items-center gap-3 text-[12px] text-[var(--text-faint)]">
          <span>
            <span className="font-medium text-[var(--text-muted)]">{screensCount}</span>{" "}
            {screensCount === 1 ? "Screen" : "Screens"}
          </span>
          <span className="opacity-40">·</span>
          <span>
            <span className="font-medium text-[var(--text-muted)]">{componentsCount}</span>{" "}
            {componentsCount === 1 ? "Component" : "Components"}
          </span>
          <span className="opacity-40">·</span>
          <span>
            <span className="font-medium text-[var(--text-muted)]">{referencesCount}</span>{" "}
            {referencesCount === 1 ? "Reference" : "References"}
          </span>
          <span className="opacity-40">·</span>
          <span>{dims}</span>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 self-start pt-0.5">
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--text)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity hover:opacity-80"
          >
            <IconPlay size={11} />
            Preview
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className={[
            "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border px-3.5 text-[13px] font-medium transition-colors",
            editOpen
              ? "border-[var(--text)] bg-[var(--surface-hover)] text-[var(--text)]"
              : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
          ].join(" ")}
          aria-label="Edit project"
        >
          <IconPencil size={13} strokeWidth={1.7} />
          Edit
        </button>
      </div>
    </div>
  );
}

export function Crumbs({ projectName, type }: { projectName: string; type: ProjectType }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
      <Link to="/" aria-label="Back" className="text-[var(--text-muted)] hover:text-[var(--text)]">
        <IconChevronLeft size={14} strokeWidth={1.6} />
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

export function Tabs({
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
    { id: "references", label: "References" },
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

function CreateScreenDropdown({
  onNewScreen,
  onNewSection,
  type,
}: {
  onNewScreen: () => void;
  onNewSection: () => void;
  type: ProjectType;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        !rootRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--text)] px-3 text-[12.5px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
      >
        <IconPlus size={13} strokeWidth={2.2} />
        New
        <IconChevronDown size={10} strokeWidth={2.4} className={["transition-transform duration-150", open ? "rotate-180" : ""].join(" ")} />
      </button>
      {open && pos ? createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-[80] w-[190px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <button
            type="button"
            onClick={() => { onNewScreen(); setOpen(false); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-[7px] text-left text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
          >
            {type === "mobile"
              ? <IconPhone size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />
              : <IconScreen size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />}
            New screen
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            onClick={() => { onNewSection(); setOpen(false); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-[7px] text-left text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
          >
            <IconFolder size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />
            New section
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function ScreensTab({
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
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");

  const filtered = query.trim()
    ? screens.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))
    : screens;

  return (
    <>
      <div className="flex items-center gap-2 px-7 pb-4 pt-5">
        <ScreenSearchBar
          query={query}
          onQueryChange={setQuery}
          sectionFilter={sectionFilter}
          onSectionFilterChange={setSectionFilter}
          sectionOptions={[
            { value: "all", label: "All sections" },
            { value: "unassigned", label: "No section" },
            ...sections.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />

        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />

        <CreateScreenDropdown
          onNewScreen={onNewScreen}
          onNewSection={() => setCreateSectionRequest((v) => v + 1)}
          type={type}
        />
      </div>

      <main className="flex-1 px-7 pb-20">
        <ScreensGrid
          screens={sectionFilter === "all"
            ? filtered
            : sectionFilter === "unassigned"
              ? filtered.filter((s) => !sectionById[s.id])
              : filtered.filter((s) => sectionById[s.id] === sectionFilter)
          }
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

export function ProjectEditPanel({
  project,
  screens,
  onClose,
  onSaved,
}: {
  project: ProjectRow;
  screens: ScreenRow[];
  onClose: () => void;
  onSaved: (project: ProjectRow) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [previewScreenId, setPreviewScreenId] = useState(project.previewScreenId ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        previewScreenId: previewScreenId || null,
      });
      if (updated) {
        onSaved(updated);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-7 py-3">
        <span className="text-[13px] font-medium text-[var(--text)]">Edit project</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconClose size={11} strokeWidth={2} />
        </button>
      </div>
      <div className="grid gap-5 px-7 py-5 md:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Project name</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            placeholder="Project name"
            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Description</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            placeholder="Briefly describe this project..."
            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.4px] text-[var(--text-faint)]">Preview screen</span>
          <select
            value={previewScreenId}
            onChange={(e) => setPreviewScreenId(e.target.value)}
            className="h-9 cursor-pointer rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--border-strong)]"
          >
            <option value="">First screen</option>
            {screens.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 px-7 pb-5">
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!name.trim() || saving}
          className="btn btn-primary"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
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
      <EmptyMessage
        icon={<IconScreen size={17} strokeWidth={1.7} />}
        title="No screens yet"
        description="Create your first screen to start building your project."
        onClick={onNewScreen}
      />
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
  itemGap,
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
  itemGap?: string;
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
  const sectionConfirmRef = useRef<ConfirmActionModalHandle>(null);
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
                      const sectionId = group.id;
                      const sectionName = group.name ?? "Section";
                      sectionConfirmRef.current?.open({
                        title: "Delete section",
                        message: `Section "${sectionName}" will be removed. Items will return to the unsectioned area.`,
                        onConfirm: () => {
                          onSectionsChange((prev) => prev.filter((s) => s.id !== sectionId));
                          onSectionByIdChange((prev) => {
                            const next = { ...prev };
                            for (const key of Object.keys(next)) {
                              if (next[key] === sectionId) next[key] = null;
                            }
                            return next;
                          });
                        },
                      });
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
                    "grid rounded-[10px]",
                    itemGap ?? "gap-x-[18px] gap-y-[22px]",
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
          <IconPlus size={13} strokeWidth={1.8} />
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
      <ConfirmActionModal ref={sectionConfirmRef} />
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
            { id: "canvas", label: "Canvas", icon: <IconOpenCanvas size={13} strokeWidth={1.6} />, onClick: () => navigate(canvasHref) },
            { id: "edit", label: "Edit", icon: <IconFastEdit size={13} strokeWidth={1.6} />, onClick: () => navigate(href) },
            {
              id: "more",
              label: "Mais",
              icon: SharedCardMenuIcons.More,
              menuItems: [
                {
                  key: "section",
                  label: "Add to section",
                  icon: SharedCardMenuIcons.MoveTo,
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
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]">
            <IconPlus size={14} strokeWidth={2} />
          </span>
          <span>New screen</span>
        </div>
      </div>
    </button>
  );
}

function AddComponentCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-2.5 bg-transparent p-0 text-left text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="grid aspect-[4/3] place-items-center rounded-[10px] border border-dashed border-[var(--border)] text-[var(--text-muted)] transition-[border-color,color,background] duration-[120ms] group-hover:border-[var(--text)] group-hover:bg-[#161616] group-hover:text-[var(--text)]">
        <div className="flex flex-col items-center gap-2 text-[12px] tracking-[0.2px]">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]">
            <IconPlus size={14} strokeWidth={2} />
          </span>
          <span>New component</span>
        </div>
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
      className={[
        "pointer-events-none absolute bottom-2 left-1/2 z-[2] inline-flex -translate-x-1/2 translate-y-1.5 items-center gap-0.5 rounded-[10px] border border-[var(--border-strong)] bg-[#161616] p-1 opacity-0 shadow-[var(--shadow-pop)] transition-[opacity,transform] duration-[140ms] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100",
        openId ? "!pointer-events-auto !translate-y-0 !opacity-100" : "",
      ].join(" ")}
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
        <IconGrid size={14} strokeWidth={1.6} />
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
        <IconListView size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = value !== "all";
  const activeLabel = options.find((o) => o.value === value)?.label ?? label;

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 5, left: rect.left });
    setOpen(true);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("all");
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={[
          "inline-flex h-[34px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] transition-colors duration-[120ms]",
          isActive
            ? "border-[var(--text)] bg-[var(--text)] font-medium text-[var(--bg)]"
            : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        ].join(" ")}
      >
        {isActive ? activeLabel : label}
        {isActive ? (
          <span
            role="button"
            aria-label={`Clear ${label} filter`}
            onClick={clear}
            className="grid h-[14px] w-[14px] shrink-0 cursor-pointer place-items-center rounded-full bg-[rgba(255,255,255,0.2)] text-[10px] leading-none hover:bg-[rgba(255,255,255,0.35)]"
          >
            ×
          </span>
        ) : (
          <IconChevronDown size={9} strokeWidth={2.4} />
        )}
      </button>
      {open && pos ? createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-[80] min-w-[160px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => { onChange(option.value); setOpen(false); }}
                className={[
                  "flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--surface)]",
                  isSelected ? "text-[var(--text)]" : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid h-[14px] w-[14px] shrink-0 place-items-center rounded-full border transition-colors",
                    isSelected
                      ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)] text-[9px]"
                      : "border-[var(--border)]",
                  ].join(" ")}
                >
                  {isSelected ? "✓" : null}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

type CmpChipOption = { value: string; label: string };

function ComponentSearchBar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  screenFilter,
  onScreenFilterChange,
  screenOptions,
  sectionFilter,
  onSectionFilterChange,
  sectionOptions,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  typeOptions: CmpChipOption[];
  screenFilter: string;
  onScreenFilterChange: (v: string) => void;
  screenOptions: CmpChipOption[];
  sectionFilter: string;
  onSectionFilterChange: (v: string) => void;
  sectionOptions: CmpChipOption[];
}) {
  const activeCount =
    (typeFilter !== "all" ? 1 : 0) +
    (screenFilter !== "all" ? 1 : 0) +
    (sectionFilter !== "all" ? 1 : 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search components..."
          className="h-[34px] w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-0 pl-8 pr-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
      </label>
      <FilterButton activeCount={activeCount}>
        <FilterSection title="Type" options={typeOptions} value={typeFilter} onChange={onTypeFilterChange} />
        <FilterSection title="Screen" options={screenOptions} value={screenFilter} onChange={onScreenFilterChange} />
        {sectionOptions.length > 2 && (
          <FilterSection title="Section" options={sectionOptions} value={sectionFilter} onChange={onSectionFilterChange} />
        )}
      </FilterButton>
    </div>
  );
}

function ScreenSearchBar({
  query,
  onQueryChange,
  sectionFilter,
  onSectionFilterChange,
  sectionOptions,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  sectionFilter: string;
  onSectionFilterChange: (v: string) => void;
  sectionOptions: CmpChipOption[];
}) {
  const activeCount = sectionFilter !== "all" ? 1 : 0;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search screens..."
          className="h-[34px] w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-0 pl-8 pr-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
      </label>
      <FilterButton activeCount={activeCount}>
        <FilterSection title="Section" options={sectionOptions} value={sectionFilter} onChange={onSectionFilterChange} />
      </FilterButton>
    </div>
  );
}

function RefSearchBar({
  query,
  onQueryChange,
  originFilter,
  onOriginFilterChange,
  originOptions,
  kindFilter,
  onKindFilterChange,
  kindOptions,
  targetFilter,
  onTargetFilterChange,
  targetOptions,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  originFilter: string;
  onOriginFilterChange: (v: string) => void;
  originOptions: CmpChipOption[];
  kindFilter: string;
  onKindFilterChange: (v: string) => void;
  kindOptions: CmpChipOption[];
  targetFilter: string;
  onTargetFilterChange: (v: string) => void;
  targetOptions: CmpChipOption[];
}) {
  const activeCount =
    (originFilter !== "all" ? 1 : 0) +
    (kindFilter !== "all" ? 1 : 0) +
    (targetFilter !== "all" ? 1 : 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search references..."
          className="h-[34px] w-full rounded-full border border-[var(--border)] bg-[var(--bg)] py-0 pl-8 pr-3 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text)]"
        />
      </label>
      <FilterButton activeCount={activeCount}>
        <FilterSection title="Source" options={originOptions} value={originFilter} onChange={onOriginFilterChange} />
        <FilterSection title="Kind" options={kindOptions} value={kindFilter} onChange={onKindFilterChange} />
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-[var(--text-faint)]">Target</p>
          <div className="flex max-h-[140px] flex-wrap gap-1.5 overflow-y-auto">
            {targetOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onTargetFilterChange(opt.value)}
                className={[
                  "h-[26px] cursor-pointer rounded-full border px-3 text-[11px] font-medium transition-colors duration-[100ms]",
                  targetFilter === opt.value
                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
                    : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </FilterButton>
    </div>
  );
}

function CreateDropdown({
  onNewComponent,
  canCreate,
  onNewSection,
  type,
}: {
  onNewComponent: () => void;
  canCreate: boolean;
  onNewSection: () => void;
  type: ProjectType;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 5, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (
        !rootRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--text)] px-3 text-[12.5px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
      >
        <IconPlus size={13} strokeWidth={2.2} />
        New
        <IconChevronDown size={10} strokeWidth={2.4} className={["transition-transform duration-150", open ? "rotate-180" : ""].join(" ")} />
      </button>
      {open && pos ? createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-[80] w-[190px] overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => { onNewComponent(); setOpen(false); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-[7px] text-left text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {type === "mobile"
              ? <IconPhone size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />
              : <IconScreen size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />}
            Create component
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            onClick={() => { onNewSection(); setOpen(false); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-[7px] text-left text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
          >
            <IconFolder size={13} strokeWidth={1.6} className="shrink-0 text-[var(--text-muted)]" />
            New section
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function ComponentsTab({
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
  const fastEditRef = useRef<FastEditModalHandle>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [screenFilter, setScreenFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [createSectionRequest, setCreateSectionRequest] = useState(0);
  const [screenAssignmentComponent, setScreenAssignmentComponent] = useState<ComponentRow | null>(null);
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
      return matchesKind && matchesQuery && matchesScreen && matchesSection;
    });
  }, [components, filter, query, screenFilter, sectionById, sectionFilter]);
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
      <div className="flex items-center gap-2 px-7 pb-4 pt-5">
        <ComponentSearchBar
          query={query}
          onQueryChange={setQuery}
          typeFilter={filter}
          onTypeFilterChange={(v) => onFilterChange(v as CmpKindFilter)}
          typeOptions={[
            { value: "all", label: "All types" },
            { value: "Layout", label: "Layout" },
            { value: "Atom", label: "Atom" },
            { value: "Section", label: "Section" },
            { value: "Pattern", label: "Pattern" },
            { value: "Overlay", label: "Overlay" },
          ]}
          screenFilter={screenFilter}
          onScreenFilterChange={setScreenFilter}
          screenOptions={[
            { value: "all", label: "All screens" },
            ...screens.map((screen) => ({ value: screen.id, label: screen.title })),
          ]}
          sectionFilter={sectionFilter}
          onSectionFilterChange={setSectionFilter}
          sectionOptions={[
            { value: "all", label: "All sections" },
            { value: "unassigned", label: "No section" },
            ...sections.map((section) => ({ value: section.id, label: section.name })),
          ]}
        />
        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />

        <ViewToggle value={view} onChange={setView} />
        <CreateDropdown
          onNewComponent={onNewComponent}
          canCreate={canCreate}
          onNewSection={() => setCreateSectionRequest((value) => value + 1)}
          type={type}
        />
      </div>

      <main className="flex-1 px-7 pb-20">
        {components.length === 0 ? (
          <EmptyMessage
            icon={<IconDiamond size={17} strokeWidth={1.7} />}
            title="No components yet"
            description="Create your first component to start building your hierarchy."
            onClick={canCreate ? onNewComponent : undefined}
          />
        ) : (
        <SectionedGrid
          items={filtered}
          sections={sections}
          sectionById={sectionById}
          onSectionsChange={onSectionsChange}
          onSectionByIdChange={onSectionByIdChange}
          getId={(component) => component.id}
          gridTemplateColumns={view === "list" ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))"}
          itemGap={view === "list" ? "gap-y-0.5" : undefined}
          newSectionPrefix="Section"
          createSectionRequest={createSectionRequest}
          showCreateSectionButton={false}
          renderAddCard={canCreate ? () => <AddComponentCard onClick={onNewComponent} /> : undefined}
          renderItem={(c, helpers) => {
            const variant = activeVariants.get(c.id) ?? null;
            const canvasHref = variant
              ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${variant.id}`
              : `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&component=${c.id}`;
            const openFastEdit = () =>
              fastEditRef.current?.open({
                mode: "component",
                component: c,
                variant,
                type,
                canvasHref,
              });
            return view === "list" ? (
              <ComponentListRow
                key={c.id}
                component={c}
                variant={variant}
                screens={screens}
                projectId={projectId}
                type={type}
                onRequestDelete={onRequestDelete}
                onRequestAssignSection={helpers.onRequestAssignSection}
                onRequestAssignScreens={() => setScreenAssignmentComponent(c)}
                onFastEdit={openFastEdit}
              />
            ) : (
              <ComponentCard
                key={c.id}
                component={c}
                variant={variant}
                screens={screens}
                projectId={projectId}
                type={type}
                onRequestDelete={onRequestDelete}
                onRequestAssignSection={helpers.onRequestAssignSection}
                onRequestAssignScreens={() => setScreenAssignmentComponent(c)}
                onFastEdit={openFastEdit}
              />
            );
          }}
        />
        )}
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
      <FastEditModal ref={fastEditRef} />
    </>
  );
}

function FilterSelectBase({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={["relative inline-flex items-center", className].filter(Boolean).join(" ")}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer rounded-[10px] border border-[var(--border)] bg-[var(--bg)] py-0 pl-3 pr-8 text-[13px] text-[var(--text)] outline-none transition-colors duration-[120ms] hover:border-[var(--border-strong)] focus:border-[var(--text)]"
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
  onFastEdit,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  screens: ScreenRow[];
  projectId: string;
  type: ProjectType;
  onRequestDelete: (component: ComponentRow) => void;
  onRequestAssignSection: () => void;
  onRequestAssignScreens: () => void;
  onFastEdit: () => void;
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
            { id: "canvas", label: "Canvas", icon: <IconOpenCanvas size={13} strokeWidth={1.6} />, onClick: () => navigate(canvasHref) },
            { id: "edit", label: "Fast edit", icon: <IconFastEdit size={13} strokeWidth={1.6} />, onClick: onFastEdit },
            {
              id: "more",
              label: "Mais",
              icon: SharedCardMenuIcons.More,
              menuItems: [
                {
                  key: "section",
                  label: "Add to section",
                  icon: SharedCardMenuIcons.MoveTo,
                  onClick: onRequestAssignSection,
                },
                {
                  key: "screens",
                  label: "Link screens",
                  icon: <IconScreen size={11} strokeWidth={1.7} className="flex-shrink-0 text-[var(--text)] opacity-90" />,
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

function ComponentListRow({
  component,
  variant,
  screens,
  projectId,
  type: _type,
  onRequestDelete,
  onRequestAssignSection,
  onRequestAssignScreens,
  onFastEdit,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  screens: ScreenRow[];
  projectId: string;
  type: ProjectType;
  onRequestDelete: (component: ComponentRow) => void;
  onRequestAssignSection: () => void;
  onRequestAssignScreens: () => void;
  onFastEdit: () => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/c/${component.id}`;
  const canvasHref = variant
    ? `/canvas?project=${encodeURIComponent(projectId)}&type=${_type}&variant=${variant.id}`
    : `/canvas?project=${encodeURIComponent(projectId)}&type=${_type}&component=${component.id}`;

  const [moreOpen, setMoreOpen] = useState(false);
  const [morePos, setMorePos] = useState<{ top: number; left: number } | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (
        !moreBtnRef.current?.contains(e.target as Node) &&
        !moreMenuRef.current?.contains(e.target as Node)
      ) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const stopNav = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <Link
      to={href}
      className="group flex h-[52px] cursor-pointer items-center gap-3 rounded-[10px] px-2 text-inherit no-underline transition-colors hover:bg-[var(--surface)]"
    >
      <div className="preview-dotgrid relative h-9 w-[52px] shrink-0 overflow-hidden rounded-md border border-[var(--border)] transition-colors group-hover:border-[var(--border-strong)]">
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
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
          {component.name}
        </span>
        {component.kind ? <KindPill kind={component.kind} /> : null}

        <span className="inline-flex shrink-0 items-center gap-px" onClick={stopNav}>
          <button
            type="button"
            aria-label="Canvas"
            onClick={(e) => { stopNav(e); navigate(canvasHref); }}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <IconOpenCanvas size={12} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label="Fast edit"
            onClick={(e) => { stopNav(e); onFastEdit(); }}
            className="grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <IconFastEdit size={12} strokeWidth={1.6} />
          </button>
          <button
            ref={moreBtnRef}
            type="button"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={(e) => {
              stopNav(e);
              if (moreOpen) { setMoreOpen(false); return; }
              const rect = moreBtnRef.current?.getBoundingClientRect();
              if (!rect) return;
              setMorePos({
                top: rect.bottom + 5,
                left: Math.min(window.innerWidth - 184, Math.max(8, rect.right - 176)),
              });
              setMoreOpen(true);
            }}
            className={[
              "grid h-6 w-6 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              moreOpen ? "bg-[var(--surface-hover)] text-[var(--text)]" : "",
            ].join(" ")}
          >
            {SharedCardMenuIcons.More}
          </button>
          {moreOpen && morePos ? createPortal(
            <div
              ref={moreMenuRef}
              role="menu"
              style={{ position: "fixed", top: morePos.top, left: morePos.left }}
              className="z-[80] min-w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1 shadow-[var(--shadow-pop)] backdrop-blur-md"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onRequestAssignSection(); setMoreOpen(false); }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <span className="grid h-4 w-4 place-items-center">{SharedCardMenuIcons.MoveTo}</span>
                <span>Add to section</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onRequestAssignScreens(); setMoreOpen(false); }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <span className="grid h-4 w-4 place-items-center">
                  <IconScreen size={11} strokeWidth={1.7} className="flex-shrink-0 text-[var(--text)] opacity-90" />
                </span>
                <span>Link screens</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onRequestDelete(component); setMoreOpen(false); }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] text-[#ff7373] transition-colors hover:bg-[rgba(255,80,80,0.12)]"
              >
                <span className="grid h-4 w-4 place-items-center">{SharedCardMenuIcons.Trash}</span>
                <span>Delete component</span>
              </button>
            </div>,
            document.body,
          ) : null}
        </span>
      </div>

      <div className="hidden shrink-0 xl:block">
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
  const primaryScreenId = component?.screenId ?? null;
  const unlinkConfirmRef = useRef<ConfirmActionModalHandle>(null);

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
                        unlinkConfirmRef.current?.open({
                          title: "Unlink screen?",
                          message: `Screen "${screen.title}" will no longer be the origin of this component.`,
                          confirmLabel: "Unlink",
                          onConfirm: () => {
                            setSelectedIds((current) => current.filter((id) => id !== screen.id));
                          },
                        });
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
      <ConfirmActionModal ref={unlinkConfirmRef} />
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
        {primaryScreen ? <IconScreen size={11} strokeWidth={1.7} className="flex-shrink-0 text-[var(--text)] opacity-90" /> : <IconGlobe size={11} strokeWidth={1.7} className="flex-shrink-0 text-[var(--text)] opacity-90" />}
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


function KindPill({ kind }: { kind: ComponentKind | null }) {
  if (!kind) return null;
  return (
    <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
      {kind}
    </span>
  );
}

type ReferenceView = "grid" | "list";

export function ReferencesTab({
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
  const referencesModalRef = useRef<ReferencesModalHandle>(null);
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
    { value: "all", label: "All targets" },
    { value: "global", label: "Global" },
    ...screens.map((screen) => ({ value: screen.id, label: `Screen · ${screen.title}` })),
    ...components.map((component) => ({ value: component.id, label: `Component · ${component.name}` })),
  ];

  return (
    <>
      <div className="flex items-center gap-2 px-7 pb-4 pt-5">
        <RefSearchBar
          query={query}
          onQueryChange={setQuery}
          originFilter={originFilter}
          onOriginFilterChange={setOriginFilter}
          originOptions={[
            { value: "all", label: "All sources" },
            { value: "external", label: "External" },
            { value: "local", label: "Local" },
          ]}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          kindOptions={[
            { value: "all", label: "All kinds" },
            { value: "hero", label: "Hero" },
            { value: "cards", label: "Cards" },
            { value: "form", label: "Form" },
            { value: "dash", label: "Dash" },
            { value: "type", label: "Type" },
          ]}
          targetFilter={targetFilter}
          onTargetFilterChange={setTargetFilter}
          targetOptions={targetOptions}
        />

        <div className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />

        <ViewToggle value={view} onChange={setView} />
        <button
          type="button"
          onClick={() => modalRef.current?.open()}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] bg-[var(--text)] px-3 text-[12.5px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
        >
          <IconPlus size={13} strokeWidth={2.2} />
          Add Reference
        </button>
      </div>

      <main className="flex-1 px-7 pb-10">
        {filtered.length === 0 ? (
          <EmptyMessage
            icon={<IconImage size={17} strokeWidth={1.7} />}
            title="No reference found"
            description="Adjust the filters or add new references to the project via search, upload or external URL."
            onClick={() => modalRef.current?.open()}
          />
        ) : view === "grid" ? (
          <div
            className="grid gap-x-[18px] gap-y-[22px]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {filtered.map((reference, index) => (
              <ReferenceProjectCard
                key={reference.id}
                reference={reference}
                attachments={projectAttachments(reference)}
                screenById={screenById}
                componentById={componentById}
                onOpen={() => referencesModalRef.current?.open(index)}
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
      <ReferencesModal
        ref={referencesModalRef}
        references={filtered}
        onRemove={(reference) => project && void removeReferenceFromProject(reference.id, project.id)}
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
  onOpen,
  onRemove,
}: {
  reference: ReferenceRow;
  attachments: ReferenceRow["attachments"];
  screenById: Map<string, ScreenRow>;
  componentById: Map<string, ComponentRow>;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  return (
    <ReferenceCard
      kind="project"
      reference={reference}
      attachments={attachments}
      screenById={screenById}
      componentById={componentById}
      onOpen={onOpen}
      onRemove={onRemove}
    />
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
  const { url: imageUrl } = useReferenceRowImage(reference);
  return (
    <div className="group relative grid gap-4 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--border-strong)] md:grid-cols-[180px_1fr_auto]">
      <CardMoreMenu
        label="More reference actions"
        items={[
          {
            key: "delete",
            label: "Remove from project",
            icon: SharedCardMenuIcons.Trash,
            destructive: true,
            onClick: onRemove,
          },
        ]}
      />
      <div className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg)]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="aspect-[16/10] h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center text-[var(--text-faint)]">
            <IconImage size={22} strokeWidth={1.4} />
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

export { SystemTab };
