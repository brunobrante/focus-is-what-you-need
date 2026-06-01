import { Fragment, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

import type { CanvasToolId } from "@/canvas/tools";
import {
  DEFAULT_TOOLBAR_CONFIG,
  type ToolbarConfig,
  type ToolEntry,
} from "@/canvas/toolbarConfig";
import type { ProjectType } from "@/lib/data/types";
import { ZoomControl, type ZoomSetter } from "@/canvas/shell/CanvasRender";

type ToolbarParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function Toolbar({
  activeTool,
  defaultTool = "cursor",
  onToolChange,
  canvasExpanded,
  onCollapseCanvas,
  zoom,
  onZoomChange,
  projectType = "desktop",
  parentTarget,
  onBackToParent,
  config = DEFAULT_TOOLBAR_CONFIG,
  onBadgeClick,
}: {
  activeTool?: CanvasToolId;
  defaultTool?: CanvasToolId;
  onToolChange?: (tool: CanvasToolId) => void;
  canvasExpanded?: boolean;
  onCollapseCanvas?: () => void;
  zoom?: number;
  onZoomChange?: ZoomSetter;
  projectType?: ProjectType;
  parentTarget?: ToolbarParentTarget | null;
  onBackToParent?: () => void;
  config?: ToolbarConfig;
  onBadgeClick?: () => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [uncontrolledActive, setUncontrolledActive] = useState<CanvasToolId>(defaultTool);
  const [deviceOverlayEnabled, setDeviceOverlayEnabled] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const active = activeTool ?? uncontrolledActive;
  const selectTool = (tool: CanvasToolId) => {
    setUncontrolledActive(tool);
    onToolChange?.(tool);
  };

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (active === "actions") setActionsMenuOpen(true);
  }, [active]);

  return (
    <div ref={toolbarRef} className="relative inline-flex">
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
                    onOpenMenu={() => setActionsMenuOpen(false)}
                    badge={item.badge}
                    onBadgeClick={item.badge ? onBadgeClick : undefined}
                  />
                ) : (
                  item.tool.id === "actions" ? (
                    <ActionsMenuButton
                      key={item.tool.id}
                      tool={item.tool}
                      menuOpen={actionsMenuOpen}
                      onToggle={() => setActionsMenuOpen((value) => !value)}
                    />
                  ) : (
                    <ToolButton
                      key={item.tool.id}
                      tool={item.tool}
                      active={active === item.tool.id}
                      onClick={() => selectTool(item.tool.id)}
                    />
                  )
                )
              )}
            </Fragment>
          );
        })}
      </div>
      {actionsMenuOpen && (
        <div
          className="absolute bottom-[calc(100%+5px)] left-1/2 z-50 h-[220px] w-[380px] -translate-x-1/2 rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-2"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)" }}
        />
      )}

      {canvasExpanded && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
          <CanvasExpandedControls
            zoom={zoom}
            onZoomChange={onZoomChange}
            projectType={projectType}
            deviceEnabled={deviceOverlayEnabled}
            onToggleDevice={() => setDeviceOverlayEnabled((value) => !value)}
            parentTarget={parentTarget}
            onBackToParent={onBackToParent}
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
  onOpenMenu,
  badge,
  onBadgeClick,
}: {
  tools: ToolEntry[];
  active: CanvasToolId;
  onSelect: (id: CanvasToolId) => void;
  onOpenMenu?: () => void;
  badge?: string;
  onBadgeClick?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [hoveredBadgeId, setHoveredBadgeId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const isGroupActive = tools.some((t) => t.id === active);
  const current = isGroupActive ? tools.find((t) => t.id === active)! : tools[0];

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
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
          <ToolTooltip tool={current} />
        )}
      </button>

      <button
        type="button"
        aria-label="More options"
        onClick={() => {
          const next = !menuOpen;
          setMenuOpen(next);
          if (next) onOpenMenu?.();
        }}
        className={[
          "-ml-1 inline-flex h-8 w-4 cursor-pointer items-center justify-center rounded-md border-0 p-0 transition-colors duration-[90ms]",
          menuOpen ? "bg-[#2A2A2A] text-white" : "text-[#666] hover:bg-[#2A2A2A] hover:text-[#DADADA]",
        ].join(" ")}
      >
        <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
          <path d="M0.5 0.5L3 3.5L5.5 0.5H0.5Z" />
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
          {tools.map((tool) => {
            const isActive = active === tool.id;
            const badgeLit = hoveredBadgeId === tool.id;
            return (
              <div
                key={tool.id}
                className={[
                  "flex w-full items-center rounded-md transition-colors duration-[90ms]",
                  isActive ? "bg-[#383838]" : "hover:bg-[#2A2A2A]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => { onSelect(tool.id); setMenuOpen(false); }}
                  className={[
                    "flex flex-1 items-center gap-2.5 border-0 bg-transparent px-2 py-1.5 text-left text-[12px] font-medium",
                    isActive ? "text-white" : "text-[#CFCFCF]",
                  ].join(" ")}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {tool.icon}
                  </span>
                  <span className="flex-1">{tool.name}</span>
                  {tool.shortcut ? (
                    <span className="ml-4 rounded border border-[#343434] bg-[#171717] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#8E8E8E]">
                      {tool.shortcut}
                    </span>
                  ) : null}
                </button>

                {badge && (
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredBadgeId(tool.id)}
                    onMouseLeave={() => setHoveredBadgeId(null)}
                    onClick={(e) => { e.stopPropagation(); onBadgeClick?.(); }}
                    className="mr-1.5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                    aria-label={`Rendering mode: ${badge}`}
                  >
                    <span
                      className="rounded px-1 py-px font-mono text-[9px] font-semibold leading-none transition-all duration-[90ms]"
                      style={{
                        letterSpacing: "0.5px",
                        color: badgeLit ? "#CFCFCF" : "#555",
                        background: badgeLit ? "#2A2A2A" : "transparent",
                        border: `1px solid ${badgeLit ? "#3A3A3A" : "transparent"}`,
                      }}
                    >
                      {badge}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
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
        <ToolTooltip tool={tool} />
      )}
    </button>
  );
}

function ActionsMenuButton({
  tool,
  menuOpen,
  onToggle,
}: {
  tool: ToolEntry;
  menuOpen: boolean;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={tool.name}
        aria-expanded={menuOpen}
        className={[
          "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 p-0 transition-colors duration-[90ms]",
          menuOpen ? "bg-[#383838] text-white" : hover ? "bg-[#2A2A2A] text-[#CFCFCF]" : "bg-transparent text-[#CFCFCF]",
        ].join(" ")}
      >
        {tool.icon}
        {hover && !menuOpen && (
          <ToolTooltip tool={tool} />
        )}
      </button>
    </div>
  );
}

function ToolTooltip({ tool }: { tool: ToolEntry }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-[11px] font-medium leading-none tracking-[0.1px] text-[#F5F5F5]"
      style={{ bottom: "calc(100% + 10px)", whiteSpace: "nowrap" }}
    >
      {tool.name}
      {tool.shortcut ? (
        <span className="rounded border border-[#343434] bg-[#171717] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#8E8E8E]">
          {tool.shortcut}
        </span>
      ) : null}
    </span>
  );
}

function CanvasExpandedControls({
  zoom,
  onZoomChange,
  projectType,
  deviceEnabled,
  onToggleDevice,
  parentTarget,
  onBackToParent,
  onCollapse,
}: {
  zoom?: number;
  onZoomChange?: ZoomSetter;
  projectType: ProjectType;
  deviceEnabled: boolean;
  onToggleDevice: () => void;
  parentTarget?: ToolbarParentTarget | null;
  onBackToParent?: () => void;
  onCollapse?: () => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-[3px]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
    >
      <ToolbarDeviceButton
        enabled={deviceEnabled}
        projectType={projectType}
        onClick={onToggleDevice}
      />
      {parentTarget ? (
        <ToolbarBackButton parentTarget={parentTarget} onClick={onBackToParent} />
      ) : null}
      <div aria-hidden className="mx-0.5 h-5 w-px bg-[#2C2C2C]" />
      {zoom != null && onZoomChange ? (
        <>
          <ZoomControl zoom={zoom} setZoom={onZoomChange} bare />
          <div aria-hidden className="mx-0.5 h-5 w-px bg-[#2C2C2C]" />
        </>
      ) : null}
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Exit fullscreen"
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

function ToolbarDeviceButton({
  enabled,
  projectType,
  onClick,
}: {
  enabled: boolean;
  projectType: ProjectType;
  onClick: () => void;
}) {
  const isMobile = projectType === "mobile";
  const Icon = isMobile ? Smartphone : Monitor;
  const label = `${enabled ? "Disable" : "Enable"} ${isMobile ? "mobile" : "desktop"} mode`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={onClick}
      className={[
        "grid h-9 w-9 place-items-center rounded-lg transition-colors duration-[90ms]",
        enabled
          ? "bg-[#0D99FF]/15 text-[#8CCBFF]"
          : "text-[#888] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]",
      ].join(" ")}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );
}

function ToolbarBackButton({
  parentTarget,
  onClick,
}: {
  parentTarget: ToolbarParentTarget;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Voltar para ${parentTarget.name}`}
      title={`Voltar para ${parentTarget.name}`}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg text-[#888] transition-colors duration-[90ms] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
        {parentTarget.kind === "component" ? <path d="M20 5h-4v4M4 19h4v-4" /> : null}
      </svg>
    </button>
  );
}

function Divider() {
  return <div aria-hidden className="mx-1 h-5 w-px bg-[#2C2C2C]" />;
}
