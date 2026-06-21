import { useRef } from "react";
import { Link } from "react-router-dom";
import { CanvasScrollbars, useElementScrollbars } from "@/components/ui/CanvasScrollbars";
import {
  Brush,
  Check,
  Crop,
  Eraser,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Move,
  Pencil,
  Plus,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GeneratorHeader } from "./ui/GeneratorHeader";

import { componentSubtreeIds } from "./engine/componentTree";

import { ComponentTreeItem } from "./ui/ComponentTreeItem";
import { ElementInfoCard } from "./ui/ElementInfoCard";
import { ModeButton } from "./ui/ModeButton";
import {
  RailToolButton,
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
import { RootSwitcher } from "./ui/RootSwitcher";
import { GallerySlider } from "./ui/GallerySlider";
import { VariantsPanel } from "./ui/VariantsPanel";

import {
  useToolsEditor,
  type ToolsEditorProps,
} from "./hooks/useToolsEditor";
import { MIN_TOOL_ZOOM } from "./types";
import { useEffect, useMemo, useState } from "react";
import {
  SceneCanvasInspector,
  type ImageStack,
} from "@/components/screen/SceneCanvasInspector";
import { useProcessingFeatures } from "@/lib/models/useProcessingFeatures";
import { useLamaInpainting } from "@/lib/models/useLamaInpainting";
import {
  bytesToPngDataUrl,
  urlToBytes,
  runBirefnet,
  runRealEsrgan,
  runLama,
  type ProcessingActionKind,
} from "@/lib/models/modelCommands";

// A circular brush cursor sized to the LaMa brush (20px radius / 40px diameter).
const LAMA_BRUSH_CURSOR =
  "url('data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="rgba(248,113,113,0.15)" stroke="white" stroke-width="1.5"/></svg>',
  ) +
  "') 20 20, crosshair";

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
    editorReady,
    selectedComponentId,
    selection,
    selectionLocked,
    brushSize,
    editingComponentId,
    showCropsOverlay,
    hoveredComponentId,
    imageError,
    autoDetecting,
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
    openGalleryMode,
    focusGalleryCut,
    openComponent,
    selectRoot,
    setPrimaryRoot,
    requestRootDeletion,
    beginRootCreation,
    promoteToRoot,
    startEditComponent,
    openTreeComponent,
    requestResetConfirmation,
    confirmPendingAction,
    persistReferenceStack,
    canSaveSelection,
    saveSelection,
    addCutVariant,
    setCutVariant,
    removeCutVariant,
    autoDetect,
    uploadImage,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRemoveComponent,
    toggleComponentExpanded,
    setActiveRootId,
    updateComponents,
    selectStackComponent,
  } = useToolsEditor({ item, referenceId, groupContext, onUploadedLocally });

  // Discrete scroll indicators for the Builder stage — only shown once the zoomed
  // image overflows the stage (zoom in past 100%).
  const stageContentRef = useRef<HTMLDivElement | null>(null);
  const stageScroll = useElementScrollbars(
    stageViewportRef,
    stageContentRef,
    `${toolZoom}:${toolPan.x}:${toolPan.y}:${viewMode}`,
  );

  const [cleanOriginal, setCleanOriginal] = useState(false);

  const { features } = useProcessingFeatures();
  // A feature is usable in the Builder only when enabled with an installed model.
  const removeBackgroundOn = features.removeBackground.operational;
  const upscaleOn = features.upscale.operational;
  const autoDetectOn = features.autoDetect.operational;
  // Active auto-detect model (OmniParser or Florence-2), or null when not enabled.
  const autoDetectModelId = autoDetectOn ? features.autoDetect.activeModelId : null;
  const removeElementOn = features.removeElement.operational;
  const hasProcessingFeature = removeBackgroundOn || upscaleOn || removeElementOn;
  const [running, setRunning] = useState<{ id: string; kind: ProcessingActionKind } | null>(null);
  // LaMa "remove element" mask-drawing state. The brush paints onto an overlay
  // canvas on the stage; Apply runs LaMa and stores the result as a new variant.
  const lama = useLamaInpainting();
  const masking = lama.status === "masking";

  // Which cut's variants panel is open in the sidebar (replaces the tree). Null
  // shows the normal component tree.
  const [variantsPanelCutId, setVariantsPanelCutId] = useState<string | null>(null);
  const variantsPanelCut = variantsPanelCutId
    ? components.find((component) => component.id === variantsPanelCutId) ?? null
    : null;

  const activeCutId =
    activeSubject.kind === "component" && selectedComponent ? selectedComponent.id : null;
  // The open cut already renders its active variant through `activeSubject.url`.
  const displayUrl = activeSubject.url;
  const runningKind = running && running.id === activeCutId ? running.kind : null;

  const imageStack = useMemo<ImageStack | null>(() => {
    if (viewMode !== "stack") return null;
    return {
      w: activeSubject.w,
      h: activeSubject.h,
      backgroundUrl: activeSubject.url,
      layers: stackedComponents.map((comp) => ({
        id: comp.id,
        name: comp.name,
        dataUrl: comp.dataUrl,
        x: comp.box.x - activeSubject.originBox.x,
        y: comp.box.y - activeSubject.originBox.y,
        w: comp.box.w,
        h: comp.box.h,
      })),
    };
  }, [viewMode, activeSubject, stackedComponents]);
  // Close the variants panel if its cut is gone (deleted or stack reset).
  useEffect(() => {
    if (variantsPanelCutId && !components.some((component) => component.id === variantsPanelCutId)) {
      setVariantsPanelCutId(null);
    }
  }, [components, variantsPanelCutId]);

  // Switching to a different cut (or closing it) abandons any in-progress mask,
  // so a mask drawn for one cut can never be applied to another.
  useEffect(() => {
    lama.cancel();
    // Only re-run when the open cut changes; `lama.cancel` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCutId]);

  async function runProcessing(kind: ProcessingActionKind) {
    if (!selectedComponent || running) return;
    const id = selectedComponent.id;
    // Chain onto the currently shown variant so edits stack (e.g. upscale then
    // background-remove); the result becomes a new variant and the new main.
    const source = activeSubject.url;
    setRunning({ id, kind });
    try {
      const input = await urlToBytes(source);
      const output = kind === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
      addCutVariant(id, { tool: kind, dataUrl: bytesToPngDataUrl(output) });
    } catch (error) {
      console.error(`Processing (${kind}) failed`, error);
    } finally {
      setRunning(null);
    }
  }

  // LaMa "remove element": reads the painted mask, runs inpainting on the open
  // cut, and stores the result (session-local) just like the other processors.
  async function applyLamaMask() {
    if (!selectedComponent || running) return;
    const id = selectedComponent.id;
    const maskBytes = await lama.readMask();
    // Nothing painted — keep the user in masking mode to draw a selection.
    if (!maskBytes) return;
    const source = activeSubject.url;
    setRunning({ id, kind: "lama" });
    lama.cancel();
    try {
      const input = await urlToBytes(source);
      const output = await runLama(input, maskBytes);
      addCutVariant(id, { tool: "lama", dataUrl: bytesToPngDataUrl(output) });
    } catch (error) {
      console.error("LaMa inpainting failed", error);
    } finally {
      setRunning(null);
    }
  }

  // Draw toolbar: commit the drawn region as a cut, optionally post-processed.
  const [drawAction, setDrawAction] = useState<"crop" | ProcessingActionKind | null>(null);
  async function commitDraw(action: "crop" | ProcessingActionKind) {
    if (!canSaveSelection || drawAction) return;
    setDrawAction(action);
    try {
      await saveSelection(action === "crop" ? undefined : action);
    } finally {
      setDrawAction(null);
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <GeneratorHeader
          tabActive={viewMode === "stack" ? "stack" : viewMode === "gallery" ? "gallery" : "builder"}
          stackDisabled={stackedComponents.length === 0}
          onBuilder={openBuilderMode}
          onStack={openStackMode}
          onGallery={openGalleryMode}
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
            gridTemplateColumns: "56px minmax(0,1fr) 340px",
          }}
        >
          <aside className={["flex flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-3", cleanOriginal ? "pointer-events-none [&_button]:!border-transparent [&_button]:!bg-transparent [&_button]:!text-[var(--text-muted)] [&_button]:!opacity-40" : ""].join(" ")}>
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
            {hasProcessingFeature ? (
              <>
                <span className="my-1.5 h-px w-7 bg-[var(--border)]" />
                {removeBackgroundOn ? (
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
                {upscaleOn ? (
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
                {removeElementOn ? (
                  <RailToolButton
                    label="Remove element"
                    active={masking}
                    disabled={!activeCutId || running !== null}
                    onClick={() => (masking ? lama.cancel() : lama.startMasking())}
                  >
                    {runningKind === "lama" ? (
                      <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
                    ) : (
                      <Wand2 size={18} strokeWidth={1.7} />
                    )}
                  </RailToolButton>
                ) : null}
                <RailToolButton
                  label="Variants"
                  disabled={!activeCutId || (selectedComponent?.variants?.length ?? 0) <= 1}
                  onClick={() => activeCutId && setVariantsPanelCutId(activeCutId)}
                >
                  <Layers size={18} strokeWidth={1.7} />
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
              onPointerDown={masking ? undefined : handlePointerDown}
              onPointerMove={masking ? undefined : handlePointerMove}
              onPointerUp={masking ? undefined : handlePointerUp}
              onPointerLeave={masking ? undefined : handleStagePointerLeave}
              onPointerCancel={masking ? undefined : cancelSelection}
            >
              {!cleanOriginal && editorReady && (
              <>
              {viewMode === "gallery" ? (
                <GallerySlider
                  cuts={scopedComponents}
                  showColors={features.colorDetector.operational}
                  showText={features.textDetection.operational}
                  showFont={features.fontDetection.operational}
                  onFocusChange={focusGalleryCut}
                />
              ) : null}

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

              {viewMode !== "gallery" && viewMode !== "stack" ? (
                <CropsOverlayToggle
                  active={showCropsOverlay}
                  onToggle={() => setShowCropsOverlay((value) => !value)}
                />
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
              </>
              )}

              {cleanOriginal ? (
                <button
                  type="button"
                  data-selection-action
                  onClick={() => setCleanOriginal(false)}
                  aria-label="Close original"
                  title="Close original"
                  className="absolute right-3 top-3 z-30 grid h-8 w-8 cursor-pointer place-items-center rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elev)] text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              ) : null}

              {imageError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-[var(--text-muted)]">
                  <ImageIcon size={24} strokeWidth={1.6} />
                  <h2 className="m-0 text-[16px] text-[var(--text)]">Image not found</h2>
                  <p className="m-0 text-[13px]">
                    Volte para <Link className="border-b border-[var(--border-strong)] text-[var(--text)] no-underline" to="/references">References</Link>.
                  </p>
                </div>
              ) : !editorReady && !cleanOriginal ? (
                // Opening subject not resolved yet — keep the bare stage so the raw
                // original image never flashes before the main screen lands.
                <div className="flex flex-1 items-center justify-center text-[var(--text-faint)]">
                  <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
                </div>
              ) : viewMode === "stack" && imageStack && !cleanOriginal ? (
                <div
                  ref={stageContentRef}
                  className="relative inline-block overflow-visible rounded-[8px] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
                  style={{
                    transform: `translate(${toolPan.x}px, ${toolPan.y}px) scale(${toolZoom})`,
                    transformOrigin: "center center",
                  }}
                >
                  <SceneCanvasInspector
                    source="stack"
                    stack={imageStack}
                    selectedId={selectedComponentId}
                    onSelect={selectStackComponent}
                    backgroundClassName="block max-h-[calc(100vh-220px)] max-w-full select-none rounded-[8px]"
                  />
                  {/* Hidden img keeps imgRef valid for mode transitions */}
                  <img
                    ref={imgRef}
                    src={displayUrl || undefined}
                    className="sr-only"
                    crossOrigin="anonymous"
                    draggable={false}
                    onLoad={() => { setImageError(false); bumpPaintVersion(); }}
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <>
                  <div
                    ref={stageContentRef}
                    className="relative max-h-full max-w-full overflow-visible rounded-[8px] bg-[#0E0E0E] shadow-[0_14px_60px_rgba(0,0,0,0.55)]"
                    style={{
                      transform: `translate(${toolPan.x}px, ${toolPan.y}px) scale(${toolZoom})`,
                      transformOrigin: "center center",
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={(cleanOriginal ? item.url : displayUrl) || undefined}
                      alt={cleanOriginal ? item.name : activeSubject.name}
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
                    {masking ? (
                      <canvas
                        ref={lama.canvasRef}
                        width={Math.max(Math.round(activeSubject.w), 1)}
                        height={Math.max(Math.round(activeSubject.h), 1)}
                        className="absolute inset-0 z-30 h-full w-full rounded-[8px]"
                        style={{ cursor: LAMA_BRUSH_CURSOR, touchAction: "none" }}
                      />
                    ) : null}
                  </div>
                  {!cleanOriginal && (
                    <>
                      <canvas
                        ref={cropsCanvasRef}
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                      />
                      <canvas
                        ref={overlayCanvasRef}
                        className="pointer-events-none absolute inset-0 z-20 h-full w-full"
                      />
                    </>
                  )}
                </>
              )}

              {!cleanOriginal && (<>
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

              {masking ? (
                <div
                  data-selection-action
                  className="absolute bottom-3.5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-[#f8717166] bg-[rgba(20,20,22,0.92)] p-1.5 pl-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
                >
                  <Wand2 size={13} strokeWidth={1.8} className="text-[#f87171]" />
                  <span className="text-[11.5px] text-[var(--text)]">Paint over the element to remove</span>
                  <span className="h-5 w-px bg-[var(--border)]" />
                  <button
                    type="button"
                    data-selection-action
                    onClick={() => void applyLamaMask()}
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--accent)] bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-[var(--accent-fg)] hover:bg-white"
                  >
                    <Check size={12} strokeWidth={2.2} />
                    Apply
                  </button>
                  <button
                    type="button"
                    data-selection-action
                    onClick={() => lama.cancel()}
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {currentTool === "draw" && !masking ? (
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
                  {removeBackgroundOn ? (
                    <DrawActionButton
                      label="Remove BG"
                      icon={<Eraser size={12} strokeWidth={1.9} />}
                      busy={drawAction === "birefnet"}
                      disabled={!canSaveSelection || drawAction !== null}
                      onClick={() => void commitDraw("birefnet")}
                    />
                  ) : null}
                  {upscaleOn ? (
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
              </>)}

              <CanvasScrollbars x={stageScroll.x} y={stageScroll.y} />
            </div>

            <div className="sticky bottom-0 z-20 flex min-h-[56px] shrink-0 items-center gap-2.5 border-t border-[var(--border)] bg-[rgba(15,15,16,0.82)] px-3.5 py-2.5 backdrop-blur-[8px]">
              <div className="inline-flex shrink-0 items-center gap-1.5">
                {autoDetectOn ? (
                  <ModeButton
                    onClick={() => void autoDetect(autoDetectModelId)}
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
                  primaryRootId={roots.find((r) => r.isPrimaryRoot)?.id ?? rootComponentId}
                  cutCountByRoot={cutCountByRoot}
                  onSelect={selectRoot}
                  onSetPrimary={setPrimaryRoot}
                  onDelete={requestRootDeletion}
                  onNewRoot={beginRootCreation}
                  creating={false}
                  activeReferenceId={item.id}
                  groupReferences={groupContext?.references ?? []}
                  groupId={groupContext?.id}
                />

                {variantsPanelCut ? (
                  <VariantsPanel
                    cut={variantsPanelCut}
                    onBack={() => setVariantsPanelCutId(null)}
                    onSetMain={(variantId) => setCutVariant(variantsPanelCut.id, variantId)}
                    onRemove={(variantId) => removeCutVariant(variantsPanelCut.id, variantId)}
                  />
                ) : (
                  <>
                    <SidebarComponentsHeader
                      rootName={activeRoot.isDefaultRoot ? "Full image" : activeRoot.name}
                      scopedCount={scopedComponents.length}
                      showReset={scopedComponents.length > 1 || !activeRoot.isDefaultRoot}
                      showingOriginal={cleanOriginal}
                      onToggleOriginal={() => setCleanOriginal((v) => !v)}
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
                          onOpenVariants={setVariantsPanelCutId}
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
                  </>
                )}

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
        </div>{/* end main column */}
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
