import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { AddCard } from "@/components/screen/AddCard";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal, type HistoryModalHandle } from "@/components/modals/HistoryModal";
import {
  CompareVersionsModal,
  type CompareVersionsModalHandle,
} from "@/components/modals/CompareVersionsModal";
import {
  ReferencesModal,
  type ReferencesModalHandle,
} from "@/components/modals/ReferencesModal";
import {
  useComponent,
  useProject,
  useScreen,
  useScreenChildren,
} from "@/lib/storage/hooks";
import type { ComponentRow } from "@/lib/storage/schema";
import {
  DEFAULT_HISTORY,
  DEFAULT_SCREEN_VERSIONS,
} from "@/lib/data/screenVersions";
import { PROJECT_TYPE_DIMS } from "@/lib/data/projects";
import type {
  ComponentKind,
  ComponentVariant,
  ProjectType,
} from "@/lib/data/types";

type ElementKind = "Atom" | "Section" | "Pattern" | "Overlay" | "Layout" | "State" | "Variant";

type ElementVariant =
  | "elogo"
  | "elink"
  | "ebtn-p"
  | "ebtn-s"
  | "ebtn-g"
  | "ebtn-i"
  | "esearch"
  | "etext-l"
  | "etext-m"
  | "etext-s"
  | "emedia"
  | "efield"
  | "estate-err"
  | "ecard"
  | "ethumb"
  | "etag"
  | "estate-active"
  | "esfooter"
  | "ebackdrop"
  | "ecol"
  | "esocial";

type Element = { id: string; title: string; kind: ElementKind; variant: ElementVariant };

const ELEMENTS_BY_VARIANT: Partial<Record<ComponentVariant, Element[]>> = {
  cheader: [
    { id: "logo", title: "Logo", kind: "Atom", variant: "elogo" },
    { id: "navlink", title: "Nav link", kind: "Atom", variant: "elink" },
    { id: "ctabtn", title: "CTA Button", kind: "Atom", variant: "ebtn-p" },
    { id: "search", title: "Search input", kind: "Atom", variant: "esearch" },
  ],
  chero: [
    { id: "title", title: "Title", kind: "Atom", variant: "etext-l" },
    { id: "sub", title: "Subtítulo", kind: "Atom", variant: "etext-m" },
    { id: "cta", title: "Botão CTA", kind: "Atom", variant: "ebtn-p" },
    { id: "media", title: "Mídia", kind: "Pattern", variant: "emedia" },
  ],
  cbtn: [
    { id: "primary", title: "Primary", kind: "Variant", variant: "ebtn-p" },
    { id: "secondary", title: "Secondary", kind: "Variant", variant: "ebtn-s" },
    { id: "ghost", title: "Ghost", kind: "Variant", variant: "ebtn-g" },
    { id: "icon", title: "Icon", kind: "Variant", variant: "ebtn-i" },
  ],
  cinput: [
    { id: "label", title: "Label", kind: "Atom", variant: "etext-s" },
    { id: "field", title: "Field", kind: "Atom", variant: "efield" },
    { id: "helper", title: "Helper text", kind: "Atom", variant: "etext-s" },
    { id: "error", title: "Error state", kind: "State", variant: "estate-err" },
  ],
  ccards: [
    { id: "card", title: "Card", kind: "Pattern", variant: "ecard" },
    { id: "thumb", title: "Thumbnail", kind: "Atom", variant: "ethumb" },
    { id: "title", title: "Card title", kind: "Atom", variant: "etext-m" },
    { id: "tag", title: "Tag", kind: "Atom", variant: "etag" },
  ],
  csidebar: [
    { id: "logo", title: "Logo", kind: "Atom", variant: "elogo" },
    { id: "navitem", title: "Nav item", kind: "Atom", variant: "elink" },
    { id: "active", title: "Item ativo", kind: "State", variant: "estate-active" },
    { id: "footer", title: "Sidebar footer", kind: "Section", variant: "esfooter" },
  ],
  cmodal: [
    { id: "title", title: "Title", kind: "Atom", variant: "etext-l" },
    { id: "body", title: "Body", kind: "Atom", variant: "etext-m" },
    { id: "cta", title: "CTA", kind: "Atom", variant: "ebtn-p" },
    { id: "close", title: "Close button", kind: "Atom", variant: "ebtn-i" },
    { id: "overlay", title: "Backdrop", kind: "Layout", variant: "ebackdrop" },
  ],
  cfooter: [
    { id: "col", title: "Coluna", kind: "Pattern", variant: "ecol" },
    { id: "title", title: "Título coluna", kind: "Atom", variant: "etext-s" },
    { id: "link", title: "Link", kind: "Atom", variant: "elink" },
    { id: "social", title: "Social icons", kind: "Pattern", variant: "esocial" },
  ],
};

type Filter = "all" | ElementKind;

export function Component() {
  const params = useParams<{
    projectId: string;
    screenId: string;
    componentId: string;
  }>();
  const navigate = useNavigate();
  const projectId = decodeURIComponent(params.projectId ?? "");
  const screenId = decodeURIComponent(params.screenId ?? "");
  const componentId = decodeURIComponent(params.componentId ?? "");
  const { data: project } = useProject(projectId);
  const { data: screen } = useScreen(screenId);
  const { data: scopedComponents } = useScreenChildren(project?.id, screen?.id);
  const { data: componentById } = useComponent(componentId);
  const type: ProjectType = project?.type ?? "desktop";
  const projectName = project?.name ?? "Projeto";
  const screenName = screen?.title ?? "Tela";
  const componentName = componentById?.name ?? "Componente";

  const meta: ComponentRow | null = useMemo(() => {
    const exact = scopedComponents.find((c) => c.id === componentId);
    return exact ?? scopedComponents[0] ?? null;
  }, [componentId, scopedComponents]);

  const initialElements = ELEMENTS_BY_VARIANT.cheader!;
  const [elements, setElements] = useState<Element[]>(initialElements);

  const [versions] = useState(() =>
    DEFAULT_SCREEN_VERSIONS.map((v) => ({ ...v, title: v.title.replace("·", `· ${componentName}`) })),
  );
  const [activeVersionId, setActiveVersionId] = useState(versions[0]?.id ?? "v3");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingElementDelete, setPendingElementDelete] = useState<Element | null>(null);
  const elementKinds = useMemo(
    () => Array.from(new Set(elements.map((e) => e.kind))),
    [elements],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return elements.filter((e) => {
      const matchQ = !q || e.title.toLowerCase().includes(q);
      const matchF = filter === "all" || e.kind === filter;
      return matchQ && matchF;
    });
  }, [elements, query, filter]);

  const historyRef = useRef<HistoryModalHandle>(null);
  const compareRef = useRef<CompareVersionsModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);

  const componentsInScope = scopedComponents.length > 0 ? scopedComponents : meta ? [meta] : [];
  const componentIdx = componentsInScope.findIndex((c) => c.id === componentId);
  const hasMultipleComponents = componentsInScope.length > 1;
  const prevComponent =
    hasMultipleComponents && componentIdx >= 0
      ? componentsInScope[(componentIdx - 1 + componentsInScope.length) % componentsInScope.length] ?? null
      : null;
  const nextComponent =
    hasMultipleComponents && componentIdx >= 0
      ? componentsInScope[(componentIdx + 1) % componentsInScope.length] ?? null
      : null;
  const buildComponentHref = (id: string) =>
    `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screenId)}/component/${encodeURIComponent(id)}`;
  const screenHref = `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screenId)}`;
  const canvasHref = meta?.activeVariantId
    ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${meta.activeVariantId}`
    : screen?.id
      ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&screen=${screen.id}`
      : `/canvas?project=${encodeURIComponent(projectId)}&type=${type}`;

  const addElement = (insertAt?: number) => {
    const n = elements.length + 1;
    const newEl: Element = {
      id: `el-${n}-${Date.now()}`,
      title: `Elemento ${n}`,
      kind: "Atom",
      variant: "etext-m",
    };
    setElements((prev) => {
      if (insertAt === undefined) return [...prev, newEl];
      const next = [...prev];
      next.splice(insertAt, 0, newEl);
      return next;
    });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          <Link to={screenHref} aria-label="Voltar" className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            Projetos
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to={`/project/${encodeURIComponent(projectId)}`} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {projectName}
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to={screenHref} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {screenName}
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="text-[13px] font-medium text-[var(--text)]">{componentName}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link to={canvasHref} className="btn btn-ghost">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M3 9h18" />
            </svg>
            Editar no canvas
          </Link>
          <button type="button" onClick={() => addElement()} className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nova variação
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-end justify-between gap-4 px-7 pb-[18px] pt-[22px]">
        <div>
          <h1 className="m-0 mb-1.5 text-[22px] font-semibold tracking-[-0.3px]">{componentName}</h1>
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            <span>{kindLabel(meta?.kind ?? "Atom")}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{meta?.screenId == null ? "Global" : "Tela"}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>usado em 1 tela</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>atualizado há 1 hora</span>
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
          <button
            type="button"
            aria-label="Ver referências"
            onClick={() => referencesRef.current?.open()}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12h6M12 9v6" />
            </svg>
            Referências
          </button>
          <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {elements.length} {elements.length === 1 ? "elemento" : "elementos"}
          </span>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 border-t border-[var(--border)]"
        style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}
      >
        <PreviewShell
          canvasHref={canvasHref}
          prev={prevComponent ? {
            name: prevComponent.name,
            details: [`${componentsInScope.length} componentes`, PROJECT_TYPE_DIMS[type]],
            href: buildComponentHref(prevComponent.id),
          } : undefined}
          next={nextComponent ? {
            name: nextComponent.name,
            details: [`${componentsInScope.length} componentes`, PROJECT_TYPE_DIMS[type]],
            href: buildComponentHref(nextComponent.id),
          } : undefined}
        >
          <div
            className="flex w-full flex-col overflow-hidden rounded-[10px] border border-[var(--border-strong)] bg-[var(--bg)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3)]"
            style={frameStyle(type)}
          >
            <div className="grid h-full place-items-center p-7">
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-5 text-center">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-strong)] text-[var(--text-faint)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M3 9h18" />
                  </svg>
                </span>
                <span className="text-[13px] font-medium text-[var(--text-muted)]">
                  Componente vazio
                </span>
              </div>
            </div>
          </div>
        </PreviewShell>

        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-3.5 pt-[18px]">
            <div>
              <h2 className="m-0 mb-1 text-[14px] font-semibold tracking-[0.1px]">Elementos</h2>
              <p className="m-0 text-[12px] text-[var(--text-muted)]">
                Subcomponentes e variações deste componente.
              </p>
            </div>
            <div className="flex items-center gap-2">
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
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="h-[30px] w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-[30px] pr-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
                />
              </div>
              <div className="relative inline-flex items-center">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as Filter)}
                  className="h-[30px] cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-2.5 pr-[26px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
                  style={{ appearance: "none", WebkitAppearance: "none" as never }}
                >
                  <option value="all">Todos</option>
                  {elementKinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-2.5 top-1/2 h-[6px] w-[6px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]"
                />
              </div>
            </div>
          </div>

          <div
            className="grid min-h-0 flex-1 content-start gap-x-4 gap-y-[22px] overflow-y-auto px-6 pb-8 pt-[22px]"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
          >
            {filtered.length === 0 && elements.length === 0 ? (
              <div className="col-span-full px-3 py-14 text-center text-[13px] text-[var(--text-faint)]">
                Nenhum elemento encontrado.
              </div>
            ) : (
              filtered.map((e, i) => (
                <ElementCard
                  key={e.id}
                  element={e}
                  onOpenCanvas={() => navigate(`${canvasHref}&element=${encodeURIComponent(e.title)}`)}
                  onRequestDelete={setPendingElementDelete}
                  onAddBetween={() => {
                    const realIdx = elements.findIndex((x) => x.id === e.id);
                    addElement(realIdx >= 0 ? realIdx + 1 : i + 1);
                  }}
                />
              ))
            )}
            <AddCard label="Novo elemento" onClick={() => addElement()} />
          </div>
        </aside>
      </div>

      <HistoryModal
        ref={historyRef}
        title={`Histórico de ${componentName}`}
        subtitle={`Alterações no componente "${componentName}".`}
        commits={DEFAULT_HISTORY}
      />
      <CompareVersionsModal ref={compareRef} versions={versions} type={type} />
      <ReferencesModal ref={referencesRef} references={[]} />
      <ConfirmActionModal
        open={Boolean(pendingElementDelete)}
        title="Excluir elemento"
        message={
          pendingElementDelete
            ? `O elemento "${pendingElementDelete.title}" será removido.`
            : ""
        }
        onClose={() => setPendingElementDelete(null)}
        onConfirm={() => {
          if (!pendingElementDelete) return;
          setElements((prev) => prev.filter((x) => x.id !== pendingElementDelete.id));
          setPendingElementDelete(null);
        }}
      />
    </div>
  );
}

function ElementCard({
  element,
  onOpenCanvas,
  onRequestDelete,
  onAddBetween,
}: {
  element: Element;
  onOpenCanvas: () => void;
  onRequestDelete: (element: Element) => void;
  onAddBetween: () => void;
}) {
  return (
    <div className="group/card relative">
      <button
        type="button"
        className="group flex w-full cursor-pointer flex-col gap-2.5 border-0 bg-transparent p-0 text-left text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5"
      >
        <div className="preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] p-4 transition-colors group-hover:border-[var(--border-strong)]">
          <ElementMock variant={element.variant} />
          <CardMenu
            buttons={[
              { key: "canvas", label: "Editar no canvas", icon: CardMenuIcons.Canvas, onClick: onOpenCanvas },
              {
                key: "more",
                label: "Mais",
                icon: CardMenuIcons.More,
                menuItems: [
                  {
                    key: "delete",
                    label: "Excluir elemento",
                    icon: CardMenuIcons.Trash,
                    destructive: true,
                    onClick: () => onRequestDelete(element),
                  },
                ],
              },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
              {element.title}
            </span>
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">
              {element.kind}
            </span>
          </div>
        </div>
      </button>
      <button
        type="button"
        aria-label="Adicionar elemento aqui"
        title="Adicionar elemento aqui"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddBetween();
        }}
        className="pointer-events-none absolute right-[-10px] top-1/2 z-10 grid h-5 w-5 -translate-y-[calc(50%+24px)] cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] opacity-0 transition-opacity duration-[120ms] group-hover/card:pointer-events-auto group-hover/card:opacity-100 hover:border-white hover:bg-white hover:text-[#111]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

function ElementMock({ variant }: { variant: ElementVariant }) {
  switch (variant) {
    case "elogo":
      return <div className="h-9 w-9 rounded-lg bg-white" />;
    case "elink":
      return (
        <div className="flex w-full flex-col items-center gap-1.5">
          <div className="h-1.5 w-[46px] rounded-[2px] bg-white" />
          <div className="h-[5px] w-[30px] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      );
    case "ebtn-p":
      return <div className="h-7 w-[90px] rounded-md bg-white" />;
    case "ebtn-s":
      return <div className="h-7 w-[90px] rounded-md border border-[#2C2C2C]" />;
    case "ebtn-g":
      return <div className="grid h-7 w-[90px] place-items-center text-[10px] text-white">Ghost</div>;
    case "ebtn-i":
      return (
        <div className="grid h-[30px] w-[30px] place-items-center rounded-md border border-[#2C2C2C]">
          <div className="h-2.5 w-2.5 rounded-[2px] bg-white" />
        </div>
      );
    case "esearch":
      return (
        <div className="flex h-7 w-full items-center gap-1.5 rounded-md border border-[#2C2C2C] px-2">
          <div className="h-2 w-2 rounded-full border-[1.5px] border-[#2C2C2C]" />
          <div className="h-[5px] flex-1 rounded-[2px] bg-[#2C2C2C] opacity-50" />
        </div>
      );
    case "etext-l":
      return <div className="h-3.5 w-[60%] rounded-[3px] bg-white" />;
    case "etext-m":
      return (
        <div className="flex w-[80%] flex-col gap-1.5">
          <div className="h-[7px] rounded-[2px] bg-[#2C2C2C]" />
          <div className="h-[7px] w-[60%] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      );
    case "etext-s":
      return <div className="h-1.5 w-[50%] rounded-[2px] bg-[#2C2C2C]" />;
    case "emedia":
      return (
        <div className="h-[60%] w-[80%] rounded-md border border-[#2C2C2C] bg-[linear-gradient(135deg,#2a2a2a,#1a1a1a)]" />
      );
    case "efield":
      return <div className="h-[30px] w-[80%] rounded-md border border-[#2C2C2C]" />;
    case "estate-err":
      return (
        <div className="flex w-[80%] flex-col gap-1.5">
          <div className="h-[30px] rounded-md border border-[#c44]" />
          <div className="h-[5px] w-[50%] rounded-[2px] bg-[#c44]" />
        </div>
      );
    case "ecard":
      return (
        <div className="flex w-[80%] flex-col overflow-hidden rounded-md bg-[#1F1F1F]">
          <div className="h-9 bg-[#2C2C2C]" />
          <div className="flex flex-col gap-1 p-2">
            <div className="h-1.5 w-[70%] rounded-[2px] bg-white" />
            <div className="h-[5px] w-[50%] rounded-[2px] bg-[#2C2C2C]" />
          </div>
        </div>
      );
    case "ethumb":
      return <div className="aspect-[4/3] w-[60%] rounded-md bg-[linear-gradient(135deg,#2a2a2a,#1a1a1a)]" />;
    case "etag":
      return (
        <span className="rounded-full bg-[#2C2C2C] px-2 py-[3px] text-[9px] uppercase tracking-[0.5px] text-[#ddd]">
          tag
        </span>
      );
    case "estate-active":
      return (
        <div className="flex h-6 w-[80%] items-center rounded-md bg-white px-2">
          <div className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#1a1a1a]" />
          <div className="h-[5px] flex-1 rounded-[2px] bg-[#1a1a1a] opacity-40" />
        </div>
      );
    case "esfooter":
      return (
        <div className="flex w-[80%] flex-col gap-1.5">
          <div className="h-2 w-[50%] rounded-[2px] bg-white" />
          <div className="h-[5px] w-[80%] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      );
    case "ebackdrop":
      return (
        <div className="h-[60%] w-[80%] rounded-md border border-dashed border-[#2C2C2C] bg-white/5" />
      );
    case "ecol":
      return (
        <div className="flex w-[60%] flex-col gap-1.5">
          <div className="h-[7px] w-[50%] rounded-[2px] bg-white" />
          <div className="h-[5px] w-[80%] rounded-[2px] bg-[#2C2C2C]" />
          <div className="h-[5px] w-[60%] rounded-[2px] bg-[#2C2C2C]" />
          <div className="h-[5px] w-[70%] rounded-[2px] bg-[#2C2C2C]" />
        </div>
      );
    case "esocial":
      return (
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[18px] w-[18px] rounded-full bg-[#2C2C2C]" />
          ))}
        </div>
      );
  }
}

function frameStyle(type: ProjectType): CSSProperties {
  if (type === "tablet") return { maxWidth: 360, aspectRatio: "4 / 5.5" };
  if (type === "mobile") return { maxWidth: 240, aspectRatio: "9 / 19.5" };
  return { maxWidth: 540, aspectRatio: "16 / 10" };
}

function kindLabel(kind: ComponentKind): string {
  return kind;
}
