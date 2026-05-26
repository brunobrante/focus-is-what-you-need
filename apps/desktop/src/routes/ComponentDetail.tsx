import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { AddCard } from "@/components/screen/AddCard";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal, type HistoryModalHandle } from "@/components/modals/HistoryModal";
import {
  CompareVersionsModal,
  type CompareVersionsModalHandle,
} from "@/components/modals/CompareVersionsModal";
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
import { deleteComponentTree, getComponent, updateComponent } from "@/lib/storage/repos/components.repo";
import { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { getVariant } from "@/lib/storage/repos/variants.repo";
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
import {
  DEFAULT_HISTORY,
  DEFAULT_SCREEN_VERSIONS,
  type ScreenVersion,
} from "@/lib/data/screenVersions";
import { getCanvasMockForTemplate } from "@/components/mocks/data/canvasMocks";
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
  const canUseFactoryMocks = project?.source === "mock";
  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");
  const [fastEditOpen, setFastEditOpen] = useState(false);
  const [versions, setVersions] = useState<ScreenVersion[]>(DEFAULT_SCREEN_VERSIONS);
  const [activeVersionId, setActiveVersionId] = useState(versions[0]?.id ?? "v3");
  const [pendingChildDelete, setPendingChildDelete] = useState<ComponentRow | null>(null);

  const historyRef = useRef<HistoryModalHandle>(null);
  const compareRef = useRef<CompareVersionsModalHandle>(null);
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

  const filteredVersions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return versions.filter((v) => !q || v.title.toLowerCase().includes(q));
  }, [query, versions]);

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

  const addVersion = () => {
    const n = versions.length + 1;
    const tpls: ScreenVersion["tpl"][] = ["hero", "detail", "form"];
    const newV: ScreenVersion = {
      id: `cv${n}`,
      title: `v${n} · nova`,
      tpl: tpls[n % tpls.length],
      updated: "agora",
      author: "Você",
      initials: "VC",
    };
    setVersions((prev) => [newV, ...prev]);
    setActiveVersionId(newV.id);
  };


  if (!component) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[13px] text-[var(--text-muted)]">
        Componente não encontrado.
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M3 9h18" />
            </svg>
            Editar no canvas
          </Link>
        </div>
      </header>

      <div className="flex shrink-0 items-end justify-between gap-4 px-7 pb-[18px] pt-[22px]">
        <div>
          <EditableTitle
            value={component.name}
            label="Editar nome do componente"
            onSave={(name) => {
              void updateComponent(component.id, { name });
            }}
          />
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            {component.kind ? <span>{component.kind}</span> : <span>Componente</span>}
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{variants.length} {variants.length === 1 ? "variante" : "variantes"}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{children.length} {children.length === 1 ? "componente filho" : "componentes filhos"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Ver histórico"
            onClick={() => historyRef.current?.open()}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
              <path d="M12 7v5l3 2" />
            </svg>
            Histórico
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
                    ? "Informações"
                  : sideTab === "versions"
                    ? "Versões do componente"
                    : "Referências"}
              </h2>
              <p className="m-0 text-[12px] text-[var(--text-muted)]">
                {sideTab === "components"
                  ? "Tudo que está dentro desta variante. Clique para abrir."
                  : sideTab === "info"
                    ? "Descrição e metadados editáveis deste componente."
                  : sideTab === "versions"
                    ? "Histórico de versões deste componente."
                    : "Inspirações e materiais de apoio para este componente."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sideTab !== "info" ? <SideSearch query={query} onChange={setQuery} /> : null}
              {sideTab === "components" ? (
                <SideKindFilter value={filter} onChange={setFilter} />
              ) : null}
              {sideTab === "versions" ? (
                <button
                  type="button"
                  aria-label="Comparar versões"
                  onClick={() => compareRef.current?.open()}
                  className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="8" height="14" rx="1" />
                    <rect x="13" y="5" width="8" height="14" rx="1" />
                  </svg>
                  Comparar
                </button>
              ) : null}
            </div>
          </div>
          <div role="tablist" className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-3.5">
            {([
              { id: "components", label: "Sub Components", count: children.length },
              { id: "info", label: "Informações", count: 0 },
              { id: "versions", label: "Versões", count: versions.length },
              { id: "references", label: "Referências", count: references.length ?? 0 },
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
                    title="Nenhum sub component encontrado"
                    description="Os filhos deste componente aparecerão aqui quando forem criados."
                    actionLabel="Novo componente"
                    onAction={children.length === 0 ? openNewChild : undefined}
                  />
                )}
                {filteredChildren.length > 0 ? (
                  <AddCard label="Novo componente" onClick={openNewChild} />
                ) : null}
              </>
            )}
            {sideTab === "info" && (
              <ComponentInfoPanel component={component} />
            )}
            {sideTab === "versions" && (
              <>
                {filteredVersions.map((v) => (
                  <VersionSideCard
                    key={v.id}
                    version={v}
                    active={v.id === activeVersionId}
                    type={type}
                    allowMock={canUseFactoryMocks}
                    onSelect={() => setActiveVersionId(v.id)}
                  />
                ))}
                {filteredVersions.length === 0 && (
                  <div className="col-span-full px-3 py-14 text-center text-[13px] text-[var(--text-faint)]">
                    Nenhuma versão encontrada.
                  </div>
                )}
                <AddCard label="Nova versão" onClick={addVersion} />
              </>
            )}
            {sideTab === "references" && (
              <SideReferencesTab
                references={filteredReferences}
                query={query}
                onAdd={() => addRefModalRef.current?.open()}
                onOpen={(i) => referencesRef.current?.open(i)}
              />
            )}
          </div>
        </aside>
      </div>

      <HistoryModal
        ref={historyRef}
        title="Histórico do componente"
        subtitle={`Alterações feitas em "${component.name}" ao longo do tempo.`}
        commits={DEFAULT_HISTORY}
      />
      <CompareVersionsModal
        ref={compareRef}
        versions={versions}
        type={type}
        allowMock={canUseFactoryMocks}
        onOpenInCanvas={(ids) => {
          if (activeVariant) {
            navigate(
              `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${activeVariant.id}&compare=${ids.join(",")}`,
            );
          }
        }}
      />
      <ReferencesModal ref={referencesRef} references={filteredReferences} />
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
        title="Excluir componente"
        message={
          pendingChildDelete
            ? `O componente "${pendingChildDelete.name}" será removido junto com subcomponentes e variantes.`
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
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        placeholder="Buscar..."
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
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
        aria-label="Filtrar por tipo"
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

function VersionSideCard({
  version,
  active,
  type,
  allowMock,
  onSelect,
}: {
  version: ScreenVersion;
  active: boolean;
  type: ProjectType;
  allowMock: boolean;
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
          aria-label={`Selecionar versão ${version.title}`}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
        />
        <div className="h-full w-full overflow-hidden">
          <VersionPreviewImage tpl={version.tpl} type={type} allowMock={allowMock} />
        </div>
        <CardMenu
          buttons={[
            { key: "select", label: "Selecionar versão", icon: CardMenuIcons.Check, onClick: onSelect },
            { key: "duplicate", label: "Duplicar", icon: CardMenuIcons.Duplicate },
            { key: "more", label: "Mais", icon: CardMenuIcons.More },
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
            {version.title}
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
              Atual
            </span>
          ) : (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.5px] text-[var(--text-faint)]">
              {version.updated}
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--text-muted)]">
          <span className="rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {version.author}
          </span>
        </span>
      </div>
    </div>
  );
}

function VersionPreviewImage({
  tpl,
  type,
  allowMock,
}: {
  tpl: ScreenVersion["tpl"];
  type: ProjectType;
  allowMock: boolean;
}) {
  if (!allowMock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Componente vazio
      </div>
    );
  }

  const mock = getCanvasMockForTemplate(tpl, type);
  if (!mock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Componente vazio
      </div>
    );
  }
  return (
    <img
      src={mock.snapshot}
      alt=""
      className="block h-full w-full object-cover"
      draggable={false}
    />
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
        <span className="text-[11px] text-[var(--text-faint)]">Descrição</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => save({ description: description.trim() || null })}
          placeholder="Descreva o papel deste componente..."
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
            <option value="">Sem tipo</option>
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
          <span className="text-[11.5px] text-[var(--text-faint)]">Variantes</span>
          <span className="text-[11.5px] text-[var(--text-muted)]">Gerenciadas na tab Versões</span>
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
    <div className="col-span-full grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg)] px-6 py-10 text-center">
      <div className="max-w-[300px]">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-faint)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="7" height="7" rx="1" />
            <rect x="13" y="4" width="7" height="7" rx="1" />
            <rect x="4" y="13" width="7" height="7" rx="1" />
            <rect x="13" y="13" width="7" height="7" rx="1" />
          </svg>
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
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
      <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">Projetos</Link>
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
            { key: "open", label: "Abrir componente", icon: CardMenuIcons.Open, onClick: () => navigate(href) },
            {
              key: "canvas",
              label: "Abrir no canvas",
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
                  label: "Excluir componente",
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
