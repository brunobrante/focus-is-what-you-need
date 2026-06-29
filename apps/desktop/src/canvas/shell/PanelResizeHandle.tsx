import { useCallback, useRef } from "react";

/**
 * A thin drag strip pinned to one vertical edge of a floating sidebar. The
 * sidebars are `fixed`/flex overlays (not flex siblings of the canvas), so the
 * shadcn ResizablePanelGroup model does not apply here — we own a single edge
 * and report the new clamped width to the parent, which recomputes the canvas
 * inset from it. Width is session-only state; nothing is persisted.
 */
export function PanelResizeHandle({
  side,
  width,
  min,
  max,
  onResize,
}: {
  /** Which edge of the panel the strip sits on. "right" → a left sidebar grows
   *  when dragged right; "left" → a right sidebar grows when dragged left. */
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
}) {
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startW.current = width;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX.current;
        const delta = side === "right" ? dx : -dx;
        onResize(Math.min(max, Math.max(min, startW.current + delta)));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [side, width, min, max, onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      className={`group absolute inset-y-0 z-20 w-1.5 cursor-ew-resize ${
        side === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[#3A3A3A]" />
    </div>
  );
}
