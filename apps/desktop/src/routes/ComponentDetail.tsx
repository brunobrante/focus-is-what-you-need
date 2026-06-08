import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import { IconFastEdit, IconGrid, IconHistory, IconOpenCanvas, IconPlus, IconSearch } from "@/components/icons";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { AddCard } from "@/components/screen/AddCard";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal, type HistoryModalHandle } from "@/components/modals/HistoryModal";
import {
  NewComponentModal,
  type NewComponentModalHandle,
} from "@/components/modals/NewComponentModal";
import {
  ReferencesModal,
  type ReferencesModalHandle,
} from "@/components/modals/ReferencesModal";
import {
  AddReferenceModal,
  type AddReferenceModalHandle,
} from "@/components/modals/AddReferenceModal";
import { deleteComponentTree, getComponent, setActiveVariant, updateComponent } from "@/lib/storage/repos/components.repo";
import {
  createOrAttachReference,
  removeReferenceFromOwner,
} from "@/lib/storage/repos/references.repo";
import { duplicateVariant, getVariant } from "@/lib/storage/repos/variants.repo";
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
import { FastEditModal } from "@/components/screen/FastEditModal";
import type { ComponentKind, ProjectType } from "@/lib/data/types";

type SideTab = "components" | "info" | "versions" | "references";
type CmpKindFilter = "all" | ComponentKind;

export function ComponentDetail() {
  const params = useParams<{ projectId: string; componentId: string }>();
  const navigate = useNavigate();
  const routeProjectId = decodeURIComponent(params.projectId ?? "");
  const componentId = params.componentId ?? "";

  const { data: component } = useComponent(componentId);
  const { data: project } = useProject(component?.projectId ?? null);
  const { data: screens } = useScreens(project?.id);
  const { data: variants } = useVariants(component?.id);
  const { data: activeVariant } = useActiveVariant(component?.id);
  const screenIdAncestor = useScreenAncestor(component);
  const { data: screen } = useScreen(screenIdAncestor);
  const trail = useAncestorTrail(component);
  const { data: children } = useVariantChildren(activeVariant?.id);
  const { data: childVariants } = useActiveVariants(children);
  const { data: projectComponents } = useComponentsByProject(project?.id ?? null);
  const { data: references } = useReferences("component", component?.id ?? null);

  const type: ProjectType = project?.type ?? "desktop";
  const projectId = project?.id ?? component?.projectId ?? routeProjectId;
  const projectName = project?.name ?? "Projeto";
  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");
  const [fastEditOpen, setFastEditOpen] = useState(false);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [pendingChildDelete, setPendingChildDelete] = useState<ComponentRow | null>(null);

  const historyRef = useRef<HistoryModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const addRefModalRef = useRef<AddReferenceModalHandle>(null);

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

  const openNewChild = () => {
    if (!project || !activeVariant) return;
    newComponentRef.current?.open({
      kind: "variant",
      variantId: activeVariant.id,
    });
  };

  const canvasHref = activeVariant
    ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${activeVariant.id}`
    : `/canvas?project=${encodeURIComponent(projectId)}&type=${type}`;

  const screenHref = screen
    ? `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`
    : `/project/${encodeURIComponent(projectId)}`;

  const addVariant = async () => {
    if (!component || !activeVariant || creatingVariant) return;
    setCreatingVariant(true);
    try {
      const created = await duplicateVariant({
        componentId: component.id,
        sourceVariantId: activeVariant.id,
        name: `Variant ${variants.length + 1}`,
      });
      await setActiveVariant(component.id, created.id);
    } finally {
      setCreatingVariant(false);
    }
  };

  const removeLinkedReference = (referenceId: string) => {
    if (!component) return;
    void removeReferenceFromOwner(referenceId, "component", component.id);
  };


  if (!component) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[13px] text-[var(--text-muted)]">
        Component not found.
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <Breadcrumb
          projectId={projectId}
          projectName={projectName}
          trail={trail}
          screen={screen}
          current={component}
          type={type}
        />
        <div className="flex items-center gap-2">
          <Link to={canvasHref} className="btn btn-ghost">
            <IconOpenCanvas size={14} strokeWidth={1.6} />
            Edit in canvas
          </Link>
        </div>
      </header>

      <div className="flex shrink-0 items-end justify-between gap-4 px-7 pb-[18px] pt-[22px]">
        <div>
          <EditableTitle
            value={component.name}
            label="Edit component name"
            onSave={(name) => {
              void updateComponent(component.id, { name });
            }}
          />
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            {component.kind ? <span>{component.kind}</span> : <span>Componente</span>}
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{variantCount} {variantCount === 1 ? "variante" : "variantes"}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{children.length} {children.length === 1 ? "child component" : "child components"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="View history"
            onClick={() => historyRef.current?.open()}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconHistory size={13} strokeWidth={1.7} />
            History
          </button>
          <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {children.length} filhos
          </span>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 border-t border-[var(--border)]"
        style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}
      >
        <PreviewShell
          onFastEdit={() => setFastEditOpen(true)}
          canvasHref={canvasHref}
        >
          <div className="relative flex h-full max-h-full min-h-0 w-full max-w-full min-w-0 items-center justify-center">
            {activeVariant ? (
              <Snapshot
                kind="component"
                ownerType="variant"
                ownerId={activeVariant.id}
                seedKey={activeVariant.seedKey}
                type={type}
                emptyMode="preview"
                display="natural"
              />
            ) : null}
          </div>
        </PreviewShell>

        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-3.5 pt-[18px]">
            <div>
              <h2 className="m-0 mb-1 text-[14px] font-semibold tracking-[0.1px]">
                {sideTab === "components"
                  ? "Sub Components"
                  : sideTab === "info"
                    ? "Information"
                  : sideTab === "versions"
                    ? "Component Versions"
                    : "References"}
              </h2>
              <p className="m-0 text-[12px] text-[var(--text-muted)]">
                {sideTab === "components"
                  ? "Everything inside this variant. Click to open."
                  : sideTab === "info"
                    ? "Editable description and metadata for this component."
                  : sideTab === "versions"
                    ? "Variants of this component."
                    : "Inspirations and support materials for this component."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sideTab !== "info" ? <SideSearch query={query} onChange={setQuery} /> : null}
              {sideTab === "components" ? (
                <SideKindFilter value={filter} onChange={setFilter} />
              ) : null}
            </div>
          </div>
          <div role="tablist" className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-3.5">
            {([
              { id: "components", label: "Sub Components", count: children.length },
              { id: "info", label: "Information", count: 0 },
              { id: "versions", label: "Variants", count: variantCount },
              { id: "references", label: "References", count: references.length ?? 0 },
            ] as Array<{ id: SideTab; label: string; count: number }>).map((t) => {
              const active = sideTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setSideTab(t.id)}
                  className={[
                    "relative cursor-pointer border-0 bg-transparent px-3.5 py-3 text-[12px] font-medium",
                    active ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
                  ].join(" ")}
                >
                  {t.label}
                  {t.id !== "info" ? (
                    <span
                      className="ml-1.5 text-[10.5px] text-[var(--text-faint)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {t.count}
                    </span>
                  ) : null}
                  {active ? (
                    <span className="absolute -bottom-px left-3.5 right-3.5 h-0.5 rounded-[2px] bg-[var(--text)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            className="grid min-h-0 flex-1 content-start gap-x-4 gap-y-[22px] overflow-y-auto px-6 pb-8 pt-[22px]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {sideTab === "components" && (
              <>
                {filteredChildren.map((c) => (
                  <ChildCard
                    key={c.id}
                    component={c}
                    variant={childVariants.get(c.id) ?? null}
                    projectId={projectId}
                    type={type}
                    onRequestDelete={setPendingChildDelete}
                    onOpenCanvas={(variantId) =>
                      navigate(
                        `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${variantId}`,
                      )
                    }
                  />
                ))}
                {filteredChildren.length === 0 && (
                  <SideEmptyState
                    title="No sub component found"
                    description="Children of this component will appear here when created."
                    actionLabel="New component"
                    onAction={children.length === 0 ? openNewChild : undefined}
                  />
                )}
                {filteredChildren.length > 0 ? (
                  <AddCard label="New component" onClick={openNewChild} />
                ) : null}
              </>
            )}
            {sideTab === "info" && (
              <ComponentInfoPanel component={component} />
            )}
            {sideTab === "versions" && (
              <>
                {variants.length > 1 &&
                  filteredVariants.map((v) => (
                    <VariantSideCard
                      key={v.id}
                      variant={v}
                      active={v.id === activeVariant?.id}
                      type={type}
                      onSelect={() => {
                        if (component) void setActiveVariant(component.id, v.id);
                      }}
                    />
                  ))}
                {variants.length <= 1 && (
                  <div className="col-span-full px-3 py-14 text-center text-[13px] text-[var(--text-faint)]">
                    No versions yet. Use “New variant” to save a copy of this component.
                  </div>
                )}
                <AddCard label="New variant" onClick={() => void addVariant()} />
              </>
            )}
            {sideTab === "references" && (
              <SideReferencesTab
                references={filteredReferences}
                query={query}
                onAdd={() => addRefModalRef.current?.open()}
                onOpen={(i) => referencesRef.current?.open(i)}
                onRemove={(reference) => removeLinkedReference(reference.id)}
              />
            )}
          </div>
        </aside>
      </div>

      <HistoryModal
        ref={historyRef}
        title="Component history"
        subtitle={`Changes made to "${component.name}" over time.`}
        commits={DEFAULT_HISTORY}
      />
      <ReferencesModal
        ref={referencesRef}
        references={filteredReferences}
        onRemove={(reference) => removeLinkedReference(reference.id)}
      />
      <FastEditModal
        mode="component"
        open={fastEditOpen}
        onClose={() => setFastEditOpen(false)}
        component={component}
        variant={activeVariant}
        type={type}
        canvasHref={canvasHref}
      />
      <NewComponentModal
        ref={newComponentRef}
        projectId={project?.id ?? null}
        screens={screens}
        onCreated={(r) => {
          navigate(`/project/${encodeURIComponent(r.component.projectId)}/c/${r.component.id}`);
        }}
      />
      <ConfirmActionModal
        open={Boolean(pendingChildDelete)}
        title="Delete component"
        message={
          pendingChildDelete
            ? `The component "${pendingChildDelete.name}" will be removed along with subcomponents and variants.`
            : ""
        }
        onClose={() => setPendingChildDelete(null)}
        onConfirm={async () => {
          if (!pendingChildDelete) return;
          await deleteComponentTree(pendingChildDelete.id);
          setPendingChildDelete(null);
        }}
      />
      <AddReferenceModal
        ref={addRefModalRef}
        projectId={project?.id ?? null}
        screens={screens}
        components={projectComponents}
        existingReferences={references}
        defaultComponentId={component.id}
        onAdd={async (input) => {
          await createOrAttachReference(input);
        }}
      />
    </div>
  );
}

function SideSearch({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-[220px]">
      <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
      <input
        type="search"
        placeholder="Search..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-[30px] pr-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
      />
    </div>
  );
}

function EditableTitle({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    setDraft(value);
    if (next && next !== value) onSave(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setEditing(false);
            setDraft(value);
          }
        }}
        className="mb-1.5 h-[32px] min-w-[260px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group/title mb-1.5 flex cursor-text items-center gap-2 border-0 bg-transparent p-0 text-left text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]"
    >
      <span>{value}</span>
      <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--border)] text-[var(--text-faint)] opacity-0 transition-opacity group-hover/title:opacity-100">
        <IconFastEdit size={12} strokeWidth={1.7} />
      </span>
    </button>
  );
}

function SideKindFilter({
  value,
  onChange,
}: {
  value: CmpKindFilter;
  onChange: (v: CmpKindFilter) => void;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Filter by type"
        value={value}
        onChange={(e) => onChange(e.target.value as CmpKindFilter)}
        className="h-[30px] cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-2.5 pr-[26px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
        style={{ appearance: "none", WebkitAppearance: "none" as never }}
      >
        <option value="all">Todos</option>
        <option value="Layout">Layout</option>
        <option value="Atom">Atom</option>
        <option value="Section">Section</option>
        <option value="Pattern">Pattern</option>
        <option value="Overlay">Overlay</option>
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-[6px] w-[6px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
      />
    </div>
  );
}

function VariantSideCard({
  variant,
  active,
  type,
  onSelect,
}: {
  variant: VariantRow;
  active: boolean;
  type: ProjectType;
  onSelect: () => void;
}) {
  return (
    <div className="group flex flex-col gap-2.5 text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5">
      <div
        className={[
          "relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border bg-[var(--bg)] p-3 transition-colors",
          active ? "border-[var(--text-muted)]" : "border-[var(--border)] group-hover:border-[var(--border-strong)]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Select variant ${variant.name}`}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
        />
        <div className="h-full w-full overflow-hidden">
          <Snapshot
            kind="component"
            ownerType="variant"
            ownerId={variant.id}
            seedKey={variant.seedKey}
            type={type}
            display="card"
          />
        </div>
        <CardMenu
          buttons={[
            { key: "select", label: "Select variant", icon: CardMenuIcons.Check, onClick: onSelect },
          ]}
        />
      </div>
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
          {variant.name}
        </span>
        {active ? (
          <span
            className="flex-shrink-0 rounded border px-1.5 py-px text-[9.5px] uppercase tracking-[0.5px]"
            style={{
              color: "#F2F2F2",
              borderColor: "#3FB950",
              background: "rgba(63,185,80,0.08)",
            }}
          >
            Active
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ComponentInfoPanel({ component }: { component: ComponentRow }) {
  const [description, setDescription] = useState(component.description ?? "");
  const [category, setCategory] = useState(component.category ?? "");
  const [kind, setKind] = useState<ComponentKind | "">(component.kind ?? "");

  useEffect(() => {
    setDescription(component.description ?? "");
    setCategory(component.category ?? "");
    setKind(component.kind ?? "");
  }, [component.id, component.description, component.category, component.kind]);

  const save = (patch: Parameters<typeof updateComponent>[1]) => {
    void updateComponent(component.id, patch);
  };

  return (
    <div className="col-span-full flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--text-faint)]">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => save({ description: description.trim() || null })}
          placeholder="Describe this component role..."
          className="min-h-[96px] resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[var(--text-faint)]">Tipo</span>
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as ComponentKind | "";
              setKind(next);
              save({ kind: next || null });
            }}
            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
          >
            <option value="">No type</option>
            <option value="Layout">Layout</option>
            <option value="Atom">Atom</option>
            <option value="Section">Section</option>
            <option value="Pattern">Pattern</option>
            <option value="Overlay">Overlay</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[var(--text-faint)]">Categoria</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            onBlur={() => save({ category: category.trim() || null })}
            placeholder="Ex.: Navigation, Checkout"
            className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
          />
        </label>
      </div>

      <div className="flex flex-col border-t border-[var(--border)] pt-4">
        <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
          <span className="text-[11.5px] text-[var(--text-faint)]">ID</span>
          <span className="min-w-0 truncate font-mono text-[10.5px] text-[var(--text-muted)]">{component.id}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
          <span className="text-[11.5px] text-[var(--text-faint)]">Variants</span>
          <span className="text-[11.5px] text-[var(--text-muted)]">Managed in the Variants tab</span>
        </div>
      </div>
    </div>
  );
}

function InfoMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="min-w-0 truncate font-medium text-[var(--text)]">{value}</span>
    </div>
  );
}

function SideEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="col-span-full grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[var(--border)] px-6 py-10 text-center">
      <div className="max-w-[300px]">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)]">
          <IconGrid size={18} strokeWidth={1.6} />
        </div>
        <div className="text-[13px] font-medium text-[var(--text)]">{title}</div>
        <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-[var(--text-muted)]">
          {description}
        </p>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mx-auto mt-5 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-strong)] bg-transparent px-3.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <IconPlus size={13} strokeWidth={1.8} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Breadcrumb({
  projectId,
  projectName,
  trail,
  screen,
  current,
  type,
}: {
  projectId: string;
  projectName: string;
  trail: ComponentRow[];
  screen: ScreenRow | null;
  current: ComponentRow;
  type: ProjectType;
}) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
      <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">Projects</Link>
      <span className="text-[var(--text-faint)]">/</span>
      <Link to={`/project/${encodeURIComponent(projectId)}`} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
        {projectName}
      </Link>
      {screen ? (
        <>
          <span className="text-[var(--text-faint)]">/</span>
          <Link
            to={`/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`}
            className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
          >
            {screen.title}
          </Link>
        </>
      ) : null}
      {trail.map((c) => (
        <span key={c.id} className="flex items-center gap-2.5">
          <span className="text-[var(--text-faint)]">/</span>
          <Link
            to={`/project/${encodeURIComponent(projectId)}/c/${c.id}`}
            className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
          >
            {c.name}
          </Link>
        </span>
      ))}
      <span className="text-[var(--text-faint)]">/</span>
      <span className="text-[13px] font-medium text-[var(--text)]">{current.name}</span>
      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
        {type}
      </span>
    </div>
  );
}

function VariantStrip({
  variants,
  activeId,
}: {
  variants: VariantRow[];
  activeId: string | null;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      {variants.map((v) => (
        <span
          key={v.id}
          className={[
            "rounded border px-2 py-0.5 text-[11px] uppercase tracking-[0.4px]",
            v.id === activeId
              ? "border-[var(--text)] text-[var(--text)]"
              : "border-[var(--border)] text-[var(--text-faint)]",
          ].join(" ")}
        >
          {v.name}
        </span>
      ))}
    </div>
  );
}

function ChildCard({
  component,
  variant,
  projectId,
  type,
  onRequestDelete,
  onOpenCanvas,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  projectId: string;
  type: ProjectType;
  onRequestDelete: (component: ComponentRow) => void;
  onOpenCanvas: (variantId: string) => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/c/${component.id}`;
  return (
    <Link
      to={href}
      className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5"
    >
      <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
        {variant ? (
          <Snapshot
            kind="component"
            ownerType="variant"
            ownerId={variant.id}
            seedKey={variant.seedKey}
            type={type}
            display="card"
          />
        ) : null}
        <CardMenu
          buttons={[
            { key: "open", label: "Open component", icon: CardMenuIcons.Open, onClick: () => navigate(href) },
            {
              key: "canvas",
              label: "Open in canvas",
              icon: CardMenuIcons.Canvas,
              onClick: () => {
                if (variant) onOpenCanvas(variant.id);
              },
            },
            {
              key: "more",
              label: "Mais",
              icon: CardMenuIcons.More,
              menuItems: [
                {
                  key: "delete",
                  label: "Delete component",
                  icon: CardMenuIcons.Trash,
                  destructive: true,
                  onClick: () => onRequestDelete(component),
                },
              ],
            },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
            {component.name}
          </span>
          {component.kind ? (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
              {component.kind}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
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
    current = await getComponent(variant.componentId);
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
    const parent = await getComponent(variant.componentId);
    if (!parent) break;
    trail.unshift(parent);
    parentVariantId = parent.parentVariantId;
  }
  return trail;
}
