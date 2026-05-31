import { useState } from "react";
import type { ShellGridType } from "@/canvas/engine/types";
import { InsColor, InsRow, InsSection, InsSwitch, InsToggle } from "./InsComponents";

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
}: ShellTabProps) {
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [referenceEnabled, setReferenceEnabled] = useState(false);
  const [versoesEnabled, setVersoesEnabled] = useState(false);
  const [shapeRenderModes, setShapeRenderModes] = useState<Record<string, ShapeRenderMode>>(
    Object.fromEntries(SHAPE_LIST.map((s) => [s.id, "svg" as ShapeRenderMode])),
  );

  return (
    <>
      <InsSection title="Shell">
        <InsRow label="BG">
          <InsColor value={background} onChange={onUpdateBackground} />
        </InsRow>

      </InsSection>

      <InsSection title="Feats">
        <InsRow label="Draft">
          <InsSwitch checked={draftEnabled} onChange={setDraftEnabled} />
        </InsRow>
        <InsRow label="Reference">
          <InsSwitch checked={referenceEnabled} onChange={setReferenceEnabled} />
        </InsRow>
        <InsRow label="Versions">
          <InsSwitch checked={versoesEnabled} onChange={setVersoesEnabled} />
        </InsRow>
      </InsSection>

      <InsSection title="Controles">
        <InsRow label="Device">
          <InsToggle
            value={deviceVisibility}
            onChange={(value) => onDeviceVisibilityChange(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Back">
          <InsToggle
            value={backVisibility}
            onChange={(value) => onBackVisibilityChange(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
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
