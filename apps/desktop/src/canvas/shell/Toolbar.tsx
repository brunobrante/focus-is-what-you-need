import { Fragment, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  IconAccessibilityCheck, IconBackArrow, IconChecklist, IconChevronDownFill,
  IconChevronDownMed, IconChevronLeft, IconChevronRight, IconClose,
  IconCollapse, IconColorStyles, IconDocument, IconExpand, IconGlobe,
  IconGrid, IconLightning, IconMicrophone, IconPlus, IconRenameLayers,
  IconReplace, IconRewrite, IconSearch, IconSend, IconSettings, IconSparkles,
  IconStar, IconTmbAssets, IconTypeStyles, IconUpload, IconWand,
  IconChevronDoubleUp, IconCheck, IconImage, IconTrash,
} from "@/components/icons";

import { useEditorBridge, useEditorBridgeReader } from "@/canvas/engine/bridge";
import { useChecklist } from "@/application/checklists/useChecklist";
import type { ChecklistOwner } from "@/lib/storage/repos/checklists.repo";
import { listLinkableComponents } from "@/lib/storage/repos/components.repo";
import { getVariantFrameSize } from "@/lib/storage/repos/scenes.repo";
import { getWorkspaceForProject } from "@/lib/storage/repos/workspace.repo";
import { insertElement } from "@/canvas/engine/mutations/elementHierarchy";
import { buildLinkedInstanceNode } from "@/canvas/engine/mutations/buildLinkedInstanceNode";
import { buildMasterResolver, withResolvedInstances } from "@/canvas/engine/htmlSceneAdapter";
import { scopeOf, sourceScopeIcon } from "@/components/component/componentSource";
import { peekTable, TABLES } from "@/lib/storage/store";
import type { ComponentRow, SceneRow } from "@/lib/storage/schema";
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

/** Context the "Add components" picker needs: which project's linkable components
 * to offer, which open component to exclude (self-insertion guard), and the current
 * scene graph/name so a freshly placed instance can be resolved into the live doc. */
export type ComponentPickerContext = {
  projectId: string | null;
  openComponentId: string | null;
  graphJSON: string | null;
  canvasName: string;
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

const ACTION_ICONS: Record<string, React.ReactNode> = {
  "Add components":      <IconGrid size={12} strokeWidth={1.8} />,
  "Checklist":           <IconChecklist />,
  "Make an image":       <IconImage size={12} strokeWidth={1.8} />,
  "Replace content":     <IconReplace />,
  "Translate to...":     <IconGlobe />,
  "Rewrite this...":     <IconRewrite />,
  "Rename layers":       <IconRenameLayers />,
  "Find more like Coupon": <IconSearch size={12} strokeWidth={1.8} />,
  "First Draft":         <IconDocument />,
  "Image library":       <IconImage size={12} strokeWidth={1.8} />,
  "Icon library":        <IconStar size={12} strokeWidth={1.8} />,
  "Color styles":        <IconColorStyles />,
  "Text styles":         <IconTypeStyles />,
  "Local uploads":       <IconUpload />,
  "Shared components":   <IconGrid size={12} strokeWidth={1.8} />,
  "TMB Assets Library":  <IconTmbAssets />,
  "Figma Make":          <IconLightning />,
  "Auto layout helper":  <IconGrid size={12} strokeWidth={1.8} />,
  "Accessibility checker": <IconAccessibilityCheck />,
  "Content generator":   <IconSparkles />,
  "Localization helper": <IconGlobe />,
};

const IMAGE_LIBRARY_SOURCES = ["Unsplash", "Pexels", "Getty Images", "iStock"];
const ICON_LIBRARY_SOURCES = ["Lucide", "Heroicons", "Material", "Phosphor"];
const TMB_ASSET_CATEGORIES = ["All", "Logos", "Brand", "UI Kit", "Patterns"];

type MockTmbAsset = { id: string; name: string; category: string; bg: string };
const MOCK_TMB_ASSETS: MockTmbAsset[] = [
  { id: "tmb-logo-primary",  name: "Primary Logo",      category: "Logos",    bg: "linear-gradient(135deg,#0f0f14,#1a1a2e)" },
  { id: "tmb-logo-white",    name: "Logo White",         category: "Logos",    bg: "linear-gradient(135deg,#2a2a2a,#1e1e1e)" },
  { id: "tmb-logo-mark",     name: "Logo Mark",          category: "Logos",    bg: "linear-gradient(135deg,#4a1d8a,#7b4fd8)" },
  { id: "tmb-logo-horiz",    name: "Horizontal",         category: "Logos",    bg: "linear-gradient(135deg,#0f0f14,#1e1e2e)" },
  { id: "tmb-brand-blue",    name: "Primary Blue",       category: "Brand",    bg: "linear-gradient(135deg,#1f7ae0,#0b55c0)" },
  { id: "tmb-brand-dark",    name: "Dark BG",            category: "Brand",    bg: "linear-gradient(135deg,#0f0f10,#1a1a1a)" },
  { id: "tmb-brand-purple",  name: "Accent Purple",      category: "Brand",    bg: "linear-gradient(135deg,#6b21a8,#9333ea)" },
  { id: "tmb-brand-grad",    name: "Brand Gradient",     category: "Brand",    bg: "linear-gradient(135deg,#4a1d8a,#1f7ae0)" },
  { id: "tmb-ui-button",     name: "Button Set",         category: "UI Kit",   bg: "linear-gradient(135deg,#1e1e2e,#2a2a3e)" },
  { id: "tmb-ui-card",       name: "Card",               category: "UI Kit",   bg: "linear-gradient(135deg,#1a1a1e,#242430)" },
  { id: "tmb-ui-input",      name: "Input Field",        category: "UI Kit",   bg: "linear-gradient(135deg,#1e1e1e,#2a2a2a)" },
  { id: "tmb-ui-nav",        name: "Navigation",         category: "UI Kit",   bg: "linear-gradient(135deg,#141418,#1e1e24)" },
  { id: "tmb-pat-dots",      name: "Dot Grid",           category: "Patterns", bg: "radial-gradient(circle,#3a3a4a 1px,transparent 1px) 0 0/8px 8px #0f0f14" },
  { id: "tmb-pat-lines",     name: "Line Grid",          category: "Patterns", bg: "repeating-linear-gradient(0deg,#1e1e2a,#1e1e2a 1px,#0f0f14 0,#0f0f14 12px)" },
  { id: "tmb-pat-noise",     name: "Noise Texture",      category: "Patterns", bg: "linear-gradient(135deg,#1a1a20,#252530)" },
  { id: "tmb-pat-mesh",      name: "Mesh Gradient",      category: "Patterns", bg: "radial-gradient(at 30% 30%,#4a1d8a,transparent 60%),radial-gradient(at 70% 70%,#1f4ae0,transparent 60%) #0f0f14" },
];

type MockImageItem = { id: string; name: string; bg: string };
const MOCK_IMAGES: MockImageItem[] = [
  { id: "img-1", name: "Abstract", bg: "linear-gradient(135deg,#1a1a2e,#0f3460)" },
  { id: "img-2", name: "Forest", bg: "linear-gradient(135deg,#134e5e,#71b280)" },
  { id: "img-3", name: "Night city", bg: "linear-gradient(135deg,#0f0c29,#302b63)" },
  { id: "img-4", name: "Sunset", bg: "linear-gradient(135deg,#f093fb,#f5576c)" },
  { id: "img-5", name: "Snow peak", bg: "linear-gradient(135deg,#c9d6ff,#e2e2e2)" },
  { id: "img-6", name: "Desert", bg: "linear-gradient(135deg,#f7971e,#ffd200)" },
  { id: "img-7", name: "Autumn", bg: "linear-gradient(135deg,#e65c00,#f9d423)" },
  { id: "img-8", name: "Rain", bg: "linear-gradient(135deg,#373b44,#4286f4)" },
  { id: "img-9", name: "Blossom", bg: "linear-gradient(135deg,#f8b4c8,#e96d8c)" },
  { id: "img-10", name: "Neon", bg: "linear-gradient(135deg,#8e2de2,#4a00e0)" },
  { id: "img-11", name: "Meadow", bg: "linear-gradient(135deg,#56ab2f,#a8e063)" },
  { id: "img-12", name: "Arctic", bg: "linear-gradient(135deg,#2980b9,#6dd5fa)" },
];

type MockIconItem = { id: string; name: string; d: React.ReactNode };
const MOCK_ICONS: MockIconItem[] = [
  { id: "home", name: "Home", d: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></> },
  { id: "user", name: "User", d: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></> },
  { id: "bell", name: "Bell", d: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></> },
  { id: "heart", name: "Heart", d: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /> },
  { id: "star", name: "Star", d: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /> },
  { id: "search", name: "Search", d: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></> },
  { id: "mail", name: "Mail", d: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></> },
  { id: "phone", name: "Phone", d: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.22a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.527.265 1.044.42 1.55" /> },
  { id: "camera", name: "Camera", d: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></> },
  { id: "map-pin", name: "Location", d: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></> },
  { id: "folder", name: "Folder", d: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /> },
  { id: "file", name: "File", d: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></> },
  { id: "lock", name: "Lock", d: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></> },
  { id: "calendar", name: "Calendar", d: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: "clock", name: "Clock", d: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
  { id: "trash", name: "Trash", d: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></> },
  { id: "edit", name: "Edit", d: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /> },
  { id: "download", name: "Download", d: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></> },
  { id: "share", name: "Share", d: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></> },
  { id: "bookmark", name: "Bookmark", d: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];

const MOCK_CONVERSATION = [
  { role: "user" as const, content: "Rewrite the hero headline" },
  { role: "assistant" as const, content: "Here are a few options:\n\n• \"Track, plan, and deliver on time.\"\n• \"One dashboard. Every metric.\"\n• \"Your operations, simplified.\"" },
];

function ActionsPanel({ onClose, aiMode, onAiModeChange, checklistOwner, componentPicker }: { onClose?: () => void; aiMode: boolean; onAiModeChange: (v: boolean) => void; checklistOwner: ChecklistOwner | null; componentPicker: ComponentPickerContext | null }) {
  const [activeTab, setActiveTab] = useState<"all" | "assets" | "plugins">("all");
  const [searchValue, setSearchValue] = useState("");
  const [checklistMode, setChecklistMode] = useState(false);
  const { items: checklistItems, addItem: addChecklistItem, toggleItem: toggleChecklistItem, removeItem: removeChecklistItem } = useChecklist(checklistOwner);
  const [checklistInput, setChecklistInput] = useState("");
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

  const [libraryMode, setLibraryMode] = useState<"images" | "icons" | "tmb" | null>(null);
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [componentsMode, setComponentsMode] = useState(false);
  const [componentItems, setComponentItems] = useState<ComponentRow[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");

  // Load linkable components when the picker opens. Workspace is resolved from the
  // project so workspace-global components are offered alongside project-global ones.
  useEffect(() => {
    if (!componentsMode) return;
    let cancelled = false;
    setComponentsLoading(true);
    void (async () => {
      const projectId = componentPicker?.projectId ?? null;
      const workspace = projectId ? await getWorkspaceForProject(projectId) : null;
      const rows = await listLinkableComponents({
        projectId,
        workspaceId: workspace?.id ?? null,
      });
      if (cancelled) return;
      setComponentItems(
        rows.filter((row) => row.id !== componentPicker?.openComponentId),
      );
      setComponentsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [componentsMode, componentPicker?.projectId, componentPicker?.openComponentId]);

  const insertLinkedComponent = async (master: ComponentRow) => {
    const editor = getEditor();
    if (!editor) return;
    const size = await getVariantFrameSize(master.activeVariantId);
    const doc = editor.state.document;
    const node = buildLinkedInstanceNode({
      componentId: master.id,
      variantId: master.activeVariantId,
      name: master.name,
      size,
      canvas: doc.canvas,
    });
    // Resolve the bare instance into the live document so its master content is
    // inlined immediately. Instances are otherwise only expanded at scene-load time,
    // so a runtime insert would render empty until a remount. The scenes cache is
    // hydrated by now, so a synchronous peek sees every master variant scene.
    const resolveMaster = buildMasterResolver(peekTable<SceneRow>(TABLES.scenes));
    const resolved = withResolvedInstances(
      insertElement(doc, node),
      componentPicker?.graphJSON ?? null,
      componentPicker?.canvasName ?? "Canvas",
      resolveMaster,
    );
    editor.dispatch({
      type: "commitDocument",
      document: resolved,
      selectedIds: [node.id],
    });
    setComponentsMode(false);
    onClose?.();
  };
  const [imageSource, setImageSource] = useState(IMAGE_LIBRARY_SOURCES[0]);
  const [iconSource, setIconSource] = useState(ICON_LIBRARY_SOURCES[0]);
  const [tmbCategory, setTmbCategory] = useState(TMB_ASSET_CATEGORIES[0]);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sourceDropdownOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target as Node)) {
        setSourceDropdownOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [sourceDropdownOpen]);

  const tabs = [
    { id: "all" as const, label: "All" },
    { id: "assets" as const, label: "Assets" },
    { id: "plugins" as const, label: "Plugins & widgets" },
  ];
  const itemsByTab: Record<"all" | "assets" | "plugins", Array<{ title: string }>> = {
    all: [
      { title: "Add components" },
      { title: "Checklist" },
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
      { title: "TMB Assets Library" },
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
      className={`group absolute bottom-[calc(100%+4px)] left-1/2 z-50 flex w-[420px] -translate-x-1/2 flex-col rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-2 pb-0 transition-[height] duration-200 ${libraryExpanded ? "h-[500px]" : "h-[264px]"}`}
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 28px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)" }}
    >
      {checklistMode ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex h-7 shrink-0 items-center justify-between px-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">Checklist</span>
            <button
              type="button"
              aria-label="Back"
              onClick={() => setChecklistMode(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            >
              <IconChevronLeft />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-px pb-1">
              {checklistItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-[90ms] hover:bg-[#252525]"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded accent-[#0D99FF]"
                  />
                  <span className={`min-w-0 flex-1 truncate text-[12px] ${item.checked ? "text-[#555] line-through" : "text-[#CFCFCF]"}`}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => removeChecklistItem(item.id)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-[#505050] opacity-0 transition-all duration-100 hover:text-[#E4A1A1] group-hover:opacity-100"
                  >
                    <IconClose size={9} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {checklistItems.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-[#555]">No items yet.</div>
              )}
            </div>
          </div>

          <div className="-mx-2 shrink-0 border-t border-[#252525] px-2 pb-2 pt-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
              <input
                type="text"
                value={checklistInput}
                onChange={(e) => setChecklistInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (!checklistInput.trim()) return;
                    addChecklistItem(checklistInput);
                    setChecklistInput("");
                  }
                }}
                placeholder="Add item..."
                className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
              />
              <button
                type="button"
                aria-label="Add item"
                onClick={() => {
                  if (!checklistInput.trim()) return;
                  addChecklistItem(checklistInput);
                  setChecklistInput("");
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#505050] transition-colors duration-100 hover:bg-[#333] hover:text-[#CFCFCF]"
              >
                <IconPlus size={12} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      ) : componentsMode ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex h-7 shrink-0 items-center justify-between px-1">
            <button
              type="button"
              aria-label="Back"
              onClick={() => setComponentsMode(false)}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A] transition-colors duration-100 hover:text-[#8E8E8E]"
            >
              <IconChevronLeft />
              Add components
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setComponentsMode(false)}
              className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
            >
              <IconClose size={11} strokeWidth={2} />
            </button>
          </div>

          <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
            <IconSearch size={11} strokeWidth={1.8} />
            <input
              type="text"
              value={componentSearch}
              onChange={(e) => setComponentSearch(e.target.value)}
              placeholder="Search components…"
              className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
            {(() => {
              const q = componentSearch.trim().toLowerCase();
              const filtered = componentItems.filter((c) => !q || c.name.toLowerCase().includes(q));
              if (componentsLoading) {
                return <div className="px-2 py-2 text-[11px] text-[#555]">Loading…</div>;
              }
              if (filtered.length === 0) {
                return (
                  <div className="px-2 py-2 text-[11px] text-[#555]">
                    {componentItems.length === 0
                      ? "No linkable components yet. Create a project or workspace component to link it here."
                      : "No components found."}
                  </div>
                );
              }
              return (
                <div className="space-y-px pb-1">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void insertLinkedComponent(c)}
                      className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center text-[#8E8E8E]">
                        {sourceScopeIcon(scopeOf(c), { size: 12, strokeWidth: 1.8 })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[#CFCFCF]">{c.name}</span>
                      <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A]">
                        {scopeOf(c) === "workspace" ? "Workspace" : "Project"}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      ) : libraryMode ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex h-7 shrink-0 items-center justify-between px-1">
            <button
              type="button"
              aria-label="Back"
              onClick={() => { setLibraryMode(null); setLibraryExpanded(false); setSourceDropdownOpen(false); }}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.3px] text-[#4A4A4A] transition-colors duration-100 hover:text-[#8E8E8E]"
            >
              <IconChevronLeft />
              {libraryMode === "images" ? "Image library" : libraryMode === "icons" ? "Icon library" : "TMB Assets Library"}
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label={libraryExpanded ? "Collapse" : "Expand"}
                onClick={() => setLibraryExpanded((v) => !v)}
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                {libraryExpanded ? <IconCollapse /> : <IconExpand />}
              </button>
              <button
                type="button"
                aria-label="Close library"
                onClick={() => { setLibraryMode(null); setLibraryExpanded(false); setSourceDropdownOpen(false); }}
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <IconClose size={11} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-[#2E2E2E] bg-[#252525] px-2.5">
              <IconSearch size={11} strokeWidth={1.8} />
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder={libraryMode === "images" ? "Search images…" : libraryMode === "icons" ? "Search icons…" : "Search assets…"}
                className="min-w-0 flex-1 border-0 bg-transparent text-[12px] text-[#CFCFCF] outline-none placeholder:text-[#555]"
              />
              {librarySearch && (
                <button
                  type="button"
                  onClick={() => setLibrarySearch("")}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#555] transition-colors duration-100 hover:text-[#CFCFCF]"
                >
                  <IconClose size={8} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div ref={sourceDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSourceDropdownOpen((v) => !v)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors duration-100 ${
                  sourceDropdownOpen
                    ? "border-[#383838] bg-[#2E2E2E] text-[#CFCFCF]"
                    : "border-[#2E2E2E] bg-[#252525] text-[#8E8E8E] hover:border-[#333] hover:text-[#CFCFCF]"
                }`}
              >
                {libraryMode === "images" ? imageSource : libraryMode === "icons" ? iconSource : tmbCategory}
                <IconChevronDownMed />
              </button>

              {sourceDropdownOpen && (
                <div
                  className="absolute right-0 z-[60] overflow-hidden rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-1"
                  style={{ bottom: "calc(100% + 4px)", minWidth: 128, boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)" }}
                >
                  {(libraryMode === "images" ? IMAGE_LIBRARY_SOURCES : libraryMode === "icons" ? ICON_LIBRARY_SOURCES : TMB_ASSET_CATEGORIES).map((src) => {
                    const isActive = libraryMode === "images" ? imageSource === src : libraryMode === "icons" ? iconSource === src : tmbCategory === src;
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => {
                          if (libraryMode === "images") setImageSource(src);
                          else if (libraryMode === "icons") setIconSource(src);
                          else setTmbCategory(src);
                          setSourceDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors duration-[90ms] ${
                          isActive ? "bg-[#2A2A2A] text-[#CFCFCF]" : "text-[#8E8E8E] hover:bg-[#252525] hover:text-[#CFCFCF]"
                        }`}
                      >
                        <span className="flex-1">{src}</span>
                        {isActive && <IconCheck />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#333_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#333]">
            {libraryMode === "images" ? (
              (() => {
                const filtered = MOCK_IMAGES.filter((img) =>
                  img.name.toLowerCase().includes(librarySearch.toLowerCase()),
                );
                return filtered.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5 pb-1">
                    {filtered.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        className="group/img flex flex-col gap-1 rounded-md p-0.5 transition-all duration-[90ms] hover:bg-[#2A2A2A]"
                      >
                        <div className="h-[52px] w-full rounded" style={{ background: img.bg }} />
                        <span className="truncate px-0.5 text-[10px] text-[#555] transition-colors duration-100 group-hover/img:text-[#8E8E8E]">
                          {img.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-[11px] text-[#555]">No images found.</div>
                );
              })()
            ) : libraryMode === "icons" ? (
              (() => {
                const filtered = MOCK_ICONS.filter((icon) =>
                  icon.name.toLowerCase().includes(librarySearch.toLowerCase()),
                );
                return filtered.length > 0 ? (
                  <div className="grid grid-cols-5 gap-0.5 pb-1">
                    {filtered.map((icon) => (
                      <button
                        key={icon.id}
                        type="button"
                        className="flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#CFCFCF"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {icon.d}
                        </svg>
                        <span className="w-full truncate text-center text-[9px] text-[#555]">
                          {icon.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-[11px] text-[#555]">No icons found.</div>
                );
              })()
            ) : (
              (() => {
                const q = librarySearch.toLowerCase();
                const filtered = MOCK_TMB_ASSETS.filter((asset) => {
                  const matchesSearch = asset.name.toLowerCase().includes(q);
                  const matchesCategory = tmbCategory === "All" || asset.category === tmbCategory;
                  return matchesSearch && matchesCategory;
                });
                return filtered.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5 pb-1">
                    {filtered.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="group/asset flex flex-col gap-1 rounded-md p-0.5 transition-all duration-[90ms] hover:bg-[#2A2A2A]"
                      >
                        <div className="h-[52px] w-full rounded" style={{ background: asset.bg }} />
                        <div className="flex items-center gap-1 px-0.5">
                          <span className="min-w-0 flex-1 truncate text-[10px] text-[#555] transition-colors duration-100 group-hover/asset:text-[#8E8E8E]">
                            {asset.name}
                          </span>
                          {tmbCategory === "All" && (
                            <span className="shrink-0 rounded px-1 py-px text-[8px] font-medium text-[#3A3A3A] transition-colors duration-100 group-hover/asset:text-[#555]">
                              {asset.category}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-[11px] text-[#555]">No assets found.</div>
                );
              })()
            )}
          </div>
        </div>
      ) : !aiMode ? (
        <>
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[#333] bg-[#2A2A2A] px-2.5">
            <IconSearch size={13} strokeWidth={1.8} />
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
              <IconWand size={14} />
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
                    onClick={() => {
                      if (item.title === "Add components") { setComponentsMode(true); setComponentSearch(""); }
                      else if (item.title === "Checklist") setChecklistMode(true);
                      else if (item.title === "Image library") { setLibraryMode("images"); setLibrarySearch(""); setLibraryExpanded(false); }
                      else if (item.title === "Icon library") { setLibraryMode("icons"); setLibrarySearch(""); setLibraryExpanded(false); }
                      else if (item.title === "TMB Assets Library") { setLibraryMode("tmb"); setLibrarySearch(""); setTmbCategory(TMB_ASSET_CATEGORIES[0]); setLibraryExpanded(false); }
                    }}
                    className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-[90ms] hover:bg-[#2A2A2A]"
                  >
                    <span className="grid h-4 w-4 shrink-0 place-items-center text-[#CFCFCF]">
                      {ACTION_ICONS[item.title] ?? <IconPlus size={12} strokeWidth={1.8} />}
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
                  <IconChevronDoubleUp />
                </button>
              )}
              <button
                type="button"
                aria-label="AI chat settings"
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <IconSettings size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="Expand conversation"
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <IconExpand size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="Close AI chat"
                onClick={() => { setAiMode(false); setTagsExpanded(false); }}
                className="grid h-6 w-6 place-items-center rounded-md text-[#555] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
              >
                <IconClose size={11} strokeWidth={2} />
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
                      <IconClose size={8} strokeWidth={2.5} />
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
                        <IconSparkles size={10} strokeWidth={1.8} className="text-white" />
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
                      <IconClose size={8} strokeWidth={2.5} />
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
                    <IconTrash size={12} strokeWidth={1.8} />
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
                <IconMicrophone size={12} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="Send"
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 ${recording ? "text-[#E05555] hover:bg-[#3A1818] hover:text-[#FF7070]" : "text-[#505050] hover:bg-[#333] hover:text-[#CFCFCF]"}`}
              >
                <IconSend size={13} strokeWidth={1.8} />
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
