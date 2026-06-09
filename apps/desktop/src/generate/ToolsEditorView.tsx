import { Link } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Crop,
  Image as ImageIcon,
  Minus,
  Move,
  Pencil,
  Pipette,
  Plus,
  Upload,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GeneratorHeader } from "./ui/GeneratorHeader";

import { componentSubtreeIds } from "./engine/componentTree";

import { ComponentTreeItem } from "./ui/ComponentTreeItem";
import { ElementInfoCard } from "./ui/ElementInfoCard";
import { ModeButton } from "./ui/ModeButton";
import {
  RailToolButton,
  BuilderStackTabs,
  CropsOverlayToggle,
  IconButton,
  Key,
} from "./ui/RailTools";
import {
  SidebarTabs,
  SidebarComponentsHeader,
  SidebarSaveButton,
  SidebarConfigPanel,
} from "./ui/BuilderSidebar";
import { ConfirmActionModal } from "./ui/ConfirmModal";
import { ReferenceGroupNavigator } from "./ui/ReferenceGroupNavigator";
import { RootSwitcher } from "./ui/RootSwitcher";

import {
  useToolsEditor,
  type ToolsEditorProps,
} from "./hooks/useToolsEditor";
import { MIN_TOOL_ZOOM } from "./types";

export function ToolsEditorView({ item, referenceId, groupContext, onUploadedLocally }: ToolsEditorProps) {
  const {
    // Refs
    fileInputRef,
    stageViewportRef,
    imgRef,
    overlayCanvasRef,
    cropsCanvasRef,

    // State
    currentTool,
    viewMode,
    selectedComponentId,
    selection,
    selectionLocked,
    editingComponentId,
    showCropsOverlay,
    hoveredComponentId,
    imageError,
    uploading,
    pendingConfirmation,
    savingStack,
    stackSaveStatus,
    expandedComponentIds,
    sidebarTab,
    cropsOverlayColor,
    cropsOverlayAlpha,

    // Setters
    setShowCropsOverlay,
    setHoveredComponentId,
    setImageError,
    setPendingConfirmation,
    setSidebarTab,
    setCropsOverlayColor,
    setCropsOverlayAlpha,

    // Viewport
    toolZoom,
    toolPan,
    handleStageWheel,
    handleZoomIn,
    handleZoomOut,
    zoomPercent,

    // Computed values
    components,
    selectedComponent,
    rootComponent,
    roots,
    activeScopeId,
    activeRoot,
    componentTree,
    scopedComponents,
    stackedComponents,
    cutCountByRoot,
    activeSubject,
    headerSubject,
    canCrop,
    selectionSize,
    confirmationCopy,
    showGroupNavigator,
    rootComponentId,

    // Handlers
    bumpPaintVersion,
    cancelSelection,
    expandAllComponents,
    collapseAllComponents,
    setTool,
    openOriginal,
    openBuilderMode,
    openStackMode,
    openComponent,
    selectRoot,
    beginRootCreation,
    promoteToRoot,
    startEditComponent,
    openTreeComponent,
    requestResetConfirmation,
    confirmPendingAction,
    persistReferenceStack,
    canSaveSelection,
    saveSelection,
    uploadImage,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRemoveComponent,
    toggleComponentExpanded,
    setActiveRootId,
    updateComponents,
  } = useToolsEditor({ item, referenceId, groupContext, onUploadedLocally });

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <GeneratorHeader
          breadcrumb={
            <div className="inline-flex min-w-0 items-center gap-2 text-[12.5px]">
              <ChevronRight size={10} strokeWidth={1.8} className="text-[var(--text-faint)]" />
              {groupContext ? (
                <>
                  <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-muted)]">
                    {groupContext.name}
                  </span>
                  <ChevronRight size={10} strokeWidth={1.8} className="text-[var(--text-faint)]" />
                </>
              ) : null}
              <span className="max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap">
                {item.name || "Untitled"}
              </span>
            </div>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void uploadImage(event.target.files?.[0])}
        />

        <div
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: showGroupNavigator
              ? "220px 56px minmax(0,1fr) 340px"
              : "56px minmax(0,1fr) 340px",
          }}
        >
          {showGroupNavigator && groupContext ? (
            <ReferenceGroupNavigator
              group={groupContext}
              activeReferenceId={item.id}
            />
          ) : null}

          <aside className="flex flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-3">
            <RailToolButton
              active={currentTool === "move"}
              label="Mover"
              shortcut="V"
              onClick={() => setTool("move")}
            >
              <Move size={18} strokeWidth={1.7} />
            </RailToolButton>
            <RailToolButton
              active={currentTool === "crop"}
              disabled={!canCrop}
              label="Recortar"
              shortcut="C"
              onClick={() => setTool("crop")}
            >
              <Crop size={18} strokeWidth={1.7} />
            </RailToolButton>
            <RailToolButton
              active={currentTool === "draw"}
              disabled={!canCrop}
              label="Desenhar"
              shortcut="D"
              onClick={() => setTool("draw")}
            >
              <Pencil size={18} strokeWidth={1.7} />
            </RailToolButton>
            <span className="my-1.5 h-px w-7 bg-[var(--border)]" />
            <RailToolButton label="Conta-gotas" disabled>
              <Pipette size={18} strokeWidth={1.7} />
            </RailToolButton>
          </aside>

          <section
            className="relative flex min-h-0 min-w-0 flex-col bg-[#0A0A0B]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          >
            <div
              ref={stageViewportRef}
              className={[
                "relative flex flex-1 items-center justify-center overflow-hidden p-8",
                (currentTool === "crop" || currentTool === "draw") && canCrop
                  ? "cursor-crosshair"
                  : "cursor-default",
              ].join(" ")}
              onWheel={handleStageWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handleStagePointerLeave}
              onPointerCancel={cancelSelection}
            >
              <BuilderStackTabs
                active={viewMode === "stack" ? "stack" : "builder"}
                stackDisabled={stackedComponents.length === 0}
                onBuilder={openBuilderMode}
                onStack={openStackMode}
              />

              <ElementInfoCard
                name={headerSubject.name || "—"}
                width={headerSubject.w}
                height={headerSubject.h}
                type={activeSubject.kind === "stack" && !selectedComponent ? "Full stack" : headerSubject.type || "—"}
                showBecomeRoot={Boolean(
                  selectedComponent &&
                    selectedComponent.parentId != null &&
                    !editingComponentId &&
                    !selection,
                )}
                onBecomeRoot={() => {
                  if (selectedComponent) promoteToRoot(selectedComponent.id);
                }}
              />

              <CropsOverlayToggle
                active={showCropsOverlay}
                onToggle={() => setShowCropsOverlay((value) => !value)}
              />

              {imageError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <ImageIcon size={24} strokeWidth={1.6} />
                  <h2 className="m-0 text-[16px] text-[var(--text)]">Image not found</h2>
                  <p className="m-0 text-[13px]">
                    Volte para <Link className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline" to="/references">References</Link>.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="relative max-h-full max-w-full overflow-visible rounded-[8px] bg-[#0E0E0E] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
                    style={{
                      transform: `translate(${toolPan.x}px, ${toolPan.y}px) scale(${toolZoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={activeSubject.url}
                      alt={activeSubject.name}
                      crossOrigin="anonymous"
                      draggable={false}
                      onLoad={() => {
                        setImageError(false);
                        bumpPaintVersion();
                      }}
                      onError={() => setImageError(true)}
                      className="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]"
                      style={{ imageRendering: toolZoom > MIN_TOOL_ZOOM ? "pixelated" : "auto" }}
                    />
                  </div>
                  <canvas
                    ref={cropsCanvasRef}
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{ mixBlendMode: viewMode === "stack" ? "normal" : "screen" }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                  />
                </>
              )}

              <div
                data-selection-action
                className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[rgba(20,20,22,0.85)] p-1 text-[11.5px] tabular-nums text-[var(--text-muted)] backdrop-blur-[6px]"
              >
                <IconButton
                  aria-label="Diminuir zoom"
                  disabled={toolZoom <= MIN_TOOL_ZOOM}
                  className={toolZoom <= MIN_TOOL_ZOOM ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--text-muted)]" : ""}
                  onClick={handleZoomOut}
                >
                  <Minus size={13} />
                </IconButton>
                <span className="min-w-12 px-2 text-center text-[var(--text)]">{zoomPercent}%</span>
                <IconButton aria-label="Aumentar zoom" onClick={handleZoomIn}>
                  <Plus size={13} />
                </IconButton>
              </div>
            </div>

            <div className="sticky bottom-0 z-20 flex min-h-[56px] shrink-0 items-center gap-2.5 border-t border-[var(--border)] bg-[rgba(15,15,16,0.82)] px-3.5 py-2.5 backdrop-blur-[8px]">
              <div className="inline-flex shrink-0 items-center gap-1.5">
                <ModeButton active={viewMode === "original"} onClick={openOriginal}>
                  <ImageIcon size={13} strokeWidth={1.8} />
                  Mostrar original
                </ModeButton>
                <ModeButton onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={13} strokeWidth={1.8} />
                  {uploading ? "Enviando..." : "Upload"}
                </ModeButton>
              </div>

              {selection ? (
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-[5px]">
                  <span className="px-1.5 font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">
                    {Math.round(selectionSize.w)} × {Math.round(selectionSize.h)}
                  </span>
                  <button
                    type="button"
                    data-selection-action
                    onClick={cancelSelection}
                    className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  >
                    Cancelar
                  </button>
                  {canCrop ? (
                    <button
                      type="button"
                      data-selection-action
                      disabled={!canSaveSelection}
                      onClick={() => void saveSelection()}
                      className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--text-faint)]"
                    >
                      <Check size={11} strokeWidth={2.2} />
                      Save component
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="ml-auto min-w-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {!canCrop ? (
                  <span>
                    Open a stack from the switcher to crop inside it. Click any component to{" "}
                    <b className="text-[var(--text-muted)]">Become root</b>.
                  </span>
                ) : editingComponentId ? (
                  <span>
                    Editing existing crop. Adjust the box and <Key>Enter</Key> saves · <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "crop" ? (
                  <span>
                    Click and drag over the open subject. <Key>Enter</Key> saves a component ·{" "}
                    <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "draw" ? (
                  <span>
                    Draw freely over the image. The drawn area becomes the crop. <Key>Enter</Key> saves ·{" "}
                    <Key>Esc</Key> cancels
                  </span>
                ) : (
                  <span>
                    Use <Key>C</Key> to crop or <Key>D</Key> to draw a component. Click a component to{" "}
                    <b className="text-[var(--text-muted)]">Become root</b>.
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
            <SidebarTabs active={sidebarTab} onChange={setSidebarTab} />

            {sidebarTab === "components" ? (
              <>
                <RootSwitcher
                  roots={roots}
                  activeRootId={activeScopeId}
                  cutCountByRoot={cutCountByRoot}
                  onSelect={selectRoot}
                  onNewRoot={beginRootCreation}
                  creating={false}
                />

                <SidebarComponentsHeader
                  rootName={activeRoot.isDefaultRoot ? "Full image" : activeRoot.name}
                  scopedCount={scopedComponents.length}
                  showReset={scopedComponents.length > 1 || !activeRoot.isDefaultRoot}
                  onExpandAll={expandAllComponents}
                  onCollapseAll={collapseAllComponents}
                  onReset={requestResetConfirmation}
                />

                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
                  {componentTree.map((node) => (
                    <ComponentTreeItem
                      key={node.component.id}
                      node={node}
                      activeId={viewMode === "component" || viewMode === "stack" ? selectedComponentId : null}
                      hoveredId={hoveredComponentId}
                      editingId={editingComponentId}
                      expandedIds={expandedComponentIds}
                      rootId={rootComponentId}
                      primaryId={activeScopeId}
                      onOpen={openTreeComponent}
                      onToggle={toggleComponentExpanded}
                      onHover={setHoveredComponentId}
                      onEdit={startEditComponent}
                      onRemove={(id) => {
                        const removedIds = componentSubtreeIds(components, id);
                        updateComponents((current) =>
                          current.filter((entry) => !removedIds.has(entry.id)),
                        );
                        if (removedIds.has(activeScopeId)) {
                          setActiveRootId(rootComponentId);
                          openOriginal();
                        } else if (selectedComponentId && removedIds.has(selectedComponentId)) {
                          openOriginal();
                        }
                      }}
                    />
                  ))}
                </div>

                <SidebarSaveButton
                  saving={savingStack}
                  saveStatus={stackSaveStatus}
                  onSave={() => void persistReferenceStack()}
                />
              </>
            ) : (
              <SidebarConfigPanel
                cropsOverlayColor={cropsOverlayColor}
                onChangeCropsOverlayColor={setCropsOverlayColor}
                cropsOverlayAlpha={cropsOverlayAlpha}
                onChangeCropsOverlayAlpha={setCropsOverlayAlpha}
              />
            )}
          </aside>
        </div>
      </div>
      {confirmationCopy ? (
        <ConfirmActionModal
          title={confirmationCopy.title}
          description={confirmationCopy.description}
          confirmLabel={confirmationCopy.confirmLabel}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </TooltipProvider>
  );
}

export default ToolsEditorView;
