import type { DeviceType } from "./treeTypes";
import { DeviceIcon } from "./DeviceIcon";
import { TypeIcon } from "./TypeIcon";

export function CurrentSceneTreeRow({
  active,
  label,
  width,
  height,
  isScreen,
  projectType,
  pickerOpen,
  onOpenPicker,
  onToggleEdit,
}: {
  active: boolean;
  label: string;
  width?: number;
  height?: number;
  isScreen: boolean;
  projectType: DeviceType;
  pickerOpen: boolean;
  onOpenPicker: (rect: DOMRect) => void;
  onToggleEdit: () => void;
}) {
  return (
    <div
      className="relative flex h-[46px] shrink-0 select-none items-center gap-1.5 border-b border-[#242424] pr-2.5 text-[13px]"
      style={{
        paddingLeft: 6,
        color: active ? "#FFFFFF" : "#CFCFCF",
        background: active ? "rgba(13,153,255,0.07)" : "#171717",
        cursor: "default",
        boxShadow: active ? "inset 2px 0 0 rgba(13,153,255,0.5)" : undefined,
      }}
    >
      <span className="grid h-[46px] w-4 shrink-0 place-items-center" />
      <button
        type="button"
        onClick={(event) => onOpenPicker(event.currentTarget.parentElement?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect())}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-left"
      >
        <span className="grid w-[18px] shrink-0 place-items-center" style={{ color: "#9A9A9A" }}>
          {isScreen ? <DeviceIcon device={projectType} /> : <TypeIcon type="component" hasChildren />}
        </span>
        <span
          className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontWeight: 500, letterSpacing: "0.05px" }}
        >
          {label}
          {width && height ? (
            <span className="ml-1.5 text-[10.5px]" style={{ color: "#4A4A4A", fontWeight: 400 }}>
              {width}×{height}
            </span>
          ) : null}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="shrink-0"
          style={{ transform: pickerOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
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
