import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconOpenCanvas } from "@/components/icons";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { VersionModeModal } from "@/components/modals/VersionModeModal";
import { Snapshot } from "@/components/Snapshot";
import { AddCard } from "@/components/screen/AddCard";
import { CardMenu, CardMenuIcons } from "@/components/screen/CardMenu";
import { CardSourceIcon, scopeOf } from "@/components/component/componentSource";
import { VersionTagBadge, versionCardButtons } from "@/components/screen/VersionSideCard";
import { SideEmptyState } from "@/components/screen/SideEmptyState";
import { FastEditModal, type FastEditModalHandle } from "@/components/screen/FastEditModal";
import { SideReferencesTab } from "@/components/screen/SideReferencesTab";
import { PreviewShell } from "@/components/screen/PreviewShell";
import { HistoryModal } from "@/components/modals/HistoryModal";
import { NewComponentModal } from "@/components/modals/NewComponentModal";
import { ReferencesModal } from "@/components/modals/ReferencesModal";
import { AddReferenceModal } from "@/components/modals/AddReferenceModal";
import type { ComponentRow, ScreenRow, VariantRow } from "@/lib/storage/schema";
import type { ComponentKind, ProjectType } from "@/lib/data/types";
import { isMainVariant, variantVersionLabel } from "@/lib/storage/repos/variants.repo";
import { updateComponent } from "@/lib/storage/repos/components.repo";
import { useComponentDetail } from "@/application/component-detail/useComponentDetail";
import { DetailSidebar } from "./DetailSidebar";

export function ComponentContent({ componentId }: { componentId: string }) {
  const {
    component, project, screens, variants, activeVariant, displayVariant, screen, trail,
    children, linkedChildIds, childVariants, projectComponents, references, type, projectId,
    projectName, variantCount, canvasHref, filteredChildren, filteredVariants,
    filteredReferences, history, sideTab, setSideTab, query, setQuery,
    filter, setFilter, pendingChildDelete,
    setPendingChildDelete, versionModeRef, historyRef, referencesRef, newComponentRef, addRefModalRef,
    openNewChild, addVariant, removeLinkedReference, handleChildDeleteConfirm,
    handleComponentCreated, handleOpenCanvas, handleOpenVersionCanvas, handleAddReference, handleSelectVariant,
    handleDeleteVariant, handleRename, handleUpdate,
  } = useComponentDetail(componentId);

  const [infoOpen, setInfoOpen] = useState(false);
  const fastEditRef = useRef<FastEditModalHandle>(null);

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
        <PreviewShell onFastEdit={() => fastEditRef.current?.open({ mode: "component", component, variant: activeVariant ?? null, type, canvasHref })} canvasHref={canvasHref} showDevice={false}>
          <div className="relative flex h-full max-h-full min-h-0 w-full max-w-full min-w-0 items-center justify-center">
            {displayVariant ? (
              <Snapshot kind="component" ownerType="variant" ownerId={displayVariant.id} seedKey={displayVariant.seedKey} type={type} emptyMode="preview" display="natural" />
            ) : null}
          </div>
        </PreviewShell>

        <DetailSidebar
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
          tabs={tabs}
          sideTab={sideTab}
          onTabChange={setSideTab}
          query={query}
          onQueryChange={setQuery}
          showKindFilter={sideTab === "components"}
          filter={filter}
          onFilterChange={setFilter}
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
                  onOpenCanvas={() =>
                    // The main variant is the component itself, not a version —
                    // open it in Current, never through the Versions window.
                    v.order <= 0 ? handleOpenCanvas(v.id) : handleOpenVersionCanvas(v.id)
                  }
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
        </DetailSidebar>
      </div>

      <HistoryModal ref={historyRef} title="Component history" subtitle={`Changes made to "${component.name}" over time.`} commits={history} />
      <ReferencesModal ref={referencesRef} references={filteredReferences} onRemove={(ref) => removeLinkedReference(ref.id)} />
      <FastEditModal ref={fastEditRef} />
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

// ── Breadcrumb ────────────────────────────────────────────────────────────────

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
          <span className="text-[11.5px] text-[var(--text-muted)]">Managed in the Variants tab</span>
        </div>
      </div>
    </div>
  );
}
