import { Link } from "react-router-dom";
import {
  Brush,
  Check,
  ChevronRight,
  Crop,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minus,
  Move,
  Pencil,
  Pipette,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
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
import { useState } from "react";
import { useProcessingFeatures } from "@/lib/models/useProcessingFeatures";
import {
  bytesToPngDataUrl,
  urlToBytes,
  runBirefnet,
  runRealEsrgan,
  type ProcessingFeatureKey,
} from "@/lib/models/modelCommands";

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
    brushSize,
    editingComponentId,
    showCropsOverlay,
    hoveredComponentId,
    imageError,
    uploading,
    proposedRegions,
    autoDetecting,
    applyingProposals,
    autoDetectMessage,
    pendingConfirmation,
    savingStack,
    stackSaveStatus,
    expandedComponentIds,
    sidebarTab,
    cropsOverlayColor,
    cropsOverlayAlpha,

    // Setters
    setBrushSize,
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
    autoDetect,
    applyProposedRegions,
    discardAllProposedRegions,
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

  const features = useProcessingFeatures();
  const hasProcessingFeature = features.birefnet.installed || features.realEsrgan.installed;
  // Session-local processed images keyed by component id; not persisted in v1.
  const [processedByCutId, setProcessedByCutId] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<{ id: string; kind: ProcessingFeatureKey } | null>(null);

  const activeCutId =
    activeSubject.kind === "component" && selectedComponent ? selectedComponent.id : null;
  const displayUrl = (activeCutId && processedByCutId[activeCutId]) || activeSubject.url;
  const runningKind = running && running.id === activeCutId ? running.kind : null;
  const canRevert = Boolean(activeCutId && processedByCutId[activeCutId]);

  async function runProcessing(kind: ProcessingFeatureKey) {
    if (!selectedComponent || running) return;
    const id = selectedComponent.id;
    const source = processedByCutId[id] ?? activeSubject.url;
    setRunning({ id, kind });
    try {
      const input = await urlToBytes(source);
      const output = kind === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
      setProcessedByCutId((prev) => ({ ...prev, [id]: bytesToPngDataUrl(output) }));
      // TODO: persist processed result
    } catch (error) {
      console.error(`Processing (${kind}) failed`, error);
    } finally {
      setRunning(null);
    }
  }

  // Draw toolbar: commit the drawn region as a cut, optionally post-processed.
  const [drawAction, setDrawAction] = useState<"crop" | ProcessingFeatureKey | null>(null);
  async function commitDraw(action: "crop" | ProcessingFeatureKey) {
    if (!canSaveSelection || drawAction) return;
    setDrawAction(action);
    try {
      await saveSelection(action === "crop" ? undefined : action);
    } finally {
      setDrawAction(null);
    }
  }

  // Reverts the open component back to its original, unprocessed image.
  function revertProcessing() {
    if (!activeCutId) return;
    setProcessedByCutId((prev) => {
      if (!(activeCutId in prev)) return prev;
      const next = { ...prev };
      delete next[activeCutId];
      return next;
    });
  }

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

            {hasProcessingFeature ? (
              <>
                <span className="my-1.5 h-px w-7 bg-[var(--border)]" />
                {features.birefnet.installed ? (
                  <RailToolButton
                    label="Remove background"
                    disabled={!activeCutId || running !== null}
                    onClick={() => void runProcessing("birefnet")}
                  >
                    {runningKind === "birefnet" ? (
                      <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
                    ) : (
                      <Eraser size={18} strokeWidth={1.7} />
                    )}
                  </RailToolButton>
                ) : null}
                {features.realEsrgan.installed ? (
                  <RailToolButton
                    label="Upscale 4×"
                    disabled={!activeCutId || running !== null}
                    onClick={() => void runProcessing("realEsrgan")}
                  >
                    {runningKind === "realEsrgan" ? (
                      <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
                    ) : (
                      <Maximize2 size={18} strokeWidth={1.7} />
                    )}
                  </RailToolButton>
                ) : null}
                <RailToolButton
                  label="Revert to original"
                  disabled={!canRevert || running !== null}
                  onClick={revertProcessing}
                >
                  <RotateCcw size={18} strokeWidth={1.7} />
                </RailToolButton>
              </>
            ) : null}
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

              {proposedRegions.length > 0 ? (
                <div
                  data-selection-action
                  className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-[#A78BFA66] bg-[rgba(20,20,22,0.92)] p-1.5 pl-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
                >
                  <Sparkles size={13} strokeWidth={1.8} className="text-[#A78BFA]" />
                  <span className="text-[11.5px] text-[var(--text)]">
                    {proposedRegions.length} proposed {proposedRegions.length === 1 ? "region" : "regions"}
                  </span>
                  <span className="px-0.5 text-[10.5px] text-[var(--text-faint)]">
                    drag to adjust · × to discard
                  </span>
                  <span className="h-5 w-px bg-[var(--border)]" />
                  <button
                    type="button"
                    data-selection-action
                    disabled={applyingProposals}
                    onClick={() => void applyProposedRegions()}
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {applyingProposals ? (
                      <Loader2 size={12} strokeWidth={1.9} className="animate-spin" />
                    ) : (
                      <Check size={12} strokeWidth={2.2} />
                    )}
                    Apply all
                  </button>
                  <button
                    type="button"
                    data-selection-action
                    disabled={applyingProposals}
                    onClick={discardAllProposedRegions}
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={12} strokeWidth={1.9} />
                    Discard all
                  </button>
                </div>
              ) : null}

              {autoDetecting ? (
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[10px] border border-[#A78BFA66] bg-[rgba(20,20,22,0.92)] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-[8px]">
                  <Loader2 size={15} strokeWidth={1.9} className="animate-spin text-[#A78BFA]" />
                  <span className="text-[12px] text-[var(--text)]">Detecting components…</span>
                </div>
              ) : null}

              {autoDetectMessage ? (
                <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-[8px] border border-[var(--border)] bg-[rgba(20,20,22,0.92)] px-3 py-2 text-[12px] text-[var(--text)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-[8px]">
                  {autoDetectMessage}
                </div>
              ) : null}

              {selection && currentTool !== "draw" ? (
                <div
                  data-selection-action
                  className="absolute right-3 top-3 z-30 inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] p-1"
                >
                  <span className="px-1.5 font-mono text-[10.5px] tabular-nums text-[var(--text-muted)]">
                    {Math.round(selectionSize.w)} × {Math.round(selectionSize.h)}
                  </span>
                  <button
                    type="button"
                    data-selection-action
                    onClick={cancelSelection}
                    className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  >
                    Cancelar
                  </button>
                  {canCrop ? (
                    <button
                      type="button"
                      data-selection-action
                      disabled={!canSaveSelection}
                      onClick={() => void saveSelection()}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--surface)] disabled:text-[var(--text-faint)]"
                    >
                      <Check size={10} strokeWidth={2.2} />
                      Save
                    </button>
                  ) : null}
                </div>
              ) : null}

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
                      src={displayUrl}
                      alt={activeSubject.name}
                      crossOrigin="anonymous"
                      draggable={false}
                      onLoad={() => {
                        setImageError(false);
                        bumpPaintVersion();
                      }}
                      onError={() => setImageError(true)}
                      className="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px] transition-opacity"
                      style={{
                        imageRendering: toolZoom > MIN_TOOL_ZOOM ? "pixelated" : "auto",
                        opacity: autoDetecting ? 0.55 : 1,
                      }}
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

              {currentTool === "draw" ? (
                <div
                  data-selection-action
                  className="absolute bottom-3.5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[rgba(20,20,22,0.9)] p-1.5 pl-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-[8px]"
                >
                  <div className="flex items-center gap-2">
                    <Brush size={13} strokeWidth={1.8} className="text-[var(--text-muted)]" />
                    <input
                      type="range"
                      min={1}
                      max={24}
                      step={1}
                      value={brushSize}
                      aria-label="Brush size"
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                      className="h-1.5 w-[110px] cursor-pointer appearance-none rounded-full bg-[var(--border-strong)] accent-[var(--text)]"
                    />
                    <span className="w-5 text-center text-[11px] tabular-nums text-[var(--text-muted)]">
                      {brushSize}
                    </span>
                  </div>

                  <span className="h-5 w-px bg-[var(--border)]" />

                  {canSaveSelection ? (
                    <span className="px-0.5 font-mono text-[10.5px] tabular-nums text-[var(--text-faint)]">
                      {Math.round(selectionSize.w)} × {Math.round(selectionSize.h)}
                    </span>
                  ) : (
                    <span className="px-0.5 text-[10.5px] text-[var(--text-faint)]">Draw a region</span>
                  )}

                  <DrawActionButton
                    label="Crop"
                    primary
                    icon={<Crop size={12} strokeWidth={1.9} />}
                    busy={drawAction === "crop"}
                    disabled={!canSaveSelection || drawAction !== null}
                    onClick={() => void commitDraw("crop")}
                  />
                  {features.birefnet.installed ? (
                    <DrawActionButton
                      label="Remove BG"
                      icon={<Eraser size={12} strokeWidth={1.9} />}
                      busy={drawAction === "birefnet"}
                      disabled={!canSaveSelection || drawAction !== null}
                      onClick={() => void commitDraw("birefnet")}
                    />
                  ) : null}
                  {features.realEsrgan.installed ? (
                    <DrawActionButton
                      label="Upscale"
                      icon={<Maximize2 size={12} strokeWidth={1.9} />}
                      busy={drawAction === "realEsrgan"}
                      disabled={!canSaveSelection || drawAction !== null}
                      onClick={() => void commitDraw("realEsrgan")}
                    />
                  ) : null}

                  <button
                    type="button"
                    data-selection-action
                    disabled={!selection || drawAction !== null}
                    onClick={cancelSelection}
                    className="ml-0.5 inline-flex h-7 cursor-pointer items-center rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
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
                {features.florence2.installed ? (
                  <ModeButton
                    onClick={() => void autoDetect()}
                    disabled={!canCrop || autoDetecting}
                  >
                    {autoDetecting ? (
                      <Loader2 size={13} strokeWidth={1.8} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} strokeWidth={1.8} />
                    )}
                    {autoDetecting ? "Detecting…" : "Auto-detect"}
                  </ModeButton>
                ) : null}
              </div>

              <div className="ml-auto min-w-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {!canCrop ? (
                  <span>
                    Open a stack from the switcher to crop inside it. Click any component to{" "}
                    <b className="text-[var(--text-muted)]">Become root</b>.
                  </span>
                ) : editingComponentId ? (
                  <span>
                    Editing existing crop. Adjust the box and <Key>Space</Key> saves · <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "crop" ? (
                  <span>
                    Click and drag over the open subject. <Key>Space</Key> saves a component ·{" "}
                    <Key>Esc</Key> cancels
                  </span>
                ) : currentTool === "draw" ? (
                  <span>
                    Draw freely over the image. The drawn area becomes the crop. <Key>Space</Key> saves ·{" "}
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
                      craftInstalled={features.florence2.installed}
                      lamaInstalled={features.lama.installed}
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

function DrawActionButton({
  label,
  icon,
  busy,
  disabled,
  primary = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-selection-action
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-40",
        primary
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-white disabled:hover:bg-[var(--accent)]"
          : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--text)] hover:bg-[var(--surface-hover)]",
      ].join(" ")}
    >
      {busy ? <Loader2 size={12} strokeWidth={1.9} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

export default ToolsEditorView;
