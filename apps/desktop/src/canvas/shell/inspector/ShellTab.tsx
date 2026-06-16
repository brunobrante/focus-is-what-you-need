import { useState } from "react";
import type { AncestorOverlayItem, AncestorOverlayState, ShellGridType } from "@/canvas/engine/types";
import { ancestorOverlayItemFor, type AncestorFrame } from "@/canvas/canvasUtils";
import { InsColor, InsRow, InsSection, InsSlider, InsSwitch, InsToggle } from "./InsComponents";

type ShapeRenderMode = "svg" | "div";

const SHAPE_RENDER_OPTIONS: Array<{ value: ShapeRenderMode; label: string }> = [
  { value: "svg", label: "SVG" },
  { value: "div", label: "DIV" },
];

const SHAPE_LIST: Array<{ id: string; label: string }> = [
  { id: "rectangle", label: "Rectangle" },
  { id: "ellipse",   label: "Elipse" },
  { id: "line",      label: "Linha" },
  { id: "arrow",     label: "Seta" },
  { id: "polygon",   label: "Polygon" },
  { id: "star",      label: "Estrela" },
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
              Sem elementos pai para este componente.
            </p>
          ) : (
            ancestorFrames.map((frame) => {
              const item = ancestorOverlayItemFor(ancestorOverlay, frame.id);
              return (
                <div
                  key={frame.id}
                  className="flex flex-col gap-2 rounded-md border border-[#2C2C2C] bg-[#1A1A1A] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-[#CFCFCF]">{frame.name}</span>
                    <span className="shrink-0 text-[9px] uppercase tracking-[0.4px] text-[#6B6B6B]">
                      {frame.kind === "screen" ? "Screen" : "Componente"}
                    </span>
                  </div>
                  <InsRow label="Herdar cor">
                    <InsSwitch
                      checked={item.inheritColor}
                      onChange={(v) => onUpdateAncestorItem(frame.id, { inheritColor: v })}
                    />
                  </InsRow>
                  {!item.inheritColor && (
                    <InsRow label="Cor">
                      <InsColor
                        value={item.color}
                        onChange={(v) => onUpdateAncestorItem(frame.id, { color: v })}
                      />
                    </InsRow>
                  )}
                  <InsRow label="Opacidade">
                    <InsSlider
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(item.opacity * 100)}
                      format={(v) => `${v}%`}
                      onChange={(v) => onUpdateAncestorItem(frame.id, { opacity: v / 100 })}
                    />
                  </InsRow>
                  <InsRow label="Radius">
                    <InsSwitch
                      checked={item.keepRadius}
                      onChange={(v) => onUpdateAncestorItem(frame.id, { keepRadius: v })}
                    />
                  </InsRow>
                </div>
              );
            })
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

      <InsSection title="Formas">
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
