import { useCallback, useRef, useState } from "react";
import { readFileAsDataUrl } from "@/lib/utils";
import { randomSuffix } from "@/lib/storage/ids";

import type {
  CropBox,
  SavedComponent,
  ActiveSubject,
  ViewMode,
  CutVariantTool,
  ToolReference,
  PendingDetectionBox,
} from "../types";
import { COMPONENT_STORAGE_PREFIX } from "../types";
import { ensureRootComponent } from "../engine/componentModel";
import { penBounds, transformPenPath, type PenPath } from "../engine/pen";
import { tracePenPath } from "../engine/drawing";
import { componentSubtreeIds } from "../engine/componentTree";
import { addVariant, setOriginalVariantImage } from "../engine/variants";
import { writeSavedComponents } from "../engine/storage";
import {
  canvasToDataUrl,
  inferType,
  measureImage,
  rasterizeCropBox,
  shortComponentName,
  waitForImage,
} from "../engine/image";
import {
  bytesToPngDataUrl,
  runBirefnet,
  runRealEsrgan,
  urlToBytes,
  type ProcessingActionKind,
} from "@/lib/models/modelCommands";

/**
 * Builder cut operations: crop rasterization (`saveSelection`), image upload,
 * and component subtree removal. Owns the `uploading` state and the file-input
 * ref. Everything else (selection state, active subject, the various setters)
 * is forwarded in from the root so behavior is identical to the previous inline
 * implementations.
 */
export function useBuilderCutOperations({
  imgRef,
  selection,
  selectionLocked,
  canCrop,
  activeSubject,
  activeScopeId,
  rootComponentId,
  rootComponent,
  components,
  editingComponentId,
  selectedComponentId,
  pendingDetections,
  setPendingDetections,
  setActiveDetectionId,
  selectionToSubjectCoords,
  toOriginalCoords,
  updateComponents,
  setEditingComponentId,
  setExpandedComponentIds,
  setSelectedComponentId,
  setViewMode,
  setActiveRootId,
  cancelSelection,
  resetToolViewport,
  openOriginal,
  onUploadedLocally,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  selection: CropBox | null;
  selectionLocked: boolean;
  canCrop: boolean;
  activeSubject: ActiveSubject;
  activeScopeId: string;
  rootComponentId: string;
  rootComponent: SavedComponent;
  components: SavedComponent[];
  editingComponentId: string | null;
  selectedComponentId: string | null;
  pendingDetections: PendingDetectionBox[];
  setPendingDetections: React.Dispatch<React.SetStateAction<PendingDetectionBox[]>>;
  setActiveDetectionId: React.Dispatch<React.SetStateAction<string | null>>;
  selectionToSubjectCoords: (box: CropBox) => CropBox | null;
  toOriginalCoords: (subjectBox: CropBox) => CropBox;
  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
  setEditingComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedComponentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setActiveRootId: React.Dispatch<React.SetStateAction<string>>;
  cancelSelection: () => void;
  resetToolViewport: () => void;
  openOriginal: () => void;
  onUploadedLocally: (next: ToolReference) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const saveSelection = useCallback(
    async (postProcess?: ProcessingActionKind) => {
      // A locked selection is required to save a NEW cut, but in edit mode the
      // projected box is the cut itself — its lock flag can still be settling, so
      // only require a selection there (gating on the lock dropped edit saves).
      if (!canCrop || !selection) return;
      if (!selectionLocked && !editingComponentId) return;
      const img = imgRef.current;
      const subjectBox = selectionToSubjectCoords(selection);
      if (!subjectBox) return;
      const sourceBox = toOriginalCoords(subjectBox);
      const dataUrl = await rasterizeCropBox(img, subjectBox, activeSubject.url);

      let processed: { tool: CutVariantTool; dataUrl: string } | null = null;
      if (postProcess) {
        try {
          const input = await urlToBytes(dataUrl);
          const output =
            postProcess === "birefnet" ? await runBirefnet(input) : await runRealEsrgan(input);
          processed = { tool: postProcess as CutVariantTool, dataUrl: bytesToPngDataUrl(output) };
        } catch (error) {
          console.error(`Draw post-process (${postProcess}) failed`, error);
        }
      }

      if (editingComponentId) {
        const editedId = editingComponentId;
        updateComponents((current) =>
          current.map((c) => {
            if (c.id !== editedId) return c;
            let next = setOriginalVariantImage({ ...c, box: sourceBox }, dataUrl);
            if (processed) next = addVariant(next, { ...processed, createdAt: new Date().toISOString() });
            return next;
          }),
        );
        setEditingComponentId(null);
        setExpandedComponentIds((current) => {
          const next = new Set(current);
          next.add(editedId);
          return next;
        });
        setSelectedComponentId(editedId);
        setViewMode("component");
        resetToolViewport();
        cancelSelection();
        return;
      }

      const nextId = `c-${randomSuffix()}`;
      const parentId =
        activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
      const rootId = activeSubject.rootId ?? activeScopeId;
      const createdAt = new Date().toISOString();
      let cut: SavedComponent = {
        id: nextId,
        name: shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt,
        parentId,
        kind: "cut",
        rootId,
      };
      if (processed) cut = addVariant(cut, { ...processed, createdAt });
      updateComponents((current) => [cut, ...current]);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(parentId);
        next.add(nextId);
        return next;
      });
      setSelectedComponentId(nextId);
      setViewMode("component");
      resetToolViewport();
      cancelSelection();
    },
    [
      activeScopeId,
      activeSubject,
      canCrop,
      cancelSelection,
      editingComponentId,
      imgRef,
      resetToolViewport,
      rootComponent.id,
      selection,
      selectionLocked,
      selectionToSubjectCoords,
      setEditingComponentId,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      toOriginalCoords,
      updateComponents,
    ],
  );

  // Commits every pending auto-detect box in one batch: rasterizes each region
  // the same way saveSelection does, then creates all the cuts in a single
  // updateComponents call so they land as one history entry.
  const saveAllDetections = useCallback(async () => {
    if (!canCrop || pendingDetections.length === 0) return;
    const img = imgRef.current;
    const parentId =
      activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
    const rootId = activeSubject.rootId ?? activeScopeId;
    const createdAt = new Date().toISOString();

    const created: SavedComponent[] = [];
    for (const detection of pendingDetections) {
      const subjectBox = selectionToSubjectCoords(detection.box);
      if (!subjectBox) continue;
      const sourceBox = toOriginalCoords(subjectBox);
      const dataUrl = await rasterizeCropBox(img, subjectBox, activeSubject.url);
      const nextId = `c-${randomSuffix()}`;
      created.push({
        id: nextId,
        name: detection.label || shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt,
        parentId,
        kind: "cut",
        rootId,
      });
    }
    if (created.length === 0) return;

    updateComponents((current) => [...created, ...current]);
    setExpandedComponentIds((current) => {
      const next = new Set(current);
      next.add(parentId);
      for (const c of created) next.add(c.id);
      return next;
    });
    setSelectedComponentId(created[0].id);
    setViewMode("component");
    resetToolViewport();
    setPendingDetections([]);
    setActiveDetectionId(null);
    cancelSelection();
  }, [
    activeScopeId,
    activeSubject,
    canCrop,
    cancelSelection,
    imgRef,
    pendingDetections,
    resetToolViewport,
    rootComponent.id,
    selectionToSubjectCoords,
    setActiveDetectionId,
    setExpandedComponentIds,
    setPendingDetections,
    setSelectedComponentId,
    setViewMode,
    toOriginalCoords,
    updateComponents,
  ]);

  // Rasterizes a closed pen silhouette into a transparent-PNG cut, mirroring
  // saveSelection's new-component path but clipping to the Bézier instead of a
  // rounded rectangle. The path is in content coords; convert to subject pixels,
  // bound it, and clip the drawn region to the silhouette.
  const savePenCut = useCallback(
    async (path: PenPath) => {
      if (!path.closed || path.anchors.length < 3 || !canCrop) return;
      const img = imgRef.current;
      if (!img || !img.clientWidth || !img.clientHeight || !img.naturalWidth || !img.naturalHeight) {
        return;
      }
      const sx = img.naturalWidth / img.clientWidth;
      const sy = img.naturalHeight / img.clientHeight;
      const subjectPath = transformPenPath(path, (p) => ({ x: p.x * sx, y: p.y * sy }));
      const bounds = penBounds(subjectPath);
      if (!bounds) return;

      // Clamp the silhouette's bounds to the image so the cut canvas stays in range.
      const x0 = Math.max(0, bounds.x);
      const y0 = Math.max(0, bounds.y);
      const x1 = Math.min(img.naturalWidth, bounds.x + bounds.w);
      const y1 = Math.min(img.naturalHeight, bounds.y + bounds.h);
      const subjectBox: CropBox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (subjectBox.w < 1 || subjectBox.h < 1) return;
      const sourceBox = toOriginalCoords(subjectBox);

      let dataUrl = activeSubject.url;
      try {
        await waitForImage(img);
        // Snap to whole image pixels so the silhouette clip and the copied region
        // share one integer origin (no sub-pixel edge sliver).
        const sx0 = Math.round(subjectBox.x);
        const sy0 = Math.round(subjectBox.y);
        const cw = Math.max(1, Math.round(subjectBox.w));
        const ch = Math.max(1, Math.round(subjectBox.h));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.imageSmoothingEnabled = false;
        const localPath = transformPenPath(subjectPath, (p) => ({ x: p.x - sx0, y: p.y - sy0 }));
        ctx.save();
        tracePenPath(ctx, localPath);
        ctx.clip();
        ctx.drawImage(img, sx0, sy0, cw, ch, 0, 0, cw, ch);
        ctx.restore();
        dataUrl = await canvasToDataUrl(canvas, "image/png");
      } catch {
        dataUrl = activeSubject.url;
      }

      const nextId = `c-${randomSuffix()}`;
      const parentId =
        activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
      const rootId = activeSubject.rootId ?? activeScopeId;
      const cut: SavedComponent = {
        id: nextId,
        name: shortComponentName(nextId),
        box: sourceBox,
        dataUrl,
        type: "PNG",
        createdAt: new Date().toISOString(),
        parentId,
        kind: "cut",
        rootId,
      };
      updateComponents((current) => [cut, ...current]);
      setExpandedComponentIds((current) => {
        const next = new Set(current);
        next.add(parentId);
        next.add(nextId);
        return next;
      });
      setSelectedComponentId(nextId);
      setViewMode("component");
      resetToolViewport();
    },
    [
      activeScopeId,
      activeSubject,
      canCrop,
      imgRef,
      resetToolViewport,
      rootComponent.id,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      toOriginalCoords,
      updateComponents,
    ],
  );

  const uploadImage = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setUploading(true);
      try {
        const url = await readFileAsDataUrl(file);
        const dims = await measureImage(url).catch(() => ({ w: 0, h: 0 }));
        const next: ToolReference = {
          id: `tool-upload-${Date.now().toString(36)}`,
          name: file.name,
          type: inferType(file.name),
          w: dims.w,
          h: dims.h,
          url,
        };
        writeSavedComponents(`${COMPONENT_STORAGE_PREFIX}${next.id}`, ensureRootComponent([], next));
        onUploadedLocally(next);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onUploadedLocally],
  );

  const handleRemoveComponent = useCallback(
    (id: string) => {
      const removedIds = componentSubtreeIds(components, id);
      updateComponents((current) => current.filter((c) => !removedIds.has(c.id)));
      if (removedIds.has(activeScopeId)) {
        setActiveRootId(rootComponentId);
        openOriginal();
      } else if (selectedComponentId && removedIds.has(selectedComponentId)) {
        openOriginal();
      }
    },
    [
      activeScopeId,
      components,
      openOriginal,
      rootComponentId,
      selectedComponentId,
      setActiveRootId,
      updateComponents,
    ],
  );

  return {
    fileInputRef,
    uploading,
    setUploading,
    saveSelection,
    saveAllDetections,
    savePenCut,
    uploadImage,
    handleRemoveComponent,
  };
}
