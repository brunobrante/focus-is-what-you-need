import { useState } from "react";
import type { AncestorOverlayItem, AncestorOverlayState, ShellGridType } from "@/canvas/engine/types";
import { ancestorOverlayItemFor, type AncestorFrame } from "@/canvas/canvasUtils";
import { IconChevronDown, IconGrid, IconScreen } from "@/components/icons";
import { InsColor, InsRow, InsSection, InsSlider, InsSwitch, InsToggle } from "./InsComponents";

function AncestorCard({
  frame,
  depth,
  item,
  disabled,
  onUpdate,
}: {
  frame: AncestorFrame;
  depth: number;
  item: AncestorOverlayItem;
  disabled: boolean;
  onUpdate: (patch: Partial<AncestorOverlayItem>) => void;
}) {
  const [open, setOpen] = useState(false);
  const isScreen = frame.kind === "screen";
  return (
    <div
      className="overflow-hidden rounded-md border border-[#2C2C2C] bg-[#1A1A1A] transition-opacity duration-[120ms]"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-[#202020]"
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-[#262626] text-[9px] font-medium tabular-nums text-[#8A8A8A]">
          {depth + 1}
        </span>
        <span className="grid h-4 w-4 shrink-0 place-items-center text-[#7A7A7A]">
          {isScreen ? <IconScreen size={12} /> : <IconGrid size={12} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[#CFCFCF]">{frame.name}</span>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.4px] text-[#6B6B6B]">
          {isScreen ? "Screen" : "Component"}
        </span>
        <IconChevronDown
          size={10}
          strokeWidth={2}
          className={`shrink-0 text-[#6B6B6B] transition-transform duration-[120ms] ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-[#262626] px-2 py-2">
          <InsRow label="Herdar cor">
            <InsSwitch
              checked={item.inheritColor}
              onChange={(v) => onUpdate({ inheritColor: v })}
            />
          </InsRow>
          {!item.inheritColor && (
            <InsRow label="Cor">
              <InsColor value={item.color} onChange={(v) => onUpdate({ color: v })} />
            </InsRow>
          )}
          <InsRow label="Opacidade">
            <InsSlider
              min={0}
              max={100}
              step={1}
              value={Math.round(item.opacity * 100)}
              format={(v) => `${v}%`}
              onChange={(v) => onUpdate({ opacity: v / 100 })}
            />
          </InsRow>
          <InsRow label="Radius">
            <InsSwitch
              checked={item.keepRadius}
              onChange={(v) => onUpdate({ keepRadius: v })}
            />
          </InsRow>
        </div>
      )}
    </div>
  );
}

type ShapeRenderMode = "svg" | "div";

const SHAPE_RENDER_OPTIONS: Array<{ value: ShapeRenderMode; label: string }> = [
  { value: "svg", label: "SVG" },
  { value: "div", label: "DIV" },
];

const SHAPE_LIST: Array<{ id: string; label: string }> = [
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse",   label: "Ellipse" },
  { id: "line",      label: "Line" },
  { id: "arrow",     label: "Arrow" },
  { id: "polygon",   label: "Polygon" },
  { id: "star",      label: "Star" },
];

export type ShellControlVisibility = "show" | "hidden" | "hover";

const SHELL_VISIBILITY_OPTIONS: Array<{ value: ShellControlVisibility; label: string }> = [
  { value: "show", label: "Show" },
  { value: "hidden", label: "Hidden" },
  { value: "hover", label: "Hover" },
];

type ShellTabProps = {
  background: string;
  shellGrid: { enabled: boolean; type: ShellGridType };
  onUpdateBackground: (background: string) => void;
  onUpdateGrid: (grid: Partial<{ enabled: boolean; type: ShellGridType }>) => void;
  deviceVisibility: ShellControlVisibility;
  backVisibility: ShellControlVisibility;
  zoomVisibility: ShellControlVisibility;
  expandVisibility: ShellControlVisibility;
  onDeviceVisibilityChange: (v: ShellControlVisibility) => void;
  onBackVisibilityChange: (v: ShellControlVisibility) => void;
  onZoomVisibilityChange: (v: ShellControlVisibility) => void;
  onExpandVisibilityChange: (v: ShellControlVisibility) => void;
  isComponent?: boolean;
  inheritParentBackground?: boolean;
  hasParent?: boolean;
  onInheritParentBackgroundChange?: (value: boolean) => void;
  ancestorFrames?: AncestorFrame[];
  ancestorOverlay: AncestorOverlayState;
  onToggleAncestorOverlay: (enabled: boolean) => void;
  onUpdateAncestorItem: (id: string, patch: Partial<AncestorOverlayItem>) => void;
};

export function ShellTab({
  background,
  shellGrid,
  onUpdateBackground,
  onUpdateGrid,
  deviceVisibility,
  backVisibility,
  zoomVisibility,
  expandVisibility,
  onDeviceVisibilityChange,
  onBackVisibilityChange,
  onZoomVisibilityChange,
  onExpandVisibilityChange,
  isComponent = false,
  inheritParentBackground = false,
  hasParent = false,
  onInheritParentBackgroundChange,
  ancestorFrames = [],
  ancestorOverlay,
  onToggleAncestorOverlay,
  onUpdateAncestorItem,
}: ShellTabProps) {
  const [shapeRenderModes, setShapeRenderModes] = useState<Record<string, ShapeRenderMode>>(
    Object.fromEntries(SHAPE_LIST.map((s) => [s.id, "svg" as ShapeRenderMode])),
  );

  return (
    <>
      <InsSection title="Shell">
        {hasParent && (
          <InsRow label="Inherit">
            <InsSwitch
              checked={inheritParentBackground}
              onChange={(checked) => onInheritParentBackgroundChange?.(checked)}
            />
          </InsRow>
        )}
        <InsRow label="BG">
          <InsColor value={background} onChange={onUpdateBackground} />
        </InsRow>
      </InsSection>

      {isComponent && (
        <InsSection title="Elementos pai">
          <InsRow label="Ativar">
            <InsSwitch
              checked={ancestorOverlay.enabled}
              onChange={onToggleAncestorOverlay}
            />
          </InsRow>
          {ancestorFrames.length === 0 ? (
            <p className="text-[11px] leading-snug text-[#6B6B6B]">
              No parent elements for this component.
            </p>
          ) : (
            ancestorFrames.map((frame, depth) => (
              <AncestorCard
                key={frame.id}
                frame={frame}
                depth={depth}
                item={ancestorOverlayItemFor(ancestorOverlay, frame.id)}
                disabled={!ancestorOverlay.enabled}
                onUpdate={(patch) => onUpdateAncestorItem(frame.id, patch)}
              />
            ))
          )}
        </InsSection>
      )}

      <InsSection title="Controles">
        {isComponent && (
          <InsRow label="Device">
            <InsToggle
              value={deviceVisibility}
              onChange={(value) => onDeviceVisibilityChange(value as ShellControlVisibility)}
              options={SHELL_VISIBILITY_OPTIONS}
            />
          </InsRow>
        )}
        {isComponent && (
          <InsRow label="Back">
            <InsToggle
              value={backVisibility}
              onChange={(value) => onBackVisibilityChange(value as ShellControlVisibility)}
              options={SHELL_VISIBILITY_OPTIONS}
            />
          </InsRow>
        )}
        <InsRow label="Zoom">
          <InsToggle
            value={zoomVisibility}
            onChange={(value) => onZoomVisibilityChange(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Expand">
          <InsToggle
            value={expandVisibility}
            onChange={(value) => onExpandVisibilityChange(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Shapes">
        {SHAPE_LIST.map((shape) => (
          <InsRow key={shape.id} label={shape.label}>
            <InsToggle
              value={shapeRenderModes[shape.id] ?? "svg"}
              onChange={(value) =>
                setShapeRenderModes((prev) => ({ ...prev, [shape.id]: value as ShapeRenderMode }))
              }
              options={SHAPE_RENDER_OPTIONS}
            />
          </InsRow>
        ))}
      </InsSection>

      <InsSection title="Grade">
        <InsRow label="Enable">
          <InsSwitch
            checked={shellGrid.enabled}
            onChange={(enabled) => onUpdateGrid({ enabled })}
          />
        </InsRow>
        <InsRow label="Type">
          <InsToggle
            value={shellGrid.type}
            onChange={(value) => onUpdateGrid({ type: value as ShellGridType })}
            options={[
              { value: "dots", label: "Dots" },
              { value: "squares", label: "Squares" },
            ]}
          />
        </InsRow>
      </InsSection>
    </>
  );
}
