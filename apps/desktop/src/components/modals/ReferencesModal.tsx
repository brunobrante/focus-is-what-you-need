import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, ModalHeader } from "./Modal";

export interface ReferencesModalHandle {
  open: (index?: number) => void;
  close: () => void;
}

type RefDisplayItem = {
  title: string;
  source: string;
  thumbnailUrl?: string | null;
};

type Props = {
  references: RefDisplayItem[];
};

export const ReferencesModal = forwardRef<ReferencesModalHandle, Props>(function ReferencesModal(
  { references },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const close = () => setOpen(false);

  useImperativeHandle(ref, () => ({
    open: (index = 0) => {
      setIdx(Math.max(0, Math.min(index, Math.max(0, references.length - 1))));
      setOpen(true);
    },
    close,
  }));

  const total = references.length;
  const next = () => setIdx((i) => (total === 0 ? 0 : (i + 1) % total));
  const prev = () => setIdx((i) => (total === 0 ? 0 : (i - 1 + total) % total));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const r = references[idx];

  return (
    <Modal open={open} onClose={close} size="image" ariaLabel="View reference">
      <ModalHeader
        title={r?.title ?? "Reference"}
        subtitle={r?.source ?? ""}
        onClose={close}
        actions={
          <span className="text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
            {total === 0 ? "0 / 0" : `${idx + 1} / ${total}`}
          </span>
        }
      />
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden p-0"
        style={{
          background:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0) 0 0/22px 22px, #0E0E0E",
        }}
      >
        {total > 1 ? (
          <button
            type="button"
            aria-label="Anterior"
            onClick={prev}
            className="absolute left-[18px] top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] text-[var(--text)] backdrop-blur transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : null}
        {r ? (
          <div className="flex h-full max-h-full max-w-full items-center justify-center px-16 py-6">
            <div className="h-[min(480px,calc(100vh-180px))] w-[min(720px,calc(100vw-144px))] max-w-full overflow-hidden rounded-md border border-[var(--border-strong)] bg-[#0E0E0E]">
              {r.thumbnailUrl ? (
                <img
                  src={r.thumbnailUrl}
                  alt=""
                  className="block h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[#0E0E0E] text-[var(--text-faint)]">
                  <div className="flex flex-col items-center gap-3">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span className="text-[12px]">No preview</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-[var(--text-faint)]">No references to show.</div>
        )}
        {total > 1 ? (
          <button
            type="button"
            aria-label="Next"
            onClick={next}
            className="absolute right-[18px] top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] text-[var(--text)] backdrop-blur transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : null}
      </div>
    </Modal>
  );
});
