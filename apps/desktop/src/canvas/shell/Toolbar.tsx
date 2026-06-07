import { Fragment, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

import { useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
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
        />
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
            parentTarget={parentTarget}
            onBackToParent={onBackToParent}
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

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "Make an image": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m21 15-5-5L5 21" /><circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  "Replace content": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  ),
  "Translate to...": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  "Rewrite this...": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  ),
  "Rename layers": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  "Find more like Coupon": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  "First Draft": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
    </svg>
  ),
  "Image library": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="m21 15-5-5L5 21" /><circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  "Icon library": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  "Color styles": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 2a5 5 0 0 1 0 10 5 5 0 0 0 0 10" /><path d="M12 2v20" />
    </svg>
  ),
  "Text styles": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  "Local uploads": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  "Shared components": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="9" height="9" rx="1" /><rect x="13" y="2" width="9" height="9" rx="1" /><rect x="2" y="13" width="9" height="9" rx="1" /><rect x="13" y="13" width="9" height="9" rx="1" />
    </svg>
  ),
  "Figma Make": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  "Auto layout helper": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  "Accessibility checker": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  "Content generator": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3l1 2.5L12.5 6 10 7l-1 2.5L8 7 5.5 6 8 5.5 9 3z" /><path d="M16 8l.6 1.4L18 10l-1.4.6L16 12l-.6-1.4L14 10l1.4-.6L16 8z" /><path d="M19 14l.5 1.1L20.6 16l-1.1.5L19 17.6l-.5-1.1L17.4 16l1.1-.5L19 14z" />
    </svg>
  ),
  "Localization helper": (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

const MOCK_CONVERSATION = [
  { role: "user" as const, content: "Rewrite the hero headline" },
  { role: "assistant" as const, content: "Here are a few options:\n\n• \"Track, plan, and deliver on time.\"\n• \"One dashboard. Every metric.\"\n• \"Your operations, simplified.\"" },
];

function ActionsPanel({ onClose, aiMode, onAiModeChange }: { onClose?: () => void; aiMode: boolean; onAiModeChange: (v: boolean) => void }) {
  const [activeTab, setActiveTab] = useState<"all" | "assets" | "plugins">("all");
  const [searchValue, setSearchValue] = useState("");
  const setAiMode = onAiModeChange;
  const [aiInput, setAiInput] = useState("");
  const [wandHover, setWandHover] = useState(false);
  const selectedNodes = useEditorBridge((v) => {
    if (!v) return [];
    return v.state.selectedIds
      .filter((id) => Boolean(v.state.document.elements[id]))
      .map((id) => ({ id, name: v.state.document.elements[id]!.name }));
  }) ?? [];
  const getEditor = useEditorBridgeReader();
  const deselectNode = (nodeId: string) => {
    const editor = getEditor();
    if (!editor) return;
    editor.dispatch({ type: "setSelected", selectedIds: editor.state.selectedIds.filter((id) => id !== nodeId) });
  };
  const TAG_LIMIT = 3;
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return; }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
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
      className="group absolute bottom-[calc(100%+4px)] left-1/2 z-50 flex h-[264px] w-[420px] -translate-x-1/2 flex-col rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-2 pb-0"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)" }}
    >
      {!aiMode ? (
        <>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[#333] bg-[#2A2A2A] px-2.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#666]"
            />
            <button
              type="button"
              aria-label="Open AI chat"
              onClick={() => setAiMode(true)}
              onMouseEnter={() => setWandHover(true)}
              onMouseLeave={() => setWandHover(false)}
              className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#CFCFCF] transition-colors duration-100 hover:bg-[#383838]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20L11 9" />
                <path d="M13 3L15 5L17 7L15 9L13 11L11 9L9 7L11 5Z" />
                <path d="M19.5 6.5H21" />
                <path d="M18.5 3.5L19.5 4.5" />
                <path d="M18.5 9.5L19.5 8.5" />
              </svg>
              {wandHover && (
                <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-[11px] font-medium leading-none tracking-[0.1px] text-[#F5F5F5]">
                  AI Chat
                </span>
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-0.5">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "h-7 rounded-lg px-2.5 text-[11px] font-medium transition-colors duration-100",
                    active ? "bg-[#2A2A2A] text-[#CFCFCF]" : "text-[#666] hover:bg-[#242424] hover:text-[#999]",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-1 px-2 text-[10px] font-medium tracking-[0.3px] uppercase text-[#4A4A4A]">{sectionTitle}</div>
            <div className="min-h-0 max-h-[160px] flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
              <div className="space-y-px pb-1">
                {visibleItems.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[#CFCFCF]">
                      {ACTION_ICONS[item.title] ?? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14" /><path d="M12 5v14" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-[12px] text-[#CFCFCF]">{item.title}</span>
                  </button>
                ))}
                {visibleItems.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-[#555]">No items found.</div>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex h-7 shrink-0 items-center justify-between px-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">AI Chat</span>
            <div className="flex items-center gap-0.5">
              {tagsExpanded && (
                <button
                  type="button"
                  aria-label="Collapse tags"
                  onClick={() => setTagsExpanded(false)}
                  className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}>
                    <path d="M17 11l-5-5-5 5" /><path d="M17 18l-5-5-5 5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                aria-label="AI chat settings"
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Expand conversation"
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Close AI chat"
                onClick={() => { setAiMode(false); setTagsExpanded(false); }}
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {tagsExpanded ? (
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
              <div className="flex flex-wrap gap-1 pb-1">
                {selectedNodes.map((node) => (
                  <span
                    key={node.id}
                    className="flex items-center gap-1 rounded-md border border-[#2E2E2E] bg-[#252525] py-[3px] pl-2 pr-1"
                  >
                    <span className="max-w-[120px] truncate text-[11px] text-[#8E8E8E]">{node.name}</span>
                    <button
                      type="button"
                      onClick={() => deselectNode(node.id)}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#505050] transition-colors duration-100 hover:text-[#CFCFCF]"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
              <div className="flex flex-col gap-2.5 pb-1">
                {MOCK_CONVERSATION.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    {msg.role === "assistant" && (
                      <div className="mr-2 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0D99FF]">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 3l1 2.5L12.5 6 10 7l-1 2.5L8 7 5.5 6 8 5.5 9 3z" />
                          <path d="M16 8l.6 1.4L18 10l-1.4.6L16 12l-.6-1.4L14 10l1.4-.6L16 8z" />
                        </svg>
                      </div>
                    )}
                    <div
                      className={[
                        "max-w-[76%] rounded-xl px-3 py-2 text-[11.5px] leading-[1.55]",
                        msg.role === "user"
                          ? "rounded-tr-sm bg-[#2A2A2A] text-[#CFCFCF]"
                          : "rounded-tl-sm bg-transparent text-[#ABABAB]",
                      ].join(" ")}
                    >
                      {msg.content.split("\n").map((line, li) => (
                        <span key={li}>
                          {line}
                          {li < msg.content.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="-mx-2 shrink-0 border-t border-[#252525] px-2 pb-2 pt-2">
            {selectedNodes.length > 0 && !tagsExpanded && (
              <div className="mb-2 flex items-center gap-1 overflow-hidden">
                {selectedNodes.slice(0, TAG_LIMIT).map((node) => (
                  <span
                    key={node.id}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-[#2E2E2E] bg-[#252525] py-[3px] pl-2 pr-1"
                  >
                    <span className="max-w-[80px] truncate text-[11px] text-[#8E8E8E]">{node.name}</span>
                    <button
                      type="button"
                      onClick={() => deselectNode(node.id)}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#505050] transition-colors duration-100 hover:text-[#CFCFCF]"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                {selectedNodes.length > TAG_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setTagsExpanded(true)}
                    className="shrink-0 rounded-md border border-[#2E2E2E] bg-[#252525] px-2 py-[3px] text-[11px] text-[#505050] transition-colors duration-100 hover:border-[#3A3A3A] hover:text-[#8E8E8E]"
                  >
                    +{selectedNodes.length - TAG_LIMIT}
                  </button>
                )}
              </div>
            )}
            <div className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 transition-colors duration-150 ${recording ? "border-[#5C2020] bg-[#1E1010]" : "border-[#2E2E2E] bg-[#252525]"}`}>
              <style>{`@keyframes ai-wave{0%,100%{transform:scaleY(0.25)}50%{transform:scaleY(1)}}`}</style>
              {recording ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E05555] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E05555]" />
                  </span>
                  <span className="w-9 shrink-0 text-[11px] tabular-nums text-[#E05555]">
                    {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-[2px]">
                    {[0.35, 0.7, 0.5, 1, 0.6, 0.85, 0.4, 0.9, 0.55, 0.75, 0.3, 0.65, 0.45].map((h, i) => (
                      <div
                        key={i}
                        className="w-[2px] rounded-full bg-[#B04040]"
                        style={{
                          height: `${Math.round(h * 14)}px`,
                          transformOrigin: "center",
                          animation: `ai-wave ${0.6 + (i % 3) * 0.15}s ease-in-out ${(i * 0.07).toFixed(2)}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel recording"
                    onClick={() => setRecording(false)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#6B3030] transition-colors duration-100 hover:bg-[#3A1818] hover:text-[#E05555]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </>
              ) : (
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
                />
              )}
              <button
                type="button"
                aria-label={recording ? "Record voice message active" : "Record voice message"}
                onClick={() => setRecording((r) => !r)}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 ${recording ? "text-[#E05555] hover:bg-[#3A1818]" : "text-[#505050] hover:bg-[#333] hover:text-[#CFCFCF]"}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="9" y1="22" x2="15" y2="22" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Send"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 ${recording ? "text-[#E05555] hover:bg-[#3A1818] hover:text-[#FF7070]" : "text-[#505050] hover:bg-[#333] hover:text-[#CFCFCF]"}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
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
  expanded,
  zoom,
  onZoomChange,
  zoomLimits,
  projectType,
  deviceEnabled,
  onToggleDevice,
  parentTarget,
  onBackToParent,
  onToggleExpanded,
}: {
  expanded: boolean;
  zoom?: number;
  onZoomChange?: ZoomSetter;
  zoomLimits?: ZoomLimits;
  projectType: ProjectType;
  deviceEnabled: boolean;
  onToggleDevice: () => void;
  parentTarget?: ToolbarParentTarget | null;
  onBackToParent?: () => void;
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
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
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
