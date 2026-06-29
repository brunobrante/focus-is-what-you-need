import { useEffect, useRef, useState } from "react";
import { IconImage } from "@/components/icons";
import { ZoomControl } from "@/canvas/shell/ZoomControl";
import { useStepZoom } from "@/components/screen/useStepZoom";
import { CanvasScrollbars } from "@/components/ui/CanvasScrollbars";
import { SceneCanvasInspector } from "@/components/screen/SceneCanvasInspector";
import { useReferencesBridge } from "@/canvas/shell/references/ReferencesBridge";
import type { ShellControlVisibility } from "@/canvas/shell/inspector/ShellTab";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";

// The references stage: renders the open reference through SceneCanvasInspector (a
// plain image is a layer-less stack; a real stack overlays its cuts with hover +
// click select). The stack graph, the pickable tree, and the selection all live in
// the ReferencesBridge — the tree renders in the Layers sidebar (StackTreePanel)
// and the selected node's details in the Inspector (ReferencesElementTab), so
// selecting a cut there or clicking it here drives the same highlight. Zoom is
// stage-local; its bottom-left widget honours the same `shellZoomVisibility` setting
// the canvas windows use (show/hover/hidden) and only appears when a reference is open.
export function CanvasReferenceInspector({
  shellZoomVisibility = "show",
  expanded = false,
}: {
  shellZoomVisibility?: ShellControlVisibility;
  expanded?: boolean;
}) {
  const { reference, loading, stackMode, imageStack, selectedNodeId, setSelectedNodeId, scopeRootId, publishZoom } =
    useReferencesBridge();
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  // Wheel-only here (keyboard off): the canvas owns the global Cmd± shortcuts.
  const zoomCtl = useStepZoom(stageRef, { contentRef });

  useEffect(() => {
    zoomCtl.reset();
  }, [reference?.id]);

  // Publish the stage zoom so the toolbar can drive it when expanded (mirrors how the
  // canvas windows' toolbar drives the editor zoom). Cleared when the stage unmounts.
  useEffect(() => {
    publishZoom({
      value: zoomCtl.zoom,
      onChange: zoomCtl.setZoom,
      limits: getViewportZoomLimits("frame"),
    });
    return () => publishZoom(null);
  }, [zoomCtl.zoom, zoomCtl.setZoom, publishZoom]);

  // Same gate as the canvas surfaces: shown always, on hover, or never — and only
  // when there is an item (a loaded reference stack) to zoom. When the window is
  // expanded the bottom-left widget hides and the toolbar's zoom takes over.
  const zoomVisible =
    !expanded &&
    Boolean(imageStack) &&
    (shellZoomVisibility === "show" || (shellZoomVisibility === "hover" && hovered));

  return (
    <div
      ref={stageRef}
      {...zoomCtl.panHandlers}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="absolute inset-0"
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
            onClick={stackMode ? () => setSelectedNodeId(scopeRootId) : undefined}
          >
            <SceneCanvasInspector
              source="stack"
              stack={imageStack}
              selectedId={selectedNodeId}
              onSelect={stackMode ? setSelectedNodeId : () => undefined}
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

      {zoomVisible ? (
        <div className="absolute bottom-3 left-3 z-[10]">
          <ZoomControl
            zoom={zoomCtl.zoom}
            setZoom={zoomCtl.setZoom}
            limits={getViewportZoomLimits("frame")}
          />
        </div>
      ) : null}

      <CanvasScrollbars x={zoomCtl.scroll.x} y={zoomCtl.scroll.y} />
    </div>
  );
}
