import { type ReactNode } from "react";
import {
  IconColorStyles,
  IconText,
  IconGrid,
  IconImage,
  IconPlus,
  IconDiamond,
  IconRadius,
  IconLayers,
} from "@/components/icons";
import type { SystemDesignCategory } from "@/lib/storage/schema";

// ─── Category presentation ──────────────────────────────────────────────────

export const CATEGORY_ICON: Record<SystemDesignCategory, ReactNode> = {
  colors: <IconColorStyles size={12} strokeWidth={1.8} />,
  gradients: <IconLayers size={12} strokeWidth={1.7} />,
  typography: <IconText size={12} strokeWidth={1.8} />,
  icons: <IconGrid size={12} strokeWidth={1.7} />,
  spacing: <IconDiamond size={10} strokeWidth={2.4} />,
  radius: <IconRadius size={12} strokeWidth={1.6} />,
  images: <IconImage size={12} strokeWidth={1.7} />,
};

// ─── Form primitives ────────────────────────────────────────────────────────

export const inputCls =
  "h-11 w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--text)] outline-none focus:border-[var(--text)]";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}

// ─── Section block ──────────────────────────────────────────────────────────

export function SectionBlock({
  title,
  icon,
  actionLabel,
  onAction,
  hideAction,
  headerRight,
  children,
}: {
  title: string;
  icon?: ReactNode;
  actionLabel: string;
  onAction: () => void;
  hideAction?: boolean;
  headerRight?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2.5">
        <div className="flex items-center gap-2 text-[var(--text-faint)]">
          {icon}
          <h2 className="m-0 text-[13px] font-semibold uppercase tracking-[0.5px]">{title}</h2>
        </div>
        <div className="flex items-center gap-2.5">
          {headerRight}
          {!hideAction && <AddButton label={actionLabel} onClick={onAction} />}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * The bordered "+ Add …" action used to create a token. Shared so the System
 * Design page can place it inline with its category tabs while the per-project
 * System tab keeps it in the section header.
 */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
    >
      <IconPlus size={12} strokeWidth={2} />
      {label}
    </button>
  );
}

export function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-[var(--text-faint)]">
      <IconPlus size={18} strokeWidth={1.5} />
      <span className="text-[12px]">{label}</span>
    </div>
  );
}

// ─── Token action overlay (edit / delete) ─────────────────────────────────────

export function TokenAction({
  icon,
  danger,
  active,
  title,
  onClick,
}: {
  icon: ReactNode;
  danger?: boolean;
  /** Renders an "on" state — used by the linkable toggle. */
  active?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "grid h-6 w-6 cursor-pointer place-items-center rounded-md border backdrop-blur-md transition-colors",
        danger
          ? "border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] text-[#ff8080] hover:bg-[rgba(255,60,60,0.18)]"
          : active
            ? "border-[#8638E5] bg-[rgba(134,56,229,0.18)] text-[var(--text)]"
            : "border-[var(--border-strong)] bg-[rgba(20,20,20,0.9)] text-[var(--text)]",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}
