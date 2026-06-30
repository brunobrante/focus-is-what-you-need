import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import type {
  ActiveSubject,
  CropBox,
  DrawingPath,
  EditorTool,
  SavedComponent,
  SelectionInteraction,
  ToolReference,
  ViewMode,
} from "../types";
import {
  CROPS_OVERLAY_ALPHA_STORAGE_KEY,
  CROPS_OVERLAY_COLOR_STORAGE_KEY,
  MIN_TOOL_ZOOM,
} from "../types";
import {
  boundsFromDrawingPath,
  clampToolPan,
  componentBoxInSubject,
  cropBoxFromPoints,
  getContentPoint,
  getImageContentBounds,
  getVisibleContentBounds,
  intersectCropBoxes,
  moveCropBox,
  resizeCropBox,
  resizeCursor,
  roundCropBox,
} from "../engine/geometry";
import { componentHitTest, selectionHitTest } from "../engine/hitTesting";
import { componentAreaAlreadyExists } from "../engine/componentModel";
import { readCropsOverlayAlpha, readCropsOverlayColor } from "../engine/storage";

// Custom cursor shown over (and while dragging) the corner-radius handle, matching
// the main canvas. The hotspot sits on the arrow tip; falls back to `grab` if the
// browser can't load the SVG cursor. The asset lives in `public/`, served from root.
const RADIUS_CURSOR = "url(/cursor-bend.svg) 4 3, grab";

export type BuilderInteractionInput = {
  item: ToolReference;
  imgRef: RefObject<HTMLImageElement | null>;
  stageViewportRef: RefObject<HTMLDivElement | null>;
  toolZoom: number;
  toolPan: { x: number; y: number };
  setToolPan: (pan: { x: number; y: number }) => void;
  currentTool: EditorTool;
  setCurrentTool: React.Dispatch<React.SetStateAction<EditorTool>>;
  canCrop: boolean;
  viewMode: ViewMode;
  stackedComponents: SavedComponent[];
  activeSubject: ActiveSubject;
  scopedComponents: SavedComponent[];
  rootComponentId: string;
  components: SavedComponent[];
  imagePaintVersion: number;
  onSelectStackComponent: (id: string) => void;
  // The pen tool's pointer handlers; this hook delegates stage events to them
  // when the pen tool is active (the pen owns its own path + interaction state).
  pen: {
    onPenPointerDown: (event: PointerEvent<HTMLDivElement>, point: { x: number; y: number }) => void;
    onPenPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPenPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  };
};

export type BuilderInteractionState = {
  selection: CropBox | null;
  setSelection: React.Dispatch<React.SetStateAction<CropBox | null>>;
  selectionLocked: boolean;
  setSelectionLocked: React.Dispatch<React.SetStateAction<boolean>>;
  drawing: boolean;
  setDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  drawingPath: DrawingPath | null;
  setDrawingPath: React.Dispatch<React.SetStateAction<DrawingPath | null>>;
  editingComponentId: string | null;
  setEditingComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  showCropsOverlay: boolean;
  setShowCropsOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  hoveredComponentId: string | null;
  setHoveredComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  cropsOverlayColor: string;
  setCropsOverlayColor: React.Dispatch<React.SetStateAction<string>>;
  cropsOverlayAlpha: number;
  setCropsOverlayAlpha: React.Dispatch<React.SetStateAction<number>>;

  isHoveringSelection: boolean;

  cancelSelection: () => void;
  selectionToSubjectCoords: (box: CropBox) => CropBox | null;
  toOriginalCoords: (subjectBox: CropBox) => CropBox;

  selectionCrop: CropBox | null;
  selectionSourceBox: CropBox | null;
  selectionMatchesExistingCut: boolean;
  canSaveSelection: boolean;
  selectionSize: { x: number; y: number; w: number; h: number };

  updateIdleCursorAndHover: (event: PointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
  handlePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function useBuilderInteraction({
  item,
  imgRef,
  stageViewportRef,
  toolZoom,
  toolPan,
  setToolPan,
  currentTool,
  setCurrentTool,
  canCrop,
  viewMode,
  stackedComponents,
  activeSubject,
  scopedComponents,
  rootComponentId,
  components,
  imagePaintVersion,
  onSelectStackComponent,
  pen,
}: BuilderInteractionInput): BuilderInteractionState {
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);

  const [selection, setSelection] = useState<CropBox | null>(null);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState<DrawingPath | null>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [showCropsOverlay, setShowCropsOverlay] = useState(false);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [isHoveringSelection, setIsHoveringSelection] = useState(false);
  const [brushSize, setBrushSize] = useState(4);
  const [cropsOverlayColor, setCropsOverlayColor] = useState<string>(
    () => readCropsOverlayColor(),
  );
  const [cropsOverlayAlpha, setCropsOverlayAlpha] = useState<number>(
    () => readCropsOverlayAlpha(),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_COLOR_STORAGE_KEY, cropsOverlayColor);
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayColor]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CROPS_OVERLAY_ALPHA_STORAGE_KEY, String(cropsOverlayAlpha));
    } catch {
      // ignore quota errors
    }
  }, [cropsOverlayAlpha]);

  // When the tool requires cropping but canCrop becomes false (e.g. navigating
  // away from a component view), fall back to move and drop the selection.
  useEffect(() => {
    const needsCrop = currentTool === "crop" || currentTool === "draw" || currentTool === "pen";
    if (!needsCrop || canCrop) return;
    setCurrentTool("move");
    cancelSelection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCrop, currentTool]);

  // When an editing component is set and the image is ready, project its box
  // back into screen space so the selection ring snaps to the existing cut.
  useEffect(() => {
    if (!editingComponentId || selection) return;
    const component = components.find((c) => c.id === editingComponentId);
    if (!component) {
      setEditingComponentId(null);
      return;
    }
    const expectedSubjectId = component.parentId ?? rootComponentId;
    let activeSubjectId: string | null = null;
    if (activeSubject.kind === "component") {
      activeSubjectId = activeSubject.id;
    } else if (activeSubject.kind === "original") {
      activeSubjectId = rootComponentId;
    }
    if (activeSubjectId !== expectedSubjectId) return;

    const img = imgRef.current;
    if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
      return;
    }

    const subjectBox = componentBoxInSubject(component.box, activeSubject);
    if (!subjectBox) {
      setEditingComponentId(null);
      return;
    }

    const sx = img.naturalWidth / img.clientWidth;
    const sy = img.naturalHeight / img.clientHeight;
    const avgScale = (sx + sy) / 2;

    setSelection({
      x: subjectBox.x / sx,
      y: subjectBox.y / sy,
      w: subjectBox.w / sx,
      h: subjectBox.h / sy,
      r: (component.box.r ?? 0) / (avgScale || 1),
    });
    setSelectionLocked(true);
  }, [activeSubject, components, editingComponentId, imagePaintVersion, rootComponentId, selection, imgRef]);

  // --- Core callbacks ------------------------------------------------------

  const cancelSelection = useCallback(() => {
    selectionInteractionRef.current = null;
    setDrawing(false);
    setSelection(null);
    setSelectionLocked(false);
    setDrawingPath(null);
    setEditingComponentId(null);
  }, []);

  const selectionToSubjectCoords = useCallback(
    (box: CropBox): CropBox | null => {
      const img = imgRef.current;
      if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
        return null;
      }
      const imageBox = { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
      const visibleBox = intersectCropBoxes(box, imageBox);
      if (!visibleBox || visibleBox.w < 1 || visibleBox.h < 1) return null;

      const sx = (img.naturalWidth || activeSubject.w || img.clientWidth) / img.clientWidth;
      const sy = (img.naturalHeight || activeSubject.h || img.clientHeight) / img.clientHeight;
      return {
        x: (visibleBox.x - imageBox.x) * sx,
        y: (visibleBox.y - imageBox.y) * sy,
        w: visibleBox.w * sx,
        h: visibleBox.h * sy,
        r: Math.min(
          ((box.r ?? 0) * (sx + sy)) / 2,
          (visibleBox.w * sx) / 2,
          (visibleBox.h * sy) / 2,
        ),
      };
    },
    [activeSubject.h, activeSubject.w, imgRef],
  );

  const toOriginalCoords = useCallback(
    (subjectBox: CropBox): CropBox => {
      const origin = activeSubject.kind === "component" ? activeSubject.originBox : null;
      const x = (origin?.x ?? 0) + subjectBox.x;
      const y = (origin?.y ?? 0) + subjectBox.y;
      const maxW = item.w ? Math.max(1, item.w - x) : subjectBox.w;
      const maxH = item.h ? Math.max(1, item.h - y) : subjectBox.h;
      return {
        x,
        y,
        w: Math.min(subjectBox.w, maxW),
        h: Math.min(subjectBox.h, maxH),
        r: Math.min(subjectBox.r ?? 0, subjectBox.w / 2, subjectBox.h / 2),
      };
    },
    [activeSubject, item.h, item.w],
  );

  // --- Computed selection values -------------------------------------------

  const selectionCrop = selection ? selectionToSubjectCoords(selection) : null;
  const selectionSourceBox = selectionCrop && canCrop ? toOriginalCoords(selectionCrop) : null;
  const selectionMatchesExistingCut = Boolean(
    selectionSourceBox &&
      componentAreaAlreadyExists(selectionSourceBox, scopedComponents, rootComponentId),
  );
  const canSaveSelection = Boolean(selectionLocked && selectionCrop && canCrop);
  const selectionSize = selectionCrop ?? { x: 0, y: 0, w: 0, h: 0 };

  // --- Pointer handlers ----------------------------------------------------

  function updateIdleCursorAndHover(event: PointerEvent<HTMLDivElement>) {
    const stage = stageViewportRef.current;
    const point = getContentPoint(event, imgRef.current, toolZoom);
    let cursor = "";
    let nextHovered: string | null = null;

    if (point) {
      const selectionTool = currentTool === "crop" || currentTool === "draw";
      if (canCrop && selection && selectionLocked && selectionTool) {
        const hit = selectionHitTest(point, selection, true, toolZoom);
        if (hit?.kind === "radius") cursor = RADIUS_CURSOR;
        else if (hit?.kind === "resize") cursor = resizeCursor(hit.handle);
        else if (hit?.kind === "move" && currentTool === "crop") cursor = "move";
      }

      if (viewMode === "stack") {
        const hovered = componentHitTest(point, stackedComponents, activeSubject, imgRef.current);
        nextHovered = hovered?.id ?? null;
        if (!cursor && hovered) cursor = "pointer";
      }

      const nextHoveringSelection = Boolean(
        selection &&
          point.x >= selection.x && point.x <= selection.x + selection.w &&
          point.y >= selection.y && point.y <= selection.y + selection.h,
      );
      if (nextHoveringSelection !== isHoveringSelection) setIsHoveringSelection(nextHoveringSelection);
    } else if (isHoveringSelection) {
      setIsHoveringSelection(false);
    }

    if (stage && stage.style.cursor !== cursor) stage.style.cursor = cursor;
    if (viewMode === "stack" && nextHovered !== hoveredComponentId) {
      setHoveredComponentId(nextHovered);
    }
  }

  function handleStagePointerLeave() {
    const stage = stageViewportRef.current;
    if (stage) stage.style.cursor = "";
    if (viewMode === "stack" && hoveredComponentId) setHoveredComponentId(null);
    if (isHoveringSelection) setIsHoveringSelection(false);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1 && toolZoom > MIN_TOOL_ZOOM) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      selectionInteractionRef.current = {
        type: "pan",
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPan: toolPan,
      };
      setDrawing(true);
      return;
    }

    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-selection-action]")) return;

    const point = getContentPoint(event, imgRef.current, toolZoom);
    if (!point) return;

    if (viewMode === "stack") {
      const hit = componentHitTest(point, stackedComponents, activeSubject, imgRef.current);
      if (hit) {
        event.preventDefault();
        onSelectStackComponent(hit.id);
      }
      return;
    }

    if (!canCrop) return;

    if (currentTool === "pen") {
      event.preventDefault();
      pen.onPenPointerDown(event, point);
      return;
    }

    if (currentTool !== "crop" && currentTool !== "draw") return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (selection && selectionLocked) {
      const hit = selectionHitTest(point, selection, true, toolZoom);
      if (hit?.kind === "radius") {
        selectionInteractionRef.current = {
          type: "radius",
          pointerId: event.pointerId,
          handle: hit.handle,
          startPoint: point,
          startBox: selection,
        };
        // Keep the bend cursor through the drag — the idle hover handler that sets
        // it does not run while a pointer interaction is active.
        if (stageViewportRef.current) stageViewportRef.current.style.cursor = RADIUS_CURSOR;
        setDrawing(true);
        return;
      }
      if (hit?.kind === "resize") {
        selectionInteractionRef.current = {
          type: "resize",
          pointerId: event.pointerId,
          handle: hit.handle,
          startPoint: point,
          startBox: selection,
        };
        setDrawing(true);
        return;
      }
      if (hit?.kind === "move" && currentTool === "crop") {
        selectionInteractionRef.current = {
          type: "move",
          pointerId: event.pointerId,
          startPoint: point,
          startBox: selection,
        };
        setDrawing(true);
        return;
      }
    }

    if (currentTool === "draw") {
      selectionInteractionRef.current = { type: "free-draw", pointerId: event.pointerId };
      setDrawing(true);
      setSelectionLocked(false);
      setSelection(null);
      setDrawingPath({ points: [point] });
      return;
    }

    selectionInteractionRef.current = { type: "draw", pointerId: event.pointerId, startPoint: point };
    setDrawing(true);
    setSelectionLocked(false);
    setSelection({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const interaction = selectionInteractionRef.current;
    // The pen tool owns its own hover + drag, except while a middle-button pan
    // is in progress (which uses the shared interaction ref).
    if (currentTool === "pen" && interaction?.type !== "pan") {
      pen.onPenPointerMove(event);
      return;
    }
    if (!drawing || !interaction) {
      updateIdleCursorAndHover(event);
      return;
    }

    if (interaction.type === "pan") {
      setToolPan(
        clampToolPan(
          {
            x: interaction.startPan.x + event.clientX - interaction.startClient.x,
            y: interaction.startPan.y + event.clientY - interaction.startClient.y,
          },
          toolZoom,
          stageViewportRef.current,
          imgRef.current,
        ),
      );
      return;
    }

    const point = getContentPoint(event, imgRef.current, toolZoom);
    if (!point) return;
    const imageBounds = getImageContentBounds(imgRef.current);

    if (interaction.type === "resize") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      if (!bounds) return;
      setSelection(resizeCropBox(interaction.startBox, interaction.handle, point, bounds));
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "radius") {
      setSelection(roundCropBox(interaction, point));
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "move") {
      const bounds = imageBounds ?? getVisibleContentBounds(stageViewportRef.current, imgRef.current, toolZoom);
      setSelection(moveCropBox(interaction.startBox, interaction.startPoint, point, bounds));
      setSelectionLocked(true);
      return;
    }

    if (interaction.type === "free-draw") {
      setDrawingPath((current) => {
        if (!current) return { points: [point] };
        const last = current.points[current.points.length - 1];
        if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) {
          return current;
        }
        return { points: [...current.points, point] };
      });
      return;
    }

    const rawBox = cropBoxFromPoints(interaction.startPoint, point);
    if (imageBounds) {
      const clipped = intersectCropBoxes(rawBox, imageBounds);
      setSelection(clipped ?? { x: rawBox.x, y: rawBox.y, w: 0, h: 0 });
    } else {
      setSelection(rawBox);
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const interaction = selectionInteractionRef.current;
    if (currentTool === "pen" && interaction?.type !== "pan") {
      pen.onPenPointerUp(event);
      return;
    }
    if (!drawing || !interaction) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDrawing(false);
    selectionInteractionRef.current = null;

    if (interaction.type === "pan") return;

    if (interaction.type === "free-draw") {
      const points = drawingPath?.points ?? [];
      const bounds = boundsFromDrawingPath(points);
      if (!bounds) {
        setDrawingPath(null);
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      const imageBounds = getImageContentBounds(imgRef.current);
      const clipped = imageBounds ? intersectCropBoxes(bounds, imageBounds) : bounds;
      if (!clipped || clipped.w < 8 || clipped.h < 8) {
        setDrawingPath(null);
        setSelection(null);
        setSelectionLocked(false);
        return;
      }
      setSelection(clipped);
      setSelectionLocked(true);
      return;
    }

    setSelection((current) => {
      if (!current || current.w < 8 || current.h < 8) {
        setSelectionLocked(false);
        return null;
      }
      setSelectionLocked(true);
      return current;
    });
  }

  return {
    selection,
    setSelection,
    selectionLocked,
    setSelectionLocked,
    drawing,
    setDrawing,
    drawingPath,
    setDrawingPath,
    editingComponentId,
    setEditingComponentId,
    showCropsOverlay,
    setShowCropsOverlay,
    hoveredComponentId,
    setHoveredComponentId,
    brushSize,
    setBrushSize,
    cropsOverlayColor,
    setCropsOverlayColor,
    cropsOverlayAlpha,
    setCropsOverlayAlpha,
    isHoveringSelection,
    cancelSelection,
    selectionToSubjectCoords,
    toOriginalCoords,
    selectionCrop,
    selectionSourceBox,
    selectionMatchesExistingCut,
    canSaveSelection,
    selectionSize,
    updateIdleCursorAndHover,
    handleStagePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
