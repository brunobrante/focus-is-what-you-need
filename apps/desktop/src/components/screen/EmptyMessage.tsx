import { type ReactNode } from "react";
import { IconPlus } from "@/components/icons";

export function EmptyMessage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="col-span-full grid min-h-[220px] place-items-center rounded-[14px] border border-dashed border-[var(--border)] px-6 py-10 text-center">
      <div className="max-w-[300px]">
        {icon ? (
          <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
            {icon}
          </div>
        ) : null}
        <div className="text-[13px] font-medium text-[var(--text)]">{title}</div>
        {description ? (
          <p className="m-0 mt-1.5 text-[12px] leading-[1.5] text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mx-auto mt-5 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-strong)] bg-transparent px-3.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <IconPlus size={13} strokeWidth={1.8} />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
