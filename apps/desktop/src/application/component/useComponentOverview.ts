import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { HistoryModalHandle } from "@/components/modals/HistoryModal";
import type { CompareVersionsModalHandle } from "@/components/modals/CompareVersionsModal";
import type { ReferencesModalHandle } from "@/components/modals/ReferencesModal";
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

export type Element = { id: string; title: string; kind: ElementKind; variant: ElementVariant };

const ELEMENTS_BY_VARIANT: Partial<Record<ComponentVariant, Element[]>> = {
  cheader: [
    { id: "logo", title: "Logo", kind: "Atom", variant: "elogo" },
    { id: "navlink", title: "Nav link", kind: "Atom", variant: "elink" },
    { id: "ctabtn", title: "CTA Button", kind: "Atom", variant: "ebtn-p" },
    { id: "search", title: "Search input", kind: "Atom", variant: "esearch" },
  ],
  chero: [
    { id: "title", title: "Title", kind: "Atom", variant: "etext-l" },
    { id: "sub", title: "Subtitle", kind: "Atom", variant: "etext-m" },
    { id: "cta", title: "CTA Button", kind: "Atom", variant: "ebtn-p" },
    { id: "media", title: "Media", kind: "Pattern", variant: "emedia" },
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
    { id: "col", title: "Column", kind: "Pattern", variant: "ecol" },
    { id: "title", title: "Column title", kind: "Atom", variant: "etext-s" },
    { id: "link", title: "Link", kind: "Atom", variant: "elink" },
    { id: "social", title: "Social icons", kind: "Pattern", variant: "esocial" },
  ],
};

type Filter = "all" | ElementKind;

export interface ComponentOverviewState {
  // route params
  projectId: string;
  screenId: string;
  componentId: string;
  // derived data
  type: ProjectType;
  projectName: string;
  screenName: string;
  componentName: string;
  meta: ComponentRow | null;
  // elements state
  elements: Element[];
  setElements: React.Dispatch<React.SetStateAction<Element[]>>;
  // versions state
  versions: typeof DEFAULT_SCREEN_VERSIONS;
  activeVersionId: string;
  setActiveVersionId: React.Dispatch<React.SetStateAction<string>>;
  // search / filter state
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  filter: Filter;
  setFilter: React.Dispatch<React.SetStateAction<Filter>>;
  // pending delete state
  pendingElementDelete: Element | null;
  setPendingElementDelete: React.Dispatch<React.SetStateAction<Element | null>>;
  // computed
  elementKinds: ElementKind[];
  filtered: Element[];
  // modal refs
  historyRef: React.RefObject<HistoryModalHandle>;
  compareRef: React.RefObject<CompareVersionsModalHandle>;
  referencesRef: React.RefObject<ReferencesModalHandle>;
  // navigation computed
  componentsInScope: ComponentRow[];
  prevComponent: ComponentRow | null;
  nextComponent: ComponentRow | null;
  // hrefs
  screenHref: string;
  canvasHref: string;
  buildComponentHref: (id: string) => string;
  // handlers
  addElement: (insertAt?: number) => void;
  handleConfirmDelete: () => void;
  // static data passed to modals
  DEFAULT_HISTORY: typeof DEFAULT_HISTORY;
  PROJECT_TYPE_DIMS: typeof PROJECT_TYPE_DIMS;
  // navigate
  navigate: ReturnType<typeof useNavigate>;
}

export function useComponentOverview(componentId: string): ComponentOverviewState {
  const params = useParams<{
    projectId: string;
    screenId: string;
    componentId: string;
  }>();
  const navigate = useNavigate();
  const projectId = decodeURIComponent(params.projectId ?? "");
  const screenId = decodeURIComponent(params.screenId ?? "");
  const { data: project } = useProject(projectId);
  const { data: screen } = useScreen(screenId);
  const { data: scopedComponents } = useScreenChildren(project?.id, screen?.id);
  const { data: componentById } = useComponent(componentId);
  const type: ProjectType = project?.type ?? "desktop";
  const projectName = project?.name ?? "Project";
  const screenName = screen?.title ?? "Screen";
  const componentName = componentById?.name ?? "Component";

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

  const handleConfirmDelete = () => {
    if (!pendingElementDelete) return;
    setElements((prev) => prev.filter((x) => x.id !== pendingElementDelete.id));
    setPendingElementDelete(null);
  };

  return {
    projectId,
    screenId,
    componentId,
    type,
    projectName,
    screenName,
    componentName,
    meta,
    elements,
    setElements,
    versions,
    activeVersionId,
    setActiveVersionId,
    query,
    setQuery,
    filter,
    setFilter,
    pendingElementDelete,
    setPendingElementDelete,
    elementKinds,
    filtered,
    historyRef,
    compareRef,
    referencesRef,
    componentsInScope,
    prevComponent,
    nextComponent,
    screenHref,
    canvasHref,
    buildComponentHref,
    addElement,
    handleConfirmDelete,
    DEFAULT_HISTORY,
    PROJECT_TYPE_DIMS,
    navigate,
  };
}

export function kindLabel(kind: ComponentKind): string {
  return kind;
}
