import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronDown, IconPlay } from "@/components/icons";
import { devicesByPlatform, deviceResolutionLabel } from "@/canvas/devices";
import type { ProjectType } from "@/lib/data/types";
import type { PreviewSettings } from "../canvasUtils";

/**
 * The Preview launcher sits above the Inspector. The play button toggles the
 * view-only Preview window; the caret opens a small settings popover (fit,
 * device frame, background) — Figma-style.
 */
export function PreviewLauncher({
  previewOpen,
  onToggle,
  settings,
  onSettingsChange,
  projectType,
}: {
  previewOpen: boolean;
  onToggle: () => void;
  settings: PreviewSettings;
  onSettingsChange: (next: PreviewSettings) => void;
  projectType: ProjectType;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative flex h-9 w-[280px] shrink-0 items-stretch gap-1 rounded-xl border border-[#2C2C2C] bg-[#171717] p-1 text-[#F2F2F2]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={previewOpen}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-colors duration-100"
        style={{
          background: previewOpen ? "rgba(13,153,255,0.18)" : "#202020",
          color: previewOpen ? "#7CC4FF" : "#CFCFCF",
          letterSpacing: "0.1px",
        }}
      >
        <IconPlay size={12} />
        {previewOpen ? "Previewing" : "Preview"}
      </button>

      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Preview settings"
        aria-expanded={menuOpen}
        className="grid w-7 place-items-center rounded-md transition-colors duration-100 hover:bg-[#242424]"
        style={{ background: menuOpen ? "#242424" : "#202020", color: menuOpen ? "#F2F2F2" : "#8A8A8A" }}
      >
        <IconChevronDown size={10} />
      </button>

      {menuOpen ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-[30] w-[240px] overflow-hidden rounded-xl border border-[#2C2C2C] bg-[#171717] p-2 text-[#F2F2F2]"
          style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset" }}
        >
          <Section title="Size">
            <Segmented
              value={settings.fit}
              options={[
                { value: "fit", label: "Fit" },
                { value: "actual", label: "Actual size" },
              ]}
              onChange={(fit) => onSettingsChange({ ...settings, fit })}
            />
          </Section>

          <Section title="Device">
            <Toggle
              label="Device frame"
              checked={settings.deviceFrame}
              onChange={(deviceFrame) => onSettingsChange({ ...settings, deviceFrame })}
            />
            {settings.deviceFrame && projectType === "mobile" ? (
              <div className="mt-2">
                <DeviceSelect
                  value={settings.deviceId}
                  onChange={(deviceId) => onSettingsChange({ ...settings, deviceId })}
                />
              </div>
            ) : null}
          </Section>

          <Section title="Background" last>
            <Segmented
              value={settings.background}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "scene", label: "Scene" },
              ]}
              onChange={(background) => onSettingsChange({ ...settings, background })}
            />
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children, last = false }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={last ? "px-1 py-2" : "border-b border-[#2C2C2C] px-1 py-2"}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">{title}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="h-7 rounded-md border text-[11px] font-medium transition-colors duration-100"
            style={{
              borderColor: active ? "rgba(13,153,255,0.5)" : "#2C2C2C",
              background: active ? "rgba(13,153,255,0.18)" : "#202020",
              color: active ? "#7CC4FF" : "#9A9A9A",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DeviceSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const groups = devicesByPlatform();
  return (
    <div className="max-h-[220px] overflow-y-auto rounded-md border border-[#2C2C2C] bg-[#141414] p-1">
      {groups.map((group) => (
        <div key={group.platform} className="mb-1 last:mb-0">
          <div className="px-2 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#6B6B6B]">
            {group.label}
          </div>
          {group.devices.map((device) => {
            const active = device.id === value;
            return (
              <button
                key={device.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => onChange(device.id)}
                className="flex h-7 w-full items-center justify-between gap-2 rounded-[5px] px-2 text-left text-[11px] transition-colors duration-100"
                style={{
                  background: active ? "rgba(13,153,255,0.18)" : "transparent",
                  color: active ? "#7CC4FF" : "#B8B8B8",
                }}
              >
                <span className="truncate">{device.label}</span>
                <span className="shrink-0 text-[10px] text-[#6B6B6B]">{deviceResolutionLabel(device)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-7 w-full items-center justify-between rounded-md border border-[#2C2C2C] bg-[#202020] px-2.5 text-left text-[11px] font-medium text-[#CFCFCF] transition-colors duration-100 hover:bg-[#282828]"
    >
      <span>{label}</span>
      <span
        className={[
          "relative h-[16px] w-[30px] shrink-0 rounded-full border transition-colors duration-100",
          checked ? "border-[#0D99FF]/50 bg-[#0D99FF]/30" : "border-[#3A3A3A] bg-[#141414]",
        ].join(" ")}
      >
        <span
          className="absolute left-[2px] top-1/2 h-[10px] w-[10px] rounded-full bg-[#D8D8D8] transition-transform duration-100"
          style={{ transform: checked ? "translate(16px, -50%)" : "translate(0, -50%)" }}
        />
      </span>
    </button>
  );
}
