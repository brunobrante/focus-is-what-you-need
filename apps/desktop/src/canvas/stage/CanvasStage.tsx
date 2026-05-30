import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useEditor, useHoverStore } from "@/canvas/engine/store";
import type { CanvasDocument } from "@/canvas/engine/types";
import {
  getCanvasDisplayScale,
  shouldUseScaledDomProjection,
} from "@/canvas/engine/viewport";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { CanvasToolingLayer } from "./CanvasToolingLayer";
import type { CanvasToolingRef } from "./CanvasToolingLayer";
import type { Interaction } from "./canvasInteractionTypes";
import { getShellPatternStyle, getStageBoxShadow, TOOLBAR_TOOL_MAP } from "./canvasShellStyle";
import { CanvasGridOverlay } from "./CanvasGridOverlay";
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
}: {
  draftMode?: boolean;
  activeTool?: string;
  viewportSubjectKey?: string;
}) {
  const { state, dispatch } = useEditor();
  const hoverStore = useHoverStore();

  useEffect(() => {
    if (!activeTool) return;
    const mapped = TOOLBAR_TOOL_MAP[activeTool];
    if (mapped && mapped !== state.tool) dispatch({ type: "setTool", tool: mapped });
  }, [activeTool, dispatch, state.tool]);

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
  });

  const { onWheel } = useViewportControls({
    state,
    dispatch,
    viewportRef,
    getCurrentViewportSize,
    getCurrentViewportRect,
    draftMode,
    viewportSubjectKey,
    viewportSize,
    viewportInitializedSubjectRef,
  });

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
    dropTargetId,
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
    textEdit,
    enterTextEditing,
    syncTextSelection,
    scheduleCanvasAlignmentLog,
  });

  const affectedElementIds = useMemo(
    () =>
      state.transientChangedIds
        ? expandRenderIds(state.document, state.transientChangedIds)
        : getAffectedElementRenderIds(previousRenderDocumentRef.current, state.document),
    [state.document, state.transientChangedIds],
  );

  const isDrawTool = state.tool !== "select";
  const shellClassName = `canvas-shell${isDrawTool ? " is-draw-tool" : ""}`;
  const shellStyle = useMemo(
    () => getShellPatternStyle(state.document),
    [state.document.shellBackground],
  );
  const canvasSize = useMemo(
    () => getCanvasSize(state.document),
    [state.document.canvas.height, state.document.canvas.width],
  );
  const displayScale = useMemo(
    () => viewportSize.width > 0 && viewportSize.height > 0 ? getCanvasDisplayScale(viewportSize, canvasSize) : 1,
    [canvasSize, viewportSize],
  );
  const displayZoom = state.zoom * displayScale;
  const viewportTransform = useMemo(
    () => buildViewportTransform(state.document, viewportSize, state.zoom, state.offsetX, state.offsetY),
    [state.document.canvas.height, state.document.canvas.rotation, state.document.canvas.width, state.offsetX, state.offsetY, state.zoom, viewportSize],
  );
  const scaledDomProjection = useMemo(
    () => shouldUseScaledDomProjection({ canvasSize, displayZoom, canvasRotation: state.document.canvas.rotation ?? 0 }),
    [canvasSize, displayZoom, state.document.canvas.rotation],
  );
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
          background={state.document.shellBackground ?? "#000000"}
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
        canvasStageActive={state.canvasStageActive}
        guides={state.guides}
        viewportTransform={viewportTransform}
        suppressHover={interactionActive}
        interactionType={interactionActive ? (interactionRef.current?.type ?? null) : null}
        marqueeRect={marqueeRect}
        dropTargetId={dropTargetId}
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
    </div>
  );
}
