import { useState } from "react";
import type { ShellGridType } from "@/canvas/engine/types";
import { InsColor, InsMultiSelect, InsRow, InsSection, InsSwitch, InsToggle } from "./InsComponents";

type ShellControlVisibility = "show" | "hidden" | "hover";
type ShellWindowOption = "draft" | "reference";

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
};

export function ShellTab({ background, shellGrid, onUpdateBackground, onUpdateGrid }: ShellTabProps) {
  const [deviceButtonVisibility, setDeviceButtonVisibility] = useState<ShellControlVisibility>("show");
  const [zoomVisibility, setZoomVisibility] = useState<ShellControlVisibility>("show");
  const [expandVisibility, setExpandVisibility] = useState<ShellControlVisibility>("hover");
  const [enabledWindows, setEnabledWindows] = useState<ShellWindowOption[]>(["draft"]);

  return (
    <>
      <InsSection title="Shell">
        <InsRow label="BG">
          <InsColor value={background} onChange={onUpdateBackground} />
        </InsRow>

      </InsSection>

      <InsSection title="Feats">
        <InsRow label="Janelas">
          <InsMultiSelect
            value={enabledWindows}
            onChange={(value) => setEnabledWindows(value as ShellWindowOption[])}
            options={[
              { value: "draft", label: "Draft" },
              { value: "reference", label: "Referência" },
            ]}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Controles">
        <InsRow label="Device">
          <InsToggle
            value={deviceButtonVisibility}
            onChange={(value) => setDeviceButtonVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Zoom">
          <InsToggle
            value={zoomVisibility}
            onChange={(value) => setZoomVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
        <InsRow label="Expand">
          <InsToggle
            value={expandVisibility}
            onChange={(value) => setExpandVisibility(value as ShellControlVisibility)}
            options={SHELL_VISIBILITY_OPTIONS}
          />
        </InsRow>
      </InsSection>

      <InsSection title="Grade">
        <InsRow label="Ativar">
          <InsSwitch
            checked={shellGrid.enabled}
            onChange={(enabled) => onUpdateGrid({ enabled })}
            label="Grid"
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
