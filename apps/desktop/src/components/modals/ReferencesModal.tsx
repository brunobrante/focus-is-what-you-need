import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Modal, ModalHeader } from "./Modal";
import { IconChevronLeft, IconChevronRight, IconImage, IconTrash } from "@/components/icons";

export interface ReferencesModalHandle {
  open: (index?: number) => void;
  close: () => void;
}

type RefDisplayItem = {
  id: string;
  title: string;
  source: string;
  thumbnailUrl?: string | null;
};

type Props = {
  references: RefDisplayItem[];
  onRemove?: (reference: RefDisplayItem) => void;
};

export const ReferencesModal = forwardRef<ReferencesModalHandle, Props>(function ReferencesModal(
  { references, onRemove },
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
  const removeCurrent = () => {
    const current = references[idx];
    if (!current || !onRemove) return;
    onRemove(current);
    if (total <= 1) {
      close();
      return;
    }
    setIdx((i) => Math.min(i, total - 2));
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((i) => (total === 0 ? 0 : (i + 1) % total));
      else if (e.key === "ArrowLeft") setIdx((i) => (total === 0 ? 0 : (i - 1 + total) % total));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total]);

  const r = references[idx];

  return (
    <Modal open={open} onClose={close} size="image" ariaLabel="View reference">
      <ModalHeader
        title={r?.title ?? "Reference"}
        subtitle={r?.source ?? ""}
        onClose={close}
        actions={
          <>
            {r && onRemove ? (
              <button
                type="button"
                onClick={removeCurrent}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)]"
              >
                <IconTrash size={12} strokeWidth={1.8} />
                Remove from project
              </button>
            ) : null}
            <span className="text-[11px] tracking-[0.4px] text-[var(--text-faint)]">
              {total === 0 ? "0 / 0" : `${idx + 1} / ${total}`}
            </span>
          </>
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
            aria-label="Previous"
            onClick={prev}
            className="absolute left-[18px] top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-[var(--border-strong)] bg-[rgba(20,20,20,0.85)] text-[var(--text)] backdrop-blur transition-colors hover:border-white hover:bg-white hover:text-[#111]"
          >
            <IconChevronLeft size={14} strokeWidth={2} />
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
                    <IconImage size={32} strokeWidth={1.3} />
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
            <IconChevronRight size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </Modal>
  );
});
