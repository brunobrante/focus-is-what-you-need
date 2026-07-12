import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ancestorOverlayItemFor, resolveAncestorOverlayStyle, type AncestorFrame } from "@/canvas/canvasUtils";
import { useEditor, useHoverStore, useNoticeStore, useTextSelectionStore } from "@/canvas/engine/store";
import type { AncestorOverlayState, CanvasDocument, Point, Rect } from "@/canvas/engine/types";
import { useElementFontTokens } from "./elementFontTokensContext";
import type { CanvasToolId } from "@/canvas/tools";
import { isInsertTool } from "@/canvas/engine/types";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import {
  canvasRectToViewport,
  centerViewportOnPoint,
  getCanvasDisplayScale,
  getInitialZoomForSubjectSize,
  resolveFrozenGestureScale,
  shouldUseScaledDomProjection,
  viewportChanged,
} from "@/canvas/engine/viewport";
import { getAbsoluteRect, getContentAxis, getContentPages, getSelectionAABB } from "@/canvas/engine/geometry/bounds";
import { setLayoutUnitScale } from "@/canvas/engine/geometry/transforms";
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
import { GradientEditOverlay } from "./GradientEditOverlay";
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
  isIconSubject = false,
  shortcutsEnabled = true,
}: {
  draftMode?: boolean;
  activeTool?: string;
  viewportSubjectKey?: string;
  ancestorFrames?: AncestorFrame[];
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  onBackToParentShortcut?: () => boolean | void;
  // Icon-master canvas: SVG paste decomposes into root paths (see useCanvasPointerEvents).
  isIconSubject?: boolean;
  // False on inactive split panes: window-level shortcuts must run in exactly
  // one editor (see useKeyboardShortcuts.enabled).
  shortcutsEnabled?: boolean;
}) {
  const { state, dispatch, clipboard } = useEditor();
  const hoverStore = useHoverStore();
  const textSelectionStore = useTextSelectionStore();
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
  // Filled by useCanvasPointerEvents below; consumed by the (earlier) keyboard
  // hook so Escape can abort an in-flight drag/resize/rotate/radius (STAGE-4).
  const cancelActiveInteractionRef = useRef<(() => boolean) | null>(null);
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
    textSelectionStore,
  });

  const { spacePressedRef } = useKeyboardShortcuts({
    dispatch,
    clipboard,
    enabled: shortcutsEnabled,
    viewportRef,
    interactionRef,
    latestStateRef,
    setInteractionActive,
    cancelActiveInteractionRef,
    settings,
    onCanvasToolShortcut,
    onOpenSelectedComponentShortcut,
    onBackToParentShortcut,
    ancestorOverlayAvailable: ancestorFrames.length > 0,
  });

  const { onWheel, zoomGestureActive } = useViewportControls({
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

  // Zoom-to-selection (G12): same consume-and-clear contract as the node focus
  // above, but framing the union bounds of the whole selection.
  useEffect(() => {
    if (!state.focusSelection) return;
    const size = getCurrentViewportSize();
    let union: Rect | null = null;
    for (const id of state.selectedIds) {
      const rect = getAbsoluteRect(state.document, id);
      if (!rect) continue;
      union = union ? unionRect(union, rect) : rect;
    }
    if (union && size.width > 0 && size.height > 0) {
      const zoom = getInitialZoomForSubjectSize(
        { width: union.width, height: union.height },
        state.viewportMode,
      );
      const focus = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const next = centerViewportOnPoint(zoom, size, canvasSize, focus, state.viewportMode);
      if (viewportChanged(next, { zoom: state.zoom, offsetX: state.offsetX, offsetY: state.offsetY })) {
        dispatch({ type: "setViewport", zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
      }
    }
    dispatch({ type: "requestSelectionFocus", active: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.focusSelection]);

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
        contentScroll: currentState.contentScroll,
        viewportMode: currentState.viewportMode,
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
      contentScroll: state.contentScroll,
      viewportMode: state.viewportMode,
    });
  }, [selectedIdsKey, state.canvasStageActive, state.document, state.offsetX, state.offsetY, state.zoom, state.contentScroll, canvasAlignmentDebugEnabled]);

  // The viewport transform is memoized from state + measured size; pointer
  // handlers reuse it instead of rebuilding it per event (STAGE-3). Defined
  // before the pointer-events hook so it can be threaded in.
  const viewportTransform = useMemo(
    () => buildViewportTransform(state.document, viewportSize, state.zoom, state.offsetX, state.offsetY, state.viewportMode),
    [state.document.canvas.height, state.document.canvas.rotation, state.document.canvas.width, state.offsetX, state.offsetY, state.viewportMode, state.zoom, viewportSize],
  );

  // Screen pages: the frame keeps its device size (the fixed window), while the
  // content scrolls inside it by `contentScroll` canvas units along the content
  // axis. Everything that lives in content space — hit-testing, tooling handles,
  // text/gradient overlays — must use a transform shifted by the scroll so it
  // stays glued to the moved content. The frame box (stageSpace) and the grid
  // keep the plain transform, so the window itself never moves. At scroll 0 this
  // is identical to `viewportTransform`.
  const contentPages = draftMode ? 1 : getContentPages(state.document);
  const contentAxis = getContentAxis(state.document);
  // Defensive clamp: an undo can shrink the page count while the transient
  // scroll still points past the new content end.
  const contentScroll = draftMode
    ? 0
    : Math.min(
        state.contentScroll,
        (contentPages - 1) * (contentAxis === "horizontal" ? state.document.canvas.width : state.document.canvas.height),
      );
  const contentViewportTransform = useMemo(() => {
    if (contentScroll === 0) return viewportTransform;
    const displayScale =
      viewportSize.width > 0 && viewportSize.height > 0
        ? getCanvasDisplayScale(viewportSize, canvasSize, state.viewportMode)
        : 1;
    const scrollPx = contentScroll * state.zoom * displayScale;
    const offsetX = contentAxis === "horizontal" ? state.offsetX - scrollPx : state.offsetX;
    const offsetY = contentAxis === "horizontal" ? state.offsetY : state.offsetY - scrollPx;
    return buildViewportTransform(state.document, viewportSize, state.zoom, offsetX, offsetY, state.viewportMode);
  }, [contentScroll, contentAxis, viewportTransform, viewportSize, canvasSize, state.viewportMode, state.zoom, state.document, state.offsetX, state.offsetY]);

  // Screen pages: the on-screen window rect the tooling layer clips its chrome to,
  // so handles/outlines of content scrolled outside the visible slice don't float
  // over the stage. Built from the PLAIN transform (the window never scrolls) and
  // padded by the resize-handle reach so chrome of elements flush against the
  // visible edge survives. Null on single-page frames — no clip.
  const windowClipRect = useMemo<Rect | null>(() => {
    if (contentPages <= 1) return null;
    const rect = canvasRectToViewport(
      { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
      viewportTransform,
    );
    const pad = 16;
    return { x: rect.x - pad, y: rect.y - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 };
  }, [contentPages, canvasSize.width, canvasSize.height, viewportTransform]);

  const {
    marqueeRect,
    lassoPoints,
    contextMenu,
    dropTarget,
    closeContextMenu,
    onPointerDown,
    onPointerMove,
    finishInteraction,
    onDoubleClick,
    handleContextMenu,
    onDragOver,
    onDrop,
    cancelActiveInteraction,
  } = useCanvasPointerEvents({
    state,
    dispatch,
    draftMode,
    viewportTransform: contentViewportTransform,
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
    isIconSubject,
  });
  cancelActiveInteractionRef.current = cancelActiveInteraction;

  const affectedElementIds = useMemo(
    () =>
      state.transientChangedIds
        ? expandRenderIds(state.document, state.transientChangedIds)
        : getAffectedElementRenderIds(previousRenderDocumentRef.current, state.document),
    [state.document, state.transientChangedIds],
  );

  // Ids being live-transformed right now (no ancestors — only the nodes whose
  // left/top actually sweep). ElementRenderer promotes these to their own
  // compositing layer so WKWebView moves the layer instead of repainting the
  // stage tile, which leaves 1px trails behind (WebKit dirty-rect rounding).
  // Keyed off the id list so the Set identity is stable across the ~60Hz
  // transient frames and flips exactly at gesture start/commit.
  const transientTransformKey = state.transientChangedIds?.join("\u0000") ?? null;
  const transientTransformIds = useMemo(
    () => (transientTransformKey === null ? null : new Set(transientTransformKey.split("\u0000"))),
    [transientTransformKey],
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

  // The settled projection choice. The gesture no longer flips the projection
  // (the old `zoomGestureActive` fast path dropped to a 1×-layout CSS transform);
  // instead a streaming zoom freezes the scaled-DOM layout below.
  const scaledDomProjection = useMemo(
    () =>
      shouldUseScaledDomProjection({
        canvasSize,
        displayZoom,
        canvasRotation: state.document.canvas.rotation ?? 0,
      }),
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
  // The scrollbar extent rescans every root's AABB — O(roots). During an active
  // gesture the document churns at 60Hz, so reuse the last settled bounds and
  // recompute only when the gesture ends; the scroll extent lagging to gesture-end
  // is invisible (P10). The ref write is idempotent (deterministic from the doc).
  const draftBoundsRef = useRef<Rect | null>(null);
  const draftContentBounds = useMemo(() => {
    if (!draftMode) return null;
    if (interactionActive && draftBoundsRef.current) return draftBoundsRef.current;
    const bounds = getSelectionAABB(state.document, state.document.rootIds);
    draftBoundsRef.current = bounds;
    return bounds;
  }, [draftMode, state.document, interactionActive]);
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
  // Frozen-scale zoom gesture (P1). A streaming wheel/pinch zoom used to either
  // re-lay-out the whole scaled-DOM scene on every wheel tick (above the safe
  // transformed side) or drop to the 1×-layout CSS-transform path (below it).
  // Both visibly detach the selection chrome from the content while the gesture
  // streams: the per-tick relayout of a 10k–100k px stage makes WebKit present
  // stale tiles for a few frames while the skia chrome updates instantly, and
  // the 1× raster stretched `displayZoom`× puts the element's PAINTED edge up to
  // ~half a source pixel × zoom away from its geometry — exactly where the
  // chrome draws. (The v8 alignment log proved every post-paint JS metric
  // aligned; the divergence lives in the raster pipeline.) So: while the gesture
  // streams, keep the layout at the scale it had when the gesture started and
  // reach the live zoom/offset with a compositor-only translate+scale on the
  // stage; re-project once, on settle (policy in resolveFrozenGestureScale).
  // Ref writes during render are deliberate and idempotent (StrictMode-safe):
  // the frozen scale must be visible to this same render pass.
  const lastCommittedRenderScaleRef = useRef<number | null>(null);
  const frozenGestureScaleRef = useRef<number | null>(null);
  frozenGestureScaleRef.current = resolveFrozenGestureScale({
    zoomGestureActive,
    scaledDomProjection,
    displayZoom,
    previousFrozenScale: frozenGestureScaleRef.current,
    lastCommittedRenderScale: lastCommittedRenderScaleRef.current,
  });
  const gestureFrozenScale = frozenGestureScaleRef.current;
  const gestureCorrectiveScale =
    gestureFrozenScale !== null ? displayZoom / gestureFrozenScale : 1;
  const renderScale = scaledDomProjection ? gestureFrozenScale ?? displayZoom : 1;
  useEffect(() => {
    lastCommittedRenderScaleRef.current = renderScale;
  });
  // Mirror the stage's layout scale into the geometry module BEFORE children
  // render: snapToLayoutUnit emulates the browser's 1/64-px LayoutUnit floor on
  // the value the DOM actually lays out (canvas × renderScale). A module write
  // during render is deliberate — it must be visible to the tooling layer's
  // render pass in this same commit, and it is idempotent (safe under
  // StrictMode's double render).
  setLayoutUnitScale(renderScale);
  const stageWidth = canvasSize.width;
  const stageHeight = canvasSize.height;
  const projectedStageWidth = stageWidth * renderScale;
  const projectedStageHeight = stageHeight * renderScale;
  // The grid draws in viewport pixels, so its clip region is the canvas's on-screen
  // box — always `size * displayZoom`, never `projectedStageWidth`, which collapses
  // to the unscaled size whenever the CSS-transform projection is active (the whole
  // zoom gesture, P1). Memoized for a stable identity so the overlay's effect doesn't
  // re-run (and re-alloc its buffer) on every render from a fresh object literal (P5).
  const gridCanvasRect = useMemo(
    () => ({
      x: viewportTransform.offsetX,
      y: viewportTransform.offsetY,
      width: stageWidth * displayZoom,
      height: stageHeight * displayZoom,
    }),
    [viewportTransform.offsetX, viewportTransform.offsetY, stageWidth, stageHeight, displayZoom],
  );
  const stageSpaceStyle = useMemo<CSSProperties>(() => {
    if (!scaledDomProjection) {
      return {
        width: stageWidth,
        height: stageHeight,
        transform: viewportTransform.cssTransform,
        transformOrigin: "0 0",
        backfaceVisibility: "hidden",
        imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
        "--zoom": displayZoom,
      } as CSSProperties;
    }
    if (gestureFrozenScale !== null) {
      // Mid zoom gesture: the layout stays at the frozen scale (projectedStage*
      // already uses it via renderScale); only this compositor transform tracks
      // the live zoom/offset, so a wheel tick costs no relayout and no restyle.
      return {
        width: projectedStageWidth,
        height: projectedStageHeight,
        left: 0,
        top: 0,
        transform: `translate(${viewportTransform.offsetX}px, ${viewportTransform.offsetY}px) scale(${gestureCorrectiveScale})`,
        transformOrigin: "0 0",
        backfaceVisibility: "visible",
        imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
        "--zoom": displayZoom,
      } as CSSProperties;
    }
    return {
      width: projectedStageWidth,
      height: projectedStageHeight,
      left: viewportTransform.offsetX,
      top: viewportTransform.offsetY,
      transform: "none",
      transformOrigin: "0 0",
      backfaceVisibility: "visible",
      imageRendering: displayZoom >= 8 ? "pixelated" : "auto",
      "--zoom": displayZoom,
    } as CSSProperties;
  }, [
    scaledDomProjection,
    gestureFrozenScale,
    gestureCorrectiveScale,
    projectedStageWidth,
    projectedStageHeight,
    stageWidth,
    stageHeight,
    viewportTransform,
    displayZoom,
  ]);

  return (
    <div
      ref={viewportRef}
      className={shellClassName}
      style={shellStyle}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={(event) => {
        // An OS gesture interruption mid-drag must revert, not commit a
        // half-finished move (M7). cancelActiveInteraction handles the transform
        // gestures (drag/resize/rotate/radius + canvas variants); it returns
        // false for pan/marquee/draw/pen/pencil, which fall back to their normal
        // finish so they still clean up.
        if (!cancelActiveInteraction()) finishInteraction(event);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
            transientTransformIds={transientTransformIds}
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
              // The fixed device window clips its scrollable content (only once
              // expanded — a single page keeps the previous overflow: visible so
              // outside strokes / shadows aren't clipped).
              overflow: contentPages > 1 ? "hidden" : undefined,
              "--zoom": displayZoom,
            } as CSSProperties}
          >
            {contentPages > 1 ? (
              // Content surface: longer than the window along the content axis,
              // slid by the scroll. Its `transform` makes it the containing block
              // for the absolute elements, so their coordinates stay natural —
              // only the surface moves.
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: projectedStageWidth * (contentAxis === "horizontal" ? contentPages : 1),
                  height: projectedStageHeight * (contentAxis === "horizontal" ? 1 : contentPages),
                  transform:
                    contentAxis === "horizontal"
                      ? `translateX(${-contentScroll * renderScale}px)`
                      : `translateY(${-contentScroll * renderScale}px)`,
                  willChange: "transform",
                }}
              >
                <RenderedScene
                  draftMode={false}
                  document={state.document}
                  canvasStageActive={state.canvasStageActive}
                  isolatedParentId={state.isolatedParentId}
                  editingTextId={state.editingTextId}
                  affectedElementIds={affectedElementIds}
                  transientTransformIds={transientTransformIds}
                  renderScale={renderScale}
                />
              </div>
            ) : (
              <RenderedScene
                draftMode={false}
                document={state.document}
                canvasStageActive={state.canvasStageActive}
                isolatedParentId={state.isolatedParentId}
                editingTextId={state.editingTextId}
                affectedElementIds={affectedElementIds}
                transientTransformIds={transientTransformIds}
                renderScale={renderScale}
              />
            )}
          </div>
        )}
      </div>

      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <CanvasGridOverlay
          enabled={state.document.shellGrid?.enabled ?? false}
          type={state.document.shellGrid?.type ?? "dots"}
          shellBackground={state.document.shellBackground ?? "#000000"}
          canvasBackground={state.document.canvas.background || "#ffffff"}
          canvasRect={gridCanvasRect}
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
        selectedAnchors={state.selectedAnchors}
        lasso={lassoPoints}
        scaleToolActive={state.tool === "scale"}
        canvasStageActive={state.canvasStageActive}
        guides={state.guides}
        viewportTransform={contentViewportTransform}
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
        contentScroll={contentScroll}
        windowClipRect={windowClipRect}
      />

      <TextEditingTextarea
        textEdit={textEdit}
        document={state.document}
        viewportRef={viewportRef}
        viewportTransform={contentViewportTransform}
        onSelectionChange={syncTextSelection}
        onInputValue={updateTextNodeFromTextareaInput}
        onCommit={commitTextEditing}
        onCancel={cancelTextEditing}
        settings={settings}
      />

      <TextEditingOverlay
        textEdit={textEdit}
        document={state.document}
        viewportTransform={contentViewportTransform}
      />

      <GradientEditOverlay
        state={state}
        viewportTransform={contentViewportTransform}
        dispatch={dispatch}
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
