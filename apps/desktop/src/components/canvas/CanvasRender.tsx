import { useMemo, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

import type { SplitMode } from "@/routes/Canvas";
import { EditorBridgePublisher } from "@/lib/editor/bridge";
import { CURRENT_CANVAS_STORAGE_KEY, DRAFTS_CANVAS_STORAGE_KEY } from "@/lib/editor/storageKeys";
import { EditorProvider, useEditor } from "@/lib/editor/store";
import { createDraftDocument } from "@/lib/editor/actions";
import type { CanvasDocument } from "@/lib/editor/types";
import type { ProjectType } from "@/lib/data/types";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from "@/lib/editor/viewport";
import { CanvasStage } from "./editor/CanvasStage";

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
  onCurrentDocumentChange,
  onActiveCanvasChange,
  onToggleExpand,
  onBackToParent,
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
  onCurrentDocumentChange?: (document: CanvasDocument) => void;
  onActiveCanvasChange?: (canvas: "left" | "right") => void;
  onToggleExpand?: () => void;
  onBackToParent?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
            onBackToParent={onBackToParent}
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
            onBackToParent={onBackToParent}
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
              onBackToParent={onBackToParent}
            />
          )}
        </div>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label="Expandir canvas"
          className="absolute grid h-7 w-7 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] text-[#888] transition-opacity duration-150 hover:text-[#CFCFCF]"
          style={{
            top: btnTop,
            right: btnRight,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
            zIndex: 10,
          }}
        >
          <ExpandIcon />
        </button>
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
  onBackToParent,
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
  onBackToParent?: () => void;
}) {
  const viewportSubjectKey = storageKey;

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
          onDocumentChange={onDocumentChange}
        >
          <EditorBridgePublisher sourceId={sourceId} active={publishBridge} />
          <CanvasStage
            draftMode={draftMode}
            activeTool={activeTool}
            viewportSubjectKey={viewportSubjectKey}
          />
          {!draftMode && parentTarget ? (
            <CanvasParentBackButton parentTarget={parentTarget} onBack={onBackToParent} />
          ) : null}
          {!expanded ? <SurfaceCanvasControls projectType={projectType} /> : null}
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
  onBack,
}: {
  parentTarget: CanvasParentTarget;
  onBack?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onBack?.();
      }}
      className="group absolute left-3 top-3 z-[10] flex max-w-[180px] items-center gap-2 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A]/95 px-2 py-1.5 text-left text-[#9A9A9A] transition-colors duration-[100ms] hover:bg-[#242424] hover:text-[#F2F2F2]"
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 6px 18px rgba(0,0,0,0.42)",
      }}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[#6B6B6B] transition-colors duration-[100ms] group-hover:text-[#CFCFCF]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[9.5px] font-medium uppercase leading-none text-[#5A5A5A] transition-colors duration-[100ms] group-hover:text-[#777]">
          Voltar para
        </span>
        <span className="truncate text-[11.5px] font-medium leading-none text-[#CFCFCF]">
          {parentTarget.name}
        </span>
      </span>
      <span className="ml-1 shrink-0 text-[#5A5A5A] transition-colors duration-[100ms] group-hover:text-[#888]">
        {parentTarget.kind === "screen" ? <ParentScreenIcon /> : <ParentComponentIcon />}
      </span>
    </button>
  );
}

function ParentScreenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function ParentComponentIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SurfaceCanvasControls({ projectType }: { projectType: ProjectType }) {
  const { state, dispatch } = useEditor();
  const [deviceOverlayEnabled, setDeviceOverlayEnabled] = useState(false);

  const setZoom: ZoomSetter = (next) => {
    const zoom = typeof next === "function" ? next(state.zoom) : next;
    dispatch({ type: "setZoom", zoom });
  };

  return (
    <div className="absolute bottom-3 left-3 z-[10] flex items-center gap-2">
      <DeviceSwitch
        enabled={deviceOverlayEnabled}
        projectType={projectType}
        onToggle={() => setDeviceOverlayEnabled((value) => !value)}
      />
      <ZoomControl zoom={state.zoom} setZoom={setZoom} />
    </div>
  );
}

function DeviceSwitch({
  enabled,
  projectType,
  onToggle,
}: {
  enabled: boolean;
  projectType: ProjectType;
  onToggle: () => void;
}) {
  const isMobile = projectType === "mobile";
  const label = `${enabled ? "Desativar" : "Ativar"} modo ${isMobile ? "mobile" : "desktop"}`;
  const Icon = isMobile ? Smartphone : Monitor;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      onClick={onToggle}
      className={[
        "grid h-[34px] w-[34px] place-items-center rounded-lg border transition-colors duration-[100ms]",
        enabled
          ? "border-[#0D99FF]/60 bg-[#0D99FF]/15 text-[#8CCBFF]"
          : "border-[#2C2C2C] bg-[#1A1A1A] text-[#CFCFCF] hover:bg-[#2A2A2A]",
      ].join(" ")}
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );
}

export function ZoomControl({
  zoom,
  setZoom,
  bare,
}: {
  zoom: number;
  setZoom: ZoomSetter;
  bare?: boolean;
}) {
  const canIn    = zoom < MAX_ZOOM - 1e-6;
  const canOut   = zoom > MIN_ZOOM + 1e-6;
  const canReset = Math.abs(zoom - 1) > 1e-6;

  const buttons = (
    <>
      <ZoomBtn active={canOut} ariaLabel="Diminuir zoom" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(4)))}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </ZoomBtn>
      <button
        type="button"
        disabled={!canReset}
        onClick={() => setZoom(1)}
        aria-label="Resetar zoom"
        title="Resetar para 100%"
        className={[
          "inline-flex h-[26px] min-w-[52px] items-center justify-center rounded-md border-0 bg-transparent px-2 text-[11.5px] font-medium tracking-[0.2px]",
          canReset ? "cursor-pointer text-[#CFCFCF] hover:bg-[#2A2A2A]" : "cursor-default text-[#7A7A7A]",
        ].join(" ")}
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <ZoomBtn active={canIn} ariaLabel="Aumentar zoom" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(4)))}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ZoomBtn>
    </>
  );

  if (bare) {
    return (
      <div role="group" aria-label="Controle de zoom" className="inline-flex items-center gap-0.5" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {buttons}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Controle de zoom"
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
