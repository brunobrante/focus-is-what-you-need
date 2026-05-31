import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { AddCard } from "@/components/screen/AddCard";
import { FastEditModal } from "@/components/screen/FastEditModal";
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
import {
  PROJECT_TYPE_DIMS,
  templateForScreenName,
} from "@/lib/data/projects";
import { getCanvasMockForTemplate } from "@/components/mocks/data/canvasMocks";
import {
  useActiveVariants,
  useProject,
  useReferences,
  useScreen,
  useScreenChildren,
  useScreens,
} from "@/lib/storage/hooks";
import { deleteComponentTree } from "@/lib/storage/repos/components.repo";
import { createOrAttachReference } from "@/lib/storage/repos/references.repo";
import { updateScreen } from "@/lib/storage/repos/screens.repo";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import {
  DEFAULT_HISTORY,
  DEFAULT_SCREEN_VERSIONS,
  type ScreenVersion,
} from "@/lib/data/screenVersions";
import type { ComponentKind, ProjectType } from "@/lib/data/types";

type SideTab = "components" | "versions" | "references";
type CmpKindFilter = "all" | ComponentKind;

export function Components() {
  const params = useParams<{ projectId: string; screenId: string }>();
  const navigate = useNavigate();
  const projectId = decodeURIComponent(params.projectId ?? "");
  const screenId = decodeURIComponent(params.screenId ?? "");
  const { data: project } = useProject(projectId);
  const { data: screens } = useScreens(project?.id);
  const { data: loadedScreen } = useScreen(screenId);
  const screen =
    loadedScreen && loadedScreen.projectId === (project?.id ?? projectId)
      ? loadedScreen
      : null;
  const { data: components } = useScreenChildren(project?.id, screen?.id);
  const { data: activeVariants } = useActiveVariants(components);
  const { data: references } = useReferences("screen", screen?.id ?? null);
  const type: ProjectType = project?.type ?? "desktop";
  const canUseFactoryMocks = project?.source === "mock";
  const projectName = project?.name ?? "Project";
  const screenName = screen?.title ?? "Screen";
  const tpl = templateForScreenName(screenName);
  const tplLabel: Record<ReturnType<typeof templateForScreenName>, string> = {
    hero: "Hero",
    list: "List",
    detail: "Detail",
    form: "Form",
    profile: "Profile",
  };

  const [sideTab, setSideTab] = useState<SideTab>("components");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CmpKindFilter>("all");
  const [pendingComponentDelete, setPendingComponentDelete] = useState<ComponentRow | null>(null);
  const [fastEditOpen, setFastEditOpen] = useState(false);

  const [versions, setVersions] = useState<ScreenVersion[]>(() =>
    DEFAULT_SCREEN_VERSIONS.map((v, i) => ({ ...v, tpl: i === DEFAULT_SCREEN_VERSIONS.length - 1 ? "detail" : tpl })),
  );
  const [activeVersionId, setActiveVersionId] = useState(versions[0]?.id ?? "v3");

  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? versions[0];
  const activeTpl = activeVersion?.tpl ?? tpl;

  const historyRef = useRef<HistoryModalHandle>(null);
  const compareRef = useRef<CompareVersionsModalHandle>(null);
  const referencesRef = useRef<ReferencesModalHandle>(null);
  const newComponentRef = useRef<NewComponentModalHandle>(null);
  const addRefModalRef = useRef<AddReferenceModalHandle>(null);

  const buildScreenHref = (id: string) =>
    `/project/${encodeURIComponent(project?.id ?? projectId)}/screen/${encodeURIComponent(id)}`;
  const { prevScreen, nextScreen } = useMemo(() => {
    const idx = screens.findIndex((s) => s.id === screen?.id);
    const hasMultipleScreens = screens.length > 1;
    if (idx < 0 || !hasMultipleScreens) {
      return {
        prevScreen: null,
        nextScreen: null,
      };
    }
    const prevIdx = (idx - 1 + screens.length) % screens.length;
    const nextIdx = (idx + 1) % screens.length;
    return {
      prevScreen: screens[prevIdx] ?? null,
      nextScreen: screens[nextIdx] ?? null,
    };
  }, [screen?.id, screens]);
  const canvasHref = screen
    ? `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&screen=${screen.id}`
    : `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}`;

  const filteredComponents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      const matchQ = !q || c.name.toLowerCase().includes(q);
      const matchF = filter === "all" || c.kind === filter;
      return matchQ && matchF;
    });
  }, [components, query, filter]);

  const filteredVersions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return versions.filter((v) => !q || v.title.toLowerCase().includes(q));
  }, [versions, query]);

  const filteredReferences = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return references;
    return references.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q) ||
        (r.metadata ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [references, query]);

  const openNewComponent = () => {
    if (!project || !screen) return;
    newComponentRef.current?.open({ kind: "screen", screenId: screen.id });
  };

  const addVersion = () => {
    const n = versions.length + 1;
    const tpls: ScreenVersion["tpl"][] = ["hero", "detail", "form"];
    const newV: ScreenVersion = {
      id: `v${n}`,
      title: `v${n} · nova`,
      tpl: tpls[n % tpls.length],
      updated: "agora",
      author: "You",
      initials: "VC",
    };
    setVersions((prev) => [newV, ...prev]);
    setActiveVersionId(newV.id);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      {/* Topbar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          <Link
            to={`/project/${encodeURIComponent(project?.id ?? projectId)}`}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            Projects
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link
            to={`/project/${encodeURIComponent(project?.id ?? projectId)}`}
            className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]"
          >
            {projectName}
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="text-[13px] font-medium text-[var(--text)]">{screenName}</span>
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
            Open canvas
          </Link>
        </div>
      </header>

      {/* Page head */}
      <div className="flex shrink-0 items-end justify-between gap-4 px-7 pb-[18px] pt-[22px]">
        <div>
          <EditableTitle
            value={screen?.title ?? screenName}
            label="Edit screen name"
            onSave={(title) => {
              if (!screen || title === screen.title) return;
              void (async () => {
                const updated = await updateScreen(screen.id, { title });
                if (updated) {
                  navigate(`/project/${encodeURIComponent(updated.projectId)}/screen/${encodeURIComponent(updated.id)}`, { replace: true });
                }
              })();
            }}
          />
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            <span>{PROJECT_TYPE_DIMS[type]}</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
            <span>{tplLabel[tpl]}</span>
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <polyline points="3 4 3 10 9 10" />
              <path d="M12 7v5l3 2" />
            </svg>
            History
          </button>
          <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
            {components.length} component{components.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* Split layout */}
      <div className="grid min-h-0 flex-1 border-t border-[var(--border)]" style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}>
        <PreviewShell
          onFastEdit={() => setFastEditOpen(true)}
          canvasHref={canvasHref}
          prev={prevScreen ? {
            name: prevScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, PROJECT_TYPE_DIMS[type]],
            href: buildScreenHref(prevScreen.id),
            screenId: prevScreen.id,
          } : undefined}
          next={nextScreen ? {
            name: nextScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, PROJECT_TYPE_DIMS[type]],
            href: buildScreenHref(nextScreen.id),
            screenId: nextScreen.id,
          } : undefined}
        >
          {screen ? (
            <Snapshot
              kind="screen"
              ownerType="screen"
              ownerId={screen.id}
              variant={screen.variant}
              type={type}
              emptyMode="preview"
              display="natural"
            />
          ) : (
            <PreviewMockImage tpl={activeTpl} type={type} allowMock={canUseFactoryMocks} />
          )}
        </PreviewShell>

        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-3.5 pt-[18px]">
            <div>
              <h2 className="m-0 mb-1 text-[14px] font-semibold tracking-[0.1px]">
                {sideTab === "components"
                  ? "Sub Components"
                  : sideTab === "versions"
                    ? "Screen Versions"
                    : "References"}
              </h2>
              <p className="m-0 text-[12px] text-[var(--text-muted)]">
                {sideTab === "components"
                  ? "Everything on this screen. Click to open."
                  : sideTab === "versions"
                    ? "History of versions for this screen."
                    : "Inspirations and support materials for this screen."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SideSearch query={query} onChange={setQuery} />
              {sideTab === "components" ? (
                <SideKindFilter value={filter} onChange={setFilter} />
              ) : null}
              {sideTab === "versions" ? (
                <button
                  type="button"
                  aria-label="Compare versions"
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
              { id: "components", label: "Sub Components", count: components.length },
              { id: "versions", label: "Versions", count: versions.length },
              { id: "references", label: "References", count: references.length },
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
                  <span
                    className="ml-1.5 text-[10.5px] text-[var(--text-faint)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t.count}
                  </span>
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
                {filteredComponents.map((c) => (
                  <ComponentSideCard
                    key={c.id}
                    component={c}
                    variant={activeVariants.get(c.id) ?? null}
                    projectId={project?.id ?? projectId}
                    type={type}
                    onRequestDelete={setPendingComponentDelete}
                    onOpenCanvas={(variantId) =>
                      navigate(
                        `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&variant=${variantId}`,
                      )
                    }
                  />
                ))}
                {filteredComponents.length === 0 && (
                  <SideEmptyState
                    title="No sub component found"
                    description="Components derived from this screen will appear here when created."
                    actionLabel="New component"
                    onAction={components.length === 0 ? openNewComponent : undefined}
                  />
                )}
                {filteredComponents.length > 0 ? (
                  <AddCard label="New component" onClick={openNewComponent} />
                ) : null}
              </>
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
                    No versions found.
                  </div>
                )}
                <AddCard label="New version" onClick={addVersion} />
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
        title="Screen history"
        subtitle={`Changes made to "${screenName}" over time.`}
        commits={DEFAULT_HISTORY}
      />
      <CompareVersionsModal
        ref={compareRef}
        versions={versions}
        type={type}
        allowMock={canUseFactoryMocks}
        onOpenInCanvas={(ids) => {
          if (screen) {
            navigate(
              `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&screen=${screen.id}&compare=${ids.join(",")}`,
            );
          }
        }}
      />
      <ReferencesModal ref={referencesRef} references={filteredReferences} />
      <AddReferenceModal
        ref={addRefModalRef}
        projectId={project?.id ?? null}
        screens={screens}
        components={[]}
        existingReferences={references}
        defaultScreenId={screen?.id}
        onAdd={async (input) => {
          await createOrAttachReference(input);
        }}
      />
      <FastEditModal
        mode="screen"
        open={fastEditOpen}
        onClose={() => setFastEditOpen(false)}
        screen={screen}
        components={components}
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
        placeholder="Search..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] w-full rounded-md border border-[var(--border)] bg-[var(--bg)] py-0 pl-[30px] pr-2.5 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--text-muted)]"
      />
    </div>
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

function ComponentSideCard({
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
          aria-label={`Select version ${version.title}`}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
        />
        <div className="h-full w-full overflow-hidden">
          <PreviewMockImage tpl={version.tpl} type={type} compact allowMock={allowMock} />
        </div>
        <CardMenu
          buttons={[
            { key: "select", label: "Select version", icon: CardMenuIcons.Check, onClick: onSelect },
            { key: "duplicate", label: "Duplicate", icon: CardMenuIcons.Duplicate },
            { key: "more", label: "More", icon: CardMenuIcons.More },
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

function PreviewMockImage({
  tpl,
  type,
  allowMock,
  compact = false,
}: {
  tpl: ScreenVersion["tpl"];
  type: ProjectType;
  allowMock: boolean;
  compact?: boolean;
}) {
  if (!allowMock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Empty screen
      </div>
    );
  }

  const mock = getCanvasMockForTemplate(tpl, type);
  if (!mock) {
    return (
      <div className="grid h-full w-full place-items-center rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] text-[12px] text-[var(--text-faint)]">
        Empty screen
      </div>
    );
  }
  return (
    <img
      src={mock.snapshot}
      alt=""
      className={["block h-full w-full object-cover", compact ? "rounded-[4px]" : ""].join(" ")}
      draggable={false}
    />
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
