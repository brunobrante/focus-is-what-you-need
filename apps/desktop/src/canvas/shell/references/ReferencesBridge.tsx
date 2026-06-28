import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ImageStack } from "@/components/screen/SceneCanvasInspector";
import type { ReferenceRow } from "@/lib/storage/schema";
import type { ZoomLimits } from "@/canvas/engine/viewport";
import type { StackTreeNode } from "@/routes/references/types";
import { useReferenceStackView } from "./useReferenceStackView";

// The references stage's step-zoom, published up so the bottom-center toolbar can
// drive it when the References window is expanded — exactly as the canvas windows'
// toolbar drives the editor zoom. `onChange` accepts the toolbar's continuous %
// (it snaps to the nearest discrete stop inside useStepZoom).
export type ReferenceZoomControl = {
  value: number;
  onChange: (next: number | ((zoom: number) => number)) => void;
  limits: ZoomLimits;
};

// Shared state for the References window. The window (publisher) sets which
// reference is open; the canvas stage and the Layers sidebar (consumers) read the
// loaded stack + the single selected node. Mirrors how the EditorBridge lets the
// Layers tree read the active canvas editor without prop-drilling — here it lets
// the stack tree live in the Layers panel while its selection still drives the
// references stage.
export type ReferencesBridgeValue = {
  reference: ReferenceRow | null;
  // Publish the open reference (the focused references window calls this); null on
  // the gallery or when the window unmounts.
  setReference: (reference: ReferenceRow | null) => void;
  loading: boolean;
  stackMode: boolean;
  scopeRootId: string | null;
  imageStack: ImageStack | null;
  tree: StackTreeNode[];
  urls: Record<string, string>;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  // The stage's zoom, published by the inspector; null when no references stage is
  // mounted. Read by the toolbar (when References is the focused, expanded window).
  zoom: ReferenceZoomControl | null;
  publishZoom: (zoom: ReferenceZoomControl | null) => void;
};

const Ctx = createContext<ReferencesBridgeValue | null>(null);

export function ReferencesBridgeProvider({ children }: { children: ReactNode }) {
  const [reference, setReference] = useState<ReferenceRow | null>(null);
  const view = useReferenceStackView(reference);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ReferenceZoomControl | null>(null);

  const stackMode = view.mode === "stack";
  const scopeRootId = view.scopeRootId;

  // Select the scoped root by default so its card shows immediately; reset when the
  // scoped subject changes. Cuts/parent are then re-selectable from tree or canvas.
  useEffect(() => {
    setSelectedNodeId(stackMode ? scopeRootId : null);
  }, [stackMode, scopeRootId]);

  const value = useMemo<ReferencesBridgeValue>(
    () => ({
      reference,
      setReference,
      loading: view.loading,
      stackMode,
      scopeRootId,
      imageStack: view.imageStack,
      tree: view.tree,
      urls: view.urls,
      selectedNodeId,
      setSelectedNodeId,
      zoom,
      publishZoom: setZoom,
    }),
    [reference, view, stackMode, scopeRootId, selectedNodeId, zoom],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReferencesBridge(): ReferencesBridgeValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useReferencesBridge must be used within a ReferencesBridgeProvider");
  return value;
}
