import { useRef, useState, type ReactNode } from "react";
import { useDismissable } from "@/lib/hooks/useDismissable";
import {
  CANVAS_FEATURE_WINDOW_ORDER,
  CANVAS_WINDOW_LABELS,
  MAX_CANVAS_SPLIT_PANES,
  isCurrentKey,
  windowKeyLabel,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
  type CanvasWindowKey,
  type CanvasWindowType,
  type SplitMode,
  LAYOUT_LABELS,
} from "./canvasUtils";
import {
  IconClose, IconEllipsisVertical, IconExpand, IconGrid,
  IconLayoutHorizontal, IconLayoutVertical, IconPlus,
} from "@/components/icons";

export type { SplitMode };

export function CanvasTabs({
  activeTab,
  enabledTabs,
  onTabChange,
  split,
  splitWindows,
  canvasFeatures,
  extraCurrentKeys = [],
  currentSubjects = {},
  canAddCurrent = false,
  onAddCurrent,
  onRemoveCurrent,
  onSplitChange,
  onSplitWindowsChange,
  onCanvasFeatureChange,
}: {
  activeTab: CanvasWindowKey;
  enabledTabs: readonly CanvasWindowType[];
  onTabChange: (t: CanvasWindowKey) => void;
  split: SplitMode;
  splitWindows: readonly CanvasWindowKey[];
  canvasFeatures: CanvasFeatureFlags;
  extraCurrentKeys?: readonly CanvasWindowKey[];
  currentSubjects?: Record<CanvasWindowKey, { name: string; kind: "screen" | "component" }>;
  canAddCurrent?: boolean;
  onAddCurrent?: () => void;
  onRemoveCurrent?: (key: CanvasWindowKey) => void;
  onSplitChange: (mode: SplitMode) => void;
  onSplitWindowsChange: (windows: readonly CanvasWindowKey[]) => void;
  onCanvasFeatureChange: (feature: CanvasFeatureWindowType, enabled: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredCurrent, setHoveredCurrent] = useState<CanvasWindowKey | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canSplit = enabledTabs.length >= 2;
  // The nav tabs render: primary Current, each extra Current, then feature windows.
  const navTabKeys: CanvasWindowKey[] = [
    "current",
    ...extraCurrentKeys,
    ...enabledTabs.filter((tab) => tab !== "preview" && tab !== "current"),
  ];
  const addableTabs = enabledTabs.filter((tab) => !splitWindows.includes(tab));
  const quadrantsEnabled = canSplit && splitWindows.length >= 3;
  const canAddPane =
    canSplit &&
    split !== "none" &&
    splitWindows.length < MAX_CANVAS_SPLIT_PANES &&
    addableTabs.length > 0;

  const changePane = (index: number, windowKey: CanvasWindowKey) => {
    const currentWindow = splitWindows[index];
    if (!currentWindow || currentWindow === windowKey) return;

    const existingIndex = splitWindows.indexOf(windowKey);
    if (existingIndex >= 0) {
      const next = [...splitWindows];
      next[index] = windowKey;
      next[existingIndex] = currentWindow;
      onSplitWindowsChange(next);
      onTabChange(windowKey);
      return;
    }

    // Current panes (primary or extra) can't be swapped to a feature window here.
    if (isCurrentKey(currentWindow)) return;
    const next = splitWindows.map((existing, existingIndex) =>
      existingIndex === index ? windowKey : existing,
    );
    onSplitWindowsChange(next);
    onTabChange(windowKey);
  };

  const addPane = () => {
    const nextWindow = addableTabs[0];
    if (!nextWindow) return;
    onSplitWindowsChange([...splitWindows, nextWindow]);
    onTabChange(nextWindow);
  };

  const removePane = (index: number) => {
    const removed = splitWindows[index];
    // The primary Current pane is locked; an extra Current is removed through its
    // owner (session state) which also drops it from the split.
    if (removed === "current") return;
    if (isCurrentKey(removed)) {
      onRemoveCurrent?.(removed);
      return;
    }
    const next = splitWindows.filter((_, existingIndex) => existingIndex !== index);
    onSplitWindowsChange(next);
    onTabChange(next[0] ?? "current");
    if (next.length < 2) onSplitChange("none");
    else if (split === "grid" && next.length < 3) onSplitChange("vertical");
  };

  useDismissable(menuOpen, () => setMenuOpen(false), [menuRef], { capture: true });

  return (
    <div
      ref={menuRef}
      className="relative inline-flex items-center gap-0.5 rounded-lg border border-[#282828] bg-[#181818] p-1"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
    >
      {/* Preview is a special view-only window (launched from above the Inspector);
          it stays selectable in the grid menu but is not a navigable nav tab.
          Primary Current first, then any extra Currents, then feature windows. */}
      {navTabKeys.map((tab) => {
        const isActive = activeTab === tab;
        const currentTab = isCurrentKey(tab);
        const subject = currentTab ? currentSubjects[tab] : undefined;
        return (
          <div
            key={tab}
            className="relative"
            onMouseEnter={currentTab ? () => setHoveredCurrent(tab) : undefined}
            onMouseLeave={currentTab ? () => setHoveredCurrent((k) => (k === tab ? null : k)) : undefined}
          >
            <button
              type="button"
              onClick={() => onTabChange(tab)}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-100"
              style={{
                background: isActive ? "#2A2A2A" : "transparent",
                color: isActive ? "#F2F2F2" : "#5A5A5A",
                letterSpacing: "0.1px",
              }}
            >
              {windowKeyLabel(tab)}
            </button>
            {currentTab && hoveredCurrent === tab ? (
              <CurrentTabPopover subject={subject} />
            ) : null}
          </div>
        );
      })}

      <span className="mx-1 h-3.5 w-px bg-[#2C2C2C]" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="More canvas options"
          aria-expanded={menuOpen}
          className="grid h-6 w-6 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
          style={{ color: menuOpen ? "#F2F2F2" : "#8A8A8A" }}
        >
          <VerticalDotsIcon />
        </button>

        {menuOpen ? (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-[30] w-[240px] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] p-2 text-[#F2F2F2]"
            style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
          >
            <MenuSection title="Layout">
              <div className="grid grid-cols-2 gap-1">
                {(["none", "vertical", "horizontal", "grid"] as const).map((mode) => {
                  const disabled =
                    mode === "none"
                      ? false
                      : mode === "grid"
                        ? !quadrantsEnabled
                        : !canSplit;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSplitChange(mode)}
                      disabled={disabled}
                      aria-label={LAYOUT_LABELS[mode]}
                      className="flex h-8 items-center justify-center rounded-md border border-[#2C2C2C] bg-[#202020] transition-colors duration-100 hover:bg-[#282828] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#202020]"
                      style={{
                        color: split === mode && !disabled ? "rgba(13,153,255,0.85)" : "#8A8A8A",
                      }}
                    >
                      <LayoutIcon mode={mode} />
                    </button>
                  );
                })}
              </div>
            </MenuSection>

            {split !== "none" ? (
              <MenuSection title="Panels">
                <div className="flex flex-col gap-1.5">
                  {splitWindows.map((windowKey, index) => (
                    <SplitPanePicker
                      key={`${windowKey}-${index}`}
                      index={index}
                      value={windowKey}
                      enabledTabs={enabledTabs}
                      onChange={(nextWindow) => changePane(index, nextWindow)}
                      onRemove={() => removePane(index)}
                    />
                  ))}
                  <div className="flex gap-1.5">
                    {canAddPane ? (
                      <button
                        type="button"
                        onClick={addPane}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-[#202020] text-[11px] font-medium text-[#9A9A9A] transition-colors duration-100 hover:bg-[#282828] hover:text-[#D8D8D8]"
                      >
                        <PlusIcon />
                        Add panel
                      </button>
                    ) : null}
                    {canAddCurrent && onAddCurrent ? (
                      <button
                        type="button"
                        onClick={onAddCurrent}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-[#202020] text-[11px] font-medium text-[#9A9A9A] transition-colors duration-100 hover:bg-[#282828] hover:text-[#D8D8D8]"
                      >
                        <PlusIcon />
                        Add Current
                      </button>
                    ) : null}
                  </div>
                </div>
              </MenuSection>
            ) : null}

            <MenuSection title="Features" last>
              <div className="flex flex-col gap-1.5">
                {CANVAS_FEATURE_WINDOW_ORDER.map((feature) => (
                  <FeatureToggle
                    key={feature}
                    label={CANVAS_WINDOW_LABELS[feature]}
                    checked={canvasFeatures[feature]}
                    onChange={(enabled) => onCanvasFeatureChange(feature, enabled)}
                  />
                ))}
              </div>
            </MenuSection>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuSection({
  title,
  children,
  last = false,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "px-1 py-2" : "border-b border-[#2C2C2C] px-1 py-2"}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
        {title}
      </div>
      {children}
    </div>
  );
}

function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-7 w-full items-center justify-between rounded-md border border-[#2C2C2C] bg-[#202020] px-2.5 text-left text-[11px] font-medium text-[#CFCFCF] transition-colors duration-100 hover:bg-[#282828]"
    >
      <span>{label}</span>
      <span
        className={[
          "relative h-[16px] w-[30px] shrink-0 rounded-full border transition-colors duration-100",
          checked ? "border-[#0D99FF]/50 bg-[#0D99FF]/30" : "border-[#3A3A3A] bg-[#141414]",
        ].join(" ")}
      >
        <span
          className="absolute left-[2px] top-1/2 h-[10px] w-[10px] rounded-full bg-[#D8D8D8] transition-transform duration-100"
          style={{ transform: checked ? "translate(16px, -50%)" : "translate(0, -50%)" }}
        />
      </span>
    </button>
  );
}

function SplitPanePicker({
  index,
  value,
  enabledTabs,
  onChange,
  onRemove,
}: {
  index: number;
  value: CanvasWindowKey;
  enabledTabs: readonly CanvasWindowType[];
  onChange: (value: CanvasWindowKey) => void;
  onRemove: () => void;
}) {
  // A Current pane (primary or extra) can't be re-typed to a feature window: the
  // select is locked and just shows its label. The primary Current also can't be
  // removed; extra Currents can.
  const currentKey = isCurrentKey(value);
  const removable = value !== "current";

  return (
    <div className="flex h-7 w-full shrink-0 items-center overflow-hidden rounded-md border border-[#2C2C2C] bg-[#202020]">
      <select
        value={currentKey ? "current" : value}
        onChange={(event) => onChange(event.target.value as CanvasWindowKey)}
        aria-label={`Split pane ${index + 1}`}
        disabled={currentKey}
        className="h-7 min-w-0 flex-1 cursor-pointer border-0 bg-transparent pl-2 pr-3 text-[10.5px] font-medium text-[#CFCFCF] outline-none disabled:cursor-default disabled:opacity-100"
      >
        {currentKey ? (
          <option value="current">{windowKeyLabel(value)}</option>
        ) : (
          enabledTabs.map((tab) => (
            <option key={tab} value={tab}>
              {CANVAS_WINDOW_LABELS[tab]}
            </option>
          ))
        )}
      </select>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-7 w-6 place-items-center border-0 border-l border-[#2C2C2C] bg-transparent text-[#6B6B6B] transition-colors duration-100 hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
          aria-label={`Remove split pane ${index + 1}`}
        >
          <CloseIcon />
        </button>
      ) : null}
    </div>
  );
}

function CurrentTabPopover({
  subject,
}: {
  subject?: { name: string; kind: "screen" | "component" };
}) {
  return (
    <div
      className="absolute left-1/2 top-[calc(100%+6px)] z-[40] w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-[#2C2C2C] bg-[#171717] px-2.5 py-2 text-left"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
    >
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
        In this window
      </div>
      {subject ? (
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-[#E6E6E6]">{subject.name}</span>
          <span className="shrink-0 rounded border border-[#2C2C2C] px-1 py-px text-[9px] uppercase tracking-[0.06em] text-[#8A8A8A]">
            {subject.kind}
          </span>
        </div>
      ) : (
        <div className="text-[12px] text-[#8A8A8A]">Empty</div>
      )}
    </div>
  );
}

function VerticalDotsIcon() { return <IconEllipsisVertical size={14} aria-hidden />; }
function PlusIcon() { return <IconPlus size={11} strokeWidth={2} />; }
function CloseIcon() { return <IconClose size={9} strokeWidth={2} />; }
function LayoutIcon({ mode }: { mode: SplitMode }) {
  if (mode === "vertical") return <IconLayoutVertical size={13} strokeWidth={1.6} />;
  if (mode === "horizontal") return <IconLayoutHorizontal size={13} strokeWidth={1.6} />;
  if (mode === "grid") return <IconGrid size={13} strokeWidth={1.6} />;
  return <IconExpand size={13} strokeWidth={1.8} />;
}
