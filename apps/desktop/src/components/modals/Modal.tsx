import { useEffect, type ReactNode } from "react";

let openModalCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";
let previousHtmlOverflow = "";
let previousHtmlOverscrollBehavior = "";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "wide" | "xl" | "image" | "picker";
  ariaLabel?: string;
};

export function Modal({ open, onClose, children, size = "default", ariaLabel }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    if (openModalCount === 0) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      previousBodyOverflow = document.body.style.overflow;
      previousBodyPaddingRight = document.body.style.paddingRight;
      previousHtmlOverflow = document.documentElement.style.overflow;
      previousHtmlOverscrollBehavior = document.documentElement.style.overscrollBehavior;

      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }
    openModalCount += 1;

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount > 0) return;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass =
    size === "xl"
      ? "w-[calc(100vw-32px)] h-[calc(100vh-32px)] max-w-none max-h-[calc(100vh-32px)]"
      : size === "wide"
        ? "w-[min(1180px,calc(100vw-32px))] h-[min(860px,calc(100vh-40px))] max-w-none max-h-[calc(100vh-40px)]"
        : size === "image"
          ? "w-[calc(100vw-64px)] max-w-none max-h-[calc(100vh-64px)] bg-[#0E0E0E]"
          : size === "picker"
            ? "w-[min(600px,calc(100vw-32px))] max-h-[min(560px,calc(100vh-48px))]"
            : "w-full max-w-[760px] max-h-[80vh]";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(circle at top, rgba(94,162,255,0.12), transparent 28%), rgba(5,6,8,0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        role="document"
        className={[
          "flex flex-col overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(34,36,40,0.98),rgba(20,21,24,0.98))] shadow-[0_30px_120px_rgba(0,0,0,0.65)]",
          sizeClass,
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  actions,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))] px-7 py-5">
      <div className="min-w-0">
        <h3 className="m-0 mb-1.5 text-[18px] font-semibold tracking-[-0.2px] text-[var(--text)]">{title}</h3>
        {subtitle ? (
          <p className="m-0 max-w-[760px] text-[13px] leading-[1.5] text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--text)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={["flex-1 overflow-y-auto px-7 pb-7 pt-6", className ?? ""].join(" ")}>
      {children}
    </div>
  );
}
