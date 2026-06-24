import { useMemo, useState, type CSSProperties } from "react";
import {
  IconExpand,
} from "@/components/icons";

import { CURRENT_CANVAS_STORAGE_KEY, SKETCH_CANVAS_STORAGE_KEY, VERSIONS_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";
import { createDraftDocument } from "@/canvas/engine/actions";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
export type { ZoomSetter } from "./ZoomControl";
import {
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
import type { SubjectOwner } from "@/canvas/hooks/useSubjectCanvasWindow";
import type { ShellControlVisibility } from "./inspector/ShellTab";
import { CanvasReferencesWindow, type CanvasReferencesContext } from "./CanvasReferencesWindow";
import { CanvasPreviewSurface } from "./PreviewSurface";
import type { CanvasToolId } from "@/canvas/tools";
import { DEFAULT_GLOBAL_SETTINGS } from "@/domain/settings/defaults";
import type { GlobalSettings } from "@/domain/settings/types";
import {
  CanvasPlaceholderSurface,
  CanvasSurface,
  ExtraCurrentSurface,
  VersionsWindowSurface,
} from "./surfaces/CanvasSurfaces";
import { shellVisibilityStyle } from "./surfaces/shellVisibility";

const GAP = 8;
const TREE_WIDTH = 300;
const INSPECTOR_WIDTH = 280;
const PANEL_MARGIN = 12;

const HEADER_HEIGHT = 64;
const BOTTOM_BAR_HEIGHT = 88;

type CanvasParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function CanvasRender({
  treeOpen,
  inspectorOpen,
  split,
  activeTab = "current",
  enabledTabs = ["current", "sketch"],
  splitWindows = ["current", "sketch"],
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
  sketchResetKey = 0,
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
  sketchResetKey?: number;
}) {
  const left   = expanded ? 0 : (treeOpen     ? PANEL_MARGIN + TREE_WIDTH + GAP      : PANEL_MARGIN);
  const right  = expanded ? 0 : (inspectorOpen ? PANEL_MARGIN + INSPECTOR_WIDTH + GAP : PANEL_MARGIN);
  const top    = expanded ? 0 : HEADER_HEIGHT;
  const bottom = expanded ? 0 : BOTTOM_BAR_HEIGHT;

  const btnTop   = expanded ? HEADER_HEIGHT + PANEL_MARGIN : PANEL_MARGIN;
  const btnRight = expanded
    ? (inspectorOpen ? PANEL_MARGIN + INSPECTOR_WIDTH + GAP + PANEL_MARGIN : PANEL_MARGIN)
    : PANEL_MARGIN;

  const draftsFallbackDoc = useMemo(() => {
    // Approximate visible-canvas size with both panels open — derived from the
    // shell layout constants rather than hardcoded offsets. It's only a fallback
    // extent for a brand-new draft, so the Math.max floors keep it sane.
    const horizontalChrome = TREE_WIDTH + INSPECTOR_WIDTH + GAP * 2 + PANEL_MARGIN * 2;
    const verticalChrome = HEADER_HEIGHT + BOTTOM_BAR_HEIGHT;
    const w = Math.floor(window.innerWidth - horizontalChrome);
    const h = Math.floor(window.innerHeight - verticalChrome);
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
    if (windowType === "sketch") {
      return (
        <CanvasSurface
          key={`sketch:${sketchResetKey}`}
          active={active}
          showActiveBorder={showActiveBorder}
          sourceId="sketch"
          publishBridge={active}
          expanded={expanded}
          onClick={() => onActiveCanvasChange?.("sketch")}
          storageKey={SKETCH_CANVAS_STORAGE_KEY}
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
