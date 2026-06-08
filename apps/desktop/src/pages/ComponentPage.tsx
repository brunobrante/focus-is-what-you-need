import { type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { IconChevronLeft, IconCirclePlus, IconCompare, IconHistory, IconOpenCanvas, IconPlus, IconSearch } from "@/components/icons";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { AddCard } from "@/components/screen/AddCard";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { CompareVersionsModal } from "@/components/modals/CompareVersionsModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { useComponentOverview, type Element } from "@/application/component/useComponentOverview";
import type { ProjectType } from "@/lib/data/types";
import type { ComponentKind } from "@/lib/data/types";

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

export function ComponentPage() {
  const params = useParams<{ componentId: string }>();
  const componentId = decodeURIComponent(params.componentId ?? "");

  const {
    projectId,
    screenId,
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
  } = useComponentOverview(componentId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          <Link to={screenHref} aria-label="Back" className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <IconChevronLeft size={14} strokeWidth={1.6} />
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            Projects
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
            <IconOpenCanvas size={14} strokeWidth={1.6} />
            Edit in canvas
          </Link>
          <button type="button" onClick={() => addElement()} className="btn btn-primary">
            <IconPlus size={14} strokeWidth={2} />
            New variant
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-end justify-between gap-4 px-7 pb-[18px] pt-[22px]">
        <div>
          <h1 className="m-0 mb-1.5 text-[22px] font-semibold tracking-[-0.3px]">{componentName}</h1>
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            <span>{kindLabel(meta?.kind ?? "Atom")}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{meta?.screenId == null ? "Global" : "Screen"}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>used in 1 screen</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>updated 1 hour ago</span>
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
          <button
            type="button"
            aria-label="Compare versions"
            onClick={() => compareRef.current?.open()}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconCompare size={13} strokeWidth={1.7} />
            Comparar
          </button>
          <button
            type="button"
            aria-label="View references"
            onClick={() => referencesRef.current?.open()}
            className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconCirclePlus size={13} strokeWidth={1.7} />
            References
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
            details: [`${componentsInScope.length} component${componentsInScope.length === 1 ? "" : "s"}`, PROJECT_TYPE_DIMS[type]],
            href: buildComponentHref(prevComponent.id),
          } : undefined}
          next={nextComponent ? {
            name: nextComponent.name,
            details: [`${componentsInScope.length} component${componentsInScope.length === 1 ? "" : "s"}`, PROJECT_TYPE_DIMS[type]],
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
                  <IconOpenCanvas size={16} strokeWidth={1.6} />
                </span>
                <span className="text-[13px] font-medium text-[var(--text-muted)]">
                  Empty component
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
                Subcomponents and variations of this component.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-[220px]">
                <IconSearch size={13} strokeWidth={1.7} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-[30px] w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-[30px] pr-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
                />
              </div>
              <div className="relative inline-flex items-center">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  className="h-[30px] cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-2.5 pr-[26px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
                  style={{ appearance: "none", WebkitAppearance: "none" as never }}
                >
                  <option value="all">All</option>
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
                No elements found.
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
            <AddCard label="New element" onClick={() => addElement()} />
          </div>
        </aside>
      </div>

      <HistoryModal
        ref={historyRef}
        title={`History of ${componentName}`}
        subtitle={`Changes to component "${componentName}".`}
        commits={DEFAULT_HISTORY}
      />
      <CompareVersionsModal ref={compareRef} versions={versions} type={type} />
      <ReferencesModal ref={referencesRef} references={[]} />
      <ConfirmActionModal
        open={Boolean(pendingElementDelete)}
        title="Delete element"
        message={
          pendingElementDelete
            ? `The element "${pendingElementDelete.title}" will be removed.`
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

export default ComponentPage;

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
          <ElementMock variant={element.variant as ElementVariant} />
          <CardMenu
            buttons={[
              { key: "canvas", label: "Edit in canvas", icon: CardMenuIcons.Canvas, onClick: onOpenCanvas },
              {
                key: "more",
                label: "Mais",
                icon: CardMenuIcons.More,
                menuItems: [
                  {
                    key: "delete",
                    label: "Delete element",
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
        aria-label="Add element here"
        title="Add element here"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAddBetween();
        }}
        className="pointer-events-none absolute right-[-10px] top-1/2 z-10 grid h-5 w-5 -translate-y-[calc(50%+24px)] cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] opacity-0 transition-opacity duration-[120ms] group-hover/card:pointer-events-auto group-hover/card:opacity-100 hover:border-white hover:bg-white hover:text-[#111]"
      >
        <IconPlus size={10} strokeWidth={2.4} />
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
