import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Monitor, RotateCcw, Smartphone } from "lucide-react";

import type { SplitMode } from "@/canvas/Canvas";
import { EditorBridgePublisher } from "@/canvas/engine/bridge";
import { CURRENT_CANVAS_STORAGE_KEY, DRAFTS_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";
import { EditorProvider, useEditor } from "@/canvas/engine/store";
import { createDraftDocument } from "@/canvas/engine/actions";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, getViewportZoomLimits } from "@/canvas/engine/viewport";
import type { ZoomLimits } from "@/canvas/engine/viewport";
import { canvasSizeForProjectType } from "@/canvas/canvasUtils";
import type { ShellControlVisibility } from "./inspector/ShellTab";
import { CanvasStage } from "../stage/CanvasStage";
import type { CanvasToolId } from "@/canvas/tools";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

function shellVisibilityStyle(v: ShellControlVisibility, localHovered: boolean): CSSProperties {
  if (v === "hidden") return { opacity: 0, pointerEvents: "none" };
  if (v === "hover") return { opacity: localHovered ? 1 : 0, transition: "opacity 150ms" };
  return {};
}

export type ScreenOverlayAlignment = "center" | "origin";

export type ScreenOverlay = {
  width: number;
  height: number;
  borderRadius: number;
  alignment: ScreenOverlayAlignment;
  originPosition: { x: number; y: number } | null;
};

const GAP = 8;
const TREE_WIDTH = 300;
const INSPECTOR_WIDTH = 280;
const PANEL_MARGIN = 12;

const HEADER_HEIGHT = 64;

export type ZoomSetter = (next: number | ((zoom: number) => number)) => void;
type CanvasParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function CanvasRender({
  treeOpen,
  inspectorOpen,
  split,
  activeTab,
  expanded,
  activeTool,
  currentDocument,
  currentStorageKey = CURRENT_CANVAS_STORAGE_KEY,
  currentReady = true,
  projectType = "desktop",
  parentTarget,
  isComponent = false,
  componentOriginPosition = null,
  shellDeviceVisibility = "show",
  shellBackVisibility = "show",
  shellZoomVisibility = "show",
  shellExpandVisibility = "hover",
  onCurrentDocumentChange,
  onActiveCanvasChange,
  onToggleExpand,
  onBackToParent,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
}: {
  treeOpen: boolean;
  inspectorOpen: boolean;
  split: SplitMode;
  activeTab?: "current" | "drafts";
  expanded: boolean;
  activeTool?: string;
  currentDocument?: CanvasDocument;
  currentStorageKey?: string;
  currentReady?: boolean;
  projectType?: ProjectType;
  parentTarget?: CanvasParentTarget | null;
  isComponent?: boolean;
  componentOriginPosition?: { x: number; y: number } | null;
  shellDeviceVisibility?: ShellControlVisibility;
  shellBackVisibility?: ShellControlVisibility;
  shellZoomVisibility?: ShellControlVisibility;
  shellExpandVisibility?: ShellControlVisibility;
  onCurrentDocumentChange?: (document: CanvasDocument) => void;
  onActiveCanvasChange?: (canvas: "left" | "right") => void;
  onToggleExpand?: () => void;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
}) {
  const activeCanvas = split !== "none" && activeTab === "drafts" ? "right" : "left";

  const left   = expanded ? 0 : (treeOpen     ? PANEL_MARGIN + TREE_WIDTH + GAP      : PANEL_MARGIN);
  const right  = expanded ? 0 : (inspectorOpen ? PANEL_MARGIN + INSPECTOR_WIDTH + GAP : PANEL_MARGIN);
  const top    = expanded ? 0 : HEADER_HEIGHT;
  const bottom = expanded ? 0 : 88;

  const btnTop   = expanded ? HEADER_HEIGHT + PANEL_MARGIN : PANEL_MARGIN;
  const btnRight = expanded
    ? (inspectorOpen ? PANEL_MARGIN + INSPECTOR_WIDTH + GAP + PANEL_MARGIN : PANEL_MARGIN)
    : PANEL_MARGIN;

  const draftsFallbackDoc = useMemo(() => {
    const w = Math.floor(window.innerWidth - 320 - 280 - 100);
    const h = Math.floor(window.innerHeight - 150);
    return createDraftDocument(Math.max(400, w), Math.max(300, h));
  }, []);

  return (
    <div
      className="fixed z-[2]"
      style={{
        left, right, top, bottom,
        transition: "left 220ms cubic-bezier(.2,.8,.2,1), right 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), bottom 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {split === "vertical" ? (
        <div className="absolute inset-0 flex gap-2">
          <CanvasSurface
            active={activeCanvas === "left"}
            showActiveBorder
            sourceId="current"
            publishBridge={activeCanvas === "left"}
            expanded={expanded}
            onClick={() => onActiveCanvasChange?.("left")}
            storageKey={currentStorageKey}
            draftMode={false}
            fallbackDocument={currentDocument}
            persistStorage={false}
            ready={currentReady}
            onDocumentChange={onCurrentDocumentChange}
            activeTool={activeTool}
            projectType={projectType}
            parentTarget={parentTarget}
            isComponent={isComponent}
            componentOriginPosition={componentOriginPosition}
            shellDeviceVisibility={shellDeviceVisibility}
            shellBackVisibility={shellBackVisibility}
            shellZoomVisibility={shellZoomVisibility}
            onBackToParent={onBackToParent}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={onOpenSelectedComponentShortcut}
          />
          <CanvasSurface
            active={activeCanvas === "right"}
            showActiveBorder
            sourceId="drafts"
            publishBridge={activeCanvas === "right"}
            expanded={expanded}
            onClick={() => onActiveCanvasChange?.("right")}
            storageKey={DRAFTS_CANVAS_STORAGE_KEY}
            draftMode
            fallbackDocument={draftsFallbackDoc}
            activeTool={activeTool}
            projectType={projectType}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={undefined}
          />
        </div>
      ) : split === "horizontal" ? (
        <div className="absolute inset-0 flex flex-col gap-2">
          <CanvasSurface
            active={activeCanvas === "left"}
            showActiveBorder
            sourceId="current"
            publishBridge={activeCanvas === "left"}
            expanded={expanded}
            onClick={() => onActiveCanvasChange?.("left")}
            storageKey={currentStorageKey}
            draftMode={false}
            fallbackDocument={currentDocument}
            persistStorage={false}
            ready={currentReady}
            onDocumentChange={onCurrentDocumentChange}
            activeTool={activeTool}
            projectType={projectType}
            parentTarget={parentTarget}
            isComponent={isComponent}
            componentOriginPosition={componentOriginPosition}
            shellDeviceVisibility={shellDeviceVisibility}
            shellBackVisibility={shellBackVisibility}
            shellZoomVisibility={shellZoomVisibility}
            onBackToParent={onBackToParent}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={onOpenSelectedComponentShortcut}
          />
          <CanvasSurface
            active={activeCanvas === "right"}
            showActiveBorder
            sourceId="drafts"
            publishBridge={activeCanvas === "right"}
            expanded={expanded}
            onClick={() => onActiveCanvasChange?.("right")}
            storageKey={DRAFTS_CANVAS_STORAGE_KEY}
            draftMode
            fallbackDocument={draftsFallbackDoc}
            activeTool={activeTool}
            projectType={projectType}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={undefined}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex">
          {activeTab === "drafts" ? (
            <CanvasSurface
              active
              showActiveBorder={false}
              sourceId="drafts"
              publishBridge
              expanded={expanded}
              storageKey={DRAFTS_CANVAS_STORAGE_KEY}
              draftMode
              fallbackDocument={draftsFallbackDoc}
              activeTool={activeTool}
              projectType={projectType}
              settings={settings}
              onCanvasToolShortcut={onCanvasToolShortcut}
              onOpenSelectedComponentShortcut={undefined}
            />
          ) : (
            <CanvasSurface
              active
              showActiveBorder={false}
              sourceId="current"
              publishBridge
              expanded={expanded}
              storageKey={currentStorageKey}
              draftMode={false}
              fallbackDocument={currentDocument}
              persistStorage={false}
              ready={currentReady}
              onDocumentChange={onCurrentDocumentChange}
              activeTool={activeTool}
              projectType={projectType}
              parentTarget={parentTarget}
              isComponent={isComponent}
              componentOriginPosition={componentOriginPosition}
              shellDeviceVisibility={shellDeviceVisibility}
              shellBackVisibility={shellBackVisibility}
              shellZoomVisibility={shellZoomVisibility}
              onBackToParent={onBackToParent}
              settings={settings}
              onCanvasToolShortcut={onCanvasToolShortcut}
              onOpenSelectedComponentShortcut={onOpenSelectedComponentShortcut}
            />
          )}
        </div>
      )}

      {!expanded && shellExpandVisibility !== "hidden" && (
        <ExpandButton
          shellExpandVisibility={shellExpandVisibility}
          btnTop={btnTop}
          btnRight={btnRight}
          onClick={onToggleExpand}
        />
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function ExpandButton({
  shellExpandVisibility,
  btnTop,
  btnRight,
  onClick,
}: {
  shellExpandVisibility: ShellControlVisibility;
  btnTop: number;
  btnRight: number;
  onClick?: () => void;
}) {
  const [localHovered, setLocalHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Expand canvas"
      className="absolute grid h-7 w-7 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] text-[#888] transition-opacity duration-150 hover:text-[#CFCFCF]"
      style={{
        top: btnTop,
        right: btnRight,
        ...shellVisibilityStyle(shellExpandVisibility, localHovered),
        boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
        zIndex: 10,
      }}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      <ExpandIcon />
    </button>
  );
}

function CanvasSurface({
  active,
  showActiveBorder,
  onClick,
  expanded,
  storageKey,
  draftMode,
  fallbackDocument,
  persistStorage = true,
  ready = true,
  onDocumentChange,
  activeTool,
  sourceId,
  publishBridge,
  projectType,
  parentTarget,
  isComponent = false,
  componentOriginPosition = null,
  shellDeviceVisibility = "show",
  shellBackVisibility = "show",
  shellZoomVisibility = "show",
  onBackToParent,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
}: {
  active: boolean;
  showActiveBorder: boolean;
  onClick?: () => void;
  expanded?: boolean;
  storageKey: string;
  draftMode: boolean;
  fallbackDocument?: CanvasDocument;
  persistStorage?: boolean;
  ready?: boolean;
  onDocumentChange?: (document: CanvasDocument) => void;
  activeTool?: string;
  sourceId: string;
  publishBridge: boolean;
  projectType: ProjectType;
  parentTarget?: CanvasParentTarget | null;
  isComponent?: boolean;
  componentOriginPosition?: { x: number; y: number } | null;
  shellDeviceVisibility?: ShellControlVisibility;
  shellBackVisibility?: ShellControlVisibility;
  shellZoomVisibility?: ShellControlVisibility;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
}) {
  const viewportSubjectKey = storageKey;
  const [screenOverlayEnabled, setScreenOverlayEnabled] = useState(false);
  const [screenOverlayAlignment, setScreenOverlayAlignment] = useState<ScreenOverlayAlignment>("center");

  useEffect(() => {
    setScreenOverlayEnabled(false);
  }, [storageKey]);

  const screenOverlay: ScreenOverlay | null = screenOverlayEnabled
    ? {
        ...canvasSizeForProjectType(projectType),
        borderRadius: projectType === "desktop" ? 0 : 32,
        alignment: screenOverlayAlignment,
        originPosition: componentOriginPosition ?? null,
      }
    : null;
  const shortcutEnabled = active && !draftMode;
  const openSelectedComponentShortcut = shortcutEnabled ? onOpenSelectedComponentShortcut : undefined;
  const backToParentShortcut =
    shortcutEnabled && parentTarget && onBackToParent
      ? () => {
          onBackToParent();
          return true;
        }
      : undefined;
  const toggleScreenOverlayShortcut =
    shortcutEnabled && isComponent
      ? () => {
          setScreenOverlayEnabled((enabled) => !enabled);
          return true;
        }
      : undefined;

  return (
    <div
      className="relative flex-1 cursor-default overflow-hidden rounded-xl border transition-all duration-150"
      style={{
        borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "#2A2A2A",
        backgroundColor: "#141615",
        boxShadow: active && showActiveBorder
          ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
          : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
      }}
      onClick={onClick}
    >
      {ready ? (
        <EditorProvider
          key={storageKey}
          storageKey={storageKey}
          fallbackDocument={fallbackDocument}
          persistStorage={persistStorage}
          viewportMode={draftMode ? "draft" : "frame"}
          onDocumentChange={onDocumentChange}
        >
          <EditorBridgePublisher sourceId={sourceId} active={publishBridge} />
          <CanvasStage
            draftMode={draftMode}
            activeTool={activeTool}
            viewportSubjectKey={viewportSubjectKey}
            screenOverlay={screenOverlay}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={openSelectedComponentShortcut}
            onBackToParentShortcut={backToParentShortcut}
            onToggleScreenOverlayShortcut={toggleScreenOverlayShortcut}
          />
          {!draftMode && parentTarget && shellBackVisibility !== "hidden" ? (
            <CanvasParentBackButton
              parentTarget={parentTarget}
              visibility={shellBackVisibility}
              onBack={onBackToParent}
            />
          ) : null}
          {!expanded ? (
            <SurfaceCanvasControls
              projectType={projectType}
              isComponent={isComponent}
              screenOverlayEnabled={screenOverlayEnabled}
              screenOverlayAlignment={screenOverlayAlignment}
              shellDeviceVisibility={shellDeviceVisibility}
              shellZoomVisibility={shellZoomVisibility}
              onToggleScreenOverlay={() => setScreenOverlayEnabled((v) => !v)}
              onChangeScreenOverlayAlignment={setScreenOverlayAlignment}
            />
          ) : null}
        </EditorProvider>
      ) : (
        <div className="grid h-full w-full place-items-center text-[12px] text-[#777]">
          Carregando cena...
        </div>
      )}
    </div>
  );
}

function CanvasParentBackButton({
  parentTarget,
  visibility,
  onBack,
}: {
  parentTarget: CanvasParentTarget;
  visibility: ShellControlVisibility;
  onBack?: () => void;
}) {
  const [localHovered, setLocalHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onBack?.();
      }}
      className="group absolute left-3 top-3 z-[10] flex max-w-[192px] items-center gap-2.5 rounded-lg border border-[#2A2A2A] bg-[#171717]/95 px-3 py-2 text-left text-[#8E8E8E] transition-colors duration-[100ms] hover:bg-[#202020] hover:text-[#F2F2F2]"
      style={{
        ...shellVisibilityStyle(visibility, localHovered),
        boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 5px 14px rgba(0,0,0,0.36)",
      }}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded text-[#6A6A6A] transition-colors duration-[100ms] group-hover:text-[#BCBCBC]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[8px] font-medium uppercase tracking-[0.08em] leading-none text-[#5E5E5E] transition-colors duration-[100ms] group-hover:text-[#767676]">
          Voltar para
        </span>
        <span className="truncate text-[12px] font-semibold leading-[1.1] text-[#DEDEDE]">
          {parentTarget.name}
        </span>
      </span>
      <span
        aria-hidden
        className="ml-1 h-4 w-px shrink-0 bg-[#323232] transition-colors duration-[100ms] group-hover:bg-[#4A4A4A]"
      />
      <span className="ml-1 shrink-0 text-[#5B5B5B] transition-colors duration-[100ms] group-hover:text-[#808080]">
        {parentTarget.kind === "screen" ? <ParentScreenIcon /> : <ParentComponentIcon />}
      </span>
    </button>
  );
}

function ParentScreenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function ParentComponentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SurfaceCanvasControls({
  projectType,
  isComponent,
  screenOverlayEnabled,
  screenOverlayAlignment,
  shellDeviceVisibility,
  shellZoomVisibility,
  onToggleScreenOverlay,
  onChangeScreenOverlayAlignment,
}: {
  projectType: ProjectType;
  isComponent: boolean;
  screenOverlayEnabled: boolean;
  screenOverlayAlignment: ScreenOverlayAlignment;
  shellDeviceVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  onToggleScreenOverlay: () => void;
  onChangeScreenOverlayAlignment: (a: ScreenOverlayAlignment) => void;
}) {
  const { state, dispatch } = useEditor();
  const [menuOpen, setMenuOpen] = useState(false);
  const [localHovered, setLocalHovered] = useState(false);

  const setZoom: ZoomSetter = (next) => {
    const zoom = typeof next === "function" ? next(state.zoom) : next;
    dispatch({ type: "setZoom", zoom });
  };

  const deviceStyle = shellVisibilityStyle(shellDeviceVisibility, localHovered);
  const zoomStyle = shellVisibilityStyle(shellZoomVisibility, localHovered);

  return (
    <div
      className="absolute bottom-3 left-3 z-[10] flex items-center gap-2"
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      {menuOpen && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 9 }}
          onPointerDown={() => setMenuOpen(false)}
        />
      )}
      {isComponent && shellDeviceVisibility !== "hidden" && (
        <div className="relative" style={deviceStyle}>
          <DeviceButton
            overlayEnabled={screenOverlayEnabled}
            menuOpen={menuOpen}
            projectType={projectType}
            onToggleOverlay={onToggleScreenOverlay}
            onToggleMenu={() => setMenuOpen((v) => !v)}
          />
          {menuOpen && (
            <ScreenAlignmentMenu
              alignment={screenOverlayAlignment}
              onChange={(a) => {
                onChangeScreenOverlayAlignment(a);
                setMenuOpen(false);
              }}
            />
          )}
        </div>
      )}
      {shellZoomVisibility !== "hidden" && (
        <div style={zoomStyle}>
          <ZoomControl zoom={state.zoom} setZoom={setZoom} limits={getViewportZoomLimits(state.viewportMode)} />
        </div>
      )}
    </div>
  );
}

function DeviceButton({
  overlayEnabled,
  menuOpen,
  projectType,
  onToggleOverlay,
  onToggleMenu,
}: {
  overlayEnabled: boolean;
  menuOpen: boolean;
  projectType: ProjectType;
  onToggleOverlay: () => void;
  onToggleMenu: () => void;
}) {
  const isMobile = projectType === "mobile";
  const Icon = isMobile ? Smartphone : Monitor;
  const active = overlayEnabled;

  return (
    <div
      className={[
        "flex items-center overflow-hidden rounded-lg border transition-colors duration-[100ms]",
        active
          ? "border-[#0D99FF]/60 bg-[#0D99FF]/15 text-[#8CCBFF]"
          : "border-[#2C2C2C] bg-[#1A1A1A] text-[#CFCFCF]",
      ].join(" ")}
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)" }}
    >
      <button
        type="button"
        aria-label={`${overlayEnabled ? "Disable" : "Enable"} screen simulator`}
        aria-pressed={overlayEnabled}
        onClick={onToggleOverlay}
        className={[
          "grid h-[34px] w-[34px] shrink-0 place-items-center transition-colors duration-[100ms]",
          active ? "" : "hover:bg-[#2A2A2A]",
        ].join(" ")}
      >
        <Icon size={16} strokeWidth={1.8} />
      </button>

      <span
        className="block h-[18px] w-px shrink-0"
        style={{ background: active ? "rgba(13,153,255,0.25)" : "#2C2C2C" }}
      />

      <button
        type="button"
        aria-label="Screen position options"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
        className={[
          "grid h-[34px] w-[18px] shrink-0 place-items-center transition-colors duration-[100ms]",
          active
            ? "hover:bg-[#0D99FF]/20"
            : menuOpen
              ? "bg-[#2A2A2A] text-[#CFCFCF]"
              : "text-[#888] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]",
        ].join(" ")}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        >
          <path d="M2 6.5l3-3 3 3" />
        </svg>
      </button>
    </div>
  );
}

function ScreenAlignmentMenu({
  alignment,
  onChange,
}: {
  alignment: ScreenOverlayAlignment;
  onChange: (a: ScreenOverlayAlignment) => void;
}) {
  return (
    <div
      className="absolute bottom-[calc(100%+6px)] left-0 flex gap-1 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-1"
      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset", zIndex: 10 }}
    >
      <AlignmentOption
        active={alignment === "center"}
        label="Centralizado"
        onClick={() => onChange("center")}
        icon={<CenterAlignIcon />}
      />
      <AlignmentOption
        active={alignment === "origin"}
        label="Local original"
        onClick={() => onChange("origin")}
        icon={<OriginAlignIcon />}
      />
    </div>
  );
}

function AlignmentOption({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={[
          "grid h-[34px] w-[34px] place-items-center rounded-md border transition-colors duration-[100ms]",
          active
            ? "border-[#0D99FF]/60 bg-[#0D99FF]/15 text-[#8CCBFF]"
            : "border-transparent text-[#888] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]",
        ].join(" ")}
      >
        {icon}
      </button>
      <div
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#333] bg-[#1E1E1E] px-2 py-1 text-[10px] font-medium leading-none text-[#CFCFCF] opacity-0 transition-opacity duration-100 group-hover:opacity-100"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        {label}
      </div>
    </div>
  );
}

function CenterAlignIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="5.5" y="5.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

function OriginAlignIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="2.5" width="13" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function ZoomControl({
  zoom,
  setZoom,
  limits,
  bare,
}: {
  zoom: number;
  setZoom: ZoomSetter;
  limits?: ZoomLimits;
  bare?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftPercent, setDraftPercent] = useState(() => String(Math.round(zoom * 100)));
  const minZoom = limits?.min ?? MIN_ZOOM;
  const maxZoom = limits?.max ?? MAX_ZOOM;
  const zoomStep = limits?.step ?? ZOOM_STEP;
  const canIn    = zoom < maxZoom - 1e-6;
  const canOut   = zoom > minZoom + 1e-6;
  const canReset = Math.abs(zoom - 1) > 1e-6;
  const clampedPercentMin = Math.round(minZoom * 100);
  const clampedPercentMax = Math.round(maxZoom * 100);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) return;
    setDraftPercent(String(Math.round(zoom * 100)));
  }, [menuOpen, zoom]);

  const commitDraftPercent = () => {
    const raw = Number.parseFloat(draftPercent.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(raw)) {
      setDraftPercent(String(Math.round(zoom * 100)));
      return;
    }
    const nextPercent = Math.max(clampedPercentMin, Math.min(clampedPercentMax, Math.round(raw)));
    setZoom(+(nextPercent / 100).toFixed(4));
    setDraftPercent(String(nextPercent));
  };

  const buttons = (
    <>
      <ZoomBtn active={canOut} ariaLabel="Diminuir zoom" onClick={() => setZoom((z) => Math.max(minZoom, +(z - zoomStep).toFixed(4)))}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </ZoomBtn>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Zoom options"
          aria-expanded={menuOpen}
          className={[
            "inline-flex h-[26px] min-w-[52px] items-center justify-center rounded-md border-0 px-2 text-[11.5px] font-medium tracking-[0.2px] transition-colors duration-[100ms]",
            menuOpen
              ? "bg-[#2A2A2A] text-[#F2F2F2]"
              : canReset
                ? "cursor-pointer bg-transparent text-[#CFCFCF] hover:bg-[#2A2A2A]"
                : "cursor-pointer bg-transparent text-[#7A7A7A] hover:bg-[#2A2A2A] hover:text-[#A0A0A0]",
          ].join(" ")}
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        {menuOpen && (
          <div
            className="absolute bottom-[calc(100%+6px)] left-1/2 z-20 -translate-x-1/2 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-1.5"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset" }}
          >
            <div className="flex items-center gap-1">
              <label className="relative block">
                <input
                  aria-label="Zoom percent"
                  value={draftPercent}
                  onChange={(event) => setDraftPercent(event.target.value)}
                  onBlur={commitDraftPercent}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitDraftPercent();
                      setMenuOpen(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setDraftPercent(String(Math.round(zoom * 100)));
                      setMenuOpen(false);
                    }
                  }}
                  inputMode="numeric"
                  className="h-[26px] w-[70px] rounded-md border border-[#343434] bg-[#141414] px-2 pr-5 text-[11.5px] text-[#E2E2E2] outline-none shadow-none transition-colors focus:border-[#0D99FF]/70"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#8A8A8A]">%</span>
              </label>
              <button
                type="button"
                aria-label="Reset zoom"
                disabled={!canReset}
                onClick={() => {
                  setZoom(1);
                  setDraftPercent("100");
                }}
                className={[
                  "grid h-[26px] w-[26px] place-items-center rounded-md border text-[11px] font-medium shadow-none transition-colors duration-[100ms]",
                  canReset
                    ? "cursor-pointer border-[#3A3A3A] bg-[#202020] text-[#D2D2D2] hover:bg-[#2A2A2A]"
                    : "cursor-not-allowed border-[#2F2F2F] bg-[#191919] text-[#6C6C6C]",
                ].join(" ")}
              >
                <RotateCcw size={13} strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}
      </div>
      <ZoomBtn active={canIn} ariaLabel="Aumentar zoom" onClick={() => setZoom((z) => Math.min(maxZoom, +(z + zoomStep).toFixed(4)))}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ZoomBtn>
    </>
  );

  if (bare) {
    return (
      <div ref={containerRef} role="group" aria-label="Controle de zoom" className="inline-flex items-center gap-0.5" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {buttons}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Zoom control"
      className="inline-flex items-center gap-0.5 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-[3px]"
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {buttons}
    </div>
  );
}

function ZoomBtn({
  active,
  ariaLabel,
  onClick,
  children,
}: {
  active: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={active ? onClick : undefined}
      disabled={!active}
      aria-label={ariaLabel}
      className={[
        "grid h-[26px] w-[26px] place-items-center rounded-md border-0 bg-transparent transition-colors duration-[100ms]",
        active ? "cursor-pointer text-[#CFCFCF] hover:bg-[#2A2A2A]" : "cursor-not-allowed text-[#4A4A4A]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
