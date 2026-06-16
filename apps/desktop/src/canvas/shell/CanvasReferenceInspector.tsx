import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { IconImage } from "@/components/icons";
import { ZoomControls } from "@/components/screen/ZoomControls";
import { useStepZoom } from "@/components/screen/useStepZoom";
import { CanvasScrollbars } from "@/components/ui/CanvasScrollbars";
import {
  SceneCanvasInspector,
  type ImageStack,
} from "@/components/screen/SceneCanvasInspector";
import type { ReferenceRow } from "@/lib/storage/schema";
import { useReferenceRowImage } from "@/lib/references/useReferenceRowImage";
import { stackRootIds } from "@/lib/references/stackTypes";
import type { StackPreviewState, StackTreeNode } from "@/routes/references/types";
import {
  loadStackPreviewById,
  releaseStackPreview,
  buildStackTree,
  findStackNode,
  countStackTreeNodes,
} from "@/routes/references/lib/stackHelpers";

// Everything the stage needs to render, derived from the loaded stack graph plus
// which node (whole image / sub-screen root / leaf cut) the card is pinned to.
type InspectorView = {
  mode: "stack" | "plain";
  // The root the composite is scoped to (its parent, selectable from the canvas).
  scopeRootId: string | null;
  stack: ImageStack | null;
  tree: StackTreeNode[];
};

// The inspector renders the subject through SceneCanvasInspector (stack source):
// a plain image is a layer-less stack, a real stack overlays its cuts (hover +
// click select). Zoom wraps the inspector the same way FastEditModal does, and
// stacks additionally get a tree to pick items plus a footer card for the pick.
export function CanvasReferenceInspector({ reference }: { reference: ReferenceRow }) {
  const sourceId = reference.sourceReferenceId ?? reference.id;
  const nodeId = reference.stackNodeId ?? null;
  // Try to load the stack graph for any card derived from a source image — a
  // whole-image stack, a sub-screen root, or a leaf cut — so sub-screen roots
  // render their cuts instead of falling back to a flat image.
  const mayHaveStack = Boolean(
    reference.stack?.enabled || reference.stackNodeId || reference.sourceReferenceId,
  );

  const [preview, setPreview] = useState<StackPreviewState | null>(null);
  const [loading, setLoading] = useState(mayHaveStack);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Wheel-only here (keyboard off): the canvas owns the global Cmd± shortcuts.
  const zoomCtl = useStepZoom(stageRef, { contentRef });
  // Plain-image background: baked thumbnail when present, else the blob-store
  // original (adapter-aware, uncapped). Unused for stacks (they load their graph).
  const { url: imageUrl } = useReferenceRowImage(reference, { eager: true });

  useEffect(() => {
    zoomCtl.reset();
  }, [reference.id]);

  // Load the stack graph (cuts + per-cut object URLs) for any source-derived card.
  useEffect(() => {
    if (!mayHaveStack) {
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

  // Release URLs when the inspector unmounts.
  useEffect(() => () => releaseStackPreview(preview), [preview]);

  // Resolve the render mode + scoped composite from the loaded graph. A leaf-cut
  // card renders as a plain image; a whole-image or root card renders its cuts,
  // with cut boxes projected against the scoped root's frame.
  const view = useMemo<InspectorView>(() => {
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
          mode: "stack",
          scopeRootId,
          stack: { w: frame.w, h: frame.h, backgroundUrl, layers },
          tree,
        };
      }
      // Pinned to a single leaf cut → its own pixels as a plain image.
      const cutUrl = (nodeId ? urls[nodeId] : undefined) ?? imageUrl;
      return {
        mode: "plain",
        scopeRootId: null,
        stack: cutUrl ? { w: 1, h: 1, backgroundUrl: cutUrl, layers: [] } : null,
        tree: [],
      };
    }
    // No stack graph → plain image.
    return {
      mode: "plain",
      scopeRootId: null,
      stack: imageUrl ? { w: 1, h: 1, backgroundUrl: imageUrl, layers: [] } : null,
      tree: [],
    };
  }, [preview, imageUrl, nodeId]);

  const stackMode = view.mode === "stack";
  const imageStack = view.stack;
  const tree = view.tree;
  const scopeRootId = view.scopeRootId;

  // Select the parent root by default so its card shows immediately; reset when
  // the scoped subject changes. Cuts/parent are then re-selectable from the canvas.
  useEffect(() => {
    setSelectedId(stackMode ? scopeRootId : null);
  }, [stackMode, scopeRootId]);

  const selectedNode = stackMode && selectedId ? findStackNode(tree, selectedId) : null;
  const selectedUrl = selectedId && preview ? preview.urls[selectedId] : undefined;

  return (
    <div className="absolute inset-0 flex">
      {/* Tree panel — stack only */}
      {stackMode ? (
        <div className="z-10 flex w-[240px] shrink-0 flex-col overflow-hidden border-r border-[#262626] bg-[#101110]/95 pt-14">
          <div className="shrink-0 border-b border-[#262626] px-3 py-2.5">
            <p className="m-0 text-[11.5px] font-semibold text-[#E6E6E6]">Stack tree</p>
            <p className="m-0 mt-0.5 text-[10.5px] text-[#777]">
              {loading
                ? "Loading…"
                : tree.length > 0
                  ? `${countStackTreeNodes(tree)} components`
                  : "No data"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && tree.length === 0 ? (
              <p className="px-2 py-3 text-[11.5px] text-[#777]">Loading stack…</p>
            ) : tree.length > 0 ? (
              tree.map((node) => (
                <StackTreeRows
                  key={node.component.id}
                  node={node}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))
            ) : (
              <div className="rounded-[8px] border border-dashed border-[#2C2C2C] px-3 py-4 text-[11.5px] text-[#777]">
                No stack data found.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Stage — the zoomable SceneCanvasInspector */}
      <div
        ref={stageRef}
        {...zoomCtl.panHandlers}
        className="relative min-w-0 flex-1"
        style={{ cursor: zoomCtl.isPanning ? "grabbing" : zoomCtl.canPan ? "grab" : "default" }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 pt-16 pb-32">
          {imageStack ? (
            <div
              ref={contentRef}
              className="pointer-events-auto"
              style={{
                transform: zoomCtl.transform,
                transformOrigin: "center",
                transition: zoomCtl.isPanning ? "none" : "transform 120ms",
              }}
              // Clicking the background (cuts stopPropagation) selects the parent
              // root — so the parent screen is selectable from the canvas itself.
              onClick={stackMode ? () => setSelectedId(scopeRootId) : undefined}
            >
              <SceneCanvasInspector
                source="stack"
                stack={imageStack}
                selectedId={selectedId}
                onSelect={stackMode ? setSelectedId : () => undefined}
                backgroundClassName="block max-h-[calc(100vh-260px)] max-w-full select-none rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              />
            </div>
          ) : !loading ? (
            <div className="flex flex-col items-center gap-2 text-[#888]">
              <IconImage size={28} strokeWidth={1.4} />
              <span className="text-[12px]">No preview</span>
            </div>
          ) : null}
        </div>

        {/* Centered footer card — the current stack selection */}
        {stackMode && selectedNode ? (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
            <div className="pointer-events-auto flex items-stretch gap-3 rounded-[12px] border border-[#303030] bg-[#161616]/95 p-2.5 pr-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[#2A2A2A] bg-[#0E0E0E]">
                {selectedUrl ? (
                  <img
                    src={selectedUrl}
                    alt={selectedNode.component.name}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <IconImage size={18} strokeWidth={1.4} className="text-[#666]" />
                )}
              </div>
              <div className="flex min-w-[140px] flex-col justify-center gap-1">
                <p className="m-0 truncate text-[12.5px] font-semibold leading-snug text-[#EDEDED]">
                  {selectedNode.component.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-[#2C2C2C] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.3px] text-[#8A8A8A]">
                    {selectedNode.component.type}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-[#7E7E7E]">
                    {Math.round(selectedNode.component.box.w)} × {Math.round(selectedNode.component.box.h)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {imageStack ? (
          <ZoomControls
            index={zoomCtl.index}
            onZoomIn={zoomCtl.zoomIn}
            onZoomOut={zoomCtl.zoomOut}
            onReset={zoomCtl.reset}
            position="left-3 top-14"
          />
        ) : null}

        <CanvasScrollbars x={zoomCtl.scroll.x} y={zoomCtl.scroll.y} />
      </div>
    </div>
  );
}

function StackTreeRows({
  node,
  selectedId,
  onSelect,
}: {
  node: StackTreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const id = node.component.id;
  const active = selectedId === id;
  const hasChildren = node.children.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={[
          "mb-1 flex min-h-8 w-full items-center gap-2 rounded-[7px] border py-1.5 pr-2 text-left transition-colors",
          active
            ? "border-[#3A3A3A] bg-[#222] text-[#F0F0F0]"
            : "border-transparent bg-transparent text-[#A6A6A6] hover:bg-[#1B1B1B] hover:text-[#E2E2E2]",
        ].join(" ")}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
      >
        {hasChildren ? (
          <ChevronRight size={12} className="shrink-0 opacity-60" />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-55" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] font-medium">{node.component.name}</span>
          <span className="block text-[10px] tabular-nums text-[#6E6E6E]">
            {Math.round(node.component.box.w)} × {Math.round(node.component.box.h)}
          </span>
        </span>
      </button>
      {node.children.map((child) => (
        <StackTreeRows
          key={child.component.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
