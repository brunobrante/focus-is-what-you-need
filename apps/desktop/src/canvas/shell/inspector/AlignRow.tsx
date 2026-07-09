import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
} from "lucide-react";
import type { AlignEdge, DistributeAxis } from "@/canvas/engine/actions";

const ALIGN_BUTTONS: Array<{ edge: AlignEdge; title: string; Icon: typeof AlignStartVertical }> = [
  { edge: "left", title: "Align left", Icon: AlignStartVertical },
  { edge: "hcenter", title: "Align horizontal centers", Icon: AlignCenterVertical },
  { edge: "right", title: "Align right", Icon: AlignEndVertical },
  { edge: "top", title: "Align top", Icon: AlignStartHorizontal },
  { edge: "vcenter", title: "Align vertical centers", Icon: AlignCenterHorizontal },
  { edge: "bottom", title: "Align bottom", Icon: AlignEndHorizontal },
];

const BUTTON_CLASS =
  "grid h-[26px] flex-1 cursor-pointer place-items-center rounded-[7px] border border-transparent text-[#B9B9B9] transition-colors hover:bg-[#2C2C2C] hover:text-[#EDEDED]";

/**
 * The six align buttons (G1), plus the two distribute buttons when the caller
 * allows them (3+ elements). One row of evenly-sized icon buttons — the shared
 * surface for the Inspector's single-element (align in parent) and
 * multi-selection (align to shared bounds) panels.
 */
export function AlignRow({
  onAlign,
  onDistribute,
}: {
  onAlign: (edge: AlignEdge) => void;
  onDistribute?: (axis: DistributeAxis) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {ALIGN_BUTTONS.map(({ edge, title, Icon }) => (
        <button key={edge} type="button" title={title} className={BUTTON_CLASS} onClick={() => onAlign(edge)}>
          <Icon size={13} strokeWidth={1.7} />
        </button>
      ))}
      {onDistribute ? (
        <>
          <span className="mx-0.5 h-[16px] w-px shrink-0 bg-[#2C2C2C]" />
          <button
            type="button"
            title="Distribute horizontally"
            className={BUTTON_CLASS}
            onClick={() => onDistribute("horizontal")}
          >
            <AlignHorizontalSpaceBetween size={13} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            title="Distribute vertically"
            className={BUTTON_CLASS}
            onClick={() => onDistribute("vertical")}
          >
            <AlignVerticalSpaceBetween size={13} strokeWidth={1.7} />
          </button>
        </>
      ) : null}
    </div>
  );
}
