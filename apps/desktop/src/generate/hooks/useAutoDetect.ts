import { useCallback, useEffect, useRef, useState } from "react";
import type { CropBox, SavedComponent, ActiveSubject, ViewMode } from "../types";
import { canvasToDataUrl, shortComponentName, waitForImage } from "../engine/image";
import { runAutoDetect, urlToBytes } from "@/lib/models/modelCommands";
import { clamp } from "../engine/geometry";

export function useAutoDetect({
  canCrop,
  activeSubject,
  rootComponent,
  activeScopeId,
  imgRef,
  selectionToSubjectCoords,
  toOriginalCoords,
  updateComponents,
  setExpandedComponentIds,
  setSelectedComponentId,
  setViewMode,
  cancelSelection,
  resetToolViewport,
}: {
  canCrop: boolean;
  activeSubject: ActiveSubject;
  rootComponent: SavedComponent;
  activeScopeId: string;
  imgRef: React.RefObject<HTMLImageElement | null>;
  selectionToSubjectCoords: (box: CropBox) => CropBox | null;
  toOriginalCoords: (subjectBox: CropBox) => CropBox;
  updateComponents: (updater: (items: SavedComponent[]) => SavedComponent[]) => void;
  setExpandedComponentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedComponentId: React.Dispatch<React.SetStateAction<string | null>>;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  cancelSelection: () => void;
  resetToolViewport: () => void;
}) {
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectMessage, setAutoDetectMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  const flashMessage = useCallback((message: string) => {
    setAutoDetectMessage(message);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setAutoDetectMessage(null);
    }, 4000);
  }, []);

  const autoDetect = useCallback(
    async (modelId: string | null) => {
      if (autoDetecting || !canCrop) return;
      if (!modelId) {
        flashMessage("Install an auto-detect model in Settings first");
        return;
      }
      const img = imgRef.current;
      const cw = img?.clientWidth ?? 0;
      const ch = img?.clientHeight ?? 0;
      if (!cw || !ch) {
        flashMessage("Open a stack before auto-detecting");
        return;
      }
      const parentId =
        activeSubject.kind === "component" ? activeSubject.component.id : rootComponent.id;
      const rootId = activeSubject.rootId ?? activeScopeId;
      setAutoDetecting(true);
      setAutoDetectMessage(null);
      try {
        const bytes = await urlToBytes(activeSubject.url);
        const regions = await runAutoDetect(modelId, bytes);
        if (regions.length === 0) {
          flashMessage("No components detected — try drawing regions manually");
          return;
        }
        if (img) await waitForImage(img).catch(() => {});
        const created: SavedComponent[] = [];
        for (const region of regions) {
          const x = clamp(region.x * cw, 0, cw);
          const y = clamp(region.y * ch, 0, ch);
          const displayBox = {
            x,
            y,
            w: clamp(region.w * cw, 1, cw - x),
            h: clamp(region.h * ch, 1, ch - y),
          };
          const subjectBox = selectionToSubjectCoords(displayBox);
          if (!subjectBox) continue;
          const sourceBox = toOriginalCoords(subjectBox);
          let dataUrl = activeSubject.url;
          if (img) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(subjectBox.w));
              canvas.height = Math.max(1, Math.round(subjectBox.h));
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Canvas unavailable");
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(
                img,
                subjectBox.x, subjectBox.y, subjectBox.w, subjectBox.h,
                0, 0, canvas.width, canvas.height,
              );
              dataUrl = await canvasToDataUrl(canvas, "image/png");
            } catch {
              dataUrl = activeSubject.url;
            }
          }
          const nextId = `c-${Math.random().toString(36).slice(2, 9)}`;
          const trimmedLabel = region.label?.trim();
          created.push({
            id: nextId,
            name: trimmedLabel ? trimmedLabel : shortComponentName(nextId),
            box: sourceBox,
            dataUrl,
            type: "PNG",
            createdAt: new Date().toISOString(),
            parentId,
            kind: "cut",
            rootId,
          });
        }
        if (created.length === 0) {
          flashMessage("No components detected — try drawing regions manually");
          return;
        }
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
        cancelSelection();
      } catch (error) {
        console.error("[tools] auto-detect failed", error);
        flashMessage("Auto-detect failed — see console for details");
      } finally {
        setAutoDetecting(false);
      }
    },
    [
      activeScopeId,
      activeSubject,
      autoDetecting,
      canCrop,
      cancelSelection,
      flashMessage,
      imgRef,
      resetToolViewport,
      rootComponent.id,
      selectionToSubjectCoords,
      setExpandedComponentIds,
      setSelectedComponentId,
      setViewMode,
      toOriginalCoords,
      updateComponents,
    ],
  );

  return { autoDetecting, autoDetectMessage, autoDetect };
}
