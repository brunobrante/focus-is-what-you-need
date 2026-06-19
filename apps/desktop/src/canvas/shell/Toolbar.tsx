import { Fragment, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  IconBackArrow, IconChevronDownFill, IconChevronRight,
  IconCollapse, IconExpand,
} from "@/components/icons";
import type { ChecklistOwner } from "@/lib/storage/repos/checklists.repo";
import type { CanvasToolId } from "@/canvas/tools";
import {
  DEFAULT_TOOLBAR_CONFIG,
  type ToolbarConfig,
  type ToolEntry,
} from "@/canvas/toolbarConfig";
import type { ProjectType } from "@/lib/data/types";
import { ZoomControl, type ZoomSetter } from "@/canvas/shell/ZoomControl";
import type { ZoomLimits } from "@/canvas/engine/viewport";
import { ActionsPanel } from "./actions/ActionsPanel";
import type { ComponentPickerContext } from "./actions/ComponentPicker";
export type { ComponentPickerContext } from "./actions/ComponentPicker";

type ToolbarParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function Toolbar({
  activeTool,
  defaultTool = "cursor",
  onToolChange,
  canvasExpanded,
  canvasControlsVisible,
  onCanvasExpandedChange,
  zoom,
  onZoomChange,
  zoomLimits,
  projectType = "desktop",
  parentTarget,
  onBackToParent,
  config = DEFAULT_TOOLBAR_CONFIG,
  onBadgeClick,
  checklistOwner = null,
  componentPicker = null,
}: {
  activeTool?: CanvasToolId;
  defaultTool?: CanvasToolId;
  onToolChange?: (tool: CanvasToolId) => void;
  canvasExpanded?: boolean;
  canvasControlsVisible?: boolean;
  onCanvasExpandedChange?: (expanded: boolean) => void;
  zoom?: number;
  onZoomChange?: ZoomSetter;
  zoomLimits?: ZoomLimits;
  projectType?: ProjectType;
  parentTarget?: ToolbarParentTarget | null;
  onBackToParent?: () => void;
  config?: ToolbarConfig;
  onBadgeClick?: () => void;
  checklistOwner?: ChecklistOwner | null;
  componentPicker?: ComponentPickerContext | null;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [uncontrolledActive, setUncontrolledActive] = useState<CanvasToolId>(defaultTool);
  const [deviceOverlayEnabled, setDeviceOverlayEnabled] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionsAiMode, setActionsAiMode] = useState(false);
  const active = activeTool ?? uncontrolledActive;
  const showCanvasControls = canvasControlsVisible ?? canvasExpanded;
  const selectTool = (tool: CanvasToolId) => {
    setUncontrolledActive(tool);
    onToolChange?.(tool);
  };

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        if (!actionsAiMode) setActionsMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [actionsMenuOpen, actionsAiMode]);

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
        <ActionsPanel
          onClose={() => { setActionsMenuOpen(false); setActionsAiMode(false); }}
          aiMode={actionsAiMode}
          onAiModeChange={setActionsAiMode}
          checklistOwner={checklistOwner}
          componentPicker={componentPicker}
        />
      )}

      {showCanvasControls && parentTarget && (
        <div className="absolute right-full top-1/2 mr-2 -translate-y-1/2">
          <CanvasBackControl parentTarget={parentTarget} onBackToParent={onBackToParent} />
        </div>
      )}

      {showCanvasControls && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
          <CanvasExpandedControls
            expanded={Boolean(canvasExpanded)}
            zoom={zoom}
            onZoomChange={onZoomChange}
            zoomLimits={zoomLimits}
            projectType={projectType}
            deviceEnabled={deviceOverlayEnabled}
            onToggleDevice={() => setDeviceOverlayEnabled((value) => !value)}
            onToggleExpanded={() => onCanvasExpandedChange?.(!canvasExpanded)}
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
  const [pillVisible, setPillVisible] = useState(false);
  const [renderMode, setRenderMode] = useState<"SVG" | "DIV">("SVG");
  const [selectedToolId, setSelectedToolId] = useState<CanvasToolId | null>(tools[0]?.id ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const autoFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroupActive = tools.some((t) => t.id === active);
  const current =
    tools.find((t) => t.id === (isGroupActive ? active : selectedToolId)) ??
    tools[0];

  // Show pill briefly whenever this group becomes active, then auto-fade
  useEffect(() => {
    if (!badge) return;
    if (autoFadeTimer.current) clearTimeout(autoFadeTimer.current);
    if (!isGroupActive) { setPillVisible(false); return; }
    setPillVisible(true);
    autoFadeTimer.current = setTimeout(() => setPillVisible(false), 1400);
    return () => { if (autoFadeTimer.current) clearTimeout(autoFadeTimer.current); };
  }, [isGroupActive, active, badge]);

  const onPillEnter = () => { if (isGroupActive) { if (autoFadeTimer.current) clearTimeout(autoFadeTimer.current); setPillVisible(true); } };
  const onPillLeave = () => { setPillVisible(false); };

  useEffect(() => {
    if (isGroupActive) setSelectedToolId(active);
  }, [active, isGroupActive]);

  useEffect(() => {
    if (selectedToolId && tools.some((tool) => tool.id === selectedToolId)) return;
    setSelectedToolId(tools[0]?.id ?? null);
  }, [selectedToolId, tools]);

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
        onClick={() => {
          setSelectedToolId(current.id);
          onSelect(current.id);
        }}
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
        <IconChevronDownFill />
      </button>

      {badge && isGroupActive && (
        <div
          className="absolute left-1/2 z-50 -translate-x-1/2"
          style={{ top: "calc(100% + 5px)" }}
          onMouseEnter={onPillEnter}
          onMouseLeave={onPillLeave}
        >
          <div
            className={`flex items-stretch overflow-hidden rounded-[5px] border border-[#333] bg-[#141414] transition-opacity duration-300 ${pillVisible ? "opacity-100" : "opacity-0"}`}
            style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.4)" }}
          >
            <button
              type="button"
              onClick={() => setRenderMode((m) => (m === "SVG" ? "DIV" : "SVG"))}
              className="flex items-center border-0 bg-transparent px-2 py-[5px] transition-colors duration-[90ms] hover:bg-[#1E1E1E]"
              aria-label="Toggle render mode"
            >
              <span className="font-mono text-[9px] font-semibold leading-none tracking-wide text-[#ADADAD]">
                {renderMode}
              </span>
            </button>
            <div className="w-px shrink-0 bg-[#2A2A2A]" />
            <button
              type="button"
              onClick={onBadgeClick}
              className="flex items-center border-0 bg-transparent px-1.5 py-[5px] text-[#484848] transition-colors duration-[90ms] hover:bg-[#1E1E1E] hover:text-[#909090]"
              aria-label="Open render settings"
            >
              <IconChevronRight />
            </button>
          </div>
        </div>
      )}

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
            const isSelected = current.id === tool.id;
            return (
              <div
                key={tool.id}
                className={[
                  "flex w-full items-center rounded-md transition-colors duration-[90ms]",
                  isSelected ? "bg-[#383838]" : "hover:bg-[#2A2A2A]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedToolId(tool.id);
                    onSelect(tool.id);
                    setMenuOpen(false);
                  }}
                  className={[
                    "flex flex-1 items-center gap-2.5 border-0 bg-transparent px-2 py-1.5 text-left text-[12px] font-medium",
                    isSelected ? "text-white" : "text-[#CFCFCF]",
                  ].join(" ")}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {tool.icon}
                  </span>
                  <span className="flex-1">{tool.name}</span>
                  {tool.shortcut ? (
                    <span className="font-mono text-[9px] leading-none text-[#686868]">
                      {tool.shortcut}
                    </span>
                  ) : null}
                </button>
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
        <span className="rounded border border-[#262626] px-1 py-px font-mono text-[9px] leading-none text-[#555]">
          {tool.shortcut}
        </span>
      ) : null}
    </span>
  );
}

function CanvasExpandedControls({
  expanded,
  zoom,
  onZoomChange,
  zoomLimits,
  projectType,
  deviceEnabled,
  onToggleDevice,
  onToggleExpanded,
}: {
  expanded: boolean;
  zoom?: number;
  onZoomChange?: ZoomSetter;
  zoomLimits?: ZoomLimits;
  projectType: ProjectType;
  deviceEnabled: boolean;
  onToggleDevice: () => void;
  onToggleExpanded?: () => void;
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
      <div aria-hidden className="mx-0.5 h-5 w-px bg-[#2C2C2C]" />
      {zoom != null && onZoomChange ? (
        <>
          <ZoomControl zoom={zoom} setZoom={onZoomChange} limits={zoomLimits} bare />
          <div aria-hidden className="mx-0.5 h-5 w-px bg-[#2C2C2C]" />
        </>
      ) : null}
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-label={expanded ? "Exit fullscreen" : "Expand canvas"}
        className="grid h-9 w-9 place-items-center rounded-lg text-[#888] transition-colors duration-[90ms] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
      >
        {expanded ? <CollapseIcon /> : <ExpandIcon />}
      </button>
    </div>
  );
}

function ExpandIcon() {
  return <IconExpand size={13} />;
}

function CollapseIcon() {
  return <IconCollapse size={13} />;
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

function CanvasBackControl({
  parentTarget,
  onBackToParent,
}: {
  parentTarget: ToolbarParentTarget;
  onBackToParent?: () => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-[3px]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
    >
      <ToolbarBackButton parentTarget={parentTarget} onClick={onBackToParent} />
    </div>
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
      aria-label={`Back to ${parentTarget.name}`}
      title={`Back to ${parentTarget.name}`}
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-lg px-3 text-[#888] transition-colors duration-[90ms] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
    >
      <IconBackArrow size={13} strokeWidth={2} />
      <span className="max-w-[120px] truncate text-[12px] font-medium leading-none text-[#CFCFCF]">
        {parentTarget.name}
      </span>
    </button>
  );
}

function Divider() {
  return <div aria-hidden className="mx-1 h-5 w-px bg-[#2C2C2C]" />;
}
