import { useEffect, useMemo, useState } from "react";
import type { ImageStack } from "@/components/screen/SceneCanvasInspector";
import type { ReferenceRow } from "@/lib/storage/schema";
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import { stackRootIds } from "@/lib/references/stackTypes";
import type { StackPreviewState, StackTreeNode } from "@/routes/references/types";
import {
  loadStackPreviewById,
  releaseStackPreview,
  buildStackTree,
} from "@/routes/references/lib/stackHelpers";

// Everything both the references stage and the Layers stack-tree need, derived
// from the loaded stack graph: the render mode, the scoped root, the stage stack
// (background + projected cuts), the pickable tree, and the per-node object URLs
// (footer thumbnails). A plain image is a layer-less stack; a real stack overlays
// its cuts. This is the data the inspector used to compute inline — lifted out so
// the sidebar tree and the canvas stage share one load + one selection.
export type ReferenceStackView = {
  loading: boolean;
  mode: "stack" | "plain";
  scopeRootId: string | null;
  imageStack: ImageStack | null;
  tree: StackTreeNode[];
  urls: Record<string, string>;
};

export function useReferenceStackView(reference: ReferenceRow | null): ReferenceStackView {
  const sourceId = reference?.sourceReferenceId ?? reference?.id ?? null;
  const nodeId = reference?.stackNodeId ?? null;
  // Try to load the stack graph for any card derived from a source image — a
  // whole-image stack, a sub-screen root, or a leaf cut — so sub-screen roots
  // render their cuts instead of falling back to a flat image.
  const mayHaveStack = Boolean(
    reference?.stack?.enabled || reference?.stackNodeId || reference?.sourceReferenceId,
  );

  const [preview, setPreview] = useState<StackPreviewState | null>(null);
  const [loading, setLoading] = useState(mayHaveStack);
  // Plain-image background: baked thumbnail when present, else the blob-store
  // original (adapter-aware, uncapped). Unused for stacks (they load their graph).
  const { url: imageUrl } = useReferenceRowImage(reference, { eager: true });

  // Load the stack graph (cuts + per-cut object URLs) for any source-derived card.
  useEffect(() => {
    if (!mayHaveStack || !sourceId) {
      setPreview((prev) => {
        releaseStackPreview(prev);
        return null;
      });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview((prev) => {
      releaseStackPreview(prev);
      return null;
    });
    void loadStackPreviewById(sourceId)
      .then((loaded) => {
        if (cancelled) {
          releaseStackPreview(loaded);
          return;
        }
        setPreview(loaded);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mayHaveStack, sourceId]);

  // Release URLs when the consumer unmounts.
  useEffect(() => () => releaseStackPreview(preview), [preview]);

  // Resolve the render mode + scoped composite from the loaded graph. A leaf-cut
  // card renders as a plain image; a whole-image or root card renders its cuts,
  // with cut boxes projected against the scoped root's frame.
  return useMemo<ReferenceStackView>(() => {
    if (preview?.data) {
      const { data, urls } = preview;
      const rootIds = stackRootIds(data);
      const nodeIsRoot = Boolean(
        nodeId && (rootIds.has(nodeId) || nodeId === data.rootComponentId),
      );
      const nodeIsCut = Boolean(
        nodeId && !nodeIsRoot && data.components.some((c) => c.id === nodeId),
      );
      if (!nodeIsCut) {
        const scopeRootId =
          (nodeIsRoot ? nodeId : null) ??
          data.roots?.find((r) => r.isDefault)?.id ??
          data.roots?.[0]?.id ??
          data.rootComponentId ??
          null;
        const scopeRoot = data.roots?.find((r) => r.id === scopeRootId) ?? null;
        const frame = scopeRoot
          ? scopeRoot.box
          : { x: 0, y: 0, w: data.original.w, h: data.original.h };
        const backgroundUrl =
          (scopeRootId ? urls[scopeRootId] : undefined) ?? urls[data.rootComponentId ?? ""] ?? "";
        const layers = data.components
          .filter(
            (cut) =>
              !rootIds.has(cut.id) &&
              urls[cut.id] &&
              (cut.rootId == null || cut.rootId === scopeRootId),
          )
          .map((cut) => ({
            id: cut.id,
            name: cut.name,
            dataUrl: urls[cut.id]!,
            x: cut.box.x - frame.x,
            y: cut.box.y - frame.y,
            w: cut.box.w,
            h: cut.box.h,
          }));
        const fullTree = buildStackTree(data);
        const tree = scopeRoot ? fullTree.filter((n) => n.component.id === scopeRootId) : fullTree;
        return {
          loading,
          mode: "stack",
          scopeRootId,
          imageStack: { w: frame.w, h: frame.h, backgroundUrl, layers },
          tree,
          urls,
        };
      }
      // Pinned to a single leaf cut → its own pixels as a plain image.
      const cutUrl = (nodeId ? urls[nodeId] : undefined) ?? imageUrl;
      return {
        loading,
        mode: "plain",
        scopeRootId: null,
        imageStack: cutUrl ? { w: 1, h: 1, backgroundUrl: cutUrl, layers: [] } : null,
        tree: [],
        urls,
      };
    }
    // No stack graph → plain image.
    return {
      loading,
      mode: "plain",
      scopeRootId: null,
      imageStack: imageUrl ? { w: 1, h: 1, backgroundUrl: imageUrl, layers: [] } : null,
      tree: [],
      urls: {},
    };
  }, [preview, imageUrl, nodeId, loading]);
}
