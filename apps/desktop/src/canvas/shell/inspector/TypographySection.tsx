import type { ElementStyles } from "@/canvas/engine/types";
import {
  clamp,
  InsColor,
  type InsColorToken,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsSwitch,
  InsToggle,
  updateNumber,
} from "./InsComponents";

// Friendly labels for `text-transform`, kept off the stored slug.
const CASE_LABELS: Record<NonNullable<ElementStyles["textTransform"]>, string> = {
  none: "As typed",
  uppercase: "UPPERCASE",
  lowercase: "lowercase",
  capitalize: "Capitalize",
};
const CASE_OPTIONS = Object.values(CASE_LABELS);
const LABEL_TO_CASE = new Map(
  (Object.keys(CASE_LABELS) as Array<NonNullable<ElementStyles["textTransform"]>>).map(
    (k) => [CASE_LABELS[k], k] as const,
  ),
);

/**
 * The Typography panel — shown only for text elements. Maps cleanly to CSS text
 * properties; the value is in the non-obvious conversions (letter-spacing %,
 * variable-font weight, vertical align, tight bounds), which `compileTypography`
 * handles. See docs/inspector-typography.md.
 *
 * `heightFit` reflects that vertical align is inert when the box hugs its content
 * (H = Fit) — the control stays, but we say so.
 */
export function TypographySection({
  styles,
  tokens,
  heightFit,
  locked,
  onChange,
}: {
  styles: ElementStyles;
  tokens: InsColorToken[];
  heightFit: boolean;
  locked: boolean;
  onChange: (patch: Partial<ElementStyles>) => void;
}) {
  const lineHeightAuto = styles.lineHeight === undefined;
  const caseValue = styles.textTransform ?? "none";

  return (
    <InsSection title="Typography" disabled={locked}>
      <InsRow label="Font">
        <InsInput
          value={styles.fontFamily ?? ""}
          onChange={(fontFamily) => onChange({ fontFamily: fontFamily.trim() || undefined })}
          placeholder="System Sans-Serif"
        />
      </InsRow>

      <InsRow label="Size">
        <InsInput
          value={String(styles.fontSize ?? 14)}
          onChange={(v) => updateNumber(v, (fontSize) => onChange({ fontSize: clamp(fontSize, 1, 300) }))}
          suffix="px"
        />
      </InsRow>

      {/* Continuous weight (drives the `wght` axis on variable fonts). */}
      <InsRow label="Weight">
        <InsInput
          value={String(Number(styles.fontWeight ?? 400))}
          onChange={(v) => updateNumber(v, (w) => onChange({ fontWeight: String(clamp(Math.round(w), 1, 1000)) }))}
        />
      </InsRow>

      <InsRow label="Style">
        <InsToggle
          value={styles.fontStyle === "italic" ? "italic" : "normal"}
          onChange={(value) => onChange({ fontStyle: value as ElementStyles["fontStyle"] })}
          options={[
            { value: "normal", label: "Normal" },
            { value: "italic", label: "Italic" },
          ]}
        />
      </InsRow>

      <InsRow label="Color">
        <InsColor
          value={styles.color ?? "#111827"}
          onChange={(color) => onChange({ color, colorRef: undefined })}
          tokens={tokens}
          boundRef={styles.colorRef}
          onBind={(colorRef) => onChange({ colorRef })}
        />
      </InsRow>

      {/* Auto = `line-height: normal` (font-metric ratio); Custom = unitless number. */}
      <InsRow label="Line">
        <InsToggle
          value={lineHeightAuto ? "auto" : "custom"}
          onChange={(value) => onChange({ lineHeight: value === "auto" ? undefined : styles.lineHeight ?? 1.2 })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "custom", label: "Custom" },
          ]}
        />
      </InsRow>
      {lineHeightAuto ? null : (
        <InsRow label="Height">
          <InsInput
            value={String(styles.lineHeight ?? 1.2)}
            onChange={(v) => updateNumber(v, (lineHeight) => onChange({ lineHeight: Math.max(0, lineHeight) }))}
            suffix="×"
          />
        </InsRow>
      )}

      <InsRow label="Spacing">
        <InsInput
          value={String(styles.letterSpacing ?? 0)}
          onChange={(v) => updateNumber(v, (letterSpacing) => onChange({ letterSpacing }))}
          suffix="%"
        />
      </InsRow>

      <InsRow label="Align">
        <InsSelect
          value={styles.textAlign ?? "left"}
          onChange={(value) => onChange({ textAlign: value as ElementStyles["textAlign"] })}
          options={["left", "center", "right", "justify"]}
        />
      </InsRow>

      <InsRow label="V-align">
        <InsToggle
          value={styles.verticalAlign ?? "top"}
          onChange={(value) => onChange({ verticalAlign: value as ElementStyles["verticalAlign"] })}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
      </InsRow>
      {heightFit && (styles.verticalAlign ?? "top") !== "top" ? (
        <p className="text-[11px] leading-4 text-[#6B6B6B]">
          Vertical alignment only appears with a fixed height (H = Fit ignores it).
        </p>
      ) : null}

      <InsRow label="Case">
        <InsSelect
          value={CASE_LABELS[caseValue]}
          onChange={(label) =>
            onChange({ textTransform: LABEL_TO_CASE.get(label) ?? "none" })
          }
          options={CASE_OPTIONS}
        />
      </InsRow>

      <InsRow label="Strike">
        <InsSwitch
          checked={styles.lineThrough === true}
          onChange={(lineThrough) => onChange({ lineThrough })}
        />
      </InsRow>

      {/* Tight cap/baseline bounds — matches what the design tool draws (Safari 18.2+). */}
      <InsRow label="Tight box">
        <InsSwitch
          checked={styles.textBoxTrim === true}
          onChange={(textBoxTrim) => onChange({ textBoxTrim })}
        />
      </InsRow>
    </InsSection>
  );
}
