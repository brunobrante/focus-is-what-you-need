import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ancestorOverlayItemFor, resolveAncestorOverlayStyle, type AncestorFrame } from "@/canvas/canvasUtils";
import { useEditor, useHoverStore, useNoticeStore } from "@/canvas/engine/store";
import type { AncestorOverlayState, CanvasDocument, Point, Rect } from "@/canvas/engine/types";
import { useElementFontTokens } from "./elementFontTokensContext";
import type { CanvasToolId } from "@/canvas/tools";
import { isInsertTool } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import {
  centerViewportOnPoint,
  getCanvasDisplayScale,
  getInitialZoomForSubjectSize,
  shouldUseScaledDomProjection,
  viewportChanged,
} from "@/canvas/engine/viewport";
import { getAbsoluteRect, getSelectionAABB } from "@/canvas/engine/geometry/bounds";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { CanvasToolingLayer } from "./CanvasToolingLayer";
import type { CanvasToolingRef } from "./CanvasToolingLayer";
import type { Interaction } from "./canvasInteractionTypes";
import { getShellPatternStyle, getStageBoxShadow, TOOLBAR_TOOL_MAP } from "./canvasShellStyle";
import { CanvasGridOverlay } from "./CanvasGridOverlay";
import { CanvasScrollbars, computeScrollAxis, HIDDEN_SCROLL, useElementScrollbars } from "@/components/ui/CanvasScrollbars";
import { getCanvasSize } from "./canvasCoordinates";
import type { CanvasAlignmentLogInput } from "./canvasAlignmentLog";
import { RenderedScene } from "./RenderedScene";
import { TextEditingOverlay } from "./TextEditingOverlay";
import { TextEditingTextarea } from "./TextEditingTextarea";
import { useViewportMetrics } from "./hooks/useViewportMetrics";
import { useTextEditingSession } from "./hooks/useTextEditingSession";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useViewportControls } from "./hooks/useViewportControls";
import { useCanvasPointerEvents } from "./hooks/useCanvasPointerEvents";
import { buildViewportTransform } from "./canvasCoordinates";
import {
  expandRenderIds,
  getAffectedElementRenderIds,
  isCanvasAlignmentDebugEnabled,
} from "./canvasStageHelpers";
import "./editor.css";

export function CanvasStage({
  draftMode = false,
  activeTool,
  viewportSubjectKey,
  ancestorFrames = [],
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
  onBackToParentShortcut,
}: {
  draftMode?: boolean;
  activeTool?: string;
  viewportSubjectKey?: string;
  ancestorFrames?: AncestorFrame[];
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  onBackToParentShortcut?: () => boolean | void;
}) {
  const { state, dispatch } = useEditor();
  const hoverStore = useHoverStore();
  const noticeStore = useNoticeStore();
  const fontTokens = useElementFontTokens();

  useEffect(() => {
    if (!activeTool) return;
    const mapped = TOOLBAR_TOOL_MAP[activeTool];
    if (mapped && mapped !== state.tool) dispatch({ type: "setTool", tool: mapped });
    // Only toolbar/tool-prop changes should drive the editor tool. If this also
    // reacts to state.tool changes, Escape can switch the editor to select while
    // the previous toolbar tool is still in props, causing a select/tool loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, dispatch]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasStageRef = useRef<HTMLDivElement | null>(null);
  const toolingRef = useRef<CanvasToolingRef | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const latestStateRef = useRef(state);
  const latestDocumentRef = useRef(state.document);
  const previousRenderDocumentRef = useRef<CanvasDocument | null>(null);
  const viewportInitializedSubjectRef = useRef<string | null>(null);
  const commandModeRef = useRef(false);
  const [interactionActive, setInteractionActive] = useState(false);

  useEffect(() => {
    latestStateRef.current = state;
    latestDocumentRef.current = state.document;
  }, [state]);

  useLayoutEffect(() => {
    previousRenderDocumentRef.current = state.document;
  }, [state.document]);

  const { viewportSize, getCurrentViewportSize, getCurrentViewportRect } = useViewportMetrics(viewportRef);

  const canvasSize = useMemo(
    () => getCanvasSize(state.document),
    [state.document.canvas.height, state.document.canvas.width],
  );

  // The parent-frames overlay: each enabled, non-zero-opacity ancestor frame is a
  // guide rect placed in the edited component's canvas space (its offset is stored
  // relative to the component). The component renders 1:1 inside them.
  const ancestorOverlay = state.ancestorOverlay;
  const visibleAncestorRects = useMemo<Array<{ frame: AncestorFrame; rect: Rect }>>(() => {
    if (draftMode || !ancestorOverlay.enabled) return [];
    return ancestorFrames
      .map((frame) => ({
        frame,
        rect: { x: frame.offsetX, y: frame.offsetY, width: frame.width, height: frame.height },
      }))
      .filter(({ frame }) => ancestorOverlayItemFor(ancestorOverlay, frame.id).opacity > 0);
  }, [draftMode, ancestorOverlay, ancestorFrames]);
  // The region the camera may pan/zoom across. It is null when there is no device
  // overlay — the camera then falls back to the component bounds everywhere — and
  // the union of the component and the device frame when the simulator is on. A
  // non-null value is therefore exactly the signal "the overlay is active".
  const navigableBounds = useMemo<Rect | null>(() => {
    if (visibleAncestorRects.length === 0) return null;
    return visibleAncestorRects.reduce<Rect>(
      (acc, { rect }) => unionRect(acc, rect),
      { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
    );
  }, [visibleAncestorRects, canvasSize.width, canvasSize.height]);

  // The camera focus point drives re-centering/reframing (handled in
  // useViewportControls). It centers the navigable region, so:
  //  - with no overlay it is the component center (component stays centered);
  //  - in "origin" alignment the navigable region is the device, so the DEVICE
  //    centers itself and the component sits off-center at its real device
  //    position — you then zoom/scroll across the device to reach it.
  const viewportFocusPoint = useMemo<Point>(() => {
    const region = navigableBounds ?? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height };
    return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
  }, [navigableBounds, canvasSize.width, canvasSize.height]);

  const {
    textEdit,
    syncTextSelection,
    updateTextNodeFromTextareaInput,
    commitTextEditing,
    cancelTextEditing,
    enterTextEditing,
  } = useTextEditingSession({
    editingTextId: state.editingTextId,
    document: state.document,
    dispatch,
    viewportRef,
    getCurrentViewportSize,
    getCurrentViewportRect,
    latestDocumentRef,
    latestStateRef,
  });

  const { spacePressedRef } = useKeyboardShortcuts({
    dispatch,
    viewportRef,
    interactionRef,
    latestStateRef,
    setInteractionActive,
    settings,
    onCanvasToolShortcut,
    onOpenSelectedComponentShortcut,
    onBackToParentShortcut,
    ancestorOverlayAvailable: ancestorFrames.length > 0,
  });

  const { onWheel } = useViewportControls({
    state,
    dispatch,
    viewportRef,
    getCurrentViewportSize,
    getCurrentViewportRect,
    viewportSubjectKey,
    viewportSize,
    viewportInitializedSubjectRef,
    settings,
    viewportFocusPoint,
    navigableBounds,
  });

  // Mirror the current viewport geometry into the store so zoom changes that have
  // no cursor to pivot on (zoom buttons, keyboard, toolbar) can anchor on the
  // viewport center via the `setZoom` reducer. Only fires on resize / overlay
  // toggle, so it is cheap.
  useEffect(() => {
    dispatch({ type: "setViewportMetrics", viewportSize, navigableBounds });
  }, [dispatch, viewportSize, navigableBounds]);

  // Focus request from the canvas tree: move the camera to frame a node without
  // moving the node itself. Used by the draft canvas "focus" button. We zoom to
  // the node's intrinsic size (proportional rule) and center on it, then clear
  // the request so a repeat click on the same node re-triggers.
  useEffect(() => {
    const nodeId = state.focusNodeId;
    if (!nodeId) return;
    const size = getCurrentViewportSize();
    const rect = getAbsoluteRect(state.document, nodeId);
    if (rect && size.width > 0 && size.height > 0) {
      const zoom = getInitialZoomForSubjectSize(
        { width: rect.width, height: rect.height },
        state.viewportMode,
      );
      const focus = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const next = centerViewportOnPoint(zoom, size, canvasSize, focus, state.viewportMode);
      if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
        dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
      }
    }
    dispatch({ type: "requestNodeFocus", nodeId: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.focusNodeId]);

  const commitContextToolbarDocument = useCallback((document: CanvasDocument, selectedIds?: string[]) => {
    dispatch({ type: "commitDocument", document, selectedIds });
  }, [dispatch]);

  const canvasAlignmentDebugEnabled = useMemo(isCanvasAlignmentDebugEnabled, []);

  const scheduleCanvasAlignmentLog = (input: CanvasAlignmentLogInput) => {
    if (!canvasAlignmentDebugEnabled) return;
    void import("./canvasAlignmentLog").then(({ logCanvasAlignment }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const run = () =>
        logCanvasAlignment(input, {
          viewport,
          stageElement: stageRef.current,
          canvasStageElement: canvasStageRef.current,
          viewportSize: getCurrentViewportSize(),
        });
      // Debug-only: the alignment log measures rendered DOM rects, so it must run
      // *after* the new viewport has painted — a double-rAF is the correct
      // post-paint idiom here (not a "wait for layout" hack like the pre-paint
      // scroll in Tree.tsx, which is now a layout effect). `setTimeout(run, 0)` is
      // the fallback for rAF-less environments (Bun tests).
      if (typeof globalThis.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
        return;
      }
      globalThis.setTimeout(run, 0);
    });
  };

  const selectedIdsKey = state.selectedIds.join("|");

  useEffect(() => {
    if (!canvasAlignmentDebugEnabled) return;
    const debugGlobal = globalThis as typeof globalThis & { __logCanvasAlignment?: () => void };
    const logCurrentAlignment = () => {
      const currentState = latestStateRef.current;
      scheduleCanvasAlignmentLog({
        reason: "manual-window-call",
        interactionType: interactionRef.current?.type ?? null,
        document: latestDocumentRef.current,
        selectedIds: currentState.selectedIds,
        zoom: currentState.zoom,
        offsetX: currentState.offsetX,
        offsetY: currentState.offsetY,
      });
    };
    debugGlobal.__logCanvasAlignment = logCurrentAlignment;
    return () => {
      if (debugGlobal.__logCanvasAlignment === logCurrentAlignment) delete debugGlobal.__logCanvasAlignment;
    };
  }, [canvasAlignmentDebugEnabled]);

  useEffect(() => {
    if (!canvasAlignmentDebugEnabled) return;
    scheduleCanvasAlignmentLog({
      reason: "selection-or-viewport-change",
      interactionType: null,
      document: state.document,
      selectedIds: state.selectedIds,
      zoom: state.zoom,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
    });
  }, [selectedIdsKey, state.canvasStageActive, state.document, state.offsetX, state.offsetY, state.zoom, canvasAlignmentDebugEnabled]);

  const {
    marqueeRect,
    contextMenu,
    dropTarget,
    closeContextMenu,
    onPointerDown,
    onPointerMove,
    finishInteraction,
    onDoubleClick,
    handleContextMenu,
  } = useCanvasPointerEvents({
    state,
    dispatch,
    draftMode,
    viewportRef,
    toolingRef,
    interactionRef,
    spacePressedRef,
    commandModeRef,
    setInteractionActive,
    getCurrentViewportSize,
    getCurrentViewportRect,
    latestDocumentRef,
    latestStateRef,
    hoverStore,
    noticeStore,
    textEdit,
    enterTextEditing,
    syncTextSelection,
    scheduleCanvasAlignmentLog,
    settings,
    fontTokens,
    navigableBounds,
  });

  const affectedElementIds = useMemo(
    () =>
      state.transientChangedIds
        ? expandRenderIds(state.document, state.transientChangedIds)
        : getAffectedElementRenderIds(previousRenderDocumentRef.current, state.document),
    [state.document, state.transientChangedIds],
  );

  const isDrawTool = isInsertTool(state.tool);
  const isHandTool = state.tool === "hand";
  const shellClassName = `canvas-shell${isDrawTool ? " is-draw-tool" : ""}${isHandTool ? " is-hand-tool" : ""}`;
  const shellStyle = useMemo(
    () => getShellPatternStyle(state.document),
    [state.document.shellBackground],
  );
  const displayScale = useMemo(
    () => viewportSize.width > 0 && viewportSize.height > 0 ? getCanvasDisplayScale(viewportSize, canvasSize, state.viewportMode) : 1,
    [canvasSize, state.viewportMode, viewportSize],
  );
  const displayZoom = state.zoom * displayScale;

  const viewportTransform = useMemo(
    () => buildViewportTransform(state.document, viewportSize, state.zoom, state.offsetX, state.offsetY, state.viewportMode),
    [state.document.canvas.height, state.document.canvas.rotation, state.document.canvas.width, state.offsetX, state.offsetY, state.viewportMode, state.zoom, viewportSize],
  );
  const scaledDomProjection = useMemo(
    () => shouldUseScaledDomProjection({ canvasSize, displayZoom, canvasRotation: state.document.canvas.rotation ?? 0 }),
    [canvasSize, displayZoom, state.document.canvas.rotation],
  );
  // Discrete scroll indicators that appear only once the subject overflows the
  // viewport (i.e. zoomed past fit). Measured straight off the transformed stage
  // box for the bounded frame canvases.
  const elementScroll = useElementScrollbars(
    viewportRef,
    draftMode ? null : stageRef,
    `${displayZoom}:${state.offsetX}:${state.offsetY}`,
  );
  // The freeform draft canvas has no fixed stage to measure, so its indicators are
  // computed from the real content's bounding box projected through the current
  // transform. The track is that content box and the thumb is the viewport within
  // it (Figma/Penpot-style): thumb length = viewport / content, so it is
  // proportional to the window (a 600px window over 1000px of content → a 60%
  // thumb) and shrinks as you zoom in. Hidden whenever the content fits the window.
  const draftContentBounds = useMemo(
    () => (draftMode ? getSelectionAABB(state.document, state.document.rootIds) : null),
    [draftMode, state.document],
  );
  const draftScroll = useMemo(() => {
    if (!draftContentBounds || viewportSize.width <= 0 || viewportSize.height <= 0) return HIDDEN_SCROLL;
    const startX = draftContentBounds.x * displayZoom + viewportTransform.offsetX;
    const startY = draftContentBounds.y * displayZoom + viewportTransform.offsetY;
    return {
      x: computeScrollAxis(viewportSize.width, startX, draftContentBounds.width * displayZoom),
      y: computeScrollAxis(viewportSize.height, startY, draftContentBounds.height * displayZoom),
    };
  }, [draftContentBounds, displayZoom, viewportTransform.offsetX, viewportTransform.offsetY, viewportSize.width, viewportSize.height]);
  const scroll = draftMode ? draftScroll : elementScroll;
  const renderScale = scaledDomProjection ? displayZoom : 1;
  const stageWidth = canvasSize.width;
  const stageHeight = canvasSize.height;
  const projectedStageWidth = stageWidth * renderScale;
  const projectedStageHeight = stageHeight * renderScale;
  const stageSpaceStyle = useMemo<CSSProperties>(
    () =>
      scaledDomProjection
        ? ({
            width: projectedStageWidth,
            height: projectedStageHeight,
            left: viewportTransform.offsetX,
            top: viewportTransform.offsetY,
            transform: "none",
            transformOrigin: "0 0",
            backfaceVisibility: "visible",
            imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
            "--zoom": displayZoom,
          } as CSSProperties)
        : ({
            width: stageWidth,
            height: stageHeight,
            transform: viewportTransform.cssTransform,
            transformOrigin: "0 0",
            backfaceVisibility: "hidden",
            imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
            "--zoom": displayZoom,
          } as CSSProperties),
    [
      scaledDomProjection,
      projectedStageWidth,
      projectedStageHeight,
      stageWidth,
      stageHeight,
      viewportTransform,
      displayZoom,
    ],
  );

  return (
    <div
      ref={viewportRef}
      className={shellClassName}
      style={shellStyle}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={finishInteraction}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={stageRef}
        className={`stage-space${draftMode ? " stage-space--draft" : ""}`}
        style={stageSpaceStyle}
      >
        <AncestorOverlay
          frames={visibleAncestorRects}
          overlay={ancestorOverlay}
          renderScale={renderScale}
        />
        {draftMode ? (
          <RenderedScene
            draftMode
            document={state.document}
            canvasStageActive={state.canvasStageActive}
            isolatedParentId={state.isolatedParentId}
            editingTextId={state.editingTextId}
            affectedElementIds={affectedElementIds}
            renderScale={renderScale}
          />
        ) : (
          <div
            ref={canvasStageRef}
            className="canvas-stage"
            style={{
              width: projectedStageWidth,
              height: projectedStageHeight,
              background: state.document.canvas.background || undefined,
              borderRadius:
                state.document.canvas.borderRadius === undefined
                  ? undefined
                  : state.document.canvas.borderRadius * renderScale,
              boxShadow: getStageBoxShadow(state.document.canvas, renderScale),
              opacity: state.document.canvas.opacity ?? undefined,
              "--zoom": displayZoom,
            } as CSSProperties}
          >
            <RenderedScene
              draftMode={false}
              document={state.document}
              canvasStageActive={state.canvasStageActive}
              isolatedParentId={state.isolatedParentId}
              editingTextId={state.editingTextId}
              affectedElementIds={affectedElementIds}
              renderScale={renderScale}
            />
          </div>
        )}
      </div>

      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <CanvasGridOverlay
          enabled={state.document.shellGrid?.enabled ?? false}
          type={state.document.shellGrid?.type ?? "dots"}
          shellBackground={state.document.shellBackground ?? "#000000"}
          canvasBackground={state.document.canvas.background || "#ffffff"}
          canvasRect={{
            x: viewportTransform.offsetX,
            y: viewportTransform.offsetY,
            width: projectedStageWidth,
            height: projectedStageHeight,
          }}
          displayZoom={displayZoom}
          offsetX={viewportTransform.offsetX}
          offsetY={viewportTransform.offsetY}
          width={viewportSize.width}
          height={viewportSize.height}
        />
      )}

      <CanvasToolingLayer
        ref={toolingRef}
        document={state.document}
        selectedIds={state.selectedIds}
        editingTextId={state.editingTextId}
        pathEditId={state.pathEditId}
        penToolActive={state.tool === "pen"}
        canvasStageActive={state.canvasStageActive}
        guides={state.guides}
        viewportTransform={viewportTransform}
        suppressHover={interactionActive}
        interactionType={interactionActive ? (interactionRef.current?.type ?? null) : null}
        radiusDragCorner={(() => {
          const ri = interactionRef.current;
          return interactionActive && ri?.type === "radius"
            ? (ri.committedCorner ?? ri.corner)
            : null;
        })()}
        marqueeRect={marqueeRect}
        dropTarget={dropTarget}
        onCommitDocument={commitContextToolbarDocument}
        settings={settings}
      />

      <TextEditingTextarea
        textEdit={textEdit}
        document={state.document}
        viewportRef={viewportRef}
        viewportTransform={viewportTransform}
        onSelectionChange={syncTextSelection}
        onInputValue={updateTextNodeFromTextareaInput}
        onCommit={commitTextEditing}
        onCancel={cancelTextEditing}
      />

      <TextEditingOverlay
        textEdit={textEdit}
        document={state.document}
        viewportTransform={viewportTransform}
      />

      {contextMenu && <CanvasContextMenu menu={contextMenu} onClose={closeContextMenu} />}

      <CanvasScrollbars x={scroll.x} y={scroll.y} />
    </div>
  );
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.max(a.x + a.width, b.x + b.width) - x;
  const height = Math.max(a.y + a.height, b.y + b.height) - y;
  return { x, y, width, height };
}

// The parent-frames overlay: a stack of guide rects (one per visible ancestor
// frame) drawn behind the scene, farthest ancestor first so closer parents sit
// on top. Each frame inherits only size, background color, and radius; opacity is
// user-set and no border is drawn — purely a visual placement guide.
function AncestorOverlay({
  frames,
  overlay,
  renderScale,
}: {
  frames: Array<{ frame: AncestorFrame; rect: Rect }>;
  overlay: AncestorOverlayState;
  renderScale: number;
}) {
  if (frames.length === 0) return null;
  // Outermost ancestor (largest enclosing frame) painted first.
  const ordered = [...frames].sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
  return (
    <>
      {ordered.map(({ frame, rect }) => {
        const style = resolveAncestorOverlayStyle(frame, ancestorOverlayItemFor(overlay, frame.id));
        return (
          <div
            key={frame.id}
            style={{
              position: "absolute",
              left: rect.x * renderScale,
              top: rect.y * renderScale,
              width: rect.width * renderScale,
              height: rect.height * renderScale,
              borderRadius: style.borderRadius * renderScale,
              background: style.background,
              opacity: style.opacity,
              pointerEvents: "none",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </>
  );
}
