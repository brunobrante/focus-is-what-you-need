import { type ReactNode, type CSSProperties } from "react";
import { IconPlus } from "@/components/icons";

const DOT_GRID_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)",
  backgroundSize: "22px 22px",
  backgroundColor: "var(--bg)",
};

/**
 * EmptyMessage — unified empty state component.
 *
 * Two modes:
 * - Static (default): bordered container with an optional inner action button.
 * - Clickable (`onClick`): the whole component becomes a button with a dot-grid
 *   background. Use when the primary affordance is a single click action
 *   (e.g. upload, open modal).
 */
export function EmptyMessage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  onClick,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** When provided the whole container becomes a clickable button. */
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="col-span-full flex w-full cursor-pointer flex-col items-center gap-3 rounded-[12px] border border-dashed border-[var(--border-strong)] py-20 text-center transition-colors hover:border-[var(--text)] hover:bg-[rgba(255,255,255,0.01)]"
        style={DOT_GRID_STYLE}
      >
        {icon ? (
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]">
            {icon}
          </span>
        ) : null}
        <div>
          <p className="m-0 text-[13px] font-medium text-[var(--text)]">{title}</p>
          {description ? (
            <p className="m-0 mt-1 text-[12px] text-[var(--text-faint)]">{description}</p>
          ) : null}
        </div>
      </button>
    );
  }

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
