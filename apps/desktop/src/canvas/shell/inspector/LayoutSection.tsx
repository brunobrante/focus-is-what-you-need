// Inspector → Layout panel (the paper-style panel that folds Figma's Layout +
// Position into one). It authors the LAYOUT ENGINE fields on ElementStyles
// (flex/grid, the visual alignment pad, sizing modes, min/max, flips, absolute
// constraints, text resize) compiled by domain/canvas/layout.ts.
//
// Deliberately NOT wired to the canvas renderer yet: these controls write real
// CSS-bound fields but have no on-canvas effect (absolute positioning stays the
// default). The panel is the authoring surface; the renderer adopts the engine
// in a later pass. See docs/inspector-layout.md.

import type { ElementStyles, GridTrack, PadAlign } from "@/canvas/engine/types";
import {
  clamp,
  InsInput,
  InsRow,
  InsSection,
  InsSelect,
  InsToggle,
  updateNumber,
} from "./InsComponents";

type LayoutSectionProps = {
  styles: ElementStyles;
  /** True when the element lays out children (a "frame" — any div with kids). */
  hasChildren: boolean;
  /** The parent element's styles, or null at the root. Gates the child controls
   *  (sizing / align-self / order) and tells Fill which axis is the main axis. */
  parentStyles: ElementStyles | null;
  /** True at a top-level element (no parent → no in-parent / constraint controls). */
  isRoot: boolean;
  locked: boolean;
  onChange: (patch: Partial<ElementStyles>) => void;
};

// ─── The 9-point alignment pad ──────────────────────────────────────────────
// A visual 3×3 grid: clicking a cell sets alignX (column) + alignY (row). The
// engine maps these to justify-content / align-items per direction (and flips
// the mapping for a column) — so the pad stays visual and direction-agnostic.

const PADS: PadAlign[] = ["start", "center", "end"];

function AlignmentPad({
  alignX,
  alignY,
  onPick,
}: {
  alignX: PadAlign;
  alignY: PadAlign;
  onPick: (x: PadAlign, y: PadAlign) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-[8px] bg-[#1C1C1C] p-1">
      {PADS.map((y) =>
        PADS.map((x) => {
          const active = alignX === x && alignY === y;
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              title={`${y} ${x}`}
              onClick={() => onPick(x, y)}
              className="grid h-5 place-items-center rounded-[3px] transition-colors"
              style={{ background: active ? "#383838" : "transparent" }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: active ? "#FFFFFF" : "#5A5A5A",
                }}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}

// ─── A minimal grid track-list editor ───────────────────────────────────────

const TRACK_KINDS = ["fill", "auto", "min", "fixed"] as const;

function TrackEditor({
  label,
  tracks,
  onChange,
}: {
  label: string;
  tracks: GridTrack[];
  onChange: (next: GridTrack[]) => void;
}) {
  const set = (i: number, patch: Partial<GridTrack>) => {
    const next = tracks.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9A9A9A]">{label}</span>
        <div className="flex gap-1">
          <button
            type="button"
            title="Add track"
            onClick={() => onChange([...tracks, { kind: "fill", value: 1 }])}
            className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-[#242424] text-[#A6A6A6] transition-colors hover:bg-[#2E2E2E] hover:text-[#E2E2E2] disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            title="Remove track"
            onClick={() => onChange(tracks.slice(0, -1))}
            disabled={tracks.length === 0}
            className="h-[20px] w-[20px] rounded-[5px] border border-[#2C2C2C] text-[#A6A6A6] hover:border-[#3A3A3A] hover:text-[#E2E2E2] disabled:opacity-40"
          >
            −
          </button>
        </div>
      </div>
      {tracks.map((t, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <select
            value={t.kind}
            onChange={(e) => set(i, { kind: e.target.value as GridTrack["kind"] })}
            className="h-[30px] flex-1 rounded-[8px] border border-transparent bg-[#242424] px-2.5 text-[12px] text-[#EDEDED] capitalize outline-none transition-colors hover:bg-[#2C2C2C] focus:border-[#0D99FF]/70"
          >
            {TRACK_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          {(t.kind === "fill" || t.kind === "fixed") && (
            <div className="w-16">
              <InsInput
                value={String(t.value ?? (t.kind === "fill" ? 1 : 0))}
                onChange={(v) => updateNumber(v, (n) => set(i, { value: n }))}
                suffix={t.kind === "fill" ? "fr" : "px"}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section ────────────────────────────────────────────────────────────────

export function LayoutSection({
  styles,
  hasChildren,
  parentStyles,
  isRoot,
  locked,
  onChange,
}: LayoutSectionProps) {
  const display = styles.display ?? "block";
  const direction = styles.flexDirection ?? "row";
  const alignX = styles.alignX ?? "start";
  const alignY = styles.alignY ?? "start";

  // Min/max bound fields: empty clears to undefined, a valid number clamps to
  // >= 0, and anything non-numeric reverts (returns false) instead of coercing
  // to 0 like `Number(v) || 0` did (L5).
  const commitBound =
    (key: "minWidth" | "maxWidth" | "minHeight" | "maxHeight") => (v: string): boolean => {
      if (v.trim() === "") {
        onChange({ [key]: undefined });
        return true;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) return false;
      onChange({ [key]: clamp(n, 0, Infinity) });
      return true;
    };

  const perSidePadding =
    styles.paddingTop !== undefined ||
    styles.paddingRight !== undefined ||
    styles.paddingBottom !== undefined ||
    styles.paddingLeft !== undefined;

  // Child controls apply when this element flows inside a flex/grid parent.
  const parentDisplay = parentStyles?.display ?? "block";
  const parentIsFlow = parentDisplay === "flex" || parentDisplay === "grid";

  const togglePerSidePadding = () => {
    if (perSidePadding) {
      onChange({ paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined });
    } else {
      const u = styles.padding ?? 0;
      onChange({ paddingTop: u, paddingRight: u, paddingBottom: u, paddingLeft: u });
    }
  };

  return (
    <InsSection title="Layout" disabled={locked}>
      {/* Text auto-resize lives in Transform as the per-axis Fixed/Fit toggles
          (node.sizing, G4); the old authoring-only textResize enum is gone. */}

      {/* ── Container layout (any element with children) ── */}
      {hasChildren ? (
        <>
          <InsRow label="Display">
            <InsToggle
              value={display}
              onChange={(v) => onChange({ display: v as ElementStyles["display"] })}
              options={[
                { value: "block", label: "Block" },
                { value: "flex", label: "Flex" },
                { value: "grid", label: "Grid" },
              ]}
            />
          </InsRow>

          {display === "flex" ? (
            <>
              <InsRow label="Direction">
                <InsToggle
                  value={direction}
                  onChange={(v) => onChange({ flexDirection: v as ElementStyles["flexDirection"] })}
                  options={[
                    { value: "row", label: "Row" },
                    { value: "column", label: "Column" },
                  ]}
                />
              </InsRow>

              <InsRow label="Align">
                <AlignmentPad alignX={alignX} alignY={alignY} onPick={(x, y) => onChange({ alignX: x, alignY: y })} />
              </InsRow>

              <InsRow label="Distribute">
                <InsToggle
                  value={styles.distribute ?? "packed"}
                  onChange={(v) => onChange({ distribute: v === "packed" ? undefined : (v as ElementStyles["distribute"]) })}
                  options={[
                    { value: "packed", label: "Packed" },
                    { value: "space-between", label: "Between" },
                    { value: "space-around", label: "Around" },
                  ]}
                />
              </InsRow>

              <InsRow label="Stretch">
                <InsToggle
                  value={styles.counterStretch ? "on" : "off"}
                  onChange={(v) => onChange({ counterStretch: v === "on" ? true : undefined })}
                  options={[
                    { value: "off", label: "Off" },
                    { value: "on", label: "Stretch" },
                  ]}
                />
              </InsRow>

              {/* Gap — uniform; "Auto" is space-between distribution, never gap:auto. */}
              {styles.distribute ? null : (
                <InsRow label="Gap">
                  <InsInput
                    value={String(styles.gap ?? 0)}
                    onChange={(v) => updateNumber(v, (gap) => onChange({ gap }))}
                    suffix="px"
                  />
                </InsRow>
              )}

              <InsRow label="Wrap">
                <InsToggle
                  value={styles.flexWrap ?? "nowrap"}
                  onChange={(v) => onChange({ flexWrap: v as ElementStyles["flexWrap"] })}
                  options={[
                    { value: "nowrap", label: "No wrap" },
                    { value: "wrap", label: "Wrap" },
                  ]}
                />
              </InsRow>
            </>
          ) : null}

          {display === "grid" ? (
            <>
              <TrackEditor label="Columns" tracks={styles.gridColumns ?? []} onChange={(gridColumns) => onChange({ gridColumns })} />
              <TrackEditor label="Rows" tracks={styles.gridRows ?? []} onChange={(gridRows) => onChange({ gridRows })} />
              <InsRow label="Gap">
                <InsInput value={String(styles.gap ?? 0)} onChange={(v) => updateNumber(v, (gap) => onChange({ gap }))} suffix="px" />
              </InsRow>
            </>
          ) : null}

          {/* Padding — uniform, with a toggle to split into four sides. */}
          {display === "flex" || display === "grid" ? (
            <>
              <InsRow label="Padding">
                <InsInput
                  value={perSidePadding ? "Mixed" : String(styles.padding ?? 0)}
                  onChange={(v) => updateNumber(v, (padding) => onChange({ padding, paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined }))}
                  suffix="px"
                />
                <button
                  type="button"
                  title="Set each side individually"
                  onClick={togglePerSidePadding}
                  className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border border-transparent text-[11px] transition-colors hover:bg-[#2C2C2C]"
                  style={{ color: perSidePadding ? "#0D99FF" : "#8A8A8A", background: perSidePadding ? "#2C2C2C" : "transparent" }}
                >
                  4
                </button>
              </InsRow>
              {perSidePadding
                ? ([
                    ["paddingTop", "Top"],
                    ["paddingRight", "Right"],
                    ["paddingBottom", "Bottom"],
                    ["paddingLeft", "Left"],
                  ] as const).map(([key, label]) => (
                    <InsRow key={key} label={label}>
                      <InsInput
                        value={String(styles[key] ?? styles.padding ?? 0)}
                        onChange={(v) => updateNumber(v, (n) => onChange({ [key]: n } as Partial<ElementStyles>))}
                        suffix="px"
                      />
                    </InsRow>
                  ))
                : null}

              {/* Advanced flex behaviors. */}
              <InsRow label="Strokes">
                <InsToggle
                  value={styles.strokesIncluded ? "included" : "excluded"}
                  onChange={(v) => onChange({ strokesIncluded: v === "included" ? true : undefined })}
                  options={[
                    { value: "excluded", label: "Excluded" },
                    { value: "included", label: "Included" },
                  ]}
                />
              </InsRow>
              <InsRow label="Stacking">
                <InsToggle
                  value={styles.canvasStacking ?? "last"}
                  onChange={(v) => onChange({ canvasStacking: v === "first" ? "first" : undefined })}
                  options={[
                    { value: "last", label: "Last on top" },
                    { value: "first", label: "First on top" },
                  ]}
                />
              </InsRow>
            </>
          ) : null}
        </>
      ) : null}

      {/* ── Child-in-parent (this element inside a flex/grid parent) ── */}
      {!isRoot && parentIsFlow ? (
        <>
          <InsRow label="W mode">
            <InsToggle
              value={styles.widthMode ?? "fixed"}
              onChange={(v) => onChange({ widthMode: v as ElementStyles["widthMode"] })}
              options={[
                { value: "fixed", label: "Fixed" },
                { value: "hug", label: "Hug" },
                { value: "fill", label: "Fill" },
              ]}
            />
          </InsRow>
          <InsRow label="H mode">
            <InsToggle
              value={styles.heightMode ?? "fixed"}
              onChange={(v) => onChange({ heightMode: v as ElementStyles["heightMode"] })}
              options={[
                { value: "fixed", label: "Fixed" },
                { value: "hug", label: "Hug" },
                { value: "fill", label: "Fill" },
              ]}
            />
          </InsRow>
          <InsRow label="Align self">
            <InsSelect
              value={styles.alignSelf ?? "auto"}
              onChange={(v) => onChange({ alignSelf: v as ElementStyles["alignSelf"] })}
              options={["auto", "start", "center", "end", "stretch"]}
            />
          </InsRow>
          <InsRow label="Order">
            <InsInput value={String(styles.order ?? 0)} onChange={(v) => updateNumber(v, (order) => onChange({ order }))} />
          </InsRow>
        </>
      ) : null}

      {/* ── Min/max size bounds — per axis, on ANY element (docs/inspector-layout.md,
          D4): e.g. a min-height on a Hug container, not just flex/grid children. ── */}
      <InsRow label="Min W">
        <InsInput value={styles.minWidth === undefined ? "" : String(styles.minWidth)} placeholder="—" onChange={commitBound("minWidth")} suffix="px" />
      </InsRow>
      <InsRow label="Max W">
        <InsInput value={styles.maxWidth === undefined ? "" : String(styles.maxWidth)} placeholder="—" onChange={commitBound("maxWidth")} suffix="px" />
      </InsRow>
      <InsRow label="Min H">
        <InsInput value={styles.minHeight === undefined ? "" : String(styles.minHeight)} placeholder="—" onChange={commitBound("minHeight")} suffix="px" />
      </InsRow>
      <InsRow label="Max H">
        <InsInput value={styles.maxHeight === undefined ? "" : String(styles.maxHeight)} placeholder="—" onChange={commitBound("maxHeight")} suffix="px" />
      </InsRow>

      {/* ── Self transform: flips (compose with the Position rotation) ── */}
      <InsRow label="Flip">
        <InsToggle
          value={styles.flipH ? "on" : "off"}
          onChange={(v) => onChange({ flipH: v === "on" ? true : undefined })}
          options={[
            { value: "off", label: "H off" },
            { value: "on", label: "Flip H" },
          ]}
        />
        <InsToggle
          value={styles.flipV ? "on" : "off"}
          onChange={(v) => onChange({ flipV: v === "on" ? true : undefined })}
          options={[
            { value: "off", label: "V off" },
            { value: "on", label: "Flip V" },
          ]}
        />
      </InsRow>

      {/* ── Absolute constraints (how a free child reflows on frame resize).
          Absolute/free children only (docs/inspector-layout.md, D5): an in-flow
          flex/grid child is positioned by the layout engine, and the resize
          reflow (G5) skips those children for the same reason. ── */}
      {!isRoot && !parentIsFlow ? (
        <>
          <InsRow label="Pin X">
            <InsSelect
              value={styles.constraintH ?? "left"}
              onChange={(v) => onChange({ constraintH: v as ElementStyles["constraintH"] })}
              options={["left", "right", "left-right", "center", "scale"]}
            />
          </InsRow>
          <InsRow label="Pin Y">
            <InsSelect
              value={styles.constraintV ?? "top"}
              onChange={(v) => onChange({ constraintV: v as ElementStyles["constraintV"] })}
              options={["top", "bottom", "top-bottom", "center", "scale"]}
            />
          </InsRow>
        </>
      ) : null}
    </InsSection>
  );
}
