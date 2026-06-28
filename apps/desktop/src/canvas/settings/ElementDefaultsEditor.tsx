import { useState } from "react";

import type { InsertTool } from "@/canvas/engine/types";
import type {
  CanvasElementDefault,
  CanvasElementDefaultsSettings,
  DeepPartial,
  ElementSizePolicy,
} from "@/domain/settings/types";

export type ElementDefaultsOverride = DeepPartial<CanvasElementDefaultsSettings>;

type SettingsScope = "global" | "workspace" | "project";

type Props = {
  scope: SettingsScope;
  /** Resolved baseline from the parent scopes (defaults -> ... -> parent). */
  inherited: CanvasElementDefaultsSettings;
  /** This scope's own override. For global this is the full element defaults. */
  override: ElementDefaultsOverride;
  /** Human label for the parent scope, e.g. "default", "Global", "Workspace". */
  parentLabel: string;
  onChange: (next: ElementDefaultsOverride) => void;
};

// Display order — the elements the product talks about come first.
const TOOL_ORDER: InsertTool[] = [
  "text",
  "rect",
  "wrapper",
  "image",
  "icon",
  "ellipse",
  "line",
  "arrow",
  "polygon",
  "star",
];

const TOOL_LABEL: Record<InsertTool, string> = {
  text: "Text",
  rect: "Rectangle",
  wrapper: "Wrapper",
  image: "Image",
  icon: "Icon",
  ellipse: "Ellipse",
  line: "Line",
  arrow: "Arrow",
  polygon: "Polygon",
  star: "Star",
};

function capabilities(tool: InsertTool) {
  return {
    isText: tool === "text",
    fill: tool !== "text" && tool !== "line" && tool !== "arrow",
    border: tool !== "text" && tool !== "line" && tool !== "arrow",
    radius: tool === "rect" || tool === "wrapper" || tool === "image" || tool === "icon",
    font: tool === "text",
  };
}

function applyToolPatch(
  tool: CanvasElementDefault,
  patch: DeepPartial<CanvasElementDefault>,
): CanvasElementDefault {
  return {
    ...tool,
    ...patch,
    styles: { ...tool.styles, ...(patch.styles ?? {}) },
  } as CanvasElementDefault;
}

function mergeTool(
  base: CanvasElementDefault,
  over: DeepPartial<CanvasElementDefault> | undefined,
): CanvasElementDefault {
  return over ? applyToolPatch(base, over) : base;
}

export function ElementDefaultsEditor({
  scope,
  inherited,
  override,
  parentLabel,
  onChange,
}: Props) {
  const allowInherit = scope !== "global";
  const [open, setOpen] = useState<InsertTool | null>(null);

  const effectiveTool = (tool: InsertTool): CanvasElementDefault =>
    mergeTool(inherited.tools[tool], override.tools?.[tool]);

  const isCustom = (tool: InsertTool): boolean =>
    allowInherit ? Boolean(override.tools?.[tool]) : true;

  const setToolFull = (tool: InsertTool, full: CanvasElementDefault | null) => {
    const tools = { ...(override.tools ?? {}) };
    if (full === null) delete tools[tool];
    else tools[tool] = full;
    onChange({ ...override, tools });
  };

  const patchTool = (tool: InsertTool, patch: DeepPartial<CanvasElementDefault>) => {
    // Per-tool granularity: editing any field makes this tool owned by the scope,
    // snapshotting the inherited value first so unchanged fields are preserved.
    const current = effectiveTool(tool);
    setToolFull(tool, applyToolPatch(current, patch));
  };

  const setCustom = (tool: InsertTool, on: boolean) => {
    setToolFull(tool, on ? effectiveTool(tool) : null);
  };

  return (
    <div className="grid gap-5">
      {scope === "global" ? (
        <ScalingSection inherited={inherited} override={override} onChange={onChange} />
      ) : (
        <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
          Values shown in muted text are inherited from <strong>{parentLabel}</strong>.
          Toggle an element to <em>Custom</em> to override it for this {scope}.
        </p>
      )}

      <div className="grid gap-2.5">
        {TOOL_ORDER.map((tool) => {
          const caps = capabilities(tool);
          const eff = effectiveTool(tool);
          const custom = isCustom(tool);
          const expanded = open === tool;
          const editable = custom; // global is always custom
          return (
            <div
              key={tool}
              className="rounded-[12px] border border-[var(--border)] overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : tool)}
                  className="flex flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
                >
                  <span className="text-[13px] font-medium text-[var(--text)]">
                    {TOOL_LABEL[tool]}
                  </span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.4px]",
                      allowInherit
                        ? custom
                          ? "bg-[#5b6cff22] text-[#9aa6ff]"
                          : "bg-[var(--surface)] text-[var(--text-faint)]"
                        : "hidden",
                    ].join(" ")}
                  >
                    {custom ? "Custom" : "Inherited"}
                  </span>
                </button>
                {allowInherit ? (
                  <MiniSwitch
                    checked={custom}
                    ariaLabel={`Customize ${TOOL_LABEL[tool]} for this ${scope}`}
                    onChange={(on) => setCustom(tool, on)}
                  />
                ) : null}
              </div>

              {expanded ? (
                <div
                  className={[
                    "border-t border-[var(--border)] px-4 py-4",
                    editable ? "" : "opacity-50",
                  ].join(" ")}
                >
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                    <Field label="Width">
                      <NumberInput
                        value={eff.width}
                        disabled={!editable}
                        onChange={(v) => patchTool(tool, { width: v })}
                      />
                    </Field>
                    <Field label="Height">
                      <NumberInput
                        value={eff.height}
                        disabled={!editable}
                        onChange={(v) => patchTool(tool, { height: v })}
                      />
                    </Field>
                    <Field
                      label="Size mode"
                      hint="Auto adapts to the edited frame; Fixed keeps the literal size."
                    >
                      <ModeToggle
                        value={eff.sizeMode ?? "auto"}
                        disabled={!editable}
                        onChange={(m) => patchTool(tool, { sizeMode: m })}
                      />
                    </Field>
                    <div />

                    {caps.fill ? (
                      <Field label="Fill">
                        <ColorInput
                          value={eff.styles.background ?? "#ffffff"}
                          disabled={!editable}
                          onChange={(v) => patchTool(tool, { styles: { background: v } })}
                        />
                      </Field>
                    ) : null}
                    {caps.isText ? (
                      <Field label="Text color">
                        <ColorInput
                          value={eff.styles.color ?? "#000000"}
                          disabled={!editable}
                          onChange={(v) => patchTool(tool, { styles: { color: v } })}
                        />
                      </Field>
                    ) : null}

                    {caps.radius ? (
                      <Field label="Corner radius">
                        <NumberInput
                          value={eff.styles.borderRadius ?? 0}
                          disabled={!editable}
                          onChange={(v) => patchTool(tool, { styles: { borderRadius: v } })}
                        />
                      </Field>
                    ) : null}

                    {caps.border ? (
                      <>
                        <Field label="Border width">
                          <NumberInput
                            value={eff.styles.borderWidth ?? 0}
                            disabled={!editable}
                            onChange={(v) => patchTool(tool, { styles: { borderWidth: v } })}
                          />
                        </Field>
                        <Field label="Border color">
                          <ColorInput
                            value={eff.styles.borderColor ?? "#000000"}
                            disabled={!editable}
                            onChange={(v) => patchTool(tool, { styles: { borderColor: v } })}
                          />
                        </Field>
                      </>
                    ) : null}

                    {caps.font ? (
                      <>
                        <Field label="Font family">
                          <TextInput
                            value={eff.styles.fontFamily ?? ""}
                            disabled={!editable}
                            onChange={(v) => patchTool(tool, { styles: { fontFamily: v } })}
                          />
                        </Field>
                        <Field label="Font weight">
                          <TextInput
                            value={eff.styles.fontWeight ?? ""}
                            disabled={!editable}
                            onChange={(v) => patchTool(tool, { styles: { fontWeight: v } })}
                          />
                        </Field>
                        <Field label="Font size">
                          <NumberInput
                            value={eff.styles.fontSize ?? 0}
                            disabled={!editable}
                            onChange={(v) => patchTool(tool, { styles: { fontSize: v } })}
                          />
                        </Field>
                        <Field
                          label="Font size mode"
                          hint="Auto scales to the frame; Fixed keeps the literal size."
                        >
                          <ModeToggle
                            value={eff.fontSizeMode ?? "auto"}
                            disabled={!editable}
                            onChange={(m) => patchTool(tool, { fontSizeMode: m })}
                          />
                        </Field>
                        <Field
                          label="Snap to design system"
                          hint="Round an auto-computed font size to the nearest design-system size."
                        >
                          <MiniSwitch
                            checked={(eff.fontSizeSnap ?? "off") === "designSystem"}
                            ariaLabel="Snap font size to design system"
                            disabled={!editable}
                            onChange={(on) =>
                              patchTool(tool, {
                                fontSizeSnap: on ? "designSystem" : "off",
                              })
                            }
                          />
                        </Field>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScalingSection({
  inherited,
  override,
  onChange,
}: {
  inherited: CanvasElementDefaultsSettings;
  override: ElementDefaultsOverride;
  onChange: (next: ElementDefaultsOverride) => void;
}) {
  const referenceSize = override.referenceSize ?? inherited.referenceSize;
  const minScale = override.minScale ?? inherited.minScale;
  const maxScale = override.maxScale ?? inherited.maxScale;
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.5px] text-[var(--text-faint)] font-medium">
        Adaptive sizing
      </div>
      <div className="rounded-[12px] border border-[var(--border)] px-4 py-4 grid grid-cols-3 gap-x-5">
        <Field label="Reference size" hint="Frame size that maps to 1× scale.">
          <NumberInput
            value={referenceSize}
            onChange={(v) => onChange({ ...override, referenceSize: v })}
          />
        </Field>
        <Field label="Min scale">
          <NumberInput
            value={minScale}
            step={0.1}
            onChange={(v) => onChange({ ...override, minScale: v })}
          />
        </Field>
        <Field label="Max scale">
          <NumberInput
            value={maxScale}
            step={0.1}
            onChange={(v) => onChange({ ...override, maxScale: v })}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Small controls ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-[var(--text-faint)]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-8 w-full rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[#5b6cff] disabled:cursor-not-allowed disabled:opacity-60";

function NumberInput({
  value,
  onChange,
  disabled,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <input
      type="number"
      className={inputClass}
      value={Number.isFinite(value) ? value : 0}
      step={step}
      disabled={disabled}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

function TextInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      className={inputClass}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="h-8 w-9 shrink-0 cursor-pointer rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        type="text"
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: ElementSizePolicy;
  onChange: (value: ElementSizePolicy) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-[8px] border border-[var(--border-strong)] p-0.5">
      {(["auto", "fixed"] as ElementSizePolicy[]).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={[
              "cursor-pointer rounded-[6px] px-3 py-1 text-[12px] capitalize disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "bg-[#5b6cff] text-white"
                : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

function MiniSwitch({
  checked,
  ariaLabel,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "inline-flex shrink-0 items-center",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        className={[
          "relative h-5 w-9 rounded-full border transition-colors",
          checked
            ? "border-[#5b6cff] bg-[#5b6cff]"
            : "border-[var(--border-strong)] bg-[var(--surface)]",
        ].join(" ")}
      >
        <span
          className="absolute top-1/2 h-3.5 w-3.5 rounded-full bg-white transition-transform"
          style={{ transform: `translate(${checked ? 18 : 3}px, -50%)` }}
        />
      </span>
    </label>
  );
}
