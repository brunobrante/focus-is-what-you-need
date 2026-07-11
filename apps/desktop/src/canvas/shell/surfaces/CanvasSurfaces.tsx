import { useState } from "react";
import { Monitor, MoveHorizontal, MoveVertical, Smartphone } from "lucide-react";
import { IconPlus } from "@/components/icons";
import { ScreenPagesPreview } from "./ScreenPagesPreview";
import {
  IconChevronLeft,
  IconGrid, IconScreen, IconWindow,
} from "@/components/icons";

import { EditorBridgePublisher } from "@/canvas/engine/bridge";
import { EditorProvider, useEditor } from "@/canvas/engine/store";
import type { Clipboard } from "@/canvas/engine/clipboard";
import { LiveInstanceRefresh } from "./LiveInstanceRefresh";
import type { CanvasDocument, ContentAxis } from "@/canvas/engine/types";
import { getContentPages } from "@/canvas/engine/geometry";
import type { ProjectType } from "@/lib/data/types";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import { ZoomControl, type ZoomSetter } from "../ZoomControl";
import {
  CANVAS_WINDOW_LABELS,
  type AncestorFrame,
  type CanvasFeatureWindowType,
  type CanvasWindowKey,
} from "@/canvas/canvasUtils";
import { useSubjectCanvasWindow, type SubjectOwner } from "@/canvas/hooks/useSubjectCanvasWindow";
import type { ShellControlVisibility } from "../inspector/ShellTab";
import { CanvasStage } from "../../stage/CanvasStage";
import { useWindowContextMenu, WindowContextMenu } from "../../stage/WindowContextMenu";
import type { CanvasToolId } from "@/canvas/tools";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import { shellVisibilityStyle } from "./shellVisibility";

export type CanvasParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function CanvasPlaceholderSurface({
  active,
  showActiveBorder,
  windowType,
  onClick,
}: {
  active: boolean;
  showActiveBorder: boolean;
  windowType: CanvasFeatureWindowType;
  onClick?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick?.();
      }}
      className="relative flex flex-1 cursor-default items-center justify-center overflow-hidden rounded-xl border text-left transition-all duration-150"
      style={{
        borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "var(--border)",
        backgroundColor: "#171717",
        boxShadow: active && showActiveBorder
          ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
          : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <span className="flex flex-col items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
          <IconWindow />
        </span>
        <span className="text-[13px] font-semibold text-[var(--text)]">
          {CANVAS_WINDOW_LABELS[windowType]}
        </span>
        <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
          No canvas yet
        </span>
      </span>
    </div>
  );
}

// The Versions window: a persistent editable clone of Current, bound to the version
// selected in the layers-tree header dropdown (no in-canvas selector). Empty when the
// current subject has no versions yet.
export function VersionsWindowSurface({
  active,
  showActiveBorder,
  expanded,
  onClick,
  document,
  storageKey,
  ready,
  onDocumentChange,
  activeTool,
  projectType,
  shellDeviceVisibility,
  shellZoomVisibility,
  settings,
  onCanvasToolShortcut,
  clipboard,
}: {
  active: boolean;
  showActiveBorder: boolean;
  expanded?: boolean;
  onClick?: () => void;
  document?: CanvasDocument;
  storageKey: string;
  ready: boolean;
  onDocumentChange?: (document: CanvasDocument) => void;
  activeTool?: string;
  projectType: ProjectType;
  shellDeviceVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  settings: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  clipboard?: Clipboard;
}) {
  const versionsMenu = useWindowContextMenu();
  // No version selected (the current subject has no versions yet) → empty state.
  if (!document) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onContextMenu={versionsMenu.onContextMenu}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onClick?.();
        }}
        className="relative flex flex-1 cursor-default items-center justify-center overflow-hidden rounded-xl border text-left transition-all duration-150"
        style={{
          borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "var(--border)",
          backgroundColor: "#171717",
          boxShadow: active && showActiveBorder
            ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
            : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <span className="flex flex-col items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
            <IconWindow />
          </span>
          <span className="text-[13px] font-semibold text-[var(--text)]">Versions</span>
          <span className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
            No versions yet
          </span>
        </span>
        {versionsMenu.menu ? (
          <WindowContextMenu menu={versionsMenu.menu} onClose={versionsMenu.closeMenu} />
        ) : null}
      </div>
    );
  }

  return (
    <CanvasSurface
      active={active}
      showActiveBorder={showActiveBorder}
      sourceId="versions"
      publishBridge={active}
      expanded={expanded}
      onClick={onClick}
      storageKey={storageKey}
      draftMode={false}
      fallbackDocument={document}
      persistStorage={false}
      ready={ready}
      onDocumentChange={onDocumentChange}
      activeTool={activeTool}
      projectType={projectType}
      shellDeviceVisibility={shellDeviceVisibility}
      shellBackVisibility="hidden"
      shellZoomVisibility={shellZoomVisibility}
      settings={settings}
      onCanvasToolShortcut={onCanvasToolShortcut}
      onOpenSelectedComponentShortcut={undefined}
      clipboard={clipboard}
    />
  );
}

// An extra "Current" window: an independent editable clone of the Current surface
// bound to its own subject (mirrored from the primary Current, then retargetable).
// It loads/persists its own scene via useSubjectCanvasWindow, so it gets its own
// editor and viewport. Session-only — persistStorage is off.
export function ExtraCurrentSurface({
  windowKey,
  subject,
  active,
  showActiveBorder,
  expanded,
  onClick,
  activeTool,
  projectType,
  shellDeviceVisibility,
  shellZoomVisibility,
  settings,
  onCanvasToolShortcut,
  clipboard,
}: {
  windowKey: CanvasWindowKey;
  subject: SubjectOwner | null;
  active: boolean;
  showActiveBorder: boolean;
  expanded?: boolean;
  onClick?: () => void;
  activeTool?: string;
  projectType: ProjectType;
  shellDeviceVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  settings: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  clipboard?: Clipboard;
}) {
  const { document, storageKey, ready, onDocumentChange } = useSubjectCanvasWindow({
    subjectOwner: subject,
    storageKeyPrefix: windowKey,
    projectType,
    canvasName: "Current",
  });

  return (
    <CanvasSurface
      active={active}
      showActiveBorder={showActiveBorder}
      sourceId={windowKey}
      publishBridge={active}
      expanded={expanded}
      onClick={onClick}
      storageKey={storageKey}
      draftMode={false}
      fallbackDocument={document}
      persistStorage={false}
      ready={ready}
      onDocumentChange={onDocumentChange}
      activeTool={activeTool}
      projectType={projectType}
      shellDeviceVisibility={shellDeviceVisibility}
      shellBackVisibility="hidden"
      shellZoomVisibility={shellZoomVisibility}
      settings={settings}
      onCanvasToolShortcut={onCanvasToolShortcut}
      onOpenSelectedComponentShortcut={undefined}
      clipboard={clipboard}
    />
  );
}

export function CanvasSurface({
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
  ancestorFrames = [],
  shellDeviceVisibility = "show",
  shellBackVisibility = "show",
  shellZoomVisibility = "show",
  onBackToParent,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
  isIconSubject = false,
  clipboard,
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
  ancestorFrames?: AncestorFrame[];
  shellDeviceVisibility?: ShellControlVisibility;
  shellBackVisibility?: ShellControlVisibility;
  shellZoomVisibility?: ShellControlVisibility;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  // Icon-master canvas: SVG paste decomposes into root paths (see useCanvasPointerEvents).
  isIconSubject?: boolean;
  // Shell-shared element clipboard (see EditorProvider) — lets copy in one pane
  // paste in another (Sketch → Current) and survive tab switches.
  clipboard?: Clipboard;
}) {
  const viewportSubjectKey = storageKey;
  const hasAncestors = ancestorFrames.length > 0;
  const shortcutEnabled = active && !draftMode;
  const openSelectedComponentShortcut = shortcutEnabled ? onOpenSelectedComponentShortcut : undefined;
  const backToParentShortcut =
    shortcutEnabled && parentTarget && onBackToParent
      ? () => {
          onBackToParent();
          return true;
        }
      : undefined;
  const showSurfaceCanvasControls =
    !expanded &&
    (shellZoomVisibility !== "hidden" || (isComponent && hasAncestors && shellDeviceVisibility !== "hidden"));

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
          clipboard={clipboard}
        >
          <EditorBridgePublisher sourceId={sourceId} active={publishBridge} />
          <LiveInstanceRefresh />
          <CanvasStage
            draftMode={draftMode}
            activeTool={activeTool}
            viewportSubjectKey={viewportSubjectKey}
            ancestorFrames={ancestorFrames}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={openSelectedComponentShortcut}
            onBackToParentShortcut={backToParentShortcut}
            isIconSubject={isIconSubject}
            shortcutsEnabled={active}
          />
          {!draftMode && parentTarget && shellBackVisibility !== "hidden" ? (
            <CanvasParentBackButton
              parentTarget={parentTarget}
              visibility={shellBackVisibility}
              onBack={onBackToParent}
            />
          ) : null}
          {showSurfaceCanvasControls ? (
            <SurfaceCanvasControls
              projectType={projectType}
              isComponent={isComponent}
              hasAncestors={hasAncestors}
              shellDeviceVisibility={shellDeviceVisibility}
              shellZoomVisibility={shellZoomVisibility}
              allowScreenPages={!draftMode && !isIconSubject}
            />
          ) : null}
          {/* Pages work for screens AND components (the frame is the window in
              both); only icon masters (fixed 24×24 artboards) and the freeform
              draft canvas opt out. */}
          {!draftMode && !isIconSubject ? <ScreenPagesPreview /> : null}
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
        <IconChevronLeft />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[8px] font-medium uppercase tracking-[0.08em] leading-none text-[#5E5E5E] transition-colors duration-[100ms] group-hover:text-[#767676]">
          Back to
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
  return <IconScreen />;
}

function ParentComponentIcon() {
  return <IconGrid />;
}

function SurfaceCanvasControls({
  projectType,
  isComponent,
  hasAncestors,
  shellDeviceVisibility,
  shellZoomVisibility,
  allowScreenPages,
}: {
  projectType: ProjectType;
  isComponent: boolean;
  hasAncestors: boolean;
  shellDeviceVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
  allowScreenPages?: boolean;
}) {
  const { state, dispatch } = useEditor();
  const [localHovered, setLocalHovered] = useState(false);
  const pages = getContentPages(state.document);

  const setZoom: ZoomSetter = (next) => {
    const zoom = typeof next === "function" ? next(state.zoom) : next;
    dispatch({ type: "setZoom", zoom });
  };

  const overlayEnabled = state.ancestorOverlay.enabled;
  const deviceStyle = shellVisibilityStyle(shellDeviceVisibility, localHovered);
  const zoomStyle = shellVisibilityStyle(shellZoomVisibility, localHovered);

  return (
    <div
      className="absolute bottom-3 left-3 z-[20] flex items-center gap-2"
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      {isComponent && hasAncestors && shellDeviceVisibility !== "hidden" && (
        <div className="relative" style={deviceStyle}>
          <DeviceButton
            overlayEnabled={overlayEnabled}
            projectType={projectType}
            onToggleOverlay={() => dispatch({ type: "setAncestorOverlayEnabled", enabled: !overlayEnabled })}
          />
        </div>
      )}
      {shellZoomVisibility !== "hidden" && (
        <div style={zoomStyle}>
          <ZoomControl zoom={state.zoom} setZoom={setZoom} limits={getViewportZoomLimits(state.viewportMode)} />
        </div>
      )}
      {allowScreenPages && <AddPageButton pages={pages} dispatch={dispatch} />}
    </div>
  );
}

// The screen-pages "+" pill. With no extra pages yet the direction is still
// free, so the click opens a small drop to pick vertical or horizontal; once
// pages exist the direction is locked to the current axis and the click adds
// straight away.
function AddPageButton({ pages, dispatch }: { pages: number; dispatch: ReturnType<typeof useEditor>["dispatch"] }) {
  const [axisMenuOpen, setAxisMenuOpen] = useState(false);

  const addPage = (axis?: ContentAxis) => {
    setAxisMenuOpen(false);
    dispatch({ type: "setContentPages", pages: pages + 1, ...(axis ? { axis } : {}) });
  };

  return (
    <div
      className="relative flex items-center gap-1 rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-[3px]"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)" }}
    >
      <button
        type="button"
        aria-label="Adicionar página"
        onClick={() => (pages > 1 ? addPage() : setAxisMenuOpen((open) => !open))}
        className="grid h-[26px] w-[26px] place-items-center rounded-md text-[#CFCFCF] transition-colors duration-[100ms] hover:bg-[#2A2A2A]"
      >
        <IconPlus size={15} strokeWidth={2} />
      </button>
      {axisMenuOpen && (
        <>
          {/* Click-away catcher: closes the drop without touching the canvas. */}
          <div className="fixed inset-0 z-[29]" onPointerDown={() => setAxisMenuOpen(false)} />
          <div
            className="absolute bottom-[calc(100%+6px)] left-0 z-[30] flex min-w-[148px] flex-col rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] p-1"
            style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.5)" }}
          >
            <button
              type="button"
              onClick={() => addPage("vertical")}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-[#CFCFCF] transition-colors duration-[100ms] hover:bg-[#2A2A2A] hover:text-white"
            >
              <MoveVertical size={13} strokeWidth={1.8} />
              Vertical
            </button>
            <button
              type="button"
              onClick={() => addPage("horizontal")}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-[#CFCFCF] transition-colors duration-[100ms] hover:bg-[#2A2A2A] hover:text-white"
            >
              <MoveHorizontal size={13} strokeWidth={1.8} />
              Horizontal
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DeviceButton({
  overlayEnabled,
  projectType,
  onToggleOverlay,
}: {
  overlayEnabled: boolean;
  projectType: ProjectType;
  onToggleOverlay: () => void;
}) {
  const isMobile = projectType === "mobile";
  const Icon = isMobile ? Smartphone : Monitor;
  const active = overlayEnabled;

  return (
    <button
      type="button"
      aria-label={`${overlayEnabled ? "Ocultar" : "Mostrar"} elementos pai`}
      aria-pressed={overlayEnabled}
      onClick={onToggleOverlay}
      className={[
        "grid h-[34px] w-[34px] place-items-center rounded-lg border transition-colors duration-[100ms]",
        active
          ? "border-[#0D99FF]/60 bg-[#0D99FF]/15 text-[#8CCBFF]"
          : "border-[#2C2C2C] bg-[#1A1A1A] text-[#CFCFCF] hover:bg-[#2A2A2A]",
      ].join(" ")}
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.4)" }}
    >
      <Icon size={16} strokeWidth={1.8} />
    </button>
  );
}
