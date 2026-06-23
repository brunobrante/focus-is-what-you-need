import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { VersionModeModal } from "@/components/modals/VersionModeModal";
import { Snapshot } from "@/components/Snapshot";
import { AddCard } from "@/components/screen/AddCard";
import { ComponentSideCard } from "@/components/screen/ComponentSideCard";
import { VersionTagBadge } from "@/components/screen/VersionSideCard";
import { SideEmptyState } from "@/components/screen/SideEmptyState";
import { FastEditModal, type FastEditModalHandle } from "@/components/screen/FastEditModal";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { CompareVersionsModal, type CompareVersionsModalHandle } from "@/components/modals/CompareVersionsModal";
import { NewComponentModal } from "@/components/modals/NewComponentModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { AddReferenceModal } from "@/components/modals/AddReferenceModal";
import type { ComponentRow, ScreenRow } from "@/lib/storage/schema";
import type { ComponentKind } from "@/lib/data/types";
import type { ScreenVersion } from "@/lib/data/screenVersions";
import { isMainVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import { updateComponent } from "@/lib/storage/repos/components.repo";
import { useComponentDetail } from "@/application/component-detail/useComponentDetail";
import { useUnlinkComponent } from "@/application/components/useUnlinkComponent";
import { useDeleteComponent } from "@/application/components/useDeleteComponent";
import { DetailView } from "./DetailView";
import { DetailBreadcrumb } from "./DetailBreadcrumb";

export function ComponentContent({ componentId }: { componentId: string }) {
  const {
    component, project, screens, variants, activeVariant, displayVariant, screen, trail,
    children, linkedChildIds, childVariants, projectComponents, references, type, projectId,
    projectName, variantCount, canvasHref, filteredChildren,
    filteredReferences, history, sideTab, setSideTab, query, setQuery,
    filter, setFilter,
    versionModeRef, historyRef, referencesRef, newComponentRef, addRefModalRef, confirmRef,
    openNewChild, addVariant, removeLinkedReference,
    handleComponentCreated, handleOpenCanvas, handleOpenVersionCanvas, handleAddReference, handleSelectVariant,
    handleDeleteVariant, handleRename, handleUpdate,
  } = useComponentDetail(componentId);

  const [infoOpen, setInfoOpen] = useState(false);
  const { requestToggle, modal: unlinkModal } = useUnlinkComponent();
  const { requestDelete, modal: deleteModal } = useDeleteComponent();
  const fastEditRef = useRef<FastEditModalHandle>(null);
  const compareRef = useRef<CompareVersionsModalHandle>(null);

  // A component is a master that owns a variant chain exactly like a screen, so its
  // versions feed the same VersionSwitcher + Compare model — mapped to the shared
  // ScreenVersion shape (tpl is unused for component snapshots, which key by ownerId).
  const versions = useMemo<ScreenVersion[]>(
    () =>
      variants.map((v) => ({
        id: v.id,
        variantId: v.id,
        title: component?.name ?? "Component",
        tag: variantVersionLabel(v),
        tpl: "detail",
        updated: "",
        author: "You",
        initials: "VC",
      })),
    [variants, component?.name],
  );

  // Open a compared version in the canvas: the main opens the component itself in
  // Current, a version opens through the persistent Versions window.
  const handleCompareOpenInCanvas = (ids: string[]) => {
    const id = ids[0];
    if (!id) return;
    const mainV = variants.find((v) => v.order <= 0) ?? activeVariant ?? null;
    if (mainV && id === mainV.id) handleOpenCanvas(id);
    else handleOpenVersionCanvas(id);
  };

  if (!component) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[13px] text-[var(--text-muted)]">
        Component not found.
      </div>
    );
  }

  const tabs = [
    { id: "components" as const, label: "Sub Components", count: children.length },
    { id: "references" as const, label: "References", count: references.length ?? 0 },
  ] as const;

  // Versions left the tab strip (now the top switcher), so the only tabs are
  // components + references; coerce any stale value back to a real tab.
  const displayTab: "components" | "references" =
    sideTab === "references" ? "references" : "components";

  return (
    <DetailView
      type={type}
      breadcrumb={
        <DetailBreadcrumb
          backHref={componentParentHref(projectId, trail, screen)}
          trail={[
            { label: "Projects", href: "/" },
            { label: projectName, href: `/project/${encodeURIComponent(projectId)}` },
            ...(screen ? [{ label: screen.title, href: `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}` }] : []),
            ...trail.map((c) => ({ label: c.name, href: `/project/${encodeURIComponent(projectId)}/c/${c.id}` })),
          ]}
          current={component.name}
          type={type}
        />
      }
      canvasHref={canvasHref}
      canvasLabel="Edit in canvas"
      preview={
        <div className="relative flex h-full max-h-full min-h-0 w-full max-w-full min-w-0 items-center justify-center">
          {displayVariant ? (
            <Snapshot kind="component" ownerType="variant" ownerId={displayVariant.id} seedKey={displayVariant.seedKey} type={type} emptyMode="preview" display="natural" />
          ) : null}
        </div>
      }
      onPreviewFastEdit={() => fastEditRef.current?.open({ mode: "component", component, variant: activeVariant ?? null, type, canvasHref })}
      previewCanvasHref={canvasHref}
      previewShowDevice={false}
      title={component.name}
      titleLabel="Edit component name"
      onTitleSave={handleRename}
      tagBadge={displayVariant && !isMainVariant(displayVariant) ? (
        <span className="mb-1.5">
          <VersionTagBadge tag={variantVersionLabel(displayVariant)} isMain={false} />
        </span>
      ) : null}
      meta={
        <>
          {component.kind ? <span>{component.kind}</span> : <span>Componente</span>}
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
          <span>{variantCount} {variantCount === 1 ? "variante" : "variantes"}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-[var(--text-faint)]" />
          <span>{children.length} {children.length === 1 ? "child component" : "child components"}</span>
        </>
      }
      onOpenHistory={() => historyRef.current?.open()}
      count={children.length}
      infoOpen={infoOpen}
      onOpenInfo={() => setInfoOpen(true)}
      onCloseInfo={() => setInfoOpen(false)}
      infoTitle="Component information"
      infoPanel={<ComponentInfoPanel component={component} onSave={handleUpdate} />}
      versions={versions}
      activeVersionId={displayVariant?.id ?? null}
      versionPreviewKind="component"
      onSelectVersion={handleSelectVariant}
      onAddVersion={() => void addVariant()}
      onCompare={() => compareRef.current?.open()}
      onOpenVersionCanvas={(v) => {
        if (!v.variantId) return;
        // The main variant is the component itself — open it in Current, never
        // through the Versions window.
        if (v.tag === "main") handleOpenCanvas(v.variantId);
        else handleOpenVersionCanvas(v.variantId);
      }}
      onDeleteVersion={(v) => { if (v.variantId) handleDeleteVariant(v.variantId); }}
      tabs={tabs}
      sideTab={displayTab}
      onTabChange={setSideTab}
      query={query}
      onQueryChange={setQuery}
      showKindFilter={displayTab === "components"}
      filter={filter}
      onFilterChange={setFilter}
      references={filteredReferences}
      onAddReference={() => addRefModalRef.current?.open()}
      onOpenReference={(i) => referencesRef.current?.open(i)}
      onRemoveReference={(ref) => removeLinkedReference(ref.id)}
      cardGrid={
        <>
          {filteredChildren.map((c) => (
            <ComponentSideCard
              key={c.id}
              component={c}
              variant={childVariants.get(c.id) ?? null}
              projectId={projectId}
              type={type}
              linked={linkedChildIds.has(c.id)}
              onRequestDelete={requestDelete}
              onOpenCanvas={handleOpenCanvas}
              onFastEdit={(cmp) => {
                const variant = childVariants.get(cmp.id) ?? null;
                const href = variant
                  ? `/canvas?project=${encodeURIComponent(projectId)}&type=${type}&variant=${variant.id}`
                  : canvasHref;
                fastEditRef.current?.open({ mode: "component", component: cmp, variant, type, canvasHref: href });
              }}
              onMoveTo={() => {}}
              onMakeGlobal={() => {}}
              onToggleLinkable={(cmp) => void requestToggle(cmp)}
            />
          ))}
          {filteredChildren.length === 0 && (
            <SideEmptyState title="No sub component found" description="Children of this component will appear here when created." actionLabel="New component" onAction={children.length === 0 ? openNewChild : undefined} />
          )}
          {filteredChildren.length > 0 ? <AddCard label="New component" onClick={openNewChild} /> : null}
        </>
      }
      modals={
        <>
          <HistoryModal ref={historyRef} title="Component history" subtitle={`Changes made to "${component.name}" over time.`} commits={history} />
          <CompareVersionsModal ref={compareRef} versions={versions} type={type} kind="component" onOpenInCanvas={handleCompareOpenInCanvas} />
          <ReferencesModal ref={referencesRef} references={filteredReferences} onRemove={(ref) => removeLinkedReference(ref.id)} />
          <FastEditModal ref={fastEditRef} />
          <NewComponentModal ref={newComponentRef} projectId={project?.id ?? null} screens={screens} onCreated={handleComponentCreated} />
          {/* Version deletes (from the switcher) confirm via the imperative API, matching the screen. */}
          <ConfirmActionModal ref={confirmRef} />
          <AddReferenceModal ref={addRefModalRef} projectId={project?.id ?? null} screens={screens} components={projectComponents} existingReferences={references} defaultComponentId={component.id} onAdd={handleAddReference} />
          <VersionModeModal ref={versionModeRef} />
          {unlinkModal}
          {deleteModal}
        </>
      }
    />
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

// The back chevron targets the component's immediate parent: the deepest trail
// ancestor, else the source screen, else the project root.
function componentParentHref(projectId: string, trail: ComponentRow[], screen: ScreenRow | null | undefined): string {
  if (trail.length > 0) return `/project/${encodeURIComponent(projectId)}/c/${trail[trail.length - 1].id}`;
  if (screen) return `/project/${encodeURIComponent(projectId)}/screen/${encodeURIComponent(screen.id)}`;
  return `/project/${encodeURIComponent(projectId)}`;
}

// ── Component info panel ──────────────────────────────────────────────────────

function ComponentInfoPanel({
  component, onSave,
}: {
  component: ComponentRow;
  onSave: (patch: Parameters<typeof updateComponent>[1]) => void;
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
          <span className="text-[11.5px] text-[var(--text-muted)]">Managed in the version switcher</span>
        </div>
      </div>
    </div>
  );
}
