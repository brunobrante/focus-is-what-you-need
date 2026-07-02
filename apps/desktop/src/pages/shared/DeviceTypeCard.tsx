import type { ProjectType } from "@/lib/data/types";
import { PROJECT_TYPE_LABEL, PROJECT_TYPE_DIMS } from "@/lib/data/projects";
import { IconCheck } from "@/components/icons";
import { DeviceMockTile } from "./DeviceMockTile";

// The selectable device-type card (mobile / tablet / desktop) shown in the new
// project and new draft wizards. Extracted from two identical copies (D7).
export function DeviceTypeCard({
  type,
  selected,
  onSelect,
}: {
  type: ProjectType;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        "relative flex cursor-pointer flex-col gap-4 rounded-[14px] border bg-[var(--surface)] px-5 pb-5 pt-[22px] text-left text-inherit transition-[border-color,background] duration-[100ms]",
        selected
          ? "border-[var(--text)] bg-[#232323]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      <DeviceMockTile type={type} selected={selected} />
      <div>
        <p className="m-0 text-[15px] font-semibold tracking-[-0.1px]">{PROJECT_TYPE_LABEL[type]}</p>
        <p className="mt-0.5 text-[12px] text-[var(--text-faint)]" style={{ fontFeatureSettings: '"tnum"' }}>
          {PROJECT_TYPE_DIMS[type]}
        </p>
      </div>
      <span
        aria-hidden
        className={[
          "absolute right-3.5 top-3.5 grid h-[18px] w-[18px] place-items-center rounded-full border bg-[#161616]",
          selected
            ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
            : "border-[var(--border-strong)]",
        ].join(" ")}
      >
        <IconCheck size={10} strokeWidth={3} className={selected ? "opacity-100" : "opacity-0"} />
      </span>
    </button>
  );
}
