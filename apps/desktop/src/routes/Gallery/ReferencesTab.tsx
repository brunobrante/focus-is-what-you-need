import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AddReferenceModal,
  type AddReferenceModalHandle,
} from "@/components/modals/AddReferenceModal";
import {
  ReferencesModal,
  type ReferencesModalHandle,
} from "@/components/modals/ReferencesModal";
import {
  CardMenuIcons as SharedCardMenuIcons,
  CardMoreMenu,
} from "@/components/screen/CardMenu";
import {
  createOrAttachReference,
  removeReferenceFromProject,
} from "@/lib/storage/repos/references.repo";
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import type {
  ComponentRow,
  ProjectRow,
  ReferenceRow,
  ScreenRow,
} from "@/lib/storage/schema";
import { IconImage, IconPlus, IconSearch } from "@/components/icons";
import { FilterButton, FilterSection } from "@/components/ui/FilterButton";
import { EmptyMessage } from "@/components/screen/EmptyMessage";
import { ReferenceCard } from "@/components/references/ReferenceCard";
import { ViewToggle } from "./shared/ViewToggle";
import type { CmpChipOption } from "./types";

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
