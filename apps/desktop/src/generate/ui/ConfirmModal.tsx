import type { PendingConfirmation } from "../engine/types";

export function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.58)] px-4">
      <div className="w-full max-w-[380px] rounded-[8px] border border-[var(--border)] bg-[var(--bg-elev)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.5)]">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text)]">{title}</h2>
        <p className="m-0 mt-2 text-[12.5px] leading-5 text-[var(--text-muted)]">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-[7px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-[7px] border border-[var(--accent)] bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-fg)] hover:bg-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmationDialogCopy(_action: PendingConfirmation) {
  return {
    title: "Reset tool",
    description:
      "This removes every root and crop and returns to the original image. The tree will be recreated with only the default full-image root.",
    confirmLabel: "Reset",
  };
}
