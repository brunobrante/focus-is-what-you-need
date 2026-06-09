import { IconPlus } from "@/components/icons";

export function AddCard({
  label,
  onClick,
  compact = false,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 block w-full self-start cursor-pointer border-0 bg-transparent p-0 text-left text-inherit transition-transform duration-[120ms] hover:-translate-y-0.5"
      style={{ breakInside: "avoid" }}
    >
      <div
        className={[
          "group relative grid place-items-center overflow-hidden rounded-[10px] border border-dashed border-[var(--border)] bg-[linear-gradient(180deg,var(--surface) 0%,var(--bg) 100%)] text-[var(--text-muted)] transition-[border-color,transform,background-color,color,box-shadow] hover:border-[var(--text)] hover:text-[var(--text)]",
          compact ? "aspect-[4/5] p-3.5" : "aspect-[4/3] p-4",
        ].join(" ")}
      >
        <div className={["flex flex-col items-center text-[12px] tracking-[0.2px]", compact ? "gap-1.5" : "gap-2"].join(" ")}>
          <span
            className={[
              "grid place-items-center rounded-full bg-[var(--surface)]",
              compact ? "h-7 w-7" : "h-8 w-8",
            ].join(" ")}
          >
            <IconPlus size={compact ? 12 : 14} strokeWidth={2} />
          </span>
          <span className={compact ? "text-[11px]" : ""}>{label}</span>
        </div>
      </div>
    </button>
  );
}
