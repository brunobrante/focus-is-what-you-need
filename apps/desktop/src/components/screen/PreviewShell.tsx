import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { NavTooltip } from "./NavTooltip";
import { ZOOM_DEFAULT_IDX, ZoomControls } from "./ZoomControls";
import { useStepZoom } from "./useStepZoom";
import { CanvasScrollbars } from "@/components/ui/CanvasScrollbars";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconFastEdit, IconOpenCanvas } from "@/components/icons";

type NeighborScreen = { name: string; details?: string[]; href?: string; screenId?: string };

type DeviceOption = {
  id: string;
  label: string;
  note: string;
};

const DEVICE_OPTIONS: DeviceOption[] = [
  { id: "iphone-15", label: "iPhone 15", note: "390 × 844" },
  { id: "iphone-xr", label: "iPhone XR", note: "414 × 896" },
  { id: "iphone-se", label: "iPhone SE", note: "320 × 568" },
];

type Props = {
  children: ReactNode;
  onFastEdit?: () => void;
  canvasHref?: string;
  prev?: NeighborScreen;
  next?: NeighborScreen;
};

export function PreviewShell({
  children,
  onFastEdit,
  canvasHref,
  prev,
  next,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomCtl = useStepZoom(stageRef, { keyboard: true, contentRef });
  const [paneHover, setPaneHover] = useState(false);
  const [deviceActive, setDeviceActive] = useState(false);
  const [deviceId, setDeviceId] = useState(DEVICE_OPTIONS[0]?.id ?? "iphone-15");
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [deviceMenuPos, setDeviceMenuPos] = useState<{ top: number; left: number } | null>(null);
  const deviceTriggerRef = useRef<HTMLButtonElement>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const isZoomed = zoomCtl.index !== ZOOM_DEFAULT_IDX;
  const overlayHidden = isZoomed && !paneHover;
  const overlayClass = [
    "transition-opacity duration-[180ms]",
    overlayHidden ? "pointer-events-none opacity-0" : "opacity-100",
  ].join(" ");
  const activeDevice = DEVICE_OPTIONS.find((device) => device.id === deviceId) ?? DEVICE_OPTIONS[0] ?? null;

  useEffect(() => {
    if (!deviceMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!deviceTriggerRef.current?.contains(target) && !deviceMenuRef.current?.contains(target)) {
        setDeviceMenuOpen(false);
        setDeviceMenuPos(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDeviceMenuOpen(false);
        setDeviceMenuPos(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deviceMenuOpen]);

  const openDeviceMenu = (rect: DOMRect) => {
    const width = 240;
    setDeviceMenuPos({
      top: rect.top,
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right + 8)),
    });
    setDeviceMenuOpen(true);
  };

  return (
    <div
      ref={stageRef}
      {...zoomCtl.panHandlers}
      onMouseEnter={() => setPaneHover(true)}
      onMouseLeave={() => setPaneHover(false)}
      className="relative flex flex-1 items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0) 0 0/22px 22px, var(--surface)",
        cursor: zoomCtl.isPanning ? "grabbing" : zoomCtl.canPan ? "grab" : "default",
      }}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 py-20">
        <div
          ref={contentRef}
          className="pointer-events-auto flex min-h-0 min-w-0 origin-center items-center justify-center max-h-full max-w-full [&_img]:h-auto [&_img]:w-auto [&_img]:max-h-[72vh] [&_img]:max-w-full [&_img]:object-contain"
          style={{
            transform: zoomCtl.transform,
            transition: zoomCtl.isPanning ? "none" : "transform 180ms",
          }}
        >
          {children}
        </div>
      </div>

      {/* device switch top-left */}
      <div className={["absolute left-4 top-4 z-[6]", overlayClass].join(" ")}>
        <div className="inline-flex items-center">
          <button
            ref={deviceTriggerRef}
            type="button"
            aria-label={activeDevice ? `Dispositivo ativo: ${activeDevice.label}` : "Dispositivo ativo"}
            aria-pressed={deviceActive}
            title={activeDevice ? activeDevice.label : "Dispositivo"}
            onClick={() => setDeviceActive((current) => !current)}
            className={[
              "grid h-[34px] w-[38px] cursor-pointer place-items-center rounded-l-md border border-[var(--border-strong)] bg-[var(--surface-2)] transition-colors hover:border-[var(--blue)] hover:bg-[rgba(31,122,224,0.08)]",
              deviceActive
                ? "border-[var(--blue)] bg-[rgba(31,122,224,0.08)] text-[var(--blue)]"
                : "text-[var(--text)]",
            ].join(" ")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect
                x="4"
                y="3"
                width="16"
                height="18"
                rx="3"
                className={deviceActive ? "fill-current" : ""}
                opacity={deviceActive ? 0.18 : 0.5}
              />
              <circle cx="12" cy="18" r="0.9" fill="currentColor" opacity={deviceActive ? 1 : 0.8} />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Open device list"
            aria-haspopup="menu"
            aria-expanded={deviceMenuOpen}
            onClick={(event) => openDeviceMenu(event.currentTarget.getBoundingClientRect())}
            className={[
              "grid h-[34px] w-[24px] cursor-pointer place-items-center rounded-r-md border-y border-r border-[var(--border-strong)] border-l-0 bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors",
              deviceMenuOpen ? "border-[var(--blue)] bg-[rgba(31,122,224,0.08)] text-[var(--blue)]" : "",
            ].join(" ")}
          >
            <IconChevronDown size={10} strokeWidth={2} />
          </button>
        </div>
      </div>
      {deviceMenuOpen && deviceMenuPos
        ? createPortal(
            <div
              ref={deviceMenuRef}
              role="menu"
              aria-label="Dispositivos"
              className="fixed z-[80] min-w-[240px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(20,20,20,0.98)] p-1.5 shadow-[var(--shadow-pop)] backdrop-blur-md"
              style={{ top: deviceMenuPos.top, left: deviceMenuPos.left }}
            >
              <div className="border-b border-[var(--border)] px-3 py-2.5">
                <div className="text-[12px] font-semibold text-[var(--text)]">Dispositivos</div>
                <div className="mt-1 text-[11px] text-[var(--text-faint)]">Escolha o modelo para o preview</div>
              </div>
              <div className="py-1">
                {DEVICE_OPTIONS.map((device) => {
                  const active = device.id === deviceId;
                  return (
                    <button
                      key={device.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setDeviceId(device.id);
                        setDeviceActive(true);
                        setDeviceMenuOpen(false);
                        setDeviceMenuPos(null);
                      }}
                      className={[
                        "flex h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-[12px] transition-colors",
                        active
                          ? "bg-[var(--surface)] text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                      ].join(" ")}
                    >
                      <span>{device.label}</span>
                      <span className="text-[11px] text-[var(--text-faint)]">{device.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* preview-actions top-right */}
      <div className={["absolute right-4 top-4 z-[6] flex items-center gap-2", overlayClass].join(" ")}>
        {onFastEdit ? (
          <button
            type="button"
            aria-label="FastEdit"
            title="FastEdit"
            onClick={onFastEdit}
            className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconFastEdit size={15} strokeWidth={1.7} />
          </button>
        ) : null}
        {canvasHref ? (
          <Link
            to={canvasHref}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[13px] font-medium text-[var(--text)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconOpenCanvas size={14} strokeWidth={1.7} />
            Open in canvas
          </Link>
        ) : null}
      </div>

      {/* prev arrow + tooltip */}
      {prev ? (
        <div className={["group absolute left-4 top-1/2 z-[4] -translate-y-1/2", overlayClass].join(" ")}>
          <Link
            to={prev.href ?? "#"}
            aria-label="Previous screen"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconChevronLeft size={14} strokeWidth={2} />
          </Link>
          <NavTooltip side="prev" name={prev.name} details={prev.details} screenId={prev.screenId} />
        </div>
      ) : null}

      {/* next arrow + tooltip */}
      {next ? (
        <div className={["group absolute right-4 top-1/2 z-[4] -translate-y-1/2", overlayClass].join(" ")}>
          <Link
            to={next.href ?? "#"}
            aria-label="Next screen"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-soft)] no-underline transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconChevronRight size={14} strokeWidth={2} />
          </Link>
          <NavTooltip side="next" name={next.name} details={next.details} screenId={next.screenId} />
        </div>
      ) : null}

      {/* zoom controls (always visible) */}
      <ZoomControls
        index={zoomCtl.index}
        onZoomIn={zoomCtl.zoomIn}
        onZoomOut={zoomCtl.zoomOut}
        onReset={zoomCtl.reset}
      />

      <CanvasScrollbars x={zoomCtl.scroll.x} y={zoomCtl.scroll.y} />
    </div>
  );
}
