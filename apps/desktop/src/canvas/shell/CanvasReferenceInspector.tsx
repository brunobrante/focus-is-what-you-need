import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { IconImage } from "@/components/icons";
import { ZoomControls, ZOOM_STEPS, ZOOM_DEFAULT_IDX } from "@/components/screen/ZoomControls";
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
  defaultStackSelectionId,
} from "@/routes/references/lib/stackHelpers";

// A reference card represents a whole stack (cuts overlaid on the original image)
// only when the stack is enabled and the card is the original — node cards
// (stackNodeId set) are a single cut and behave like a plain image.
export function isStackReference(reference: ReferenceRow): boolean {
  return Boolean(reference.stack?.enabled) && !reference.stackNodeId;
}

// The inspector always renders the subject through SceneCanvasInspector (stack
// source): a plain image is a stack with no overlay layers, a real stack carries
// its cut layers. Zoom wraps the inspector the same way FastEditModal does, and
// stacks additionally get a tree to pick items plus a footer card for the pick.
export function CanvasReferenceInspector({ reference }: { reference: ReferenceRow }) {
  const isStack = isStackReference(reference);
  const sourceId = reference.sourceReferenceId ?? reference.id;

  const [preview, setPreview] = useState<StackPreviewState | null>(null);
  const [loading, setLoading] = useState(isStack);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(ZOOM_DEFAULT_IDX);
  // Plain-image background: baked thumbnail when present, else the blob-store
  // original (adapter-aware, uncapped). Unused for stacks (they load their graph).
  const { url: imageUrl } = useReferenceRowImage(reference, { eager: true });

  useEffect(() => {
    setZoomIdx(ZOOM_DEFAULT_IDX);
  }, [reference.id]);

  // Load the stack graph (cuts + per-cut object URLs) only for stack cards.
  useEffect(() => {
    if (!isStack) {
      setPreview((prev) => {
        releaseStackPreview(prev);
        return null;
      });
      setSelectedId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview((prev) => {
      releaseStackPreview(prev);
      return null;
    });
    setSelectedId(null);
    void loadStackPreviewById(sourceId)
      .then((loaded) => {
        if (cancelled) {
          releaseStackPreview(loaded);
          return;
        }
        setPreview(loaded);
        setSelectedId(loaded ? defaultStackSelectionId(loaded.data) : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isStack, sourceId]);

  // Release URLs when the inspector unmounts.
  useEffect(() => () => releaseStackPreview(preview), [preview]);

  const tree = useMemo(() => (preview ? buildStackTree(preview.data) : []), [preview]);

  // The subject for SceneCanvasInspector. A plain image becomes a layer-less
  // stack whose background is the card thumbnail; a real stack overlays its cuts.
  const imageStack = useMemo<ImageStack | null>(() => {
    if (!isStack) {
      if (!imageUrl) return null;
      return { w: 1, h: 1, backgroundUrl: imageUrl, layers: [] };
    }
    if (!preview) return null;
    const { data, urls } = preview;
    const rootIds = stackRootIds(data);
    const defaultRootId =
      data.roots?.find((r) => r.isDefault)?.id ?? data.roots?.[0]?.id ?? data.rootComponentId;
    const backgroundUrl =
      (defaultRootId ? urls[defaultRootId] : undefined) ?? urls[data.rootComponentId ?? ""] ?? "";
    // Cut boxes live in original-image space. Project them against the full
    // original (the default root spans it), so only the default root's cuts —
    // and legacy cuts with no rootId — overlay correctly. Foreign-root cuts
    // belong to a trimmed frame and would misposition here, so they are skipped.
    const layers = data.components
      .filter(
        (cut) =>
          !rootIds.has(cut.id) &&
          urls[cut.id] &&
          (cut.rootId == null || cut.rootId === defaultRootId),
      )
      .map((cut) => ({
        id: cut.id,
        name: cut.name,
        dataUrl: urls[cut.id]!,
        x: cut.box.x,
        y: cut.box.y,
        w: cut.box.w,
        h: cut.box.h,
      }));
    return { w: data.original.w, h: data.original.h, backgroundUrl, layers };
  }, [isStack, preview, imageUrl]);

  const selectedNode = selectedId && tree.length ? findStackNode(tree, selectedId) : null;
  const selectedUrl = selectedId && preview ? preview.urls[selectedId] : undefined;
  const z = ZOOM_STEPS[zoomIdx] ?? 1;

  return (
    <div className="absolute inset-0 flex">
      {/* Tree panel — stack only */}
      {isStack ? (
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
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-0 flex items-center justify-center overflow-auto p-6 pt-16 pb-32">
          {imageStack ? (
            <div
              style={{ transform: `scale(${z})`, transformOrigin: "center", transition: "transform 120ms" }}
            >
              <SceneCanvasInspector
                source="stack"
                stack={imageStack}
                selectedId={selectedId}
                onSelect={isStack ? setSelectedId : () => undefined}
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
        {isStack && selectedNode ? (
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
            index={zoomIdx}
            onZoomIn={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
            onZoomOut={() => setZoomIdx((i) => Math.max(i - 1, 0))}
            onReset={() => setZoomIdx(ZOOM_DEFAULT_IDX)}
          />
        ) : null}
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
