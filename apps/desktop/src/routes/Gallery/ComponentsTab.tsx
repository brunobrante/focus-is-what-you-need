import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { FastEditModal, type FastEditModalHandle } from "@/components/screen/FastEditModal";
import { ConfirmActionModal, type ConfirmActionModalHandle } from "@/components/modals/ConfirmActionModal";
import { Modal, ModalBody, ModalHeader } from "@/components/modals/Modal";
import { CardMenuIcons as SharedCardMenuIcons } from "@/components/screen/CardMenu";
import { Snapshot } from "@/components/Snapshot";
import { Badge } from "@/components/ui/badge";
import { scopeOf, sourceScopeIcon, SOURCE_SCOPE_LABEL } from "@/components/component/componentSource";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import { updateComponent } from "@/lib/storage/repos/components.repo";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import {
  IconChevronDown,
  IconDiamond,
  IconFastEdit,
  IconFolder,
  IconLink,
  IconOpenCanvas,
  IconPhone,
  IconPlus,
  IconScreen,
  IconSearch,
  IconUnlink,
} from "@/components/icons";
import { FilterButton, FilterSection } from "@/components/ui/FilterButton";
import { useUnlinkComponent } from "@/application/components/useUnlinkComponent";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { CardMenu } from "./shared/CardMenu";
import { SectionedGrid } from "./shared/SectionedGrid";
import { ViewToggle } from "./shared/ViewToggle";
import type { CmpChipOption, CmpKindFilter, SectionState } from "./types";

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
  const { requestToggle, modal: unlinkModal } = useUnlinkComponent();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [screenFilter, setScreenFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
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
      const matchesSource =
        sourceFilter === "all" || scopeOf(component) === sourceFilter;
      const matchesSection =
        sectionFilter === "all" || (sectionById[component.id] ?? "unassigned") === sectionFilter;
      return matchesKind && matchesQuery && matchesScreen && matchesSource && matchesSection;
    });
  }, [components, filter, query, screenFilter, sourceFilter, sectionById, sectionFilter]);

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
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          sourceOptions={[
            { value: "all", label: "All sources" },
            { value: "workspace", label: "Workspace" },
            { value: "project", label: "Project" },
            { value: "screen", label: "Screen" },
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
                onToggleLinkable={(cmp) => void requestToggle(cmp)}
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
                onToggleLinkable={(cmp) => void requestToggle(cmp)}
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
      {unlinkModal}
    </>
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
  onToggleLinkable,
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
  onToggleLinkable: (component: ComponentRow) => void;
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
        <ComponentSourceBadge component={component} screens={screens} projectId={projectId} />
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
                component.linkable
                  ? {
                      key: "unlink",
                      label: "Unlink",
                      icon: <IconUnlink size={13} strokeWidth={1.7} />,
                      accent: true,
                      onClick: () => onToggleLinkable(component),
                    }
                  : {
                      key: "link",
                      label: "Make linkable",
                      icon: <IconLink size={13} strokeWidth={1.7} />,
                      onClick: () => onToggleLinkable(component),
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
  onToggleLinkable,
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
  onToggleLinkable: (component: ComponentRow) => void;
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
                onClick={(e) => { e.stopPropagation(); onToggleLinkable(component); setMoreOpen(false); }}
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-[12px] transition-colors hover:bg-[var(--surface-hover)]"
                style={component.linkable ? { color: "#8638E5" } : undefined}
              >
                <span className="grid h-4 w-4 place-items-center">
                  {component.linkable ? <IconUnlink size={13} strokeWidth={1.7} /> : <IconLink size={13} strokeWidth={1.7} />}
                </span>
                <span style={component.linkable ? undefined : { color: "var(--text-muted)" }}>
                  {component.linkable ? "Unlink" : "Make linkable"}
                </span>
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
        <ComponentSourceBadge component={component} screens={screens} projectId={projectId} inline />
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

/**
 * Source indicator pinned to a component card. Shows the owner-scope icon
 * (screen / project / workspace / nested) and, on hover, a small menu listing
 * where the component lives: the owner ("Main") plus any linked screens. The
 * menu is structured so project/workspace link rows can be added once the link
 * graph exists.
 */
function ComponentSourceBadge({
  component,
  screens,
  projectId,
  inline = false,
}: {
  component: ComponentRow;
  screens: ScreenRow[];
  projectId: string;
  inline?: boolean;
}) {
  const navigate = useNavigate();
  const scope = scopeOf(component);
  const mainScreen = component.screenId
    ? screens.find((s) => s.id === component.screenId) ?? null
    : null;
  const linkedScreens = screens.filter(
    (s) => component.assignedScreenIds.includes(s.id) && s.id !== component.screenId,
  );
  const mainLabel =
    scope === "screen"
      ? mainScreen?.title ?? "Screen"
      : scope === "workspace"
        ? "Workspace"
        : scope === "nested"
          ? "Parent component"
          : "This project";

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
  useEffect(() => () => cancelClose(), []);

  const openScreen = (event: MouseEvent, screen: ScreenRow) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    navigate(`/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Source: ${SOURCE_SCOPE_LABEL[scope]}`}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onMouseEnter={(event) => {
          cancelClose();
          const rect = event.currentTarget.getBoundingClientRect();
          const width = 200;
          setPosition({
            top: rect.bottom + 6,
            left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width)),
          });
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        className={[
          "z-[2] grid h-[22px] w-[22px] place-items-center rounded-md border border-[var(--border)] bg-[rgba(20,20,20,0.85)] text-[var(--text-muted)] backdrop-blur-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]",
          inline ? "" : "absolute right-2 top-2 cursor-default",
        ].join(" ")}
      >
        {sourceScopeIcon(scope, { size: 11, strokeWidth: 1.7 })}
      </button>
      {open && position ? createPortal(
        <div
          className="fixed z-[120] min-w-[180px] max-w-[260px] rounded-lg border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)]"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <div className="px-2 pb-1 pt-0.5 text-[9.5px] font-medium uppercase tracking-[0.4px] text-[var(--text-faint)]">
            Source
          </div>
          {mainScreen ? (
            <button
              type="button"
              onClick={(event) => openScreen(event, mainScreen)}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[11.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              {sourceScopeIcon(scope, { size: 11, strokeWidth: 1.7, className: "flex-shrink-0" })}
              <span className="min-w-0 flex-1 truncate">{mainLabel}</span>
              <MainTag />
            </button>
          ) : (
            <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium text-[var(--text-muted)]">
              {sourceScopeIcon(scope, { size: 11, strokeWidth: 1.7, className: "flex-shrink-0" })}
              <span className="min-w-0 flex-1 truncate">{mainLabel}</span>
              <MainTag />
            </div>
          )}
          {linkedScreens.length > 0 ? (
            <>
              <div className="mt-1 px-2 pb-1 pt-1 text-[9.5px] font-medium uppercase tracking-[0.4px] text-[var(--text-faint)]">
                Linked screens
              </div>
              {linkedScreens.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={(event) => openScreen(event, screen)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[11.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  <IconScreen size={11} strokeWidth={1.7} className="flex-shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{screen.title}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function MainTag() {
  return (
    <span className="flex-shrink-0 rounded border border-[var(--border)] px-1 py-px text-[8.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
      Main
    </span>
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

function ComponentSearchBar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  screenFilter,
  onScreenFilterChange,
  screenOptions,
  sourceFilter,
  onSourceFilterChange,
  sourceOptions,
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
  sourceFilter: string;
  onSourceFilterChange: (v: string) => void;
  sourceOptions: CmpChipOption[];
  sectionFilter: string;
  onSectionFilterChange: (v: string) => void;
  sectionOptions: CmpChipOption[];
}) {
  const activeCount =
    (typeFilter !== "all" ? 1 : 0) +
    (screenFilter !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
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
        <FilterSection title="Source" options={sourceOptions} value={sourceFilter} onChange={onSourceFilterChange} />
        <FilterSection title="Screen" options={screenOptions} value={screenFilter} onChange={onScreenFilterChange} />
        {sectionOptions.length > 2 && (
          <FilterSection title="Section" options={sectionOptions} value={sectionFilter} onChange={onSectionFilterChange} />
        )}
      </FilterButton>
    </div>
  );
}
