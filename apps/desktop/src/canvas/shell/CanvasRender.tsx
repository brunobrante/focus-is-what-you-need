import { Fragment, useEffect, useMemo, useState } from "react";
import {
  IconExpand,
} from "@/components/icons";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { CURRENT_CANVAS_STORAGE_KEY, SKETCH_CANVAS_STORAGE_KEY, VERSIONS_CANVAS_STORAGE_KEY } from "@/canvas/engine/storageKeys";
import { createDraftDocument } from "@/canvas/engine/actions";
import type { CanvasDocument } from "@/canvas/engine/types";
import type { ProjectType } from "@/lib/data/types";
export type { ZoomSetter } from "./ZoomControl";
import {
  DEFAULT_PREVIEW_SETTINGS,
  isCurrentKey,
  isFeatureWindowType,
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
import {
  DEFAULT_SHELL_CONTROLS_BY_WINDOW,
  shellWindowTypeOf,
  type ShellControlsByWindow,
  type ShellWindowType,
} from "./shellControls";
import { CanvasReferencesWindow, type CanvasReferencesContext } from "./CanvasReferencesWindow";
import { CanvasPreviewSurface } from "./PreviewSurface";
import { CanvasWindowProvider } from "@/canvas/CanvasWindowContext";
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

// Split panes sit flush against a transparent 8px drag strip that stands in for
// the old `gap-2` spacing — invisible, but grabbable to resize adjacent panes.
const SPLIT_HANDLE =
  "w-2 bg-transparent data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full";

type CanvasParentTarget = {
  name: string;
  kind: "screen" | "component";
};

export function CanvasRender({
  treeOpen,
  inspectorOpen,
  treeWidth = TREE_WIDTH,
  inspectorWidth = INSPECTOR_WIDTH,
  split,
  activeTab = "current",
  enabledTabs = ["current", "sketch"],
  splitWindows = ["current", "sketch"],
  navbarVisible = true,
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
  isIconSubject = false,
  referencesContext = null,
  ancestorFrames = [],
  shellControls = DEFAULT_SHELL_CONTROLS_BY_WINDOW,
  previewSettings = DEFAULT_PREVIEW_SETTINGS,
  onClosePreview,
  onCurrentDocumentChange,
  onActiveCanvasChange,
  onHideWindow,
  onToggleExpand,
  onBackToParent,
  settings = DEFAULT_GLOBAL_SETTINGS,
  onCanvasToolShortcut,
  onOpenSelectedComponentShortcut,
  sketchResetKey = 0,
}: {
  treeOpen: boolean;
  inspectorOpen: boolean;
  treeWidth?: number;
  inspectorWidth?: number;
  split: SplitMode;
  activeTab?: CanvasWindowKey;
  enabledTabs?: readonly CanvasWindowType[];
  splitWindows?: readonly CanvasWindowKey[];
  navbarVisible?: boolean;
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
  // The Current subject is an icon master (SVG paste lands as root paths there).
  isIconSubject?: boolean;
  referencesContext?: CanvasReferencesContext | null;
  ancestorFrames?: AncestorFrame[];
  shellControls?: ShellControlsByWindow;
  previewSettings?: PreviewSettings;
  onClosePreview?: () => void;
  onCurrentDocumentChange?: (document: CanvasDocument) => void;
  onActiveCanvasChange?: (windowKey: CanvasWindowKey) => void;
  onHideWindow?: (windowKey: CanvasWindowKey) => void;
  onToggleExpand?: () => void;
  onBackToParent?: () => void;
  settings?: GlobalSettings;
  onCanvasToolShortcut?: (tool: CanvasToolId) => boolean | void;
  onOpenSelectedComponentShortcut?: () => boolean | void;
  sketchResetKey?: number;
}) {
  const normalizedSplitWindows: CanvasSplitWindows = normalizeCanvasSplitWindows(
    splitWindows,
    enabledTabs,
  );
  const splitEnabled = split !== "none" && normalizedSplitWindows.length > 1;

  const left   = expanded ? 0 : (treeOpen     ? PANEL_MARGIN + treeWidth + GAP      : PANEL_MARGIN);
  const right  = expanded ? 0 : (inspectorOpen ? PANEL_MARGIN + inspectorWidth + GAP : PANEL_MARGIN);
  // With the top nav hidden (only the Current window), the canvas reaches up to the
  // top margin and the header/preview chrome just floats over it. Once the nav is
  // shown it descends below that row so the nav never covers a pane's top.
  const top    = expanded ? 0 : (navbarVisible ? HEADER_HEIGHT : PANEL_MARGIN);
  const bottom = expanded ? 0 : BOTTOM_BAR_HEIGHT;

  const btnTop   = expanded ? HEADER_HEIGHT + PANEL_MARGIN : PANEL_MARGIN;
  const btnRight = expanded
    ? (inspectorOpen ? PANEL_MARGIN + inspectorWidth + GAP + PANEL_MARGIN : PANEL_MARGIN)
    : PANEL_MARGIN;

  // Track the window extent so a draft seeded after a resize uses the current
  // size, not the size captured once at mount (SHELL-9). Resize is not a hot path,
  // so a listener-driven recompute is fine; the surface only reads this fallback
  // when it has no stored draft, so a fresh identity never resets an existing one.
  const [windowExtent, setWindowExtent] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setWindowExtent({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const draftsFallbackDoc = useMemo(() => {
    // Approximate visible-canvas size with both panels open — derived from the
    // shell layout constants rather than hardcoded offsets. It's only a fallback
    // extent for a brand-new draft, so the Math.max floors keep it sane.
    const horizontalChrome = treeWidth + inspectorWidth + GAP * 2 + PANEL_MARGIN * 2;
    const verticalChrome = HEADER_HEIGHT + BOTTOM_BAR_HEIGHT;
    const w = Math.floor(windowExtent.w - horizontalChrome);
    const h = Math.floor(windowExtent.h - verticalChrome);
    return createDraftDocument(Math.max(400, w), Math.max(300, h));
  }, [windowExtent, treeWidth, inspectorWidth]);

  const isKeyRenderable = (key: CanvasWindowKey) =>
    isCurrentKey(key) || enabledTabs.includes(windowTypeOfKey(key));
  const selectedTab = isKeyRenderable(activeTab) ? activeTab : "current";
  const renderedWindows = splitEnabled ? normalizedSplitWindows : [selectedTab];
  const activeWindow = renderedWindows.includes(selectedTab) ? selectedTab : renderedWindows[0];
  // Each surface reads its own window type's controls; split forces device/zoom off.
  const deviceVisFor = (type: ShellWindowType): ShellControlVisibility =>
    splitEnabled ? "hidden" : shellControls[type].device;
  const zoomVisFor = (type: ShellWindowType): ShellControlVisibility =>
    splitEnabled ? "hidden" : shellControls[type].zoom;
  const expandVisibility = shellControls[shellWindowTypeOf(selectedTab)].expand;

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
      isIconSubject={isIconSubject}
      ancestorFrames={ancestorFrames}
      shellDeviceVisibility={deviceVisFor("current")}
      shellBackVisibility={shellControls.current.back}
      shellZoomVisibility={zoomVisFor("current")}
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
          shellDeviceVisibility={deviceVisFor("sketch")}
          shellZoomVisibility={zoomVisFor("sketch")}
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
          shellDeviceVisibility={deviceVisFor("versions")}
          shellZoomVisibility={zoomVisFor("versions")}
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
          shellZoomVisibility={zoomVisFor("references")}
          expanded={expanded}
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
          shellDeviceVisibility={deviceVisFor("current")}
          shellZoomVisibility={zoomVisFor("current")}
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
    const windowType = windowTypeOfKey(windowKey);
    if (isFeatureWindowType(windowType)) {
      return renderSecondarySurface(windowType, active, showActiveBorder);
    }
    // Unknown / unhandled window key: render nothing rather than silently
    // mis-rendering it as a feature window. A new CanvasWindowKey variant that
    // reaches here is a missing case to handle above, not something to coerce (SHELL-12).
    return null;
  };
  // Wrap every pane with its window identity so the (deeply-nested) canvas context
  // menu can offer "Hide this window" for the exact pane it was opened in.
  const renderPane = (windowKey: CanvasWindowKey, active: boolean, showActiveBorder: boolean) => (
    <CanvasWindowProvider
      value={{ windowKey, splitActive: splitEnabled, onHideWindow: onHideWindow ?? (() => {}) }}
    >
      {renderWindowSurface(windowKey, active, showActiveBorder)}
    </CanvasWindowProvider>
  );
  const useGridSplit = split === "grid" && renderedWindows.length >= 3;

  // Each pane fills its ResizablePanel track. Handles are an 8px transparent
  // strip so they read as the old `gap-2` spacing while staying draggable.
  const paneCell = (windowKey: CanvasWindowKey) => (
    <div className="flex h-full w-full min-h-0 min-w-0">
      {renderPane(windowKey, activeWindow === windowKey, true)}
    </div>
  );
  // A horizontal row of panes; a single key renders bare (no inner group/handle),
  // which gives the 3-pane grid its full-width bottom cell.
  const paneRow = (keys: CanvasWindowKey[], groupId: string) =>
    keys.length === 1 ? (
      paneCell(keys[0])
    ) : (
      <ResizablePanelGroup direction="horizontal" id={groupId}>
        {keys.map((key, index) => (
          <Fragment key={key}>
            {index > 0 && <ResizableHandle className={SPLIT_HANDLE} />}
            <ResizablePanel id={key} order={index} defaultSize={100 / keys.length} minSize={15}>
              {paneCell(key)}
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>
    );

  return (
    <div
      className="fixed z-[2]"
      style={{
        left, right, top, bottom,
        transition: "left 220ms cubic-bezier(.2,.8,.2,1), right 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), bottom 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {splitEnabled ? (
        <div className="absolute inset-0">
          {useGridSplit ? (
            // 2×2 grid: an outer vertical group of two rows, each a horizontal
            // group. With 3 panes the bottom row holds a single full-width pane.
            <ResizablePanelGroup direction="vertical" id="canvas-split-grid">
              <ResizablePanel id="canvas-split-grid-top" order={0} defaultSize={50} minSize={15}>
                {paneRow(renderedWindows.slice(0, 2), "canvas-split-grid-top-row")}
              </ResizablePanel>
              <ResizableHandle className={SPLIT_HANDLE} />
              <ResizablePanel id="canvas-split-grid-bottom" order={1} defaultSize={50} minSize={15}>
                {paneRow(renderedWindows.slice(2), "canvas-split-grid-bottom-row")}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            // Vertical split → a row of panes; horizontal split → a column.
            <ResizablePanelGroup
              direction={split === "horizontal" ? "vertical" : "horizontal"}
              id="canvas-split-linear"
            >
              {renderedWindows.map((windowKey, index) => (
                <Fragment key={windowKey}>
                  {index > 0 && <ResizableHandle className={SPLIT_HANDLE} />}
                  <ResizablePanel
                    id={windowKey}
                    order={index}
                    defaultSize={100 / renderedWindows.length}
                    minSize={15}
                  >
                    {paneCell(windowKey)}
                  </ResizablePanel>
                </Fragment>
              ))}
            </ResizablePanelGroup>
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex">
          {renderPane(selectedTab, true, false)}
        </div>
      )}

      {!expanded && !splitEnabled && expandVisibility !== "hidden" && (
        <ExpandButton
          shellExpandVisibility={expandVisibility}
          btnTop={btnTop}
          btnRight={btnRight}
          onClick={onToggleExpand}
        />
      )}
    </div>
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
      <IconExpand />
    </button>
  );
}
