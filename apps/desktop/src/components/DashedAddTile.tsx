import { IconPlus } from "@/components/icons";

/**
 * The dashed "add" tile shared by the Landing "New project" card and the Global
 * Components "New component" card. Only the inner tile is shared — the wrapper
 * (`Link` vs `button`) and any caption stay at the call site. `className` is
 * appended so a caller can add e.g. `w-full` without changing the base styling.
 */
export function DashedAddTile({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div
      className={`relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] text-[var(--text-faint)] transition-colors duration-[120ms] group-hover:border-[var(--text)] group-hover:text-[var(--text)] ${className}`}
    >
      <div className="flex flex-col items-center gap-2 text-[12px] tracking-[0.2px]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)]">
          <IconPlus size={14} strokeWidth={2} />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
