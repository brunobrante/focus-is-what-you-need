import { InsSection, InsRow, InsToggle } from "./InsComponents";
import type { ShellControlVisibility } from "./ShellTab";

const SHELL_VISIBILITY_OPTIONS: Array<{ value: ShellControlVisibility; label: string }> = [
  { value: "show", label: "Show" },
  { value: "hidden", label: "Hidden" },
  { value: "hover", label: "Hover" },
];

// The Shell tab body for the References window. References has no shell background,
// device frame, parent overlay, or shapes — only the chrome controls that apply to
// any canvas window: Zoom and Expand visibility (the same global settings the canvas
// windows' Shell tab drives). Device/Back are omitted (no device, no parent here).
export function ReferencesShellTab({
  zoomVisibility,
  expandVisibility,
  onZoomVisibilityChange,
  onExpandVisibilityChange,
}: {
  zoomVisibility: ShellControlVisibility;
  expandVisibility: ShellControlVisibility;
  onZoomVisibilityChange: (value: ShellControlVisibility) => void;
  onExpandVisibilityChange: (value: ShellControlVisibility) => void;
}) {
  return (
    <InsSection title="Controles">
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
  );
}
