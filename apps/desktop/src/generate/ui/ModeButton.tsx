import type { ReactNode } from "react";

export function ModeButton({
  active = false,
  disabled = false,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--text)] bg-[var(--text)] text-[var(--bg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        disabled ? "cursor-not-allowed opacity-45 hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text-muted)]" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
