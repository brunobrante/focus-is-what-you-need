import type { DeviceType } from "./treeTypes";
import { DeviceIcon } from "./DeviceIcon";
import { TypeIcon } from "./TypeIcon";
import { IconChevronDown } from "@/components/icons";

export function CurrentSceneTreeRow({
  active,
  label,
  tag,
  width,
  height,
  isScreen,
  isIcon,
  projectType,
  pickerOpen,
  pickerEnabled = true,
  onOpenPicker,
  onToggleEdit,
}: {
  active: boolean;
  label: string;
  // A version tag (e.g. "V1") shown beside the title in the Versions window.
  tag?: string;
  width?: number;
  height?: number;
  isScreen: boolean;
  // The subject is an icon master — show the icon glyph instead of the component one.
  isIcon?: boolean;
  projectType: DeviceType;
  pickerOpen: boolean;
  // Whether the subject can be switched (a project context). Isolated editing
  // (a standalone draft/component/screen/icon) has nothing to switch to, so the
  // dropdown picker is hidden and the row is inert.
  pickerEnabled?: boolean;
  onOpenPicker: (rect: DOMRect) => void;
  onToggleEdit: () => void;
}) {
  const glyph = (
    <span className="grid w-[18px] shrink-0 place-items-center text-[#9A9A9A] transition-colors duration-100 group-hover:text-[#C3C3C3]">
      {isScreen ? (
        <DeviceIcon device={projectType} />
      ) : isIcon ? (
        <TypeIcon type="icon" />
      ) : (
        <TypeIcon type="component" hasChildren />
      )}
    </span>
  );
  const title = (
    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontWeight: 500, letterSpacing: "0.05px" }}>
      {label}
      {width && height ? (
        <span className="ml-1.5 text-[10.5px]" style={{ color: "#4A4A4A", fontWeight: 400 }}>
          {width}×{height}
        </span>
      ) : null}
      {tag ? (
        <span
          className="ml-1.5 rounded border px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.4px]"
          style={{ borderColor: "rgba(134,56,229,0.55)", color: "#C4A1F2", background: "rgba(134,56,229,0.16)" }}
        >
          {tag}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      className="relative flex h-[46px] shrink-0 select-none items-center justify-between border-b border-[#242424] px-2.5 text-[13px]"
      style={{
        color: active ? "#FFFFFF" : "#CFCFCF",
        background: active ? "rgba(13,153,255,0.07)" : "#171717",
        cursor: "default",
        boxShadow: active ? "inset 2px 0 0 rgba(13,153,255,0.5)" : undefined,
      }}
    >
      {pickerEnabled ? (
        <button
          type="button"
          onClick={(event) => onOpenPicker(event.currentTarget.parentElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect())}
          className="group mr-2 flex min-w-0 flex-1 items-center gap-1 rounded-md bg-transparent px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-[#1E1E1E]"
        >
          {glyph}
          {title}
          <IconChevronDown
            size={10} strokeWidth={2}
            className={`ml-auto shrink-0 text-[#666] transition-colors duration-100 group-hover:text-[#A0A0A0] ${pickerOpen ? "rotate-180" : "rotate-0"}`}
          />
        </button>
      ) : (
        <div className="group mr-2 flex min-w-0 flex-1 items-center gap-1 px-1.5 py-1.5">
          {glyph}
          {title}
        </div>
      )}
      <button
        type="button"
        onClick={onToggleEdit}
        className="cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium hover:opacity-80"
        style={{
          borderColor: active ? "rgba(13,153,255,0.5)" : "#333",
          color: active ? "#7CC7FF" : "#8A8A8A",
          background: active ? "rgba(13,153,255,0.08)" : "transparent",
        }}
      >
        {active ? "Done" : "Edit"}
      </button>
    </div>
  );
}
