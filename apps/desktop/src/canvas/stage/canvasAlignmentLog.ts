import {
  getAbsoluteRect,
  getElementAABB,
  getSelectionBox,
  unionRects,
} from "@/canvas/engine/geometry";
import { getContentAxis, getContentPages } from "@/canvas/engine/geometry/bounds";
import type { CanvasDocument, Rect, ViewportMode } from "@/canvas/engine/types";
import {
  getCanvasDisplayScale,
  shouldUseScaledDomProjection,
  type Size,
} from "@/canvas/engine/viewport";
import {
  containmentOutlineSegments,
  elementToPaintViewportRect,
  snapOutlineRect,
} from "./canvasToolingRenderer";
import { buildViewportTransform, getCanvasSize } from "./canvasCoordinates";
import { getTransformIds } from "./canvasToolingUtils";

export type CanvasAlignmentLogInput = {
  reason: string;
  interactionType?: string | null;
  document: CanvasDocument;
  selectedIds: string[];
  zoom: number;
  offsetX: number;
  offsetY: number;
  // Screen pages (v7): the raw transient scroll along the content axis, in canvas
  // units. Optional so older call sites keep working; without it the log assumes 0.
  contentScroll?: number;
  viewportMode?: ViewportMode;
};

export type CanvasAlignmentLogContext = {
  viewport: HTMLElement;
  stageElement: HTMLElement | null;
  canvasStageElement: HTMLElement | null;
  viewportSize: Size;
};

// v8: delegate to the app's real transform builder so the log uses the SAME
// device-pixel snapping the stage and the tooling adapter use — the v7 log built
// unsnapped transforms and reported a phantom ±0.5px dom-vs-tooling delta.
function buildTransform(
  document: CanvasDocument,
  viewportSize: Size,
  zoom: number,
  offsetX: number,
  offsetY: number,
  viewportMode?: ViewportMode,
) {
  return buildViewportTransform(document, viewportSize, zoom, offsetX, offsetY, viewportMode ?? "frame");
}

// Mirrors the CanvasStage fold: clamp the transient scroll to the current page
// count, convert to screen px, and shift the offset along the content axis. The
// tooling overlay draws with this folded transform; the content surface applies
// the same shift as a nested CSS translate. Divergence between the two is the
// recurring "selection chrome off the element" bug this log exists to catch.
function foldContentScroll(
  document: CanvasDocument,
  contentScrollRaw: number,
  displayZoom: number,
  offsetX: number,
  offsetY: number,
) {
  const pages = getContentPages(document);
  const axis = getContentAxis(document);
  const maxScroll =
    (pages - 1) * (axis === "horizontal" ? document.canvas.width : document.canvas.height);
  const clamped = Math.min(contentScrollRaw, maxScroll);
  const scrollPx = clamped * displayZoom;
  return {
    pages,
    axis,
    contentScrollRaw,
    contentScrollClamped: clamped,
    scrollPx,
    offsetX: axis === "horizontal" ? offsetX - scrollPx : offsetX,
    offsetY: axis === "horizontal" ? offsetY : offsetY - scrollPx,
  };
}

function roundDebugValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rectForDebug(rect: Rect | null): Rect | null {
  if (!rect) return null;
  return {
    x: roundDebugValue(rect.x),
    y: roundDebugValue(rect.y),
    width: roundDebugValue(rect.width),
    height: roundDebugValue(rect.height),
  };
}

function rectEdgesForDebug(rect: Rect | null): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
  if (!rect) return null;
  return {
    left: roundDebugValue(rect.x),
    right: roundDebugValue(rect.x + rect.width),
    top: roundDebugValue(rect.y),
    bottom: roundDebugValue(rect.y + rect.height),
  };
}

function unionViewportRects(rects: Rect[]): Rect | null {
  return unionRects(rects);
}

function getRenderedElement(viewport: HTMLElement, id: string): HTMLElement | null {
  for (const element of viewport.querySelectorAll<HTMLElement>("[data-element-id]")) {
    if (element.dataset.elementId === id) return element;
  }
  return null;
}

function domRectRelativeToViewport(element: HTMLElement, viewport: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return {
    x: rect.left - viewportRect.left,
    y: rect.top - viewportRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function domClientRectForDebug(element: HTMLElement | null): Rect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function domBoxMetricsForDebug(element: HTMLElement | null) {
  if (!element) return null;
  return {
    clientRect: rectForDebug(domClientRectForDebug(element)),
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    // v7: a non-zero native scroll on a clipped container (canvas-stage /
    // canvas-shell) shifts its DOM children WITHOUT moving the tooling canvas —
    // a prime suspect for the chrome-vs-content desync. Nothing in the app sets
    // these; any non-zero value came from the browser (focus reveal, find, IME).
    scrollTop: roundDebugValue(element.scrollTop),
    scrollLeft: roundDebugValue(element.scrollLeft),
    cssWidth: getComputedStyle(element).width,
    cssHeight: getComputedStyle(element).height,
    inlineTransform: element.style.transform || null,
    computedTransform: getComputedStyle(element).transform,
    inlineLeft: element.style.left || null,
    inlineTop: element.style.top || null,
  };
}

function unscaleRect(rect: Rect | null, scale: number): Rect | null {
  if (!rect || scale === 0) return null;
  return {
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function exactOutlineEdges(
  rect: Rect | null,
  pixelScale: { x: number; y: number },
): {
  leftOuter: number;
  leftInner: number;
  rightInner: number;
  rightOuter: number;
  topOuter: number;
  topInner: number;
  bottomInner: number;
  bottomOuter: number;
} | null {
  if (!rect) return null;
  const segments = containmentOutlineSegments(rect, pixelScale);
  if (!segments) return null;
  return {
    leftOuter: roundDebugValue(segments.left.x),
    leftInner: roundDebugValue(segments.left.x + segments.left.width),
    rightInner: roundDebugValue(segments.right.x),
    rightOuter: roundDebugValue(segments.right.x + segments.right.width),
    topOuter: roundDebugValue(segments.top.y),
    topInner: roundDebugValue(segments.top.y + segments.top.height),
    bottomInner: roundDebugValue(segments.bottom.y),
    bottomOuter: roundDebugValue(segments.bottom.y + segments.bottom.height),
  };
}

export function logCanvasAlignment(
  input: CanvasAlignmentLogInput,
  context: CanvasAlignmentLogContext,
): void {
  const { viewport, stageElement, canvasStageElement, viewportSize } = context;

  const canvasSize = getCanvasSize(input.document);
  const displayScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? getCanvasDisplayScale(viewportSize, canvasSize, input.viewportMode)
      : 1;
  // v7: the tooling overlay draws with the CONTENT transform — the plain viewport
  // offset shifted by the screen-pages scroll. Fold it here the same way
  // CanvasStage does, so the "expected blue box" below matches what the overlay
  // actually drew; `fold` also carries the raw/clamped scroll for the payload.
  const fold = foldContentScroll(
    input.document,
    input.contentScroll ?? 0,
    displayScale * input.zoom,
    input.offsetX,
    input.offsetY,
  );
  const t = buildTransform(
    input.document,
    viewportSize,
    input.zoom,
    fold.offsetX,
    fold.offsetY,
    input.viewportMode,
  );
  const plainT = buildTransform(
    input.document,
    viewportSize,
    input.zoom,
    input.offsetX,
    input.offsetY,
    input.viewportMode,
  );
  const displayZoom = t.displayZoom;
  const offsetX = t.offsetX;
  const offsetY = t.offsetY;
  // The content surface is the anonymous translated div CanvasStage renders as
  // canvas-stage's only child once contentPages > 1; its inline translate is the
  // content half of the fold. Null with a single page.
  const contentSurfaceElement =
    fold.pages > 1 ? (canvasStageElement?.firstElementChild as HTMLElement | null) ?? null : null;
  const scaledDomProjection = shouldUseScaledDomProjection({
    canvasSize,
    displayZoom,
    canvasRotation: input.document.canvas.rotation ?? 0,
  });
  const transformIds = getTransformIds(input.document, input.selectedIds);
  const selectionCanvasRect = getSelectionBox(input.document, transformIds);
  const toolingRects = transformIds
    .map((id) => elementToPaintViewportRect(input.document, id, t))
    .filter((rect): rect is Rect => rect !== null);
  const boxSelectionViewportRect = unionViewportRects(toolingRects);
  // v8: target the skia tooling canvas by its data tag — a bare
  // `querySelector("canvas")` used to hit the grid overlay canvas first (0-width
  // backing when the grid is off), poisoning pixelScale (v7 logs showed x: 0).
  const toolingCanvas =
    viewport.querySelector<HTMLCanvasElement>("canvas[data-fwyn-tooling-canvas]") ??
    viewport.querySelector<HTMLCanvasElement>("canvas");
  const toolingCanvasRect = toolingCanvas?.getBoundingClientRect();
  const canvasStageViewportRect = canvasStageElement
    ? domRectRelativeToViewport(canvasStageElement, viewport)
    : null;
  const pixelScale =
    toolingCanvas && toolingCanvasRect && toolingCanvasRect.width > 0 && toolingCanvasRect.height > 0
      ? {
          x: toolingCanvas.width / toolingCanvasRect.width,
          y: toolingCanvas.height / toolingCanvasRect.height,
        }
      : {
          x: globalThis.devicePixelRatio || 1,
          y: globalThis.devicePixelRatio || 1,
        };
  const snappedBoxSelection = boxSelectionViewportRect
    ? snapOutlineRect(boxSelectionViewportRect, pixelScale)
    : null;
  const boxOutlineEdges = exactOutlineEdges(boxSelectionViewportRect, pixelScale);

  const items = transformIds.map((id) => {
    const node = input.document.elements[id];
    const domElement = getRenderedElement(viewport, id);
    const domViewportRect = domElement
      ? domRectRelativeToViewport(domElement, viewport)
      : null;
    const domCanvasRectScreenPx =
      domViewportRect && canvasStageViewportRect
        ? {
            x: domViewportRect.x - canvasStageViewportRect.x,
            y: domViewportRect.y - canvasStageViewportRect.y,
            width: domViewportRect.width,
            height: domViewportRect.height,
          }
        : null;
    const domCanvasRectCanvasPx =
      (input.document.canvas.rotation ?? 0) === 0
        ? unscaleRect(domCanvasRectScreenPx, displayZoom)
        : null;
    const modelViewportRect = elementToPaintViewportRect(input.document, id, t);
    const toolingViewportRect = modelViewportRect;
    const computedStyle = domElement ? getComputedStyle(domElement) : null;
    const snappedToolingRect = toolingViewportRect
      ? snapOutlineRect(toolingViewportRect, pixelScale)
      : null;
    const blueOutlineEdges = exactOutlineEdges(toolingViewportRect, pixelScale);
    return {
      id,
      name: node?.name ?? null,
      type: node?.type ?? null,
      documentRect: node
        ? rectForDebug({ x: node.x, y: node.y, width: node.width, height: node.height })
        : null,
      absoluteRectCanvas: rectForDebug(getAbsoluteRect(input.document, id)),
      aabbCanvas: rectForDebug(getElementAABB(input.document, id)),
      modelViewportRect: rectForDebug(modelViewportRect),
      modelViewportEdges: rectEdgesForDebug(modelViewportRect),
      toolingViewportRect: rectForDebug(toolingViewportRect),
      toolingViewportEdges: rectEdgesForDebug(toolingViewportRect),
      snappedToolingEdges: snappedToolingRect,
      domClientRect: rectForDebug(domClientRectForDebug(domElement)),
      domViewportRect: rectForDebug(domViewportRect),
      domViewportEdges: rectEdgesForDebug(domViewportRect),
      domCanvasRectScreenPx: rectForDebug(domCanvasRectScreenPx),
      domCanvasRectCanvasPx: rectForDebug(domCanvasRectCanvasPx),
      blueOutlineEdges,
      deltaDomMinusTooling:
        domViewportRect && toolingViewportRect
          ? rectForDebug({
              x: domViewportRect.x - toolingViewportRect.x,
              y: domViewportRect.y - toolingViewportRect.y,
              width: domViewportRect.width - toolingViewportRect.width,
              height: domViewportRect.height - toolingViewportRect.height,
            })
          : null,
      deltaDomCanvasMinusModelCanvas:
        domCanvasRectCanvasPx && node
          ? rectForDebug({
              x: domCanvasRectCanvasPx.x - (getAbsoluteRect(input.document, id)?.x ?? node.x),
              y: domCanvasRectCanvasPx.y - (getAbsoluteRect(input.document, id)?.y ?? node.y),
              width: domCanvasRectCanvasPx.width - node.width,
              height: domCanvasRectCanvasPx.height - node.height,
            })
          : null,
      css: {
        boxSizing: computedStyle?.boxSizing ?? null,
        left: domElement?.style.left || null,
        top: domElement?.style.top || null,
        width: domElement?.style.width || null,
        height: domElement?.style.height || null,
        transform: computedStyle?.transform ?? null,
        borderWidth: computedStyle?.borderWidth ?? null,
      },
    };
  });
  const domSelectionViewportRect = unionViewportRects(
    items
      .map((item) => item.domViewportRect)
      .filter((rect): rect is Rect => rect !== null),
  );

  const flatItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    docX: item.documentRect?.x ?? null,
    docY: item.documentRect?.y ?? null,
    docW: item.documentRect?.width ?? null,
    docH: item.documentRect?.height ?? null,
    domLeft: item.domViewportEdges?.left ?? null,
    domRight: item.domViewportEdges?.right ?? null,
    domW: item.domViewportRect?.width ?? null,
    domCanvasX: item.domCanvasRectCanvasPx?.x ?? null,
    domCanvasY: item.domCanvasRectCanvasPx?.y ?? null,
    domCanvasW: item.domCanvasRectCanvasPx?.width ?? null,
    domCanvasH: item.domCanvasRectCanvasPx?.height ?? null,
    modelLeft: item.modelViewportEdges?.left ?? null,
    modelRight: item.modelViewportEdges?.right ?? null,
    toolingLeft: item.toolingViewportEdges?.left ?? null,
    toolingRight: item.toolingViewportEdges?.right ?? null,
    toolingW: item.toolingViewportRect?.width ?? null,
    canvasDeltaX: item.deltaDomCanvasMinusModelCanvas?.x ?? null,
    canvasDeltaY: item.deltaDomCanvasMinusModelCanvas?.y ?? null,
    canvasDeltaW: item.deltaDomCanvasMinusModelCanvas?.width ?? null,
    canvasDeltaH: item.deltaDomCanvasMinusModelCanvas?.height ?? null,
    blueLeftOuter: item.blueOutlineEdges?.leftOuter ?? null,
    blueLeftInner: item.blueOutlineEdges?.leftInner ?? null,
    blueRightInner: item.blueOutlineEdges?.rightInner ?? null,
    blueRightOuter: item.blueOutlineEdges?.rightOuter ?? null,
    domLeftMinusToolingLeft:
      item.domViewportEdges && item.toolingViewportEdges
        ? roundDebugValue(item.domViewportEdges.left - item.toolingViewportEdges.left)
        : null,
    domRightMinusToolingRight:
      item.domViewportEdges && item.toolingViewportEdges
        ? roundDebugValue(item.domViewportEdges.right - item.toolingViewportEdges.right)
        : null,
    domLeftMinusBlueOuter:
      item.domViewportEdges && item.blueOutlineEdges
        ? roundDebugValue(item.domViewportEdges.left - item.blueOutlineEdges.leftOuter)
        : null,
    domRightMinusBlueOuter:
      item.domViewportEdges && item.blueOutlineEdges
        ? roundDebugValue(item.domViewportEdges.right - item.blueOutlineEdges.rightOuter)
        : null,
    domLeftMinusBlueInner:
      item.domViewportEdges && item.blueOutlineEdges
        ? roundDebugValue(item.domViewportEdges.left - item.blueOutlineEdges.leftInner)
        : null,
    domRightMinusBlueInner:
      item.domViewportEdges && item.blueOutlineEdges
        ? roundDebugValue(item.domViewportEdges.right - item.blueOutlineEdges.rightInner)
        : null,
    boxSizing: item.css.boxSizing,
    cssLeft: item.css.left,
    cssWidth: item.css.width,
  }));

  // v8: the ONLY skew-free on-screen comparison in this log. `input` state is
  // captured at dispatch time, but this function runs post-paint (double rAF),
  // so during a wheel-zoom stream the DOM rects measured here belong to a NEWER
  // commit than `input` — the big mid-gesture deltas in the v7 logs were that
  // scheduling skew, not a real desync. `__fwynLastToolingFrame` is stamped by
  // the skia adapter at draw time, so comparing it against the DOM rects
  // measured in the same post-paint instant answers the real question: does the
  // chrome currently submitted to the canvas match the content currently laid
  // out in the DOM? (A remaining gap here would mean the divergence lives below
  // JS — the compositor presenting a stale WebGL buffer.)
  const lastToolingFrame = (globalThis as Record<string, unknown>).__fwynLastToolingFrame as
    | { displayZoom: number; offsetX: number; offsetY: number; drawnAt: number }
    | undefined;
  const firstItem = items[0];
  const firstAbs = transformIds.length > 0 ? getAbsoluteRect(input.document, transformIds[0]) : null;
  const onScreenChrome =
    lastToolingFrame && firstItem?.domViewportRect && firstAbs && firstAbs.width > 0
      ? {
          chromeDisplayZoom: roundDebugValue(lastToolingFrame.displayZoom),
          domImpliedScale: roundDebugValue(firstItem.domViewportRect.width / firstAbs.width),
          deltaScale: roundDebugValue(
            lastToolingFrame.displayZoom - firstItem.domViewportRect.width / firstAbs.width,
          ),
          deltaLeft: roundDebugValue(
            firstItem.domViewportRect.x -
              (lastToolingFrame.offsetX + firstAbs.x * lastToolingFrame.displayZoom),
          ),
          deltaTop: roundDebugValue(
            firstItem.domViewportRect.y -
              (lastToolingFrame.offsetY + firstAbs.y * lastToolingFrame.displayZoom),
          ),
          chromeAgeMs: roundDebugValue(performance.now() - lastToolingFrame.drawnAt),
        }
      : null;

  const payload = {
    version: 8,
    reason: input.reason,
    interaction: input.interactionType ?? null,
    onScreenChrome,
    // v7: everything screen-pages. expectedSurfaceTranslatePx assumes the
    // scaled-DOM projection (renderScale = displayZoom); during a live zoom
    // gesture the projection is CSS-transform and the expected inline translate
    // is `-contentScrollClamped * 1` instead — compare against
    // dom.contentSurface.inlineTransform for whichever projection
    // stageProjection.mode reports.
    screenPages: {
      pages: fold.pages,
      axis: fold.axis,
      contentScrollRaw: roundDebugValue(fold.contentScrollRaw),
      contentScrollClamped: roundDebugValue(fold.contentScrollClamped),
      scrollPx: roundDebugValue(fold.scrollPx),
      expectedSurfaceTranslatePx: roundDebugValue(-fold.scrollPx),
      plainOffset: { x: roundDebugValue(plainT.offsetX), y: roundDebugValue(plainT.offsetY) },
      foldedOffset: { x: roundDebugValue(t.offsetX), y: roundDebugValue(t.offsetY) },
    },
    runtime: {
      devicePixelRatio: roundDebugValue(globalThis.devicePixelRatio || 1),
      visualViewport: globalThis.visualViewport
        ? {
            width: roundDebugValue(globalThis.visualViewport.width),
            height: roundDebugValue(globalThis.visualViewport.height),
            scale: roundDebugValue(globalThis.visualViewport.scale),
          }
        : null,
      windowInner: { width: globalThis.innerWidth, height: globalThis.innerHeight },
      screen: globalThis.screen
        ? {
            width: globalThis.screen.width,
            height: globalThis.screen.height,
            availWidth: globalThis.screen.availWidth,
            availHeight: globalThis.screen.availHeight,
          }
        : null,
    },
    zoom: {
      userZoom: roundDebugValue(input.zoom),
      displayScale: roundDebugValue(displayScale),
      displayZoom: roundDebugValue(displayZoom),
    },
    offset: { x: roundDebugValue(offsetX), y: roundDebugValue(offsetY) },
    viewportMatrix: {
      a: roundDebugValue(t.matrix.a),
      b: roundDebugValue(t.matrix.b),
      c: roundDebugValue(t.matrix.c),
      d: roundDebugValue(t.matrix.d),
      e: roundDebugValue(t.matrix.e),
      f: roundDebugValue(t.matrix.f),
    },
    stageProjection: {
      mode: scaledDomProjection ? "scaled-dom" : "css-transform",
      renderScale: roundDebugValue(scaledDomProjection ? displayZoom : 1),
    },
    pixelScale: { x: roundDebugValue(pixelScale.x), y: roundDebugValue(pixelScale.y) },
    canvas: {
      model: input.document.canvas,
      modelTotalCssPixels: roundDebugValue(
        input.document.canvas.width * input.document.canvas.height,
      ),
      displayCssPixels: {
        width: roundDebugValue(input.document.canvas.width * displayZoom),
        height: roundDebugValue(input.document.canvas.height * displayZoom),
        total: roundDebugValue(
          input.document.canvas.width * displayZoom * input.document.canvas.height * displayZoom,
        ),
      },
      displayDevicePixels: {
        width: roundDebugValue(
          input.document.canvas.width * displayZoom * (globalThis.devicePixelRatio || 1),
        ),
        height: roundDebugValue(
          input.document.canvas.height * displayZoom * (globalThis.devicePixelRatio || 1),
        ),
        total: roundDebugValue(
          input.document.canvas.width *
            displayZoom *
            (globalThis.devicePixelRatio || 1) *
            input.document.canvas.height *
            displayZoom *
            (globalThis.devicePixelRatio || 1),
        ),
      },
    },
    dom: {
      viewport: domBoxMetricsForDebug(viewport),
      stageSpace: domBoxMetricsForDebug(stageElement),
      canvasStage: domBoxMetricsForDebug(canvasStageElement),
      contentSurface: domBoxMetricsForDebug(contentSurfaceElement),
      toolingCanvas: toolingCanvas
        ? {
            clientRect: rectForDebug(domClientRectForDebug(toolingCanvas)),
            viewportRect: rectForDebug(domRectRelativeToViewport(toolingCanvas, viewport)),
            cssWidth: roundDebugValue(toolingCanvasRect?.width ?? 0),
            cssHeight: roundDebugValue(toolingCanvasRect?.height ?? 0),
            backingWidth: toolingCanvas.width,
            backingHeight: toolingCanvas.height,
            totalBackingPixels: toolingCanvas.width * toolingCanvas.height,
          }
        : null,
    },
    stage: stageElement
      ? {
          rect: rectForDebug(domRectRelativeToViewport(stageElement, viewport)),
          transform: stageElement.style.transform || null,
        }
      : null,
    selectedIds: input.selectedIds,
    transformIds,
    selectionCanvasRect: rectForDebug(selectionCanvasRect),
    selectionCanvasEdges: rectEdgesForDebug(selectionCanvasRect),
    boxSelectionViewportRect: rectForDebug(boxSelectionViewportRect),
    boxSelectionViewportEdges: rectEdgesForDebug(boxSelectionViewportRect),
    domSelectionViewportRect: rectForDebug(domSelectionViewportRect),
    domSelectionViewportEdges: rectEdgesForDebug(domSelectionViewportRect),
    deltaDomSelectionMinusTooling:
      domSelectionViewportRect && boxSelectionViewportRect
        ? rectForDebug({
            x: domSelectionViewportRect.x - boxSelectionViewportRect.x,
            y: domSelectionViewportRect.y - boxSelectionViewportRect.y,
            width: domSelectionViewportRect.width - boxSelectionViewportRect.width,
            height: domSelectionViewportRect.height - boxSelectionViewportRect.height,
          })
        : null,
    snappedBoxSelection,
    boxOutlineEdges,
    items,
  };
  console.log("[canvas alignment geometry v8]", payload);
  console.table(flatItems);
  console.log("[canvas alignment flat v8]", JSON.stringify(flatItems, null, 2));
  console.log("[canvas alignment payload v8]", JSON.stringify(payload, null, 2));
}
