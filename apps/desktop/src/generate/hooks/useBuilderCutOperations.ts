import { useCallback, useRef, useState } from "react";
import { readFileAsDataUrl } from "@/lib/utils";

import type {
  CropBox,
  SavedComponent,
  ActiveSubject,
  ViewMode,
  CutVariantTool,
  ToolReference,
} from "../types";
import { COMPONENT_STORAGE_PREFIX } from "../types";
import { roundedRectPath } from "../engine/drawing";
import { ensureRootComponent } from "../engine/componentModel";
import { componentSubtreeIds } from "../engine/componentTree";
import { addVariant, setOriginalVariantImage } from "../engine/variants";
import { writeSavedComponents } from "../engine/storage";
import {
  canvasToDataUrl,
  inferType,
  measureImage,
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
      if (!selection || !selectionLocked || !canCrop) return;
      const img = imgRef.current;
      const subjectBox = selectionToSubjectCoords(selection);
      if (!subjectBox) return;
      const sourceBox = toOriginalCoords(subjectBox);
      let dataUrl = activeSubject.url;

      if (img) {
        try {
          await waitForImage(img);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(subjectBox.w));
          canvas.height = Math.max(1, Math.round(subjectBox.h));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          const radius = Math.min(subjectBox.r ?? 0, canvas.width / 2, canvas.height / 2);
          ctx.imageSmoothingEnabled = false;
          if (radius > 0) {
            ctx.save();
            roundedRectPath(ctx, 0, 0, canvas.width, canvas.height, radius);
            ctx.clip();
          }
          ctx.drawImage(
            img,
            subjectBox.x, subjectBox.y, subjectBox.w, subjectBox.h,
            0, 0, canvas.width, canvas.height,
          );
          if (radius > 0) ctx.restore();
          dataUrl = await canvasToDataUrl(canvas, "image/png");
        } catch {
          dataUrl = activeSubject.url;
        }
      }

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

      const nextId = `c-${Math.random().toString(36).slice(2, 9)}`;
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
    uploadImage,
    handleRemoveComponent,
  };
}
