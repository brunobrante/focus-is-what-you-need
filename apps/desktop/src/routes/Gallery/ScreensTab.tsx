import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import { PROJECT_TYPE_DIMS } from "@/lib/data/projects";
import type { ProjectType } from "@/lib/data/types";
import type { ScreenRow } from "@/lib/storage/schema";
import { CardMenuIcons as SharedCardMenuIcons } from "@/components/screen/CardMenu";
import {
  IconChevronDown,
  IconFastEdit,
  IconFolder,
  IconOpenCanvas,
  IconPhone,
  IconPlus,
  IconScreen,
  IconSearch,
} from "@/components/icons";
import { FilterButton, FilterSection } from "@/components/ui/FilterButton";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { CardMenu } from "./shared/CardMenu";
import { SectionedGrid } from "./shared/SectionedGrid";
import type { CmpChipOption, SectionState } from "./types";

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
  onRequestVersion,
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
  onRequestVersion: (screen: ScreenRow) => void;
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
          onRequestVersion={onRequestVersion}
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
  onRequestVersion,
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
  onRequestVersion: (screen: ScreenRow) => void;
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
          onRequestVersion={onRequestVersion}
          onRequestAssignSection={helpers.onRequestAssignSection}
        />
      )}
      renderAddCard={() => <AddScreenCard type={type} onClick={onNewScreen} />}
    />
  );
}

function ScreenCard({
  screen,
  type,
  projectId,
  onRequestDelete,
  onRequestVersion,
  onRequestAssignSection,
}: {
  screen: ScreenRow;
  type: ProjectType;
  projectId: string;
  onRequestDelete: (screen: ScreenRow) => void;
  onRequestVersion: (screen: ScreenRow) => void;
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
                  key: "version",
                  label: "New version",
                  icon: SharedCardMenuIcons.MoveTo,
                  onClick: () => onRequestVersion(screen),
                },
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
