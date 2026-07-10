import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Combine, Lasso, MousePointer2, Paintbrush, Scissors, Spline, Waypoints, X,
} from "lucide-react";
import { IconChevronDownFill } from "@/components/icons";
import { useDismissable } from "@/lib/hooks/useDismissable";
import type { VectorEditTool } from "@/domain/canvas/types";

// The Figma-style vector edit toolbar. Shown (replacing the main canvas toolbar)
// only while a path is in anchor-edit mode. Its buttons switch EditorState.vectorTool
// — the sub-tool that decides how pointer gestures are read against the edited path.
// Self-contained visual language mirroring shell/Toolbar.tsx (same tokens/sizes).

type VectorToolEntry = {
  id: VectorEditTool;
  name: string;
  icon: ReactNode;
  shortcut?: string;
};

const ICON_PROPS = { size: 16, strokeWidth: 1.8 } as const;

// Left, always-visible cluster (Move · Lasso · Paint · Bend · Cut).
const PRIMARY: VectorToolEntry[] = [
  { id: "move", name: "Move", icon: <MousePointer2 {...ICON_PROPS} />, shortcut: "V" },
  { id: "lasso", name: "Lasso", icon: <Lasso {...ICON_PROPS} />, shortcut: "Q" },
  { id: "paint", name: "Paint selection", icon: <Paintbrush {...ICON_PROPS} /> },
  { id: "bend", name: "Bend", icon: <Spline {...ICON_PROPS} />, shortcut: "B" },
  { id: "cut", name: "Cut", icon: <Scissors {...ICON_PROPS} />, shortcut: "C" },
];

// The "More ▾" overflow menu (Shape builder · Variable width).
const MORE: VectorToolEntry[] = [
  { id: "shape-builder", name: "Shape builder", icon: <Combine {...ICON_PROPS} />, shortcut: "M" },
  { id: "variable-width", name: "Variable width", icon: <Waypoints {...ICON_PROPS} />, shortcut: "⇧W" },
];

export function VectorToolbar({
  active,
  onSelect,
  onDone,
}: {
  active: VectorEditTool;
  onSelect: (tool: VectorEditTool) => void;
  onDone: () => void;
}) {
  return (
    <div
      data-screen-label="Vector toolbar"
      className="inline-flex items-center gap-0.5 rounded-[14px] border border-[#2C2C2C] bg-[#1E1E1E] p-1.5"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)" }}
    >
      {PRIMARY.map((tool) => (
        <VectorToolButton
          key={tool.id}
          tool={tool}
          active={active === tool.id}
          onClick={() => onSelect(tool.id)}
        />
      ))}

      <MoreMenu active={active} onSelect={onSelect} />

      <div aria-hidden className="mx-1 h-5 w-px bg-[#2C2C2C]" />

      <button
        type="button"
        onClick={onDone}
        aria-label="Done editing path"
        title="Done"
        className="grid h-9 w-9 place-items-center rounded-lg text-[#888] transition-colors duration-[90ms] hover:bg-[#2A2A2A] hover:text-[#CFCFCF]"
      >
        <X {...ICON_PROPS} />
      </button>
    </div>
  );
}

function MoreMenu({
  active,
  onSelect,
}: {
  active: VectorEditTool;
  onSelect: (tool: VectorEditTool) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isGroupActive = MORE.some((t) => t.id === active);
  const current = MORE.find((t) => t.id === active) ?? MORE[0];

  useDismissable(open, () => setOpen(false), [ref], { capture: true, escape: true });

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => (isGroupActive ? onSelect(current.id) : setOpen((v) => !v))}
        aria-label={isGroupActive ? current.name : "More vector tools"}
        className={[
          "relative inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border-0 pl-2.5 pr-2 transition-colors duration-[90ms]",
          isGroupActive ? "bg-[#383838] text-white" : hover ? "bg-[#2A2A2A] text-[#CFCFCF]" : "bg-transparent text-[#CFCFCF]",
        ].join(" ")}
      >
        {isGroupActive ? current.icon : <span className="text-[12px] font-medium">More</span>}
        <button
          type="button"
          aria-label="More vector tools"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="grid h-5 w-4 place-items-center rounded text-[#888] hover:text-[#DADADA]"
        >
          <IconChevronDownFill />
        </button>
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 overflow-hidden rounded-[10px] border border-[#2C2C2C] bg-[#1E1E1E] p-1"
          style={{ bottom: "calc(100% + 8px)", boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)", minWidth: 190 }}
        >
          {MORE.map((tool) => {
            const isSelected = active === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => { onSelect(tool.id); setOpen(false); }}
                className={[
                  "flex w-full items-center gap-2.5 rounded-md border-0 px-2 py-1.5 text-left text-[12px] font-medium transition-colors duration-[90ms]",
                  isSelected ? "bg-[#383838] text-white" : "bg-transparent text-[#CFCFCF] hover:bg-[#2A2A2A]",
                ].join(" ")}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">{tool.icon}</span>
                <span className="flex-1">{tool.name}</span>
                {tool.shortcut ? (
                  <span className="font-mono text-[9px] leading-none text-[#686868]">{tool.shortcut}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VectorToolButton({
  tool,
  active,
  onClick,
}: {
  tool: VectorToolEntry;
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
      )}
    </button>
  );
}
