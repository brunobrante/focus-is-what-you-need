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
import type { ZoomLimits } from "@/canvas/engine/viewport";

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
  zoomLimits,
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
  zoomLimits?: ZoomLimits;
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
        <ActionsPanel />
      )}

      {canvasExpanded && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
          <CanvasExpandedControls
            zoom={zoom}
            onZoomChange={onZoomChange}
            zoomLimits={zoomLimits}
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
  const [selectedToolId, setSelectedToolId] = useState<CanvasToolId | null>(tools[0]?.id ?? null);
  const ref = useRef<HTMLDivElement>(null);

  const isGroupActive = tools.some((t) => t.id === active);
  const current =
    tools.find((t) => t.id === (isGroupActive ? active : selectedToolId)) ??
    tools[0];

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
            const isSelected = current.id === tool.id;
            const badgeLit = hoveredBadgeId === tool.id;
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

function ActionsPanel() {
  const [activeTab, setActiveTab] = useState<"all" | "assets" | "plugins">("all");
  const [searchValue, setSearchValue] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const tabs = [
    { id: "all" as const, label: "All" },
    { id: "assets" as const, label: "Assets" },
    { id: "plugins" as const, label: "Plugins & widgets" },
  ];
  const itemsByTab: Record<"all" | "assets" | "plugins", Array<{ title: string }>> = {
    all: [
      { title: "Make an image" },
      { title: "Replace content" },
      { title: "Translate to..." },
      { title: "Rewrite this..." },
      { title: "Rename layers" },
      { title: "Find more like Coupon" },
      { title: "First Draft" },
    ],
    assets: [
      { title: "Image library" },
      { title: "Icon library" },
      { title: "Color styles" },
      { title: "Text styles" },
      { title: "Local uploads" },
      { title: "Shared components" },
    ],
    plugins: [
      { title: "Figma Make" },
      { title: "Auto layout helper" },
      { title: "Accessibility checker" },
      { title: "Content generator" },
      { title: "Localization helper" },
    ],
  };
  const visibleItems = itemsByTab[activeTab].filter((item) =>
    item.title.toLowerCase().includes(searchValue.trim().toLowerCase()),
  );
  const sectionTitle =
    activeTab === "assets"
      ? "Assets"
      : activeTab === "plugins"
        ? "Plugins & widgets"
        : "Suggestions";

  return (
    <div
      className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 flex h-[286px] w-[404px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-[#3A3A3A] bg-[#2B2B2B] p-2 pb-[2px]"
      style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.58), 0 1px 0 rgba(255,255,255,0.03) inset" }}
    >
      {!aiMode ? (
        <>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[#424242] bg-[#363636] px-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8E8E8E" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#E5E5E5] outline-none placeholder:text-[#A4A4A4]"
            />
            <button
              type="button"
              aria-label="Open AI chat"
              onClick={() => setAiMode(true)}
              className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#D8D8D8] transition-colors duration-100 hover:bg-[#3B3B3B]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20l7.5-7.5" />
                <path d="M9 3l1 2.5L12.5 6 10 7l-1 2.5L8 7 5.5 6 8 5.5 9 3z" />
                <path d="M16 8l.6 1.4L18 10l-1.4.6L16 12l-.6-1.4L14 10l1.4-.6L16 8z" />
                <path d="M19 14l.5 1.1L20.6 16l-1.1.5L19 17.6l-.5-1.1L17.4 16l1.1-.5L19 14z" />
              </svg>
              <span className="absolute -right-1 -top-1 rounded-full bg-[#0D99FF] px-1 text-[8px] font-semibold leading-[14px] text-white shadow-[0_0_0_1px_#2B2B2B]">
                IA
              </span>
            </button>
          </div>

          <div className="mt-2 flex items-center gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors duration-100",
                    active ? "bg-[#444] text-[#F2F2F2]" : "text-[#BDBDBD] hover:bg-[#343434] hover:text-[#E8E8E8]",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-1 px-2 text-[10px] font-medium tracking-[0.2px] text-[#8B8B8B]">{sectionTitle}</div>
            <div className="min-h-0 max-h-[150px] flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin] [scrollbar-color:#4A4A4A_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#4A4A4A]">
              <div className="space-y-0.5 pb-1">
                {visibleItems.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors duration-100 hover:bg-[#343434]"
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#DFDFDF]">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                    </span>
                    <span className="truncate text-[12px] text-[#EFEFEF]">{item.title}</span>
                  </button>
                ))}
                {visibleItems.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-[#7C7C7C]">No items found.</div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-medium tracking-[0.2px] text-[#8B8B8B]">AI Chat</span>
            <button
              type="button"
              onClick={() => setAiMode(false)}
              className="rounded px-1.5 py-0.5 text-[10px] text-[#BDBDBD] transition-colors duration-100 hover:bg-[#343434] hover:text-[#F2F2F2]"
            >
              Back
            </button>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Ask AI to generate or edit..."
            className="min-h-0 flex-1 resize-none rounded-lg border border-[#424242] bg-[#363636] px-3 py-2 text-[12px] text-[#E5E5E5] outline-none placeholder:text-[#A4A4A4]"
          />
        </div>
      )}
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
  zoomLimits,
  projectType,
  deviceEnabled,
  onToggleDevice,
  parentTarget,
  onBackToParent,
  onCollapse,
}: {
  zoom?: number;
  onZoomChange?: ZoomSetter;
  zoomLimits?: ZoomLimits;
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
          <ZoomControl zoom={zoom} setZoom={onZoomChange} limits={zoomLimits} bare />
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
