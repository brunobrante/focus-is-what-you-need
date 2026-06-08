import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { hexToRgba, paintOverlayCanvas, paintCropsCanvas } from "../engine/drawing";
import type {
  ActiveSubject,
  CropBox,
  DrawingPath,
  SavedComponent,
  ViewMode,
} from "../types";

export type BuilderCanvasPainterInput = {
  imgRef: RefObject<HTMLImageElement | null>;
  components: SavedComponent[];
  stackedComponents: SavedComponent[];
  activeSubject: ActiveSubject;
  rootComponentId: string;
  viewMode: ViewMode;
  toolZoom: number;
  toolPan: { x: number; y: number };
  selection: CropBox | null;
  selectionLocked: boolean;
  selectionCrop: CropBox | null;
  selectionMatchesExistingCut: boolean;
  drawingPath: DrawingPath | null;
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  editingComponentId: string | null;
  showCropsOverlay: boolean;
  cropsOverlayColor: string;
  cropsOverlayAlpha: number;
  /** Repaint counter bumped when async images settle; owned by the host. */
  imagePaintVersion: number;
  /** Signals the host that a source/component image finished loading. */
  bumpPaintVersion: () => void;
};

/**
 * Owns the Builder stage's imperative canvas painting: the selection/overlay
 * layer, the crops layer, the cached component images they composite, and the
 * resize listener that forces a repaint. The host owns the `imagePaintVersion`
 * counter (its edit-selection effect also reads it) and passes it in along with
 * `bumpPaintVersion`. The host attaches the returned refs to its two `<canvas>`
 * elements.
 */
export function useBuilderCanvasPainter(input: BuilderCanvasPainterInput) {
  const {
    imgRef,
    components,
    stackedComponents,
    activeSubject,
    rootComponentId,
    viewMode,
    toolZoom,
    toolPan,
    selection,
    selectionLocked,
    selectionCrop,
    selectionMatchesExistingCut,
    drawingPath,
    selectedComponentId,
    hoveredComponentId,
    editingComponentId,
    showCropsOverlay,
    cropsOverlayColor,
    cropsOverlayAlpha,
    imagePaintVersion,
    bumpPaintVersion,
  } = input;

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropsCanvasRef = useRef<HTMLCanvasElement>(null);
  const componentImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    const onResize = () => bumpPaintVersion();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bumpPaintVersion]);

  useEffect(() => {
    const cache = componentImageCacheRef.current;
    const activeIds = new Set(components.map((component) => component.id));
    for (const id of Array.from(cache.keys())) {
      if (!activeIds.has(id)) cache.delete(id);
    }
    for (const component of components) {
      const existing = cache.get(component.id);
      if (existing && existing.src === component.dataUrl) continue;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      const handleSettled = () => bumpPaintVersion();
      image.onload = handleSettled;
      image.onerror = handleSettled;
      image.src = component.dataUrl;
      cache.set(component.id, image);
    }
  }, [bumpPaintVersion, components]);

  useLayoutEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;
    paintOverlayCanvas({
      canvas: overlayCanvas,
      img: imgRef.current,
      toolZoom,
      selection,
      selectionLocked,
      drawingPath,
      viewMode,
      components,
      stackedComponents,
      activeSubject,
      rootComponentId,
      selectedComponentId,
      hoveredComponentId,
      editingComponentId,
      selectionMatchesExistingCut,
      selectionCrop,
    });
  }, [
    activeSubject,
    components,
    drawingPath,
    editingComponentId,
    hoveredComponentId,
    imagePaintVersion,
    imgRef,
    rootComponentId,
    selectedComponentId,
    selection,
    selectionCrop,
    selectionLocked,
    selectionMatchesExistingCut,
    stackedComponents,
    toolPan,
    toolZoom,
    viewMode,
  ]);

  useLayoutEffect(() => {
    const cropsCanvas = cropsCanvasRef.current;
    if (!cropsCanvas) return;
    paintCropsCanvas({
      canvas: cropsCanvas,
      img: imgRef.current,
      toolZoom,
      components,
      stackedComponents,
      activeSubject,
      rootComponentId,
      editingComponentId,
      showCropsOverlay,
      viewMode,
      overlayFill: hexToRgba(cropsOverlayColor, cropsOverlayAlpha),
      componentImageCache: componentImageCacheRef.current,
    });
  }, [
    activeSubject,
    components,
    cropsOverlayColor,
    cropsOverlayAlpha,
    editingComponentId,
    imagePaintVersion,
    imgRef,
    rootComponentId,
    showCropsOverlay,
    stackedComponents,
    toolPan,
    toolZoom,
    viewMode,
  ]);

  return {
    overlayCanvasRef,
    cropsCanvasRef,
  };
}
