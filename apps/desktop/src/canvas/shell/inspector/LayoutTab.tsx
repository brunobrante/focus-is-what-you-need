import {
  CANVAS_FEATURE_WINDOW_ORDER,
  CANVAS_WINDOW_LABELS,
  type CanvasFeatureFlags,
  type CanvasFeatureWindowType,
} from "@/canvas/canvasUtils";
import { InsSection, InsSwitch } from "./InsComponents";

/**
 * Canvas window controls, surfaced in the Inspector when the top nav is hidden
 * because only the Current window is enabled. Toggling a feature window on brings
 * the nav back (and this tab disappears); the nav's "…" menu then owns split/layout.
 */
export function LayoutTab({
  canvasFeatures,
  onCanvasFeatureChange,
}: {
  canvasFeatures: CanvasFeatureFlags;
  onCanvasFeatureChange: (feature: CanvasFeatureWindowType, enabled: boolean) => void;
}) {
  return (
    <InsSection title="Windows">
      {CANVAS_FEATURE_WINDOW_ORDER.map((feature) => (
        <div key={feature} className="flex items-center justify-between">
          <span className="text-[11px] text-[#CFCFCF]" style={{ letterSpacing: "0.2px" }}>
            {CANVAS_WINDOW_LABELS[feature]}
          </span>
          <InsSwitch
            checked={canvasFeatures[feature]}
            onChange={(enabled) => onCanvasFeatureChange(feature, enabled)}
          />
        </div>
      ))}
    </InsSection>
  );
}
