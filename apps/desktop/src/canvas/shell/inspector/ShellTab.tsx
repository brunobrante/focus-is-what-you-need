import { useState } from "react";
import type { ShellGridType } from "@/canvas/engine/types";
import { InsColor, InsRow, InsSection, InsSwitch, InsToggle } from "./InsComponents";

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
  zoomVisibility: ShellControlVisibility;
  expandVisibility: ShellControlVisibility;
  onDeviceVisibilityChange: (v: ShellControlVisibility) => void;
  onZoomVisibilityChange: (v: ShellControlVisibility) => void;
  onExpandVisibilityChange: (v: ShellControlVisibility) => void;
};

export function ShellTab({
  background,
  shellGrid,
  onUpdateBackground,
  onUpdateGrid,
  deviceVisibility,
  zoomVisibility,
  expandVisibility,
  onDeviceVisibilityChange,
  onZoomVisibilityChange,
  onExpandVisibilityChange,
}: ShellTabProps) {
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [referenceEnabled, setReferenceEnabled] = useState(false);

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
        <InsRow label="Referência">
          <InsSwitch checked={referenceEnabled} onChange={setReferenceEnabled} />
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

      <InsSection title="Grade">
        <InsRow label="Ativar">
          <InsSwitch
            checked={shellGrid.enabled}
            onChange={(enabled) => onUpdateGrid({ enabled })}
          />
        </InsRow>
        <InsRow label="Tipo">
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
