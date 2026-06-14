import type { ReactNode } from "react";
import type { DeviceType } from "./treeTypes";
import { DeviceIcon } from "./DeviceIcon";
import { TypeIcon } from "./TypeIcon";
import { IconChevronDown, IconLink } from "@/components/icons";

// The Versions window header: two stacked selects. The first ("Screen") picks any
// screen or component in the project; the second ("Version") picks one of that subject's
// versions. Both are decoupled from whatever is open in the Current window.
export function VersionsSubjectHeader({
  active,
  subjectName,
  isScreen,
  projectType,
  versionTag,
  width,
  height,
  subjectPickerOpen,
  versionPickerOpen,
  hasVersion,
  linkedToCurrent,
  onOpenSubjectPicker,
  onOpenVersionPicker,
  onToggleEdit,
  onLinkToCurrent,
}: {
  active: boolean;
  subjectName: string;
  isScreen: boolean;
  projectType: DeviceType;
  // The selected version's tag (e.g. "V1"); absent when the subject has no versions.
  versionTag?: string;
  width?: number;
  height?: number;
  subjectPickerOpen: boolean;
  versionPickerOpen: boolean;
  hasVersion: boolean;
  // True when the subject already matches what's open in Current — nothing to re-link.
  linkedToCurrent: boolean;
  onOpenSubjectPicker: (rect: DOMRect) => void;
  onOpenVersionPicker: (rect: DOMRect) => void;
  onToggleEdit: () => void;
  // Re-points this window at the subject currently open in the Current window, so it
  // follows along to that element's versions.
  onLinkToCurrent: () => void;
}) {
  return (
    <div
      className="flex shrink-0 select-none flex-col gap-2 border-b border-[#242424] px-2.5 py-2.5"
      style={{
        background: active ? "rgba(13,153,255,0.07)" : "#171717",
        boxShadow: active ? "inset 2px 0 0 rgba(13,153,255,0.5)" : undefined,
      }}
    >
      <Field label="Screen">
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={(event) => onOpenSubjectPicker(event.currentTarget.getBoundingClientRect())}
            className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[#2A2A2A] bg-[#1B1B1B] px-2 py-1.5 text-left transition-colors duration-100 hover:border-[#383838] hover:bg-[#1E1E1E]"
          >
            <span className="grid w-[18px] shrink-0 place-items-center text-[#9A9A9A] transition-colors duration-100 group-hover:text-[#C3C3C3]">
              {isScreen ? <DeviceIcon device={projectType} /> : <TypeIcon type="component" hasChildren />}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[13px] text-[#E2E2E2]"
              style={{ fontWeight: 500, letterSpacing: "0.05px" }}
            >
              {subjectName}
            </span>
            <IconChevronDown
              size={10}
              strokeWidth={2}
              className={`shrink-0 text-[#666] transition-transform duration-100 group-hover:text-[#A0A0A0] ${subjectPickerOpen ? "rotate-180" : "rotate-0"}`}
            />
          </button>
          <button
            type="button"
            onClick={onLinkToCurrent}
            disabled={linkedToCurrent}
            aria-label="Link to the element open in Current"
            title={linkedToCurrent ? "Following the Current element" : "Link to the Current element"}
            className="grid shrink-0 cursor-pointer place-items-center rounded border border-[#333] px-1.5 text-[#8A8A8A] transition-colors duration-100 hover:border-[#454545] hover:bg-[#1E1E1E] hover:text-[#C3C3C3] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#333] disabled:hover:bg-transparent disabled:hover:text-[#8A8A8A]"
          >
            <IconLink size={13} strokeWidth={1.7} />
          </button>
        </div>
      </Field>

      <Field label="Version">
        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={(event) => onOpenVersionPicker(event.currentTarget.getBoundingClientRect())}
            className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[#2A2A2A] bg-[#1B1B1B] px-2 py-1.5 text-left transition-colors duration-100 hover:border-[#383838] hover:bg-[#1E1E1E]"
          >
            {versionTag ? (
              <span
                className="shrink-0 rounded border px-1 py-px text-[9.5px] font-semibold uppercase tracking-[0.4px]"
                style={{ borderColor: "rgba(134,56,229,0.55)", color: "#C4A1F2", background: "rgba(134,56,229,0.16)" }}
              >
                {versionTag}
              </span>
            ) : (
              <span className="text-[12px] text-[#6B6B6B]">No versions</span>
            )}
            {versionTag && width && height ? (
              <span className="text-[10.5px]" style={{ color: "#4A4A4A", fontWeight: 400 }}>
                {width}×{height}
              </span>
            ) : null}
            <IconChevronDown
              size={10}
              strokeWidth={2}
              className={`ml-auto shrink-0 text-[#666] transition-transform duration-100 group-hover:text-[#A0A0A0] ${versionPickerOpen ? "rotate-180" : "rotate-0"}`}
            />
          </button>
          <button
            type="button"
            onClick={onToggleEdit}
            disabled={!hasVersion}
            className="shrink-0 cursor-pointer rounded border px-2 text-[10px] font-medium transition-opacity duration-100 hover:opacity-80 disabled:cursor-default disabled:opacity-40"
            style={{
              borderColor: active ? "rgba(13,153,255,0.5)" : "#333",
              color: active ? "#7CC7FF" : "#8A8A8A",
              background: active ? "rgba(13,153,255,0.08)" : "transparent",
            }}
          >
            {active ? "Done" : "Edit"}
          </button>
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#5F5F5F]">
        {label}
      </span>
      {children}
    </div>
  );
}
