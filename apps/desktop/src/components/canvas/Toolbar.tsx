import { Fragment, useEffect, useRef, useState } from "react";

import type { CanvasToolId } from "@/lib/canvas/tools";
import {
  DEFAULT_TOOLBAR_CONFIG,
  type ToolbarConfig,
  type ToolEntry,
} from "@/lib/canvas/toolbarConfig";
import { ZoomControl, type ZoomSetter } from "@/components/canvas/CanvasRender";

export function Toolbar({
  activeTool,
  defaultTool = "cursor",
  onToolChange,
  canvasExpanded,
  onCollapseCanvas,
  zoom,
  onZoomChange,
  config = DEFAULT_TOOLBAR_CONFIG,
}: {
  activeTool?: CanvasToolId;
  defaultTool?: CanvasToolId;
  onToolChange?: (tool: CanvasToolId) => void;
  canvasExpanded?: boolean;
  onCollapseCanvas?: () => void;
  zoom?: number;
  onZoomChange?: ZoomSetter;
  config?: ToolbarConfig;
}) {
  const [uncontrolledActive, setUncontrolledActive] = useState<CanvasToolId>(defaultTool);
  const active = activeTool ?? uncontrolledActive;
  const selectTool = (tool: CanvasToolId) => {
    setUncontrolledActive(tool);
    onToolChange?.(tool);
  };

  return (
    <div className="relative inline-flex">
      <div
        data-screen-label="Toolbar"
        className="inline-flex items-center gap-0.5 rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-1.5"
        style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
      >
        {config.groups.map((group, gi) => {
          const groupKey = group[0]?.kind === "button"
            ? group[0].tool.id
            : group[0]?.kind === "dropdown"
              ? (group[0].tools[0]?.id ?? `g${gi}`)
              : `g${gi}`;
          return (
            <Fragment key={groupKey}>
              {gi > 0 && <Divider />}
              {group.map((item) =>
                item.kind === "dropdown" ? (
                  <DropdownToolButton
                    key={`dd-${item.tools[0]?.id ?? gi}`}
                    tools={item.tools}
                    active={active}
                    onSelect={selectTool}
                  />
                ) : (
                  <ToolButton
                    key={item.tool.id}
                    tool={item.tool}
                    active={active === item.tool.id}
                    onClick={() => selectTool(item.tool.id)}
                  />
                )
              )}
            </Fragment>
          );
        })}
      </div>

      {canvasExpanded && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
          <CanvasExpandedControls
            zoom={zoom}
            onZoomChange={onZoomChange}
            onCollapse={onCollapseCanvas}
          />
        </div>
      )}
    </div>
  );
}

// ── Internal components ────────────────────────────────────────────────────────

function DropdownToolButton({
  tools,
  active,
  onSelect,
}: {
  tools: ToolEntry[];
  active: CanvasToolId;
  onSelect: (id: CanvasToolId) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isGroupActive = tools.some((t) => t.id === active);
  const current = isGroupActive ? tools.find((t) => t.id === active)! : tools[0];

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  if (!current) return null;

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onSelect(current.id)}
        aria-label={current.name}
        className={[
          "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 p-0 transition-colors duration-[90ms]",
          isGroupActive ? "bg-[#383838] text-white" : hover ? "bg-[#2A2A2A] text-[#CFCFCF]" : "bg-transparent text-[#CFCFCF]",
        ].join(" ")}
      >
        {current.icon}
        {hover && !isGroupActive && (
          <span
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-[11px] font-medium leading-none tracking-[0.1px] text-[#F5F5F5]"
            style={{ bottom: "calc(100% + 10px)", whiteSpace: "nowrap" }}
          >
            {current.name}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Mais opções"
        onClick={() => setMenuOpen((o) => !o)}
        className={[
          "inline-flex h-9 w-3 cursor-pointer items-center justify-center rounded-md border-0 p-0 transition-colors duration-[90ms]",
          menuOpen ? "text-white" : "text-[#555] hover:text-[#CFCFCF]",
        ].join(" ")}
      >
        <svg width="5" height="4" viewBox="0 0 5 4" fill="currentColor">
          <path d="M0 0.5L2.5 3.5L5 0.5H0Z" />
        </svg>
      </button>

      {menuOpen && (
        <div
          className="absolute left-0 z-50 overflow-hidden rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-1"
          style={{
            bottom: "calc(100% + 8px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)",
            minWidth: 140,
          }}
        >
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                onSelect(tool.id);
                setMenuOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors duration-[90ms]",
                active === tool.id
                  ? "bg-[#383838] text-white"
                  : "text-[#CFCFCF] hover:bg-[#2A2A2A] hover:text-white",
              ].join(" ")}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {tool.icon}
              </span>
              {tool.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: ToolEntry;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={tool.name}
      className={[
        "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 p-0 transition-colors duration-[90ms]",
        active ? "bg-[#383838] text-white" : hover ? "bg-[#2A2A2A] text-[#CFCFCF]" : "bg-transparent text-[#CFCFCF]",
      ].join(" ")}
    >
      {tool.icon}
      {hover && !active && (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-[11px] font-medium leading-none tracking-[0.1px] text-[#F5F5F5]"
          style={{ bottom: "calc(100% + 10px)", whiteSpace: "nowrap" }}
        >
          {tool.name}
        </span>
      )}
    </button>
  );
}

function CanvasExpandedControls({
  zoom,
  onZoomChange,
  onCollapse,
}: {
  zoom?: number;
  onZoomChange?: ZoomSetter;
  onCollapse?: () => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-[3px]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
    >
      {zoom != null && onZoomChange ? (
        <>
          <ZoomControl zoom={zoom} setZoom={onZoomChange} bare />
          <div aria-hidden className="mx-0.5 h-5 w-px bg-[#2C2C2C]" />
        </>
      ) : null}
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Sair da tela cheia"
        className="grid h-9 w-9 place-items-center rounded-lg text-[#888] transition-colors duration-[90ms] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="10" y1="14" x2="3" y2="21" />
          <line x1="21" y1="3" x2="14" y2="10" />
        </svg>
      </button>
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="mx-1 h-5 w-px bg-[#2C2C2C]" />;
}
