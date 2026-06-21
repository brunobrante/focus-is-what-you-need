import { useState } from "react";
import { Link } from "react-router-dom";
import { SceneCanvasViewer } from "@/components/screen/SceneCanvasViewer";
import { IconChevronLeft } from "@/components/icons";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { VersionModeModal } from "@/components/modals/VersionModeModal";
import { AddCard } from "@/components/screen/AddCard";
import { ComponentSideCard } from "@/components/screen/ComponentSideCard";
import { PreviewMockImage, VersionTagBadge } from "@/components/screen/VersionSideCard";
import { SideEmptyState } from "@/components/screen/SideEmptyState";
import { FastEditModal } from "@/components/screen/FastEditModal";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { CompareVersionsModal } from "@/components/modals/CompareVersionsModal";
import { NewComponentModal } from "@/components/modals/NewComponentModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { AddReferenceModal } from "@/components/modals/AddReferenceModal";
import type { ScreenRow } from "@/lib/storage/schema";
import type { ProjectType, ScreenVariant } from "@/lib/data/types";
import { updateScreen } from "@/lib/storage/repos/screens.repo";
import { useScreenDetail } from "@/application/screen-detail/useScreenDetail";
import { DetailView } from "./DetailView";

export function ScreenContent({ projectId, screenId: rawScreenId }: { projectId: string; screenId: string }) {
  const screenId = decodeURIComponent(rawScreenId);
  const pid = decodeURIComponent(projectId);

  const {
    project, screens, screen, components, activeVariants, references,
    type, canUseFactoryMocks, projectName, screenName, tpl, tplLabel,
    prevScreen, nextScreen, canvasHref, filteredComponents, linkedComponentIds,
    filteredReferences, sideTab, setSideTab, query, setQuery, filter, setFilter,
    displayComponents,
    versions, activeVersionId, setActiveVersionId, activeVersion, activeTpl, isPreviewingVersion,
    previewVariantId, previewCanvasHref,
    versionModeRef, historyRef, compareRef, referencesRef, newComponentRef, addRefModalRef, fastEditRef, confirmRef,
    defaultHistory, projectDims, buildScreenHref, buildComponentFastEditHref, openNewComponent, addVersion,
    removeLinkedReference, requestDeleteComponent, handleOpenCanvas, handleOpenScreenCanvas, handleOpenVersionCanvas, handleDeleteVersion, handleScreenTitleSave,
    handleNewComponentCreated, handleCompareOpenInCanvas, handleAddReference,
  } = useScreenDetail(screenId, pid);

  const [infoOpen, setInfoOpen] = useState(false);

  const tabs = [
    { id: "components" as const, label: "Sub Components", count: displayComponents.length },
    { id: "references" as const, label: "References", count: references.length },
  ] as const;

  const stepperDetails = [`${components.length} component${components.length === 1 ? "" : "s"}`, projectDims[type]];

  return (
    <DetailView
      type={type}
      breadcrumb={
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
      }
      canvasHref={canvasHref}
      canvasLabel="Open canvas"
      preview={
        screen ? (
          <SceneCanvasViewer source="stored" ownerType="variant" ownerId={activeVersionId ?? screen.activeVariantId} kind="screen" />
        ) : (
          <PreviewMockImage tpl={activeTpl} type={type} allowMock={canUseFactoryMocks} />
        )
      }
      onPreviewFastEdit={() => fastEditRef.current?.open({ mode: "screen", screen, components: displayComponents, type, canvasHref: previewCanvasHref, variantId: previewVariantId })}
      previewCanvasHref={previewCanvasHref}
      prev={!isPreviewingVersion && prevScreen ? { name: prevScreen.title, details: stepperDetails, href: buildScreenHref(prevScreen.id), screenId: prevScreen.id } : undefined}
      next={!isPreviewingVersion && nextScreen ? { name: nextScreen.title, details: stepperDetails, href: buildScreenHref(nextScreen.id), screenId: nextScreen.id } : undefined}
      title={screen?.title ?? screenName}
      titleLabel="Edit screen name"
      onTitleSave={handleScreenTitleSave}
      tagBadge={activeVersion && activeVersion.tag && activeVersion.tag !== "main" ? (
        <span className="mb-1.5">
          <VersionTagBadge tag={activeVersion.tag} isMain={false} />
        </span>
      ) : null}
      meta={
        <>
          <span>{projectDims[type]}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
          <span>{tplLabel[tpl]}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
          <span>updated 1 hour ago</span>
        </>
      }
      onOpenHistory={() => historyRef.current?.open()}
      count={displayComponents.length}
      infoOpen={infoOpen}
      onOpenInfo={() => setInfoOpen(true)}
      onCloseInfo={() => setInfoOpen(false)}
      infoTitle="Screen information"
      infoPanel={
        screen ? (
          <ScreenInfoPanel screen={screen} type={type} onSave={(patch) => void updateScreen(screen.id, patch)} />
        ) : (
          <p className="text-[13px] text-[var(--text-faint)]">No screen data available yet.</p>
        )
      }
      versions={versions}
      activeVersionId={activeVersionId}
      versionPreviewKind="screen"
      onSelectVersion={setActiveVersionId}
      onAddVersion={addVersion}
      onCompare={() => compareRef.current?.open()}
      onOpenVersionCanvas={(v) => {
        // The main is the screen itself, not a version — open it in Current.
        if (v.tag === "main") handleOpenScreenCanvas();
        else if (v.variantId) handleOpenVersionCanvas(v.variantId);
      }}
      onDeleteVersion={(v) => { if (v.variantId) handleDeleteVersion(v.variantId, v.tag ?? v.title); }}
      tabs={tabs}
      sideTab={sideTab}
      onTabChange={setSideTab}
      query={query}
      onQueryChange={setQuery}
      showKindFilter={sideTab === "components"}
      filter={filter}
      onFilterChange={setFilter}
      references={filteredReferences}
      onAddReference={() => addRefModalRef.current?.open()}
      onOpenReference={(i) => referencesRef.current?.open(i)}
      onRemoveReference={(ref) => removeLinkedReference(ref.id)}
      cardGrid={
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
                const href = buildComponentFastEditHref(cmp);
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
      }
      modals={
        <>
          <HistoryModal ref={historyRef} title="Screen history" subtitle={`Changes made to "${screenName}" over time.`} commits={defaultHistory} />
          <CompareVersionsModal ref={compareRef} versions={versions} type={type} allowMock={canUseFactoryMocks} onOpenInCanvas={handleCompareOpenInCanvas} />
          <ReferencesModal ref={referencesRef} references={filteredReferences} onRemove={(ref) => removeLinkedReference(ref.id)} />
          <AddReferenceModal ref={addRefModalRef} projectId={project?.id ?? null} screens={screens} components={[]} existingReferences={references} defaultScreenId={screen?.id} onAdd={handleAddReference} />
          <FastEditModal ref={fastEditRef} />
          <NewComponentModal ref={newComponentRef} projectId={project?.id ?? null} screens={screens} onCreated={handleNewComponentCreated} />
          <ConfirmActionModal ref={confirmRef} />
          <VersionModeModal ref={versionModeRef} />
        </>
      }
    />
  );
}

// ── Screen info panel ─────────────────────────────────────────────────────────

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
