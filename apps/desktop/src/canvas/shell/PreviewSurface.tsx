import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ElementRenderer } from "@/canvas/stage/ElementRenderer";
import { getStageBoxShadow } from "@/canvas/stage/canvasShellStyle";
import { IconClose, IconOpenCanvas } from "@/components/icons";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
import type { PreviewSettings } from "../canvasUtils";

const PREVIEW_BACKGROUNDS: Record<PreviewSettings["background"], string> = {
  dark: "#1A1A1A",
  light: "#F2F2F2",
  scene: "#1A1A1A",
};

// Device bezel sizing, mirroring the proportions used by the project-card
// thumbnail mockups in lib/storage/projectThumbnail.ts.
const BEZEL_PAD = 14; // mobile / tablet bezel thickness
const BROWSER_CHROME = 30; // desktop browser chrome bar height

function useMeasuredSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/**
 * View-only Preview window: a live, non-interactive render of the current
 * document. Never becomes the active/focused canvas — it is purely for viewing.
 */
export function CanvasPreviewSurface({
  document,
  projectType,
  settings,
  onClose,
  onOpenInNewWindow,
}: {
  document: CanvasDocument;
  projectType: ProjectType;
  settings: PreviewSettings;
  onClose: () => void;
  onOpenInNewWindow?: () => void;
}) {
  const [areaRef, area] = useMeasuredSize();

  const docWidth = Math.max(1, document.canvas.width);
  const docHeight = Math.max(1, document.canvas.height);

  // Outer (bezel-inclusive) dimensions used to compute the fit scale.
  const isBrowser = projectType === "desktop";
  const padX = settings.deviceFrame ? (isBrowser ? 0 : BEZEL_PAD) : 0;
  const padTop = settings.deviceFrame ? (isBrowser ? BROWSER_CHROME : BEZEL_PAD) : 0;
  const padBottom = settings.deviceFrame ? (isBrowser ? 0 : BEZEL_PAD) : 0;
  const outerWidth = docWidth + padX * 2;
  const outerHeight = docHeight + padTop + padBottom;

  const FIT_MARGIN = 24;
  const fitScale =
    area.width > 0 && area.height > 0
      ? Math.min(
          (area.width - FIT_MARGIN) / outerWidth,
          (area.height - FIT_MARGIN) / outerHeight,
          1,
        )
      : 1;
  const scale = settings.fit === "fit" ? Math.max(0.05, fitScale) : 1;

  const background =
    settings.background === "scene"
      ? document.shellBackground || PREVIEW_BACKGROUNDS.scene
      : PREVIEW_BACKGROUNDS[settings.background];

  const stage = (
    <div
      className="canvas-stage"
      style={{
        position: "relative",
        width: docWidth,
        height: docHeight,
        background: document.canvas.background || undefined,
        borderRadius: document.canvas.borderRadius,
        boxShadow: getStageBoxShadow(document.canvas, 1),
        opacity: document.canvas.opacity ?? undefined,
        overflow: "hidden",
        flex: "none",
      }}
    >
      <div className="render-layer">
        {document.rootIds.map((id) => (
          <ElementRenderer key={id} id={id} document={document} preview renderScale={1} />
        ))}
      </div>
    </div>
  );

  const framed = settings.deviceFrame ? (
    <DeviceFrame isBrowser={isBrowser} docBorderRadius={document.canvas.borderRadius ?? 0}>
      {stage}
    </DeviceFrame>
  ) : (
    stage
  );

  return (
    <div
      className="relative flex flex-1 overflow-hidden rounded-xl border border-[#2A2A2A]"
      style={{ background, boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)" }}
    >
      <div
        ref={areaRef}
        className={settings.fit === "actual" ? "flex-1 overflow-auto" : "flex-1 overflow-hidden"}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center p-3"
          style={{ width: settings.fit === "actual" ? outerWidth + 24 : undefined }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "center center", flex: "none" }}>
            {framed}
          </div>
        </div>
      </div>

      <div className="absolute right-2 top-2 z-[5] flex items-center gap-1">
        <FloatBtn label="Open in new window" disabled title="Coming soon" onClick={onOpenInNewWindow}>
          <IconOpenCanvas size={12} />
        </FloatBtn>
        <FloatBtn label="Close preview" onClick={onClose}>
          <IconClose size={11} strokeWidth={1.8} />
        </FloatBtn>
      </div>
    </div>
  );
}

function FloatBtn({
  label,
  title,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A]/90 text-[#9A9A9A] backdrop-blur transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#E6E6E6] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#1A1A1A]/90 disabled:hover:text-[#9A9A9A]"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
    >
      {children}
    </button>
  );
}

function DeviceFrame({
  isBrowser,
  docBorderRadius,
  children,
}: {
  isBrowser: boolean;
  docBorderRadius: number;
  children: ReactNode;
}) {
  if (isBrowser) {
    return (
      <div
        className="flex-none overflow-hidden rounded-[10px] border border-[#333]"
        style={{ background: "#202020", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
      >
        <div
          className="flex items-center gap-1.5 px-3"
          style={{ height: BROWSER_CHROME, background: "#2A2A2A" }}
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ED6A5E" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#F4BF4F" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#61C554" }} />
        </div>
        {children}
      </div>
    );
  }
  const outerRadius = Math.max(28, docBorderRadius + BEZEL_PAD);
  const frameStyle: CSSProperties = {
    padding: BEZEL_PAD,
    background: "#0A0A0A",
    borderRadius: outerRadius,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.5)",
  };
  return (
    <div className="flex-none" style={frameStyle}>
      {children}
    </div>
  );
}
