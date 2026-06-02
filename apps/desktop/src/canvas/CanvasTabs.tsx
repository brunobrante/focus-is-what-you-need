import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CANVAS_FEATURE_WINDOW_ORDER,
  CANVAS_WINDOW_LABELS,
  MAX_CANVAS_SPLIT_PANES,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
  type CanvasWindowType,
  type SplitMode,
  LAYOUT_LABELS,
} from "./canvasUtils";

export type { SplitMode };

export function CanvasTabs({
  activeTab,
  enabledTabs,
  onTabChange,
  split,
  splitWindows,
  canvasFeatures,
  onSplitChange,
  onSplitWindowsChange,
  onCanvasFeatureChange,
}: {
  activeTab: CanvasWindowType;
  enabledTabs: readonly CanvasWindowType[];
  onTabChange: (t: CanvasWindowType) => void;
  split: SplitMode;
  splitWindows: readonly CanvasWindowType[];
  canvasFeatures: CanvasFeatureFlags;
  onSplitChange: (mode: SplitMode) => void;
  onSplitWindowsChange: (windows: readonly CanvasWindowType[]) => void;
  onCanvasFeatureChange: (feature: CanvasFeatureWindowType, enabled: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canSplit = enabledTabs.length >= 2;
  const addableTabs = enabledTabs.filter((tab) => !splitWindows.includes(tab));
  const quadrantsEnabled = canSplit && splitWindows.length >= 3;
  const canAddPane =
    canSplit &&
    split !== "none" &&
    splitWindows.length < MAX_CANVAS_SPLIT_PANES &&
    addableTabs.length > 0;

  const changePane = (index: number, windowType: CanvasWindowType) => {
    const currentWindow = splitWindows[index];
    if (!currentWindow || currentWindow === windowType) return;

    const existingIndex = splitWindows.indexOf(windowType);
    if (existingIndex >= 0) {
      const next = [...splitWindows];
      next[index] = windowType;
      next[existingIndex] = currentWindow;
      onSplitWindowsChange(next);
      onTabChange(windowType);
      return;
    }

    if (currentWindow === "current") return;
    const next = splitWindows.map((existing, existingIndex) =>
      existingIndex === index ? windowType : existing,
    );
    onSplitWindowsChange(next);
    onTabChange(windowType);
  };

  const addPane = () => {
    const nextWindow = addableTabs[0];
    if (!nextWindow) return;
    onSplitWindowsChange([...splitWindows, nextWindow]);
    onTabChange(nextWindow);
  };

  const removePane = (index: number) => {
    if (splitWindows[index] === "current") return;
    const next = splitWindows.filter((_, existingIndex) => existingIndex !== index);
    onSplitWindowsChange(next);
    onTabChange(next[0] ?? "current");
    if (next.length < 2) onSplitChange("none");
    else if (split === "grid" && next.length < 3) onSplitChange("vertical");
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      className="relative inline-flex items-center gap-0.5 rounded-lg border border-[#282828] bg-[#181818] p-1"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
    >
      {enabledTabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-100"
            style={{
              background: isActive ? "#2A2A2A" : "transparent",
              color: isActive ? "#F2F2F2" : "#5A5A5A",
              letterSpacing: "0.1px",
            }}
          >
            {CANVAS_WINDOW_LABELS[tab]}
          </button>
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
            className="absolute left-0 top-[calc(100%+6px)] z-[30] w-[336px] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] p-2 text-[#F2F2F2]"
            style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
          >
            <MenuSection title="Layout">
              <div className="grid grid-cols-4 gap-1">
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
                  {splitWindows.map((windowType, index) => (
                    <SplitPanePicker
                      key={`${windowType}-${index}`}
                      index={index}
                      value={windowType}
                      enabledTabs={enabledTabs}
                      onChange={(nextWindow) => changePane(index, nextWindow)}
                      onRemove={() => removePane(index)}
                    />
                  ))}
                  {canAddPane ? (
                    <button
                      type="button"
                      onClick={addPane}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-[#2C2C2C] bg-[#202020] text-[11px] font-medium text-[#9A9A9A] transition-colors duration-100 hover:bg-[#282828] hover:text-[#D8D8D8]"
                    >
                      <PlusIcon />
                      Add panel
                    </button>
                  ) : null}
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
      className="flex h-8 w-full items-center justify-between rounded-md border border-[#2C2C2C] bg-[#202020] px-2.5 text-left text-[11.5px] font-medium text-[#CFCFCF] transition-colors duration-100 hover:bg-[#282828]"
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
  value: CanvasWindowType;
  enabledTabs: readonly CanvasWindowType[];
  onChange: (value: CanvasWindowType) => void;
  onRemove: () => void;
}) {
  const currentLocked = value === "current";

  return (
    <div className="flex h-7 w-full shrink-0 items-center overflow-hidden rounded-md border border-[#2C2C2C] bg-[#202020]">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as CanvasWindowType)}
        aria-label={`Split pane ${index + 1}`}
        className="h-7 min-w-0 flex-1 cursor-pointer border-0 bg-transparent pl-2 pr-1 text-[10.5px] font-medium text-[#CFCFCF] outline-none"
      >
        {enabledTabs.map((tab) => (
          <option
            key={tab}
            value={tab}
            disabled={currentLocked && tab !== "current"}
          >
            {CANVAS_WINDOW_LABELS[tab]}
          </option>
        ))}
      </select>
      {!currentLocked ? (
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

function VerticalDotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="19" r="1.7" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function LayoutIcon({ mode }: { mode: SplitMode }) {
  if (mode === "vertical") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="18" rx="1.5" />
        <rect x="13" y="3" width="8" height="18" rx="1.5" />
      </svg>
    );
  }
  if (mode === "horizontal") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="8" rx="1.5" />
        <rect x="3" y="13" width="18" height="8" rx="1.5" />
      </svg>
    );
  }
  if (mode === "grid") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H3v6" />
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M15 21h6v-6" />
    </svg>
  );
}
