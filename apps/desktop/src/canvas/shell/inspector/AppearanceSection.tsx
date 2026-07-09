import { useMemo } from "react";
import { BLEND_MODES, blendLabel, blendValueFromLabel } from "@/domain/canvas/appearance";
import type { ElementStyles } from "@/canvas/engine/types";
import { tokenRef } from "@/domain/system-design/resolveTokenRef";
import type { RadiusToken } from "@/domain/system-design/types";
import { useResolvedSystemDesign } from "@/canvas/stage/resolvedSystemDesignContext";
import {
  clamp,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsSlider,
  InsTokenBind,
  InsToggle,
  updateNumber,
} from "./InsComponents";

type RadiusRole = "corner" | "ratio" | "none";

type AppearanceSectionProps = {
  styles: ElementStyles;
  /** Whether this element type exposes a radius control (def.radius). */
  radius: boolean;
  /** What `borderRadius` means for this type — "corner" px or "ratio" % (star). */
  radiusRole: RadiusRole;
  /** Static radius bounds for the "ratio" role (star inner-radius %). */
  radiusConstraint?: { min: number; max?: number };
  /** Element box size — drives the uniform corner-radius slider max (min(w,h)/2). */
  width: number;
  height: number;
  /** True when the element has children (a "group"/frame) — gates group blending. */
  hasChildren: boolean;
  locked: boolean;
  onChange: (patch: Partial<ElementStyles>) => void;
  /** Slider scrub lifecycle — transient while dragging, one commit on release (H3). */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

const cornerButtonBase =
  "grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent transition-colors";

/** A small icon hinting "individual corners" — two L-brackets at opposite corners. */
function CornersIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 5V3.5C2 2.67 2.67 2 3.5 2H5" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <path d="M10 7v1.5c0 .83-.67 1.5-1.5 1.5H7" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}

const CORNER_LABELS = ["Top L", "Top R", "Bot R", "Bot L"] as const;

// "Full" stores a large sentinel rather than the current min(w,h)/2, so the pill
// survives a resize — the radius is clamped only at render (CSS caps at 50%). D1.
const PILL_RADIUS = 9999;

export function AppearanceSection({
  styles,
  radius,
  radiusRole,
  radiusConstraint,
  width,
  height,
  hasChildren,
  locked,
  onChange,
  onScrubStart,
  onScrubEnd,
}: AppearanceSectionProps) {
  const opacityPct = Math.round((styles.opacity ?? 1) * 100);
  const uniformRadius = styles.borderRadius ?? 0;
  const perCorner = Array.isArray(styles.cornerRadii);
  // Radius token binding (G14): bind writes the ref + the token value as the
  // concrete fallback; any manual radius edit clears the ref.
  const resolvedDesign = useResolvedSystemDesign();
  const radiusTokens = useMemo(
    () =>
      (resolvedDesign?.radius.tokens ?? []).map((sourced) => {
        const token = sourced.token as RadiusToken;
        return { ref: tokenRef("radius", token.id), name: token.name, value: token.value };
      }),
    [resolvedDesign],
  );
  const cornerMax = Math.floor(Math.min(width, height) / 2);

  const setCorner = (index: number, value: number) => {
    const base = styles.cornerRadii ?? ([uniformRadius, uniformRadius, uniformRadius, uniformRadius] as [number, number, number, number]);
    const next = [...base] as [number, number, number, number];
    next[index] = Math.max(0, value);
    onChange({ cornerRadii: next, radiusRef: undefined });
  };

  const togglePerCorner = () => {
    if (perCorner) {
      onChange({ cornerRadii: undefined });
    } else {
      onChange({ cornerRadii: [uniformRadius, uniformRadius, uniformRadius, uniformRadius], radiusRef: undefined });
    }
  };

  const radiusSuffix = radiusRole === "ratio" ? "%" : "px";
  const sliderMin = radiusRole === "ratio" ? radiusConstraint?.min ?? 0 : 0;
  const sliderMax = radiusRole === "ratio" ? radiusConstraint?.max ?? 50 : Math.max(cornerMax, 1);

  return (
    <InsSection title="Appearance" disabled={locked}>
      {/* Opacity — paper-style slider + editable input. */}
      <InsRow label="Opacity">
        <InsInput
          value={String(opacityPct)}
          onChange={(value) => updateNumber(value, (next) => onChange({ opacity: clamp(next, 0, 100) / 100 }))}
          suffix="%"
        />
      </InsRow>
      <InsRow label="">
        <InsSlider
          value={opacityPct}
          min={0}
          max={100}
          step={1}
          onChange={(next) => onChange({ opacity: clamp(next, 0, 100) / 100 })}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          format={(v) => `${v}%`}
        />
      </InsRow>

      {/* Per-layer blend with the backdrop → mix-blend-mode. */}
      <InsRow label="Blend">
        <InsSelect
          value={blendLabel(styles.blendMode)}
          onChange={(label) => {
            const next = blendValueFromLabel(label);
            onChange({ blendMode: next === "normal" ? undefined : next });
          }}
          options={BLEND_MODES.map((m) => m.label)}
        />
      </InsRow>

      {/* Group blending (only a div with children) → isolation. */}
      {hasChildren ? (
        <InsRow label="Blending">
          <InsToggle
            value={styles.isolation === "isolate" ? "isolate" : "auto"}
            onChange={(value) => onChange({ isolation: value === "isolate" ? "isolate" : undefined })}
            options={[
              { value: "auto", label: "Pass through" },
              { value: "isolate", label: "Normal" },
            ]}
          />
        </InsRow>
      ) : null}

      {/* Corner radius — type-aware. */}
      {radius ? (
        radiusRole === "ratio" ? (
          <>
            <InsRow label="Radius">
              <InsInput
                value={String(uniformRadius)}
                onChange={(value) => updateNumber(value, (r) => onChange({ borderRadius: r }))}
                suffix={radiusSuffix}
              />
            </InsRow>
            <InsRow label="">
              <InsSlider
                value={clamp(uniformRadius, sliderMin, sliderMax)}
                min={sliderMin}
                max={sliderMax}
                step={1}
                onChange={(r) => onChange({ borderRadius: r })}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
                format={(v) => `${v}%`}
              />
            </InsRow>
          </>
        ) : (
          <>
            <InsRow label="Radius">
              <InsInput
                value={perCorner ? "Mixed" : String(uniformRadius)}
                onChange={(value) => updateNumber(value, (r) => onChange({ borderRadius: Math.max(0, r), cornerRadii: undefined, radiusRef: undefined }))}
                suffix={radiusSuffix}
              />
              <button
                type="button"
                title="Pill — round the corners fully"
                onClick={() => onChange({ borderRadius: PILL_RADIUS, cornerRadii: undefined, radiusRef: undefined })}
                className="grid h-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent px-2 text-[11px] text-[#9A9A9A] transition-colors hover:bg-[#2C2C2C] hover:text-[#E2E2E2]"
              >
                Full
              </button>
              <button
                type="button"
                title="Set each corner individually"
                onClick={togglePerCorner}
                className={`${cornerButtonBase} ${
                  perCorner
                    ? "bg-[#2C2C2C] text-[#E2E2E2]"
                    : "text-[#9A9A9A] hover:bg-[#2C2C2C] hover:text-[#E2E2E2]"
                }`}
              >
                <CornersIcon />
              </button>
            </InsRow>
            {perCorner ? (
              CORNER_LABELS.map((label, index) => (
                <InsRow key={label} label={label}>
                  <InsInput
                    value={String(styles.cornerRadii?.[index] ?? uniformRadius)}
                    onChange={(value) => updateNumber(value, (r) => setCorner(index, r))}
                    suffix="px"
                  />
                </InsRow>
              ))
            ) : (
              <InsRow label="">
                <InsSlider
                  value={clamp(uniformRadius, 0, sliderMax)}
                  min={0}
                  max={sliderMax}
                  step={1}
                  onChange={(r) => onChange({ borderRadius: r, radiusRef: undefined })}
                  onScrubStart={onScrubStart}
                  onScrubEnd={onScrubEnd}
                  format={(v) => `${v}`}
                />
              </InsRow>
            )}
            {radiusTokens.length > 0 ? (
              <InsRow label="Token">
                <InsTokenBind
                  boundRef={styles.radiusRef}
                  options={radiusTokens}
                  onBind={(option) => {
                    const token = radiusTokens.find((t) => t.ref === option.ref);
                    onChange({
                      radiusRef: option.ref,
                      borderRadius: token?.value ?? uniformRadius,
                      cornerRadii: undefined,
                    });
                  }}
                  onUnbind={() => onChange({ radiusRef: undefined })}
                />
              </InsRow>
            ) : null}
          </>
        )
      ) : null}
    </InsSection>
  );
}
