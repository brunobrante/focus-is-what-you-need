import { useState } from "react";
import { type SplitMode, LAYOUT_LABELS } from "./canvasUtils";

export type { SplitMode };

export function CanvasTabs({
  activeTab,
  onTabChange,
  split,
  onSplitChange,
}: {
  activeTab: "current" | "drafts";
  onTabChange: (t: "current" | "drafts") => void;
  split: SplitMode;
  onSplitChange: (mode: SplitMode) => void;
}) {
  const [layoutExpanded, setLayoutExpanded] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-0.5 rounded-lg border border-[#282828] bg-[#181818] p-1"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
    >
      {(["current", "drafts"] as const).map((tab) => {
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
            {tab === "current" ? "Current" : "Drafts"}
          </button>
        );
      })}

      <span className="mx-1 h-3.5 w-px bg-[#2C2C2C]" />

      <div
        className="flex items-center"
        onMouseEnter={() => setLayoutExpanded(true)}
        onMouseLeave={() => setLayoutExpanded(false)}
      >
        <button
          type="button"
          aria-label="Layout"
          className="grid h-6 w-6 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
          style={{ color: split !== "none" ? "rgba(13,153,255,0.7)" : "#555" }}
        >
          <LayoutIcon mode={split} />
        </button>

        <div
          className="flex items-center overflow-hidden"
          style={{
            maxWidth: layoutExpanded ? 110 : 0,
            transition: "max-width 180ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <span className="mx-1 h-3.5 w-px shrink-0 bg-[#2C2C2C]" />
          {(["none", "vertical", "horizontal"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSplitChange(mode)}
              aria-label={LAYOUT_LABELS[mode]}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
              style={{ color: split === mode ? "rgba(13,153,255,0.7)" : "#555" }}
            >
              <LayoutIcon mode={mode} />
            </button>
          ))}
        </div>
      </div>
    </div>
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
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H3v6" />
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M15 21h6v-6" />
    </svg>
  );
}
