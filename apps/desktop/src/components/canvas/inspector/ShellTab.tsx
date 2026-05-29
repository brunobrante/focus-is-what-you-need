import { useState } from "react";
import type { ShellPattern } from "@/lib/editor/types";
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
  pattern: ShellPattern;
  onUpdateBackground: (background: string) => void;
  onUpdatePattern: (pattern: ShellPattern) => void;
};

export function ShellTab({ background, pattern, onUpdateBackground, onUpdatePattern }: ShellTabProps) {
  const [deviceButtonVisibility, setDeviceButtonVisibility] = useState<ShellControlVisibility>("show");
  const [zoomVisibility, setZoomVisibility] = useState<ShellControlVisibility>("show");
  const [expandVisibility, setExpandVisibility] = useState<ShellControlVisibility>("hover");
  const [showDots, setShowDots] = useState(true);
  const [showSquares, setShowSquares] = useState(false);
  const [enabledWindows, setEnabledWindows] = useState<ShellWindowOption[]>(["draft"]);

  return (
    <>
      <InsSection title="Shell">
        <InsRow label="BG">
          <InsColor value={background} onChange={onUpdateBackground} />
        </InsRow>
        <InsRow label="Padrão">
          <InsToggle
            value={pattern}
            onChange={(value) => onUpdatePattern(value as ShellPattern)}
            options={[
              { value: "dots", label: "Pontilhado" },
              { value: "grid", label: "Quadrados" },
            ]}
          />
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
        <InsRow label="Dots">
          <InsSwitch checked={showDots} onChange={setShowDots} label="Pontilhado" />
        </InsRow>
        <InsRow label="Squares">
          <InsSwitch checked={showSquares} onChange={setShowSquares} label="Quadrados" />
        </InsRow>
      </InsSection>
    </>
  );
}
