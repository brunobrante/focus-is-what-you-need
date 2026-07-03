import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronLeft, IconChevronRight, IconClose } from "@/components/icons";

/**
 * Shared chrome for the stepped creation wizards (new project / draft /
 * workspace). Header carries the title, "step X of Y" counter, close link, and
 * the progress bar; footer carries the hint/error line plus Back / primary
 * buttons. Extracted from three byte-identical copies (D7).
 */

export function WizardHeader({
  title,
  stepIndex,
  totalSteps,
  closeHref,
}: {
  title: string;
  stepIndex: number;
  totalSteps: number;
  closeHref: string;
}) {
  return (
    <header className="px-6 pt-[18px]">
      <div className="mb-3.5 flex items-center justify-between text-[12px] tracking-[0.3px] text-[var(--text-muted)]">
        <div>
          <span className="font-medium text-[var(--text)]">{title}</span>
          <span> · step {stepIndex} of {totalSteps}</span>
        </div>
        <Link
          to={closeHref}
          aria-label="Close"
          className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded-lg border border-[var(--border)] bg-transparent text-[var(--text-muted)] no-underline hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <IconClose size={14} strokeWidth={1.6} />
        </Link>
      </div>
      <div className="h-[3px] overflow-hidden rounded-[2px] bg-[#1A1A1A]">
        <div
          className="h-full rounded-[2px] bg-[var(--text)] transition-[width] duration-[320ms] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ width: `${(stepIndex / totalSteps) * 100}%` }}
        />
      </div>
    </header>
  );
}

export function WizardFooter({
  stepIndex,
  footerHint,
  error,
  onBack,
  onNext,
  nextDisabled,
  primaryLabel,
  extra,
}: {
  stepIndex: number;
  footerHint: string;
  /** When present, replaces the step/hint line with a danger message. */
  error?: string | null;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  primaryLabel: string;
  /** Optional button(s) rendered between Back and the primary action. */
  extra?: ReactNode;
}) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3.5">
      <div className="text-[12px] tracking-[0.2px] text-[var(--text-faint)]">
        {error ? (
          <span className="text-[var(--danger,#e5484d)]">{error}</span>
        ) : (
          <>
            <span>Step {stepIndex}</span> · <span>{footerHint}</span>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={stepIndex === 1}>
          <IconChevronLeft size={14} strokeWidth={1.8} />
          Back
        </button>
        {extra}
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={nextDisabled}>
          <span>{primaryLabel}</span>
          <IconChevronRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </footer>
  );
}
