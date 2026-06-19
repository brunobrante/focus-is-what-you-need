import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { SceneCanvasViewer } from "@/components/screen/SceneCanvasViewer";
import {
  IconFastEdit,
  IconChevronLeft,
  IconClose,
  IconCompare,
  IconHistory,
  IconOpenCanvas,
  IconPencil,
  IconSearch,
} from "@/components/icons";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { VersionModeModal } from "@/components/modals/VersionModeModal";
import { Snapshot } from "@/components/Snapshot";
import { AddCard } from "@/components/screen/AddCard";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { ComponentSideCard } from "@/components/screen/ComponentSideCard";
import { CardSourceIcon, scopeOf } from "@/components/component/componentSource";
import { VersionSideCard, PreviewMockImage, VersionTagBadge } from "@/components/screen/VersionSideCard";
import { SideEmptyState } from "@/components/screen/SideEmptyState";
import { FastEditModal } from "@/components/screen/FastEditModal";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { CompareVersionsModal } from "@/components/modals/CompareVersionsModal";
import { NewComponentModal } from "@/components/modals/NewComponentModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { AddReferenceModal } from "@/components/modals/AddReferenceModal";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import type { ComponentKind, ProjectType, ScreenVariant } from "@/lib/data/types";
import { updateScreen } from "@/lib/storage/repos/screens.repo";
import { isMainVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import { useScreenDetail, type CmpKindFilter as ScreenCmpKindFilter } from "@/application/screen-detail/useScreenDetail";
import { useComponentDetail } from "@/application/component-detail/useComponentDetail";

// ── Router ────────────────────────────────────────────────────────────────────

export function DetailPage() {
  const { projectId = "", screenId, componentId } = useParams<{
    projectId: string;
    screenId?: string;
    componentId?: string;
  }>();

  if (screenId) return <ScreenContent projectId={projectId} screenId={screenId} />;
  if (componentId) return <ComponentContent componentId={componentId} />;
  return null;
}

export default DetailPage;

// ── Screen content ────────────────────────────────────────────────────────────

function ScreenContent({ projectId, screenId: rawScreenId }: { projectId: string; screenId: string }) {
  const screenId = decodeURIComponent(rawScreenId);
  const pid = decodeURIComponent(projectId);

  const {
    project, screens, screen, components, activeVariants, references,
    type, canUseFactoryMocks, projectName, screenName, tpl, tplLabel,
    prevScreen, nextScreen, canvasHref, filteredComponents, linkedComponentIds, filteredVersions,
    filteredReferences, sideTab, setSideTab, query, setQuery, filter, setFilter,
    versions, activeVersionId, setActiveVersionId, activeVersion, activeTpl, isPreviewingVersion,
    versionModeRef, historyRef, compareRef, referencesRef, newComponentRef, addRefModalRef, fastEditRef, confirmRef,
    defaultHistory, projectDims, buildScreenHref, openNewComponent, addVersion,
    removeLinkedReference, requestDeleteComponent, handleOpenCanvas, handleOpenVersionCanvas, handleDeleteVersion, handleScreenTitleSave,
    handleNewComponentCreated, handleCompareOpenInCanvas, handleAddReference,
  } = useScreenDetail(screenId, pid);

  const [infoOpen, setInfoOpen] = useState(false);

  const tabs = [
    { id: "components" as const, label: "Sub Components", count: components.length },
    { id: "versions" as const, label: "Versions", count: Math.max(0, versions.length - 1) },
    { id: "references" as const, label: "References", count: references.length },
  ] as const;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[0.2px] text-[var(--text-muted)]">
          <Link to={`/project/${encodeURIComponent(project?.id ?? pid)}`} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <IconChevronLeft size={14} strokeWidth={1.6} />
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to="/" className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">Projects</Link>
          <span className="text-[var(--text-faint)]">/</span>
          <Link to={`/project/${encodeURIComponent(project?.id ?? pid)}`} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {projectName}
          </Link>
          <span className="text-[var(--text-faint)]">/</span>
          <span className="text-[13px] font-medium text-[var(--text)]">{screenName}</span>
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{type}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to={canvasHref} className="btn btn-ghost">
            <IconOpenCanvas size={14} strokeWidth={1.6} />
            Open canvas
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 border-t border-[var(--border)]" style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}>
        <PreviewShell
          onFastEdit={() => fastEditRef.current?.open({ mode: "screen", screen, components, type, canvasHref })}
          canvasHref={canvasHref}
          prev={!isPreviewingVersion && prevScreen ? {
            name: prevScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, projectDims[type]],
            href: buildScreenHref(prevScreen.id),
            screenId: prevScreen.id,
          } : undefined}
          next={!isPreviewingVersion && nextScreen ? {
            name: nextScreen.title,
            details: [`${components.length} component${components.length === 1 ? "" : "s"}`, projectDims[type]],
            href: buildScreenHref(nextScreen.id),
            screenId: nextScreen.id,
          } : undefined}
        >
          {screen ? (
            <SceneCanvasViewer source="stored" ownerType="variant" ownerId={activeVersionId ?? screen.activeVariantId} kind="screen" />
          ) : (
            <PreviewMockImage tpl={activeTpl} type={type} allowMock={canUseFactoryMocks} />
          )}
        </PreviewShell>

        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-[18px] pt-[22px]">
            <div>
              <div className="flex items-center gap-1.5">
                <EditableTitle value={screen?.title ?? screenName} label="Edit screen name" onSave={handleScreenTitleSave} />
                {activeVersion && activeVersion.tag && activeVersion.tag !== "main" ? (
                  <span className="mb-1.5">
                    <VersionTagBadge tag={activeVersion.tag} isMain={false} />
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
                <span>{projectDims[type]}</span>
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
                <span>{tplLabel[tpl]}</span>
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
                <span>updated 1 hour ago</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="View history" onClick={() => historyRef.current?.open()}
                className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
              >
                <IconHistory size={13} strokeWidth={1.7} />
                History
              </button>
              <button type="button" aria-label="Edit information" onClick={() => setInfoOpen(true)}
                className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
              >
                <IconPencil size={12} strokeWidth={1.7} />
              </button>
              <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                {components.length} component{components.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {infoOpen ? (
            <InlineInfoPanel title="Screen information" onClose={() => setInfoOpen(false)}>
              {screen ? (
                <ScreenInfoPanel
                  screen={screen}
                  type={type}
                  onSave={(patch) => void updateScreen(screen.id, patch)}
                />
              ) : (
                <p className="text-[13px] text-[var(--text-faint)]">No screen data available yet.</p>
              )}
            </InlineInfoPanel>
          ) : (
            <>
          <SideTabs tabs={tabs} active={sideTab} onChange={setSideTab} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
              <SideSearch query={query} onChange={setQuery} />
              {sideTab === "components" ? <SideKindFilter value={filter} onChange={setFilter} /> : null}
              {sideTab === "versions" ? (
                <button type="button" aria-label="Compare versions" onClick={() => compareRef.current?.open()}
                  className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
                >
                  <IconCompare size={13} strokeWidth={1.7} />
                  Comparar
                </button>
              ) : null}
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-x-4 gap-y-[22px] overflow-y-auto px-6 pb-8 pt-[22px]"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
            >
              {sideTab === "components" && (
                <>
                  {filteredComponents.map((c) => (
                    <ComponentSideCard
                      key={c.id}
                      component={c}
                      variant={activeVariants.get(c.id) ?? null}
                      projectId={project?.id ?? pid}
                      type={type}
                      linked={linkedComponentIds.has(c.id)}
                      onRequestDelete={requestDeleteComponent}
                      onOpenCanvas={handleOpenCanvas}
                      onFastEdit={(cmp) => {
                        const variant = activeVariants.get(cmp.id) ?? null;
                        const href = cmp.activeVariantId
                          ? `/canvas?project=${encodeURIComponent(project?.id ?? pid)}&type=${type}&variant=${cmp.activeVariantId}`
                          : canvasHref;
                        fastEditRef.current?.open({ mode: "component", component: cmp, variant, type, canvasHref: href });
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
                  {filteredComponents.length > 0 ? <AddCard label="New component" onClick={openNewComponent} /> : null}
                </>
              )}
              {sideTab === "versions" && (
                <>
                  {versions.length > 1 ? (
                    <>
                      {filteredVersions.map((v) => (
                        <VersionSideCard
                          key={v.id}
                          version={v}
                          active={v.id === activeVersionId}
                          type={type}
                          allowMock={canUseFactoryMocks}
                          onSelect={() => setActiveVersionId(v.id)}
                          onOpenCanvas={() => { if (v.variantId) handleOpenVersionCanvas(v.variantId); }}
                          onFastEdit={() => {}}
                          onDelete={() => { if (v.variantId) handleDeleteVersion(v.variantId, v.tag ?? v.title); }}
                        />
                      ))}
                      <AddCard label="New version" onClick={addVersion} />
                    </>
                  ) : (
                    <SideEmptyState
                      title="No versions yet"
                      description="Create a version of this screen to start. The original stays as the main."
                      actionLabel="New version"
                      onAction={addVersion}
                    />
                  )}
                </>
              )}
              {sideTab === "references" && (
                <SideReferencesTab
                  references={filteredReferences}
                  query={query}
                  onAdd={() => addRefModalRef.current?.open()}
                  onOpen={(i) => referencesRef.current?.open(i)}
                  onRemove={(ref) => removeLinkedReference(ref.id)}
                />
              )}
            </div>
          </div>
            </>
          )}
        </aside>
      </div>

      <HistoryModal ref={historyRef} title="Screen history" subtitle={`Changes made to "${screenName}" over time.`} commits={defaultHistory} />
      <CompareVersionsModal ref={compareRef} versions={versions} type={type} allowMock={canUseFactoryMocks} onOpenInCanvas={handleCompareOpenInCanvas} />
      <ReferencesModal ref={referencesRef} references={filteredReferences} onRemove={(ref) => removeLinkedReference(ref.id)} />
      <AddReferenceModal ref={addRefModalRef} projectId={project?.id ?? null} screens={screens} components={[]} existingReferences={references} defaultScreenId={screen?.id} onAdd={handleAddReference} />
      <FastEditModal ref={fastEditRef} />
      <NewComponentModal ref={newComponentRef} projectId={project?.id ?? null} screens={screens} onCreated={handleNewComponentCreated} />
      <ConfirmActionModal ref={confirmRef} />
      <VersionModeModal ref={versionModeRef} />
    </div>
  );
}

// ── Component content ─────────────────────────────────────────────────────────

function ComponentContent({ componentId }: { componentId: string }) {
  const {
    component, project, screens, variants, activeVariant, displayVariant, screen, trail,
    children, linkedChildIds, childVariants, projectComponents, references, type, projectId,
    projectName, variantCount, canvasHref, filteredChildren, filteredVariants,
    filteredReferences, history, sideTab, setSideTab, query, setQuery,
    filter, setFilter, fastEditOpen, setFastEditOpen, pendingChildDelete,
    setPendingChildDelete, versionModeRef, historyRef, referencesRef, newComponentRef, addRefModalRef,
    openNewChild, addVariant, removeLinkedReference, handleChildDeleteConfirm,
    handleComponentCreated, handleOpenCanvas, handleOpenVersionCanvas, handleAddReference, handleSelectVariant,
    handleDeleteVariant, handleRename, handleUpdate,
  } = useComponentDetail(componentId);

  const [infoOpen, setInfoOpen] = useState(false);

  if (!component) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[13px] text-[var(--text-muted)]">
        Component not found.
      </div>
    );
  }

  const tabs = [
    { id: "components" as const, label: "Sub Components", count: children.length },
    { id: "versions" as const, label: "Versions", count: Math.max(0, variants.length - 1) },
    { id: "references" as const, label: "References", count: references.length ?? 0 },
  ] as const;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)]" data-type={type}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <ComponentBreadcrumb projectId={projectId} projectName={projectName} trail={trail} screen={screen} current={component} type={type} />
        <div className="flex items-center gap-2">
          <Link to={canvasHref} className="btn btn-ghost">
            <IconOpenCanvas size={14} strokeWidth={1.6} />
            Edit in canvas
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 border-t border-[var(--border)]" style={{ gridTemplateColumns: "minmax(360px, 40%) minmax(0, 1fr)" }}>
        <PreviewShell onFastEdit={() => setFastEditOpen(true)} canvasHref={canvasHref}>
          <div className="relative flex h-full max-h-full min-h-0 w-full max-w-full min-w-0 items-center justify-center">
            {displayVariant ? (
              <Snapshot kind="component" ownerType="variant" ownerId={displayVariant.id} seedKey={displayVariant.seedKey} type={type} emptyMode="preview" display="natural" />
            ) : null}
          </div>
        </PreviewShell>

        <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
          <div className="flex shrink-0 items-end justify-between gap-4 border-b border-[var(--border)] px-6 pb-[18px] pt-[22px]">
            <div>
              <div className="flex items-center gap-1.5">
                <EditableTitle value={component.name} label="Edit component name" onSave={handleRename} />
                {displayVariant && !isMainVariant(displayVariant) ? (
                  <span className="mb-1.5">
                    <VersionTagBadge tag={variantVersionLabel(displayVariant)} isMain={false} />
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--text-muted)]">
                {component.kind ? <span>{component.kind}</span> : <span>Componente</span>}
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
                <span>{variantCount} {variantCount === 1 ? "variante" : "variantes"}</span>
                <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
                <span>{children.length} {children.length === 1 ? "child component" : "child components"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="View history" onClick={() => historyRef.current?.open()}
                className="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[12px] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
              >
                <IconHistory size={13} strokeWidth={1.7} />
                History
              </button>
              <button type="button" aria-label="Edit information" onClick={() => setInfoOpen(true)}
                className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
              >
                <IconPencil size={12} strokeWidth={1.7} />
              </button>
              <span className="rounded border border-[var(--border)] px-[7px] py-0.5 text-[10.5px] uppercase tracking-[0.4px] text-[var(--text-faint)]">
                {children.length} component{children.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {infoOpen ? (
            <InlineInfoPanel title="Component information" onClose={() => setInfoOpen(false)}>
              <ComponentInfoPanel component={component} onSave={handleUpdate} />
            </InlineInfoPanel>
          ) : (
            <>
          <SideTabs tabs={tabs} active={sideTab} onChange={setSideTab} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
              <SideSearch query={query} onChange={setQuery} />
              {sideTab === "components" ? <SideKindFilter value={filter} onChange={setFilter} /> : null}
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-x-4 gap-y-[22px] overflow-y-auto px-6 pb-8 pt-[22px]"
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
                      linked={linkedChildIds.has(c.id)}
                      onRequestDelete={setPendingChildDelete}
                      onOpenCanvas={handleOpenCanvas}
                    />
                  ))}
                  {filteredChildren.length === 0 && (
                    <SideEmptyState title="No sub component found" description="Children of this component will appear here when created." actionLabel="New component" onAction={children.length === 0 ? openNewChild : undefined} />
                  )}
                  {filteredChildren.length > 0 ? <AddCard label="New component" onClick={openNewChild} /> : null}
                </>
              )}
              {sideTab === "versions" && (
                <>
                  {variants.length > 1 && filteredVariants.map((v) => (
                    <VariantSideCard
                      key={v.id}
                      variant={v}
                      active={v.id === displayVariant?.id}
                      type={type}
                      onSelect={() => handleSelectVariant(v.id)}
                      onOpenCanvas={() => handleOpenVersionCanvas(v.id)}
                      onFastEdit={() => {}}
                      onDelete={() => handleDeleteVariant(v.id)}
                    />
                  ))}
                  {variants.length <= 1 && (
                    <SideEmptyState
                      title="No versions yet"
                      description="Save a copy of this component's current canvas state to create a version."
                      actionLabel="New version"
                      onAction={() => void addVariant()}
                    />
                  )}
                  {variants.length > 1 && <AddCard label="New version" onClick={() => void addVariant()} />}
                </>
              )}
              {sideTab === "references" && (
                <SideReferencesTab
                  references={filteredReferences}
                  query={query}
                  onAdd={() => addRefModalRef.current?.open()}
                  onOpen={(i) => referencesRef.current?.open(i)}
                  onRemove={(ref) => removeLinkedReference(ref.id)}
                />
              )}
            </div>
          </div>
            </>
          )}
        </aside>
      </div>

      <HistoryModal ref={historyRef} title="Component history" subtitle={`Changes made to "${component.name}" over time.`} commits={history} />
      <ReferencesModal ref={referencesRef} references={filteredReferences} onRemove={(ref) => removeLinkedReference(ref.id)} />
      <FastEditModal mode="component" open={fastEditOpen} onClose={() => setFastEditOpen(false)} component={component} variant={activeVariant} type={type} canvasHref={canvasHref} />
      <NewComponentModal ref={newComponentRef} projectId={project?.id ?? null} screens={screens} onCreated={handleComponentCreated} />
      <ConfirmActionModal
        open={Boolean(pendingChildDelete)}
        title="Delete component"
        message={pendingChildDelete ? `The component "${pendingChildDelete.name}" will be removed along with subcomponents and variants.` : ""}
        onClose={() => setPendingChildDelete(null)}
        onConfirm={handleChildDeleteConfirm}
      />
      <AddReferenceModal ref={addRefModalRef} projectId={project?.id ?? null} screens={screens} components={projectComponents} existingReferences={references} defaultComponentId={component.id} onAdd={handleAddReference} />
      <VersionModeModal ref={versionModeRef} />
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function SideTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ readonly id: T; readonly label: string; readonly count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex shrink-0 gap-0.5 border-b border-[var(--border)] px-3.5">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={[
              "relative cursor-pointer border-0 bg-transparent px-3.5 py-3 text-[12px] font-medium",
              isActive ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {t.label}
            {t.count ? (
              <span className="ml-1.5 text-[10.5px] text-[var(--text-faint)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {t.count}
              </span>
            ) : null}
            {isActive ? <span className="absolute -bottom-px left-3.5 right-3.5 h-0.5 rounded-[2px] bg-[var(--text)]" /> : null}
          </button>
        );
      })}
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

function SideKindFilter({ value, onChange }: { value: ScreenCmpKindFilter; onChange: (v: ScreenCmpKindFilter) => void }) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label="Filter by type"
        value={value}
        onChange={(e) => onChange(e.target.value as ScreenCmpKindFilter)}
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
      <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-[6px] w-[6px] -translate-y-[70%] rotate-45 border-b-[1.5px] border-r-[1.5px] border-[var(--text-muted)]" />
    </div>
  );
}

function EditableTitle({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="mb-1.5 h-[32px] min-w-[260px] rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-2 text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => { setDraft(value); setEditing(true); }}
      className="group/title mb-1.5 flex cursor-text items-center border-0 bg-transparent p-0 text-left text-[22px] font-semibold tracking-[-0.3px] text-[var(--text)]"
    >
      <span>{value}</span>
      <span className="ml-0 grid h-6 w-0 place-items-center overflow-hidden rounded-md border border-transparent text-[var(--text-faint)] opacity-0 transition-all group-hover/title:ml-2 group-hover/title:w-6 group-hover/title:border-[var(--border)] group-hover/title:opacity-100">
        <IconFastEdit size={12} strokeWidth={1.7} />
      </span>
    </button>
  );
}

function ComponentBreadcrumb({
  projectId, projectName, trail, screen, current, type,
}: {
  projectId: string;
  projectName: string;
  trail: ComponentRow[];
  screen: ScreenRow | null | undefined;
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
          <Link to={`/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {screen.title}
          </Link>
        </>
      ) : null}
      {trail.map((c) => (
        <span key={c.id} className="flex items-center gap-2.5">
          <span className="text-[var(--text-faint)]">/</span>
          <Link to={`/project/${encodeURIComponent(projectId)}/c/${c.id}`} className="text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            {c.name}
          </Link>
        </span>
      ))}
      <span className="text-[var(--text-faint)]">/</span>
      <span className="text-[13px] font-medium text-[var(--text)]">{current.name}</span>
      <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.4px] text-[var(--text-faint)]">{type}</span>
    </div>
  );
}

// ── Component-specific side cards ─────────────────────────────────────────────

function VariantSideCard({
  variant, active, type, onSelect, onOpenCanvas, onFastEdit, onDelete,
}: {
  variant: VariantRow;
  active: boolean;
  type: ProjectType;
  onSelect: () => void;
  onOpenCanvas: () => void;
  onFastEdit?: () => void;
  onDelete: () => void;
}) {
  const label = variantVersionLabel(variant);
  const isMain = label === "main";
  return (
    <div className="group flex flex-col gap-2.5 text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5">
      <div className={["relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border bg-[var(--bg)] p-3 transition-colors", active ? "border-[var(--text-muted)]" : "border-[var(--border)] group-hover:border-[var(--border-strong)]"].join(" ")}>
        <button type="button" onClick={onSelect} aria-label={`Select version ${label}`} className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 text-left text-inherit" />
        <div className="h-full w-full overflow-hidden">
          <Snapshot kind="component" ownerType="variant" ownerId={variant.id} seedKey={variant.seedKey} type={type} display="card" />
        </div>
        <CardMenu buttons={versionCardButtons({ isMain, onOpenCanvas, onFastEdit, onDelete })} />
      </div>
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <VersionTagBadge tag={label} isMain={isMain} />
      </div>
    </div>
  );
}

function ChildCard({
  component, variant, projectId, type, linked = false, onRequestDelete, onOpenCanvas,
}: {
  component: ComponentRow;
  variant: VariantRow | null;
  projectId: string;
  type: ProjectType;
  linked?: boolean;
  onRequestDelete: (c: ComponentRow) => void;
  onOpenCanvas: (variantId: string) => void;
}) {
  const navigate = useNavigate();
  const href = `/project/${encodeURIComponent(projectId)}/c/${component.id}`;
  return (
    <Link to={href} className="group flex cursor-pointer flex-col gap-2.5 text-inherit no-underline transition-transform duration-[120ms] hover:-translate-y-0.5">
      <div className={["preview-dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border p-4 transition-colors", linked ? "border-[#9b6dff] group-hover:border-[#b69cff]" : "border-[var(--border)] group-hover:border-[var(--border-strong)]"].join(" ")}>
        {variant ? <Snapshot kind="component" ownerType="variant" ownerId={variant.id} seedKey={variant.seedKey} type={type} display="card" /> : null}
        <CardSourceIcon
          scope={linked ? "screen" : scopeOf(component)}
          className={linked ? "border-[#9b6dff] text-[#c9b3ff]" : undefined}
        />
        <CardMenu
          buttons={[
            { key: "open", label: "Open component", icon: CardMenuIcons.Open, onClick: () => navigate(href) },
            { key: "canvas", label: "Open in canvas", icon: CardMenuIcons.Canvas, onClick: () => { if (variant) onOpenCanvas(variant.id); } },
            ...(linked ? [] : [{ key: "more", label: "More", icon: CardMenuIcons.More, menuItems: [{ key: "delete", label: "Delete component", icon: CardMenuIcons.Trash, destructive: true, onClick: () => onRequestDelete(component) }] }]),
          ]}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={["min-w-0 flex-1 truncate text-[13px] font-medium", linked ? "text-[#c9b3ff]" : "text-[var(--text)]"].join(" ")}>{component.name}</span>
          {linked ? (
            <span className="flex-shrink-0 rounded border border-[#9b6dff] bg-[rgba(155,109,255,0.1)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[#c9b3ff]">linked</span>
          ) : component.kind ? (
            <span className="flex-shrink-0 rounded border border-[var(--border)] px-1.5 py-px text-[9.5px] uppercase leading-[14px] tracking-[0.5px] text-[var(--text-faint)]">{component.kind}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

// ── Inline info panel ─────────────────────────────────────────────────────────

function InlineInfoPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3">
        <span className="text-[13px] font-medium text-[var(--text)]">{title}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconClose size={11} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {children}
      </div>
    </div>
  );
}

function ScreenInfoPanel({ screen, type, onSave }: {
  screen: ScreenRow;
  type: ProjectType;
  onSave: (patch: Partial<Pick<ScreenRow, "variant">>) => void;
}) {
  const SCREEN_VARIANTS: Array<{ value: ScreenVariant; label: string }> = [
    { value: "blank", label: "Blank" },
    { value: "empty", label: "Empty" },
    { value: "hero", label: "Hero" },
    { value: "list", label: "List" },
    { value: "detail", label: "Detail" },
    { value: "form", label: "Form" },
    { value: "profile", label: "Profile" },
  ];

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--text-faint)]">Template</span>
        <select
          value={screen.variant}
          onChange={(e) => onSave({ variant: e.target.value as ScreenVariant })}
          className="h-9 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
        >
          {SCREEN_VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-col border-t border-[var(--border)] pt-4">
        <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
          <span className="text-[11.5px] text-[var(--text-faint)]">Type</span>
          <span className="text-[11.5px] text-[var(--text-muted)]">{type}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
          <span className="text-[11.5px] text-[var(--text-faint)]">ID</span>
          <span className="min-w-0 truncate font-mono text-[10.5px] text-[var(--text-muted)]">{screen.id}</span>
        </div>
      </div>
    </>
  );
}

function ComponentInfoPanel({
  component, onSave,
}: {
  component: ComponentRow;
  onSave: (patch: Partial<Pick<ComponentRow, "description" | "category" | "kind">>) => void;
}) {
  const [description, setDescription] = useState(component.description ?? "");
  const [category, setCategory] = useState(component.category ?? "");
  const [kind, setKind] = useState<ComponentKind | "">(component.kind ?? "");

  useEffect(() => {
    setDescription(component.description ?? "");
    setCategory(component.category ?? "");
    setKind(component.kind ?? "");
  }, [component.id, component.description, component.category, component.kind]);

  return (
    <div className="col-span-full flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--text-faint)]">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onSave({ description: description.trim() || undefined })}
          placeholder="Describe this component role..."
          className="min-h-[96px] resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] leading-[1.5] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-[var(--text-faint)]">Tipo</span>
          <select
            value={kind}
            onChange={(e) => { const next = e.target.value as ComponentKind | ""; setKind(next); onSave({ kind: next || undefined }); }}
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
            onChange={(e) => setCategory(e.target.value)}
            onBlur={() => onSave({ category: category.trim() || undefined })}
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
