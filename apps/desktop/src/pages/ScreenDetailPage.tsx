import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Snapshot } from "@/components/Snapshot";
import {
  IconChevronLeft,
  IconCompare,
  IconFastEdit,
  IconHistory,
  IconOpenCanvas,
  IconSearch,
} from "@/components/icons";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { AddCard } from "@/components/screen/AddCard";
import { ComponentSideCard } from "@/components/screen/ComponentSideCard";
import { VersionSideCard, PreviewMockImage } from "@/components/screen/VersionSideCard";
import { SideEmptyState } from "@/components/screen/SideEmptyState";
import { FastEditModal } from "@/components/screen/FastEditModal";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { CompareVersionsModal } from "@/components/modals/CompareVersionsModal";
import { NewComponentModal } from "@/components/modals/NewComponentModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { AddReferenceModal } from "@/components/modals/AddReferenceModal";
import type { ComponentRow, VariantRow } from "@/lib/storage/schema";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import { useScreenDetail, type SideTab, type CmpKindFilter } from "@/application/screen-detail/useScreenDetail";

export function ScreenDetailPage() {
  const params = useParams<{ projectId: string; screenId: string }>();
  const projectId = decodeURIComponent(params.projectId ?? "");
  const screenId = decodeURIComponent(params.screenId ?? "");

  const {
    project,
    screens,
    screen,
    components,
    activeVariants,
    references,
    type,
    canUseFactoryMocks,
    projectName,
    screenName,
    tpl,
    tplLabel,
    prevScreen,
    nextScreen,
    canvasHref,
    filteredComponents,
    filteredVersions,
    filteredReferences,
    sideTab,
    setSideTab,
    query,
    setQuery,
    filter,
    setFilter,
    versions,
    setVersions,
    activeVersionId,
    setActiveVersionId,
    activeVersion,
    activeTpl,
    historyRef,
    compareRef,
    referencesRef,
    newComponentRef,
    addRefModalRef,
    fastEditRef,
    confirmRef,
    defaultHistory,
    projectDims,
    buildScreenHref,
    openNewComponent,
    addVersion,
    removeLinkedReference,
    requestDeleteComponent,
    handleOpenCanvas,
    handleScreenTitleSave,
    handleNewComponentCreated,
    handleCompareOpenInCanvas,
    handleAddReference,
  } = useScreenDetail(screenId, projectId);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      {/* Topbar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          <Link
            to={`/project/${encodeURIComponent(project?.id ?? projectId)}`}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <IconChevronLeft size={14} strokeWidth={1.6} />
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
            <IconOpenCanvas size={14} strokeWidth={1.6} />
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
            onSave={handleScreenTitleSave}
          />
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
            <span>{projectDims[type]}</span>
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
            <IconHistory size={13} strokeWidth={1.7} />
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
          onFastEdit={() => fastEditRef.current?.open({ mode: "screen", screen, components, type, canvasHref })}
          canvasHref={canvasHref}
          prev={prevScreen ? {
            name: prevScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, projectDims[type]],
            href: buildScreenHref(prevScreen.id),
            screenId: prevScreen.id,
          } : undefined}
          next={nextScreen ? {
            name: nextScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, projectDims[type]],
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
                  <IconCompare size={13} strokeWidth={1.7} />
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
                    onRequestDelete={requestDeleteComponent}
                    onOpenCanvas={handleOpenCanvas}
                    onFastEdit={(component) => {
                      const variant = activeVariants.get(component.id) ?? null;
                      const href = component.activeVariantId
                        ? `/canvas?project=${encodeURIComponent(project?.id ?? projectId)}&type=${type}&variant=${component.activeVariantId}`
                        : canvasHref;
                      fastEditRef.current?.open({ mode: "component", component, variant, type, canvasHref: href });
                    }}
                    onMoveTo={() => {}}
                    onMakeGlobal={() => {}}
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
                  <SideEmptyState
                    title="No versions found"
                    description="Versions of this screen will appear here when created."
                    actionLabel="New version"
                    onAction={addVersion}
                  />
                )}
                {filteredVersions.length > 0 && (
                  <AddCard label="New version" onClick={addVersion} />
                )}
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
        title="Screen history"
        subtitle={`Changes made to "${screenName}" over time.`}
        commits={defaultHistory}
      />
      <CompareVersionsModal
        ref={compareRef}
        versions={versions}
        type={type}
        allowMock={canUseFactoryMocks}
        onOpenInCanvas={handleCompareOpenInCanvas}
      />
      <ReferencesModal
        ref={referencesRef}
        references={filteredReferences}
        onRemove={(reference) => removeLinkedReference(reference.id)}
      />
      <AddReferenceModal
        ref={addRefModalRef}
        projectId={project?.id ?? null}
        screens={screens}
        components={[]}
        existingReferences={references}
        defaultScreenId={screen?.id}
        onAdd={handleAddReference}
      />
      <FastEditModal ref={fastEditRef} />
      <NewComponentModal
        ref={newComponentRef}
        projectId={project?.id ?? null}
        screens={screens}
        onCreated={handleNewComponentCreated}
      />
      <ConfirmActionModal ref={confirmRef} />
    </div>
  );
}

export default ScreenDetailPage;

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

