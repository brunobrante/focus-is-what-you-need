import { useMemo, useState, type CSSProperties } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  IconChevronLeft, IconCollapse, IconExpand,
  IconGrid, IconScreen, IconWindow,
} from "@/components/icons";

import { EditorBridgePublisher } from "@/canvas/engine/bridge";
import { CURRENT_CANVAS_STORAGE_KEY, DRAFTS_CANVAS_STORAGE_KEY, VERSIONS_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";
import { EditorProvider, useEditor } from "@/canvas/engine/store";
import { createDraftDocument } from "@/canvas/engine/actions";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
import { getViewportZoomLimits } from "@/canvas/engine/viewport";
import { ZoomControl, type ZoomSetter } from "./ZoomControl";
export type { ZoomSetter } from "./ZoomControl";
import {
  CANVAS_WINDOW_LABELS,
  DEFAULT_PREVIEW_SETTINGS,
  isCurrentKey,
  normalizeCanvasSplitWindows,
  windowTypeOfKey,
  type AncestorFrame,
  type CanvasFeatureWindowType,
  type CanvasSplitWindows,
  type CanvasWindowKey,
  type CanvasWindowType,
  type PreviewSettings,
  type SplitMode,
} from "@/canvas/canvasUtils";
import { useSubjectCanvasWindow, type SubjectOwner } from "@/canvas/hooks/useSubjectCanvasWindow";
import type { ShellControlVisibility } from "./inspector/ShellTab";
import { CanvasReferencesWindow, type CanvasReferencesContext } from "./CanvasReferencesWindow";
import { CanvasPreviewSurface } from "./PreviewSurface";
import { CanvasStage } from "../stage/CanvasStage";
import type { CanvasToolId } from "@/canvas/tools";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";

function shellVisibilityStyle(v: ShellControlVisibility, localHovered: boolean): CSSProperties {
  if (v === "hidden") return { opacity: 0, pointerEvents: "none" };
  if (v === "hover") return { opacity: localHovered ? 1 : 0, transition: "opacity 150ms" };
  return {};
}

const GAP = 8;
const TREE_WIDTH = 300;
const INSPECTOR_WIDTH = 280;
const PANEL_MARGIN = 12;

const HEADER_HEIGHT = 64;

type CanvasParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function CanvasRender({
  treeOpen,
  inspectorOpen,
  split,
  activeTab = "current",
  enabledTabs = ["current", "drafts"],
  splitWindows = ["current", "drafts"],
  expanded,
  activeTool,
  currentDocument,
  currentStorageKey = CURRENT_CANVAS_STORAGE_KEY,
  currentReady = true,
  extraCurrents = [],
  versionsDocument,
  versionsStorageKey = VERSIONS_CANVAS_STORAGE_KEY,
  versionsReady = true,
  onVersionsDocumentChange,
  projectType = "desktop",
  parentTarget,
  isComponent = false,
  referencesContext = null,
  ancestorFrames = [],
  shellDeviceVisibility = "show",
  shellBackVisibility = "show",
  shellZoomVisibility = "show",
  shellExpandVisibility = "hover",
  previewSettings = DEFAULT_PREVIEW_SETTINGS,
  onClosePreview,
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
  activeTab?: CanvasWindowKey;
  enabledTabs?: readonly CanvasWindowType[];
  splitWindows?: readonly CanvasWindowKey[];
  expanded: boolean;
  activeTool?: string;
  currentDocument?: CanvasDocument;
  currentStorageKey?: string;
  currentReady?: boolean;
  extraCurrents?: ReadonlyArray<{ key: CanvasWindowKey; subject: SubjectOwner }>;
  versionsDocument?: CanvasDocument;
  versionsStorageKey?: string;
  versionsReady?: boolean;
  onVersionsDocumentChange?: (document: CanvasDocument) => void;
  projectType?: ProjectType;
  parentTarget?: CanvasParentTarget | null;
  isComponent?: boolean;
  referencesContext?: CanvasReferencesContext | null;
  ancestorFrames?: AncestorFrame[];
  shellDeviceVisibility?: ShellControlVisibility;
  shellBackVisibility?: ShellControlVisibility;
  shellZoomVisibility?: ShellControlVisibility;
  shellExpandVisibility?: ShellControlVisibility;
  previewSettings?: PreviewSettings;
  onClosePreview?: () => void;
  onCurrentDocumentChange?: (document: CanvasDocument) => void;
  onActiveCanvasChange?: (windowKey: CanvasWindowKey) => void;
  onToggleExpand?: () => void;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
}) {
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

  const isKeyRenderable = (key: CanvasWindowKey) =>
    isCurrentKey(key) || enabledTabs.includes(windowTypeOfKey(key));
  const selectedTab = isKeyRenderable(activeTab) ? activeTab : "current";
  const normalizedSplitWindows: CanvasSplitWindows = normalizeCanvasSplitWindows(
    splitWindows,
    enabledTabs,
  );
  const splitEnabled = split !== "none" && normalizedSplitWindows.length > 1;
  const renderedWindows = splitEnabled ? normalizedSplitWindows : [selectedTab];
  const activeWindow = renderedWindows.includes(selectedTab) ? selectedTab : renderedWindows[0];
  const surfaceDeviceVisibility = splitEnabled ? "hidden" : shellDeviceVisibility;
  const surfaceZoomVisibility = splitEnabled ? "hidden" : shellZoomVisibility;

  const renderCurrentSurface = (active: boolean, showActiveBorder: boolean) => (
    <CanvasSurface
      active={active}
      showActiveBorder={showActiveBorder}
      sourceId="current"
      publishBridge={active}
      expanded={expanded}
      onClick={() => onActiveCanvasChange?.("current")}
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
      ancestorFrames={ancestorFrames}
      shellDeviceVisibility={surfaceDeviceVisibility}
      shellBackVisibility={shellBackVisibility}
      shellZoomVisibility={surfaceZoomVisibility}
      onBackToParent={onBackToParent}
      settings={settings}
      onCanvasToolShortcut={onCanvasToolShortcut}
      onOpenSelectedComponentShortcut={onOpenSelectedComponentShortcut}
    />
  );

  const renderSecondarySurface = (
    windowType: CanvasFeatureWindowType,
    active: boolean,
    showActiveBorder: boolean,
  ) => {
    if (windowType === "drafts") {
      return (
        <CanvasSurface
          active={active}
          showActiveBorder={showActiveBorder}
          sourceId="drafts"
          publishBridge={active}
          expanded={expanded}
          onClick={() => onActiveCanvasChange?.("drafts")}
          storageKey={DRAFTS_CANVAS_STORAGE_KEY}
          draftMode
          fallbackDocument={draftsFallbackDoc}
          activeTool={activeTool}
          projectType={projectType}
          shellDeviceVisibility={surfaceDeviceVisibility}
          shellZoomVisibility={surfaceZoomVisibility}
          settings={settings}
          onCanvasToolShortcut={onCanvasToolShortcut}
          onOpenSelectedComponentShortcut={undefined}
        />
      );
    }

    if (windowType === "versions") {
      // A persistent clone of the Current surface, bound to the current subject's
      // variants. The selector switches which variant is shown/edited here.
      return (
        <VersionsWindowSurface
          active={active}
          showActiveBorder={showActiveBorder}
          expanded={expanded}
          onClick={() => onActiveCanvasChange?.("versions")}
          document={versionsDocument}
          storageKey={versionsStorageKey}
          ready={versionsReady}
          onDocumentChange={onVersionsDocumentChange}
          activeTool={activeTool}
          projectType={projectType}
          shellDeviceVisibility={surfaceDeviceVisibility}
          shellZoomVisibility={surfaceZoomVisibility}
          settings={settings}
          onCanvasToolShortcut={onCanvasToolShortcut}
        />
      );
    }

    if (windowType === "references" && referencesContext) {
      return (
        <CanvasReferencesWindow
          active={active}
          showActiveBorder={showActiveBorder}
          context={referencesContext}
          onClick={() => onActiveCanvasChange?.(windowType)}
        />
      );
    }

    return (
      <CanvasPlaceholderSurface
        active={active}
        showActiveBorder={showActiveBorder}
        windowType={windowType}
        onClick={() => onActiveCanvasChange?.(windowType)}
      />
    );
  };

  const renderWindowSurface = (
    windowKey: CanvasWindowKey,
    active: boolean,
    showActiveBorder: boolean,
  ) => {
    if (windowKey === "current") return renderCurrentSurface(active, showActiveBorder);
    if (isCurrentKey(windowKey)) {
      const entry = extraCurrents.find((item) => item.key === windowKey);
      return (
        <ExtraCurrentSurface
          windowKey={windowKey}
          subject={entry?.subject ?? null}
          active={active}
          showActiveBorder={showActiveBorder}
          expanded={expanded}
          onClick={() => onActiveCanvasChange?.(windowKey)}
          activeTool={activeTool}
          projectType={projectType}
          shellDeviceVisibility={surfaceDeviceVisibility}
          shellZoomVisibility={surfaceZoomVisibility}
          settings={settings}
          onCanvasToolShortcut={onCanvasToolShortcut}
        />
      );
    }
    // Preview is a view-only window: it renders the current document read-only and
    // never becomes the active/focused canvas (no onActiveCanvasChange, no border).
    if (windowKey === "preview") {
      return (
        <CanvasPreviewSurface
          document={currentDocument ?? createDraftDocument(390, 844)}
          projectType={projectType}
          settings={previewSettings}
          onClose={() => onClosePreview?.()}
        />
      );
    }
    return renderSecondarySurface(windowTypeOfKey(windowKey) as CanvasFeatureWindowType, active, showActiveBorder);
  };
  const useGridSplit = split === "grid" && renderedWindows.length >= 3;

  return (
    <div
      className="fixed z-[2]"
      style={{
        left, right, top, bottom,
        transition: "left 220ms cubic-bezier(.2,.8,.2,1), right 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), bottom 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {splitEnabled ? (
        <div
          className={
            useGridSplit
              ? "absolute inset-0 grid gap-2"
              : split === "horizontal"
                ? "absolute inset-0 flex flex-col gap-2"
                : "absolute inset-0 flex gap-2"
          }
          style={useGridSplit ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}
        >
          {renderedWindows.map((windowKey, index) => (
            <div
              key={windowKey}
              className="flex min-h-0 min-w-0 flex-1"
              style={gridPaneStyle(index, renderedWindows.length)}
            >
              {renderWindowSurface(windowKey, activeWindow === windowKey, true)}
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex">
          {renderWindowSurface(selectedTab, true, false)}
        </div>
      )}

      {!expanded && !splitEnabled && shellExpandVisibility !== "hidden" && (
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

function gridPaneStyle(index: number, count: number): CSSProperties | undefined {
  if (count === 3 && index === 2) return { gridColumn: "1 / span 2" };
  return undefined;
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
      <IconExpand />
    </button>
  );
}

function CanvasPlaceholderSurface({
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
        borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "#2A2A2A",
        backgroundColor: "#141615",
        boxShadow: active && showActiveBorder
          ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
          : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <span className="flex flex-col items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] text-[#888]">
          <IconWindow />
        </span>
        <span className="text-[13px] font-semibold text-[#E6E6E6]">
          {CANVAS_WINDOW_LABELS[windowType]}
        </span>
        <span className="rounded border border-[#2C2C2C] bg-[#1A1A1A] px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#737373]">
          No canvas yet
        </span>
      </span>
    </div>
  );
}

// The Versions window: a persistent editable clone of Current, bound to the version
// selected in the layers-tree header dropdown (no in-canvas selector). Empty when the
// current subject has no versions yet.
function VersionsWindowSurface({
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
}) {
  // No version selected (the current subject has no versions yet) → empty state.
  if (!document) {
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
          borderColor: active && showActiveBorder ? "rgba(13,153,255,0.55)" : "#2A2A2A",
          backgroundColor: "#141615",
          boxShadow: active && showActiveBorder
            ? "0 0 0 1px rgba(13,153,255,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)"
            : "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <span className="flex flex-col items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#2C2C2C] bg-[#1A1A1A] text-[#888]">
            <IconWindow />
          </span>
          <span className="text-[13px] font-semibold text-[#E6E6E6]">Versions</span>
          <span className="rounded border border-[#2C2C2C] bg-[#1A1A1A] px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#737373]">
            No versions yet
          </span>
        </span>
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
    />
  );
}

// An extra "Current" window: an independent editable clone of the Current surface
// bound to its own subject (mirrored from the primary Current, then retargetable).
// It loads/persists its own scene via useSubjectCanvasWindow, so it gets its own
// editor and viewport. Session-only — persistStorage is off.
function ExtraCurrentSurface({
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
    />
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
  ancestorFrames = [],
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
  ancestorFrames?: AncestorFrame[];
  shellDeviceVisibility?: ShellControlVisibility;
  shellBackVisibility?: ShellControlVisibility;
  shellZoomVisibility?: ShellControlVisibility;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
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
        >
          <EditorBridgePublisher sourceId={sourceId} active={publishBridge} />
          <CanvasStage
            draftMode={draftMode}
            activeTool={activeTool}
            viewportSubjectKey={viewportSubjectKey}
            ancestorFrames={ancestorFrames}
            settings={settings}
            onCanvasToolShortcut={onCanvasToolShortcut}
            onOpenSelectedComponentShortcut={openSelectedComponentShortcut}
            onBackToParentShortcut={backToParentShortcut}
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
        <IconChevronLeft />
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
}: {
  projectType: ProjectType;
  isComponent: boolean;
  hasAncestors: boolean;
  shellDeviceVisibility: ShellControlVisibility;
  shellZoomVisibility: ShellControlVisibility;
}) {
  const { state, dispatch } = useEditor();
  const [localHovered, setLocalHovered] = useState(false);

  const setZoom: ZoomSetter = (next) => {
    const zoom = typeof next === "function" ? next(state.zoom) : next;
    dispatch({ type: "setZoom", zoom });
  };

  const overlayEnabled = state.ancestorOverlay.enabled;
  const deviceStyle = shellVisibilityStyle(shellDeviceVisibility, localHovered);
  const zoomStyle = shellVisibilityStyle(shellZoomVisibility, localHovered);

  return (
    <div
      className="absolute bottom-3 left-3 z-[10] flex items-center gap-2"
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
